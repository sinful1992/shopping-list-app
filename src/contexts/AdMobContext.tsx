import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import mobileAds, {
  InterstitialAd,
  AdEventType,
  AdsConsent,
  AdsConsentStatus,
} from 'react-native-google-mobile-ads';
import { useRevenueCat } from './RevenueCatContext';
import { AD_UNIT_IDS, INTERSTITIAL_COOLDOWN_MS, MAX_RETRY_ATTEMPTS } from '../config/adConfig';

interface AdMobContextType {
  shouldShowAds: boolean;
  isInitialized: boolean;
  showInterstitial: () => boolean;
  setPendingInterstitial: () => void;
}

const AdMobContext = createContext<AdMobContextType | null>(null);

export function AdMobProvider({ children }: { children: React.ReactNode }) {
  const { tier, hasEntitlement } = useRevenueCat();
  const [isInitialized, setIsInitialized] = useState(false);
  const [consentObtained, setConsentObtained] = useState(false);

  const interstitialRef = useRef<InterstitialAd | null>(null);
  const interstitialLoadedRef = useRef(false);
  const lastInterstitialTimeRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInterstitialRef = useRef<{ pending: boolean; expiresAt: number } | null>(null);

  const shouldShowAds = tier === 'free' && !hasEntitlement && consentObtained;

  // UMP consent first, then initialize AdMob SDK
  // Docs: "ads may be preloaded upon initialization" — must resolve consent before init
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Step 1: Resolve UMP consent before any SDK initialization
      let hasConsent = false;
      try {
        const consentInfo = await AdsConsent.requestInfoUpdate();
        if (
          consentInfo.status === AdsConsentStatus.OBTAINED ||
          consentInfo.status === AdsConsentStatus.NOT_REQUIRED
        ) {
          hasConsent = true;
        } else if (consentInfo.isConsentFormAvailable) {
          const result = await AdsConsent.showForm();
          if (result.status === AdsConsentStatus.OBTAINED) {
            hasConsent = true;
          }
        }
      } catch (e) {
        if (__DEV__) console.warn('UMP consent failed:', e);
        // hasConsent stays false — no ads, no SDK init (safe default)
      }

      if (!mounted) return;
      setConsentObtained(hasConsent);

      if (!hasConsent) return;

      // Step 2: Only initialize SDK after consent is obtained/not required
      try {
        await mobileAds().initialize();
      } catch (e) {
        if (__DEV__) console.warn('AdMob init failed:', e);
        return;
      }

      if (mounted) setIsInitialized(true);
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Load interstitial ad
  const loadInterstitial = useCallback(() => {
    if (interstitialRef.current) {
      interstitialRef.current.removeAllListeners();
    }

    const interstitial = InterstitialAd.createForAdRequest(AD_UNIT_IDS.interstitial);

    interstitial.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoadedRef.current = true;
      retryCountRef.current = 0;
    });

    interstitial.addAdEventListener(AdEventType.CLOSED, () => {
      interstitialLoadedRef.current = false;
      loadInterstitial();
    });

    interstitial.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoadedRef.current = false;
      if (retryCountRef.current < MAX_RETRY_ATTEMPTS) {
        const delay = 5000 * Math.pow(3, retryCountRef.current); // 5s, 15s, 45s
        retryCountRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => {
          loadInterstitial();
        }, delay);
      }
    });

    interstitialRef.current = interstitial;
    interstitial.load();
  }, []);

  // Start preloading interstitial when ads should show
  useEffect(() => {
    if (shouldShowAds && isInitialized) {
      loadInterstitial();
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (interstitialRef.current) {
        interstitialRef.current.removeAllListeners();
      }
    };
  }, [shouldShowAds, isInitialized, loadInterstitial]);

  const showInterstitial = useCallback((): boolean => {
    if (!shouldShowAds) return false;
    if (!interstitialLoadedRef.current) return false;

    const now = Date.now();
    if (now - lastInterstitialTimeRef.current < INTERSTITIAL_COOLDOWN_MS) {
      return false;
    }

    try {
      interstitialRef.current?.show();
      lastInterstitialTimeRef.current = now;
      interstitialLoadedRef.current = false;
      return true;
    } catch {
      return false;
    }
  }, [shouldShowAds]);

  const setPendingInterstitial = useCallback(() => {
    pendingInterstitialRef.current = {
      pending: true,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
  }, []);

  // AppState listener for pending interstitial on foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const pending = pendingInterstitialRef.current;
        if (pending?.pending && Date.now() < pending.expiresAt) {
          const shown = showInterstitial();
          if (shown) {
            pendingInterstitialRef.current = null;
          }
        } else if (pending?.pending) {
          // Expired — clear it
          pendingInterstitialRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [showInterstitial]);

  const value: AdMobContextType = {
    shouldShowAds,
    isInitialized,
    showInterstitial,
    setPendingInterstitial,
  };

  return (
    <AdMobContext.Provider value={value}>
      {children}
    </AdMobContext.Provider>
  );
}

export function useAdMob(): AdMobContextType {
  const context = useContext(AdMobContext);
  if (!context) {
    throw new Error('useAdMob must be used within an AdMobProvider');
  }
  return context;
}
