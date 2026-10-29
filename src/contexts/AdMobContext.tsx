import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import mobileAds, {
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  AdsConsent,
  AdsConsentPrivacyOptionsRequirementStatus,
} from 'react-native-google-mobile-ads';
import { useRevenueCat } from './RevenueCatContext';
import { AD_UNIT_IDS, INTERSTITIAL_COOLDOWN_MS, MAX_RETRY_ATTEMPTS } from '../config/adConfig';
import CrashReporting from '../services/CrashReporting';

interface AdMobContextType {
  shouldShowAds: boolean;
  isInitialized: boolean;
  consentChecked: boolean;
  consentObtained: boolean;
  /** UMP could not be reached (offline) and this phone has no consent answer on record: let the user in without ads. */
  consentUnavailable: boolean;
  retryConsent: () => Promise<void>;
  /** UMP says this user (UK/EEA) must be able to change their consent choice later. */
  privacyOptionsRequired: boolean;
  showPrivacyOptions: () => Promise<void>;
  showInterstitial: () => boolean;
  /** Show now, or retry once after a delay (cold start: ad not loaded yet). */
  showInterstitialWithRetry: (delayMs?: number) => void;
  setPendingInterstitial: () => void;
  showRewarded: (onRewarded: () => void, onDismissed?: () => void) => boolean;
}

const AdMobContext = createContext<AdMobContextType | null>(null);

const CONSENT_REFUSED_KEY = 'ads_consent_refused';

/** Remember an online answer, so an offline start can tell a refusal from "never asked". */
function recordConsentAnswer(canRequestAds: boolean): void {
  const write = canRequestAds
    ? AsyncStorage.removeItem(CONSENT_REFUSED_KEY)
    : AsyncStorage.setItem(CONSENT_REFUSED_KEY, '1');
  write.catch(e => CrashReporting.recordError(e as Error, 'AdMobContext record consent answer'));
}

/**
 * gatherConsent failed, usually because the phone is offline. UMP keeps the
 * last answer on the phone, so a user who accepted before is let in as usual.
 * A refusal on record keeps the wall (fails closed). With no answer at all the
 * form can't be shown, so the user gets in without ads until UMP is reachable.
 */
async function offlineConsent(): Promise<'obtained' | 'refused' | 'unknown'> {
  let cached: { canRequestAds: boolean; status?: string } | null = null;
  try {
    cached = await AdsConsent.getConsentInfo();
  } catch (e) {
    CrashReporting.recordError(e as Error, 'AdMobContext cached consent info');
  }
  if (cached?.canRequestAds) return 'obtained';
  let refused: string | null = null;
  try {
    refused = await AsyncStorage.getItem(CONSENT_REFUSED_KEY);
  } catch (e) {
    CrashReporting.recordError(e as Error, 'AdMobContext read consent answer');
  }
  if (refused || cached?.status === 'OBTAINED') return 'refused';
  return 'unknown';
}

export function AdMobProvider({ children }: { children: React.ReactNode }) {
  const { tier, hasEntitlement, isLoading } = useRevenueCat();
  const [isInitialized, setIsInitialized] = useState(false);
  const [consentObtained, setConsentObtained] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const [consentUnavailable, setConsentUnavailable] = useState(false);
  // Bumped when the app comes back to the foreground while UMP was unreachable.
  const [consentRetryTick, setConsentRetryTick] = useState(0);

  const isConsentInFlightRef = useRef(false);
  const consentInitializedOnceRef = useRef(false);

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
    if (isLoading) return;

    const isFreeUser = tier === 'free' && !hasEntitlement;
    if (!isFreeUser) {
      setConsentChecked(true);
      return;
    }

    if (consentInitializedOnceRef.current) return;

    let mounted = true;

    const initAds = async () => {
      if (isConsentInFlightRef.current) return;
      isConsentInFlightRef.current = true;

      try {
        await AdsConsent.gatherConsent();
      } catch (e) {
        CrashReporting.recordError(e as Error, 'AdMobContext UMP consent');
        const fallback = await offlineConsent();
        if (mounted) {
          setConsentObtained(fallback === 'obtained');
          setConsentUnavailable(fallback === 'unknown');
          setConsentChecked(true);
        }
        isConsentInFlightRef.current = false;
        if (fallback === 'obtained' && mounted) {
          try {
            await mobileAds().initialize();
            if (mounted) {
              setIsInitialized(true);
              consentInitializedOnceRef.current = true;
            }
          } catch (initError) {
            CrashReporting.recordError(initError as Error, 'AdMobContext mobileAds initialize');
          }
        }
        return;
      }

      if (!mounted) { isConsentInFlightRef.current = false; return; }

      const consentInfo = await AdsConsent.getConsentInfo();
      if (__DEV__) console.log('UMP consent info:', JSON.stringify(consentInfo));
      const { canRequestAds } = consentInfo;
      if (!mounted) { isConsentInFlightRef.current = false; return; }

      setPrivacyOptionsRequired(
        consentInfo.privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
      );
      recordConsentAnswer(canRequestAds);
      setConsentObtained(canRequestAds);
      setConsentUnavailable(false);
      setConsentChecked(true);

      if (!canRequestAds) { isConsentInFlightRef.current = false; return; }

      try {
        await mobileAds().initialize();
      } catch (e) {
        CrashReporting.recordError(e as Error, 'AdMobContext mobileAds initialize');
        isConsentInFlightRef.current = false;
        return;
      }

      if (mounted) {
        setIsInitialized(true);
        consentInitializedOnceRef.current = true;
      }
      isConsentInFlightRef.current = false;
    };

    initAds();
    return () => {
      mounted = false;
      isConsentInFlightRef.current = false;
    };
  }, [isLoading, tier, hasEntitlement, consentRetryTick]);

  // Offline start with no answer on record: ask UMP again once the app is
  // back in the foreground (the phone may have found a network meanwhile).
  useEffect(() => {
    if (!consentUnavailable) return;
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') setConsentRetryTick(t => t + 1);
    });
    return () => subscription.remove();
  }, [consentUnavailable]);

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
      CrashReporting.recordError(e as Error, 'AdMobContext UMP consent retry');
      // Accept Ads tapped while offline: the form can't open, so nobody refused
      // anything here. Same fallback as a cold start.
      const fallback = await offlineConsent();
      setConsentObtained(fallback === 'obtained');
      setConsentUnavailable(fallback === 'unknown');
      setConsentChecked(true);
      isConsentInFlightRef.current = false;
      return;
    }

    const { canRequestAds, privacyOptionsRequirementStatus } = await AdsConsent.getConsentInfo();
    setPrivacyOptionsRequired(
      privacyOptionsRequirementStatus === AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
    );
    recordConsentAnswer(canRequestAds);
    setConsentUnavailable(false);
    setConsentObtained(canRequestAds);
    setConsentChecked(true);

    if (!canRequestAds) {
      isConsentInFlightRef.current = false;
      return;
    }

    try {
      await mobileAds().initialize();
      setIsInitialized(true);
      consentInitializedOnceRef.current = true;
    } catch (e) {
      if (__DEV__) console.warn('AdMob init failed:', e);
    }

    isConsentInFlightRef.current = false;
  }, []);

  const showPrivacyOptions = useCallback(async () => {
    if (isConsentInFlightRef.current) return;
    isConsentInFlightRef.current = true;

    try {
      const { canRequestAds } = await AdsConsent.showPrivacyOptionsForm();
      recordConsentAnswer(canRequestAds);
      setConsentObtained(canRequestAds);

      if (canRequestAds && !consentInitializedOnceRef.current) {
        await mobileAds().initialize();
        setIsInitialized(true);
        consentInitializedOnceRef.current = true;
      }
    } catch (e) {
      CrashReporting.recordError(e as Error, 'AdMobContext UMP privacy options');
    } finally {
      isConsentInFlightRef.current = false;
    }
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

  // One-shot retry for the cold-start case where the interstitial hasn't
  // loaded yet when a screen wants to show it (previously duplicated in
  // ListDetailScreen). A new call supersedes any pending retry.
  const interstitialRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showInterstitialWithRetry = useCallback((delayMs: number = 3000): void => {
    if (showInterstitial()) return;
    if (interstitialRetryRef.current) {
      clearTimeout(interstitialRetryRef.current);
    }
    interstitialRetryRef.current = setTimeout(() => {
      interstitialRetryRef.current = null;
      showInterstitial();
    }, delayMs);
  }, [showInterstitial]);

  // Clear any pending interstitial retry on unmount
  useEffect(() => {
    return () => {
      if (interstitialRetryRef.current) {
        clearTimeout(interstitialRetryRef.current);
      }
    };
  }, []);

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

  // The provider re-renders on every profile tick (its parent passes the
  // live user); a new value object each time re-rendered every consumer.
  const showPrivacyRow = privacyOptionsRequired && tier === 'free' && !hasEntitlement;
  const value: AdMobContextType = useMemo(() => ({
    shouldShowAds,
    isInitialized,
    consentChecked,
    consentObtained,
    consentUnavailable,
    retryConsent,
    privacyOptionsRequired: showPrivacyRow,
    showPrivacyOptions,
    showInterstitial,
    showInterstitialWithRetry,
    setPendingInterstitial,
    showRewarded,
  }), [shouldShowAds, isInitialized, consentChecked, consentObtained, consentUnavailable, retryConsent, showPrivacyRow,
    showPrivacyOptions, showInterstitial, showInterstitialWithRetry, setPendingInterstitial, showRewarded]);

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
