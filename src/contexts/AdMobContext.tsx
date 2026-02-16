import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import mobileAds, {
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  AdsConsent,
} from 'react-native-google-mobile-ads';
import { useRevenueCat } from './RevenueCatContext';
import { AD_UNIT_IDS, INTERSTITIAL_COOLDOWN_MS, MAX_RETRY_ATTEMPTS } from '../config/adConfig';

interface AdMobContextType {
  shouldShowAds: boolean;
  isInitialized: boolean;
  consentChecked: boolean;
  consentObtained: boolean;
  retryConsent: () => Promise<void>;
  showInterstitial: () => boolean;
  setPendingInterstitial: () => void;
  showRewarded: (onRewarded: () => void, onDismissed?: () => void) => boolean;
}

const AdMobContext = createContext<AdMobContextType | null>(null);

export function AdMobProvider({ children }: { children: React.ReactNode }) {
  const { tier, hasEntitlement } = useRevenueCat();
  const [isInitialized, setIsInitialized] = useState(false);
  const [consentObtained, setConsentObtained] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);

  const isConsentInFlightRef = useRef(false);

  const interstitialRef = useRef<InterstitialAd | null>(null);
  const interstitialLoadedRef = useRef(false);
  const lastInterstitialTimeRef = useRef(0);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInterstitialRef = useRef<{ pending: boolean; expiresAt: number } | null>(null);

  const rewardedRef = useRef<RewardedAd | null>(null);
  const rewardedLoadedRef = useRef(false);
  const rewardedRetryCountRef = useRef(0);
  const rewardedRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewardedCallbackRef = useRef<{ onRewarded: () => void; onDismissed?: () => void } | null>(null);
  const rewardedEarnedRef = useRef(false);

  const shouldShowAds = tier === 'free' && !hasEntitlement && consentObtained;

  useEffect(() => {
    let mounted = true;

    const initAds = async () => {
      if (isConsentInFlightRef.current) return;
      isConsentInFlightRef.current = true;

      try {
        if (__DEV__) AdsConsent.reset();
        await AdsConsent.gatherConsent();
      } catch (e) {
        if (__DEV__) console.warn('UMP consent failed:', JSON.stringify(e, Object.getOwnPropertyNames(e as object)));
        if (mounted) {
          setConsentObtained(false);
          setConsentChecked(true);
        }
        isConsentInFlightRef.current = false;
        return;
      }

      if (!mounted) { isConsentInFlightRef.current = false; return; }

      const consentInfo = await AdsConsent.getConsentInfo();
      if (__DEV__) console.log('UMP consent info:', JSON.stringify(consentInfo));
      const { canRequestAds } = consentInfo;
      if (!mounted) { isConsentInFlightRef.current = false; return; }

      setConsentObtained(canRequestAds);
      setConsentChecked(true);

      if (!canRequestAds) { isConsentInFlightRef.current = false; return; }

      try {
        await mobileAds().initialize();
      } catch (e) {
        if (__DEV__) console.warn('AdMob init failed:', e);
        isConsentInFlightRef.current = false;
        return;
      }

      if (mounted) setIsInitialized(true);
      isConsentInFlightRef.current = false;
    };

    initAds();
    return () => { mounted = false; };
  }, []);

  const retryConsent = useCallback(async () => {
    if (isConsentInFlightRef.current) return;
    isConsentInFlightRef.current = true;

    setConsentChecked(false);
    setConsentObtained(false);
    setIsInitialized(false);

    try {
      AdsConsent.reset();
      await AdsConsent.gatherConsent();
    } catch (e) {
      if (__DEV__) console.warn('UMP consent retry failed:', e);
      setConsentChecked(true);
      isConsentInFlightRef.current = false;
      return;
    }

    const { canRequestAds } = await AdsConsent.getConsentInfo();
    setConsentObtained(canRequestAds);
    setConsentChecked(true);

    if (!canRequestAds) {
      isConsentInFlightRef.current = false;
      return;
    }

    try {
      await mobileAds().initialize();
      setIsInitialized(true);
    } catch (e) {
      if (__DEV__) console.warn('AdMob init failed:', e);
    }

    isConsentInFlightRef.current = false;
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

  // Load rewarded ad
  const loadRewarded = useCallback(() => {
    if (rewardedRef.current) {
      rewardedRef.current.removeAllListeners();
    }

    const rewarded = RewardedAd.createForAdRequest(AD_UNIT_IDS.rewarded);

    rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewardedLoadedRef.current = true;
      rewardedRetryCountRef.current = 0;
    });

    rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      rewardedEarnedRef.current = true;
    });

    rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      rewardedLoadedRef.current = false;
      const callbacks = rewardedCallbackRef.current;
      const earned = rewardedEarnedRef.current;
      rewardedCallbackRef.current = null;
      rewardedEarnedRef.current = false;

      if (earned && callbacks?.onRewarded) {
        callbacks.onRewarded();
      } else if (!earned && callbacks?.onDismissed) {
        callbacks.onDismissed();
      }

      loadRewarded();
    });

    rewarded.addAdEventListener(AdEventType.ERROR, () => {
      rewardedLoadedRef.current = false;
      if (rewardedRetryCountRef.current < MAX_RETRY_ATTEMPTS) {
        const delay = 5000 * Math.pow(3, rewardedRetryCountRef.current);
        rewardedRetryCountRef.current += 1;
        rewardedRetryTimeoutRef.current = setTimeout(() => {
          loadRewarded();
        }, delay);
      }
    });

    rewardedRef.current = rewarded;
    rewarded.load();
  }, []);

  // Start preloading interstitial and rewarded when ads should show
  useEffect(() => {
    if (shouldShowAds && isInitialized) {
      loadInterstitial();
      loadRewarded();
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (interstitialRef.current) {
        interstitialRef.current.removeAllListeners();
      }
      if (rewardedRetryTimeoutRef.current) {
        clearTimeout(rewardedRetryTimeoutRef.current);
      }
      if (rewardedRef.current) {
        rewardedRef.current.removeAllListeners();
      }
    };
  }, [shouldShowAds, isInitialized, loadInterstitial, loadRewarded]);

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

  const showRewarded = useCallback((onRewarded: () => void, onDismissed?: () => void): boolean => {
    if (!shouldShowAds || !rewardedLoadedRef.current) return false;

    rewardedCallbackRef.current = { onRewarded, onDismissed };
    rewardedEarnedRef.current = false;

    try {
      rewardedRef.current?.show();
      rewardedLoadedRef.current = false;
      return true;
    } catch {
      rewardedCallbackRef.current = null;
      return false;
    }
  }, [shouldShowAds]);

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
    consentChecked,
    consentObtained,
    retryConsent,
    showInterstitial,
    setPendingInterstitial,
    showRewarded,
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
