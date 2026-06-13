import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { safeJsonParse } from '../utils/safeJsonParse';
import Purchases, {
  PurchasesOffering,
  CustomerInfo,
  LOG_LEVEL,
} from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { getDatabase, ref, onValue } from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SubscriptionTier, User } from '../models/types';
import { ENTITLEMENT_ID, TIER_CACHE_KEY } from '../models/SubscriptionConfig';
import supabase from '../services/SupabaseClient';
import { REVENUECAT_ANDROID_API_KEY } from '@env';
import CrashReporting from '../services/CrashReporting';

interface RevenueCatContextType {
  tier: SubscriptionTier;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  isLoading: boolean;
  isPurchasing: boolean;
  presentPaywall: () => Promise<void>;
  presentCustomerCenter: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  hasEntitlement: boolean;
}

const RevenueCatContext = createContext<RevenueCatContextType | null>(null);

interface RevenueCatProviderProps {
  user: User | null;
  children: React.ReactNode;
}

const PURCHASE_TIMEOUT_MS = 30_000;

export function RevenueCatProvider({ user, children }: RevenueCatProviderProps) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const isPurchasingRef = useRef(false);
  const purchaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFamilyGroupIdRef = useRef<string | null>(null);
  const reconciledGroupRef = useRef<string | null>(null);

  // Keep ref in sync so the Firebase callback always sees the latest value without
  // being in its dependency array (prevents unnecessary listener teardown/re-register)
  useEffect(() => {
    isPurchasingRef.current = isPurchasing;
  }, [isPurchasing]);

  // Configure RevenueCat SDK on mount
  useEffect(() => {
    const configure = async () => {
      try {
        const apiKey = REVENUECAT_ANDROID_API_KEY;
        if (!apiKey) {
          if (__DEV__) console.warn('REVENUECAT_ANDROID_API_KEY is not set');
          setIsLoading(false);
          return;
        }

        if (__DEV__) {
          Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        }

        await Purchases.configure({ apiKey });
        setIsConfigured(true);
      } catch (error) {
        CrashReporting.recordError(error as Error, 'RevenueCatContext configure');
        await loadCachedTier();
        setIsLoading(false);
      }
    };

    configure();
  }, []);

  // Log in/out based on user auth state (depends on isConfigured)
  useEffect(() => {
    if (!isConfigured) return;

    let customerInfoListener: (() => void) | null = null;

    const handleUser = async () => {
      // Keep isLoading=true for the entire async window so AdMobContext's consent
      // effect is blocked until RC + Firebase have resolved the user's tier (v1.2.3 fix).
      setIsLoading(true);
      if (user?.uid) {
        try {
          await Purchases.logIn(user.uid);
          const info = await Purchases.getCustomerInfo();
          setCustomerInfo(info);

          const offeringsResult = await Purchases.getOfferings();
          setOfferings(offeringsResult.current);

          // Set up customer info update listener
          const listener = (updatedInfo: CustomerInfo) => {
            setCustomerInfo(updatedInfo);
          };
          Purchases.addCustomerInfoUpdateListener(listener);
          customerInfoListener = () => {
            Purchases.removeCustomerInfoUpdateListener(listener);
          };
        } catch (error) {
          CrashReporting.recordError(error as Error, 'RevenueCatContext login/fetch');
          await loadCachedTier();
        }
      } else {
        try {
          await Purchases.logOut();
        } catch {
          // logOut can fail if not logged in — ignore
        }
        setCustomerInfo(null);
        setOfferings(null);
        setTier('free');
      }
      setIsLoading(false);
    };

    handleUser();

    return () => {
      customerInfoListener?.();
    };
  }, [user?.uid, isConfigured]);

  // Firebase RTDB listener for tier (authoritative source)
  useEffect(() => {
    if (!user?.familyGroupId) {
      setTier('free');
      return;
    }

    const tierRef = ref(getDatabase(), `/familyGroups/${user.familyGroupId}/subscriptionTier`);

    const onTierChange = (snapshot: any) => {
      const newTier: SubscriptionTier = snapshot.val() ?? 'free';
      setTier(newTier);
      cacheTier(newTier);

      // If we were waiting for a purchase to activate, it just did
      if (isPurchasingRef.current) {
        setIsPurchasing(false);
        if (purchaseTimeoutRef.current) {
          clearTimeout(purchaseTimeoutRef.current);
          purchaseTimeoutRef.current = null;
        }
      }
    };

    const unsubTier = onValue(tierRef, onTierChange);

    return () => {
      unsubTier();
    };
  }, [user?.familyGroupId]);

  // Reconciliation: server-side subscription verification on cold start
  useEffect(() => {
    const prevGroupId = prevFamilyGroupIdRef.current;
    const currentGroupId = user?.familyGroupId ?? null;
    prevFamilyGroupIdRef.current = currentGroupId;

    if (
      prevGroupId === null &&
      currentGroupId !== null &&
      user?.uid &&
      reconciledGroupRef.current !== currentGroupId
    ) {
      reconciledGroupRef.current = currentGroupId;
      // Send a fresh Firebase ID token so the edge function can verify the caller
      // server-side (reconcile writes the family's subscription tier).
      auth().currentUser?.getIdToken().then((idToken) =>
        supabase.functions.invoke('reconcile-subscription', {
          body: { appUserId: user.uid, familyGroupId: currentGroupId, idToken },
        })
      ).catch((error) => {
        CrashReporting.recordError(error as Error, 'RevenueCatContext tier reconciliation');
      });
    }
  }, [user?.familyGroupId, user?.uid]);

  const loadCachedTier = async () => {
    const cached = await AsyncStorage.getItem(TIER_CACHE_KEY);
    const parsed = safeJsonParse<{ tier?: SubscriptionTier } | null>(cached, null);
    if (parsed?.tier) {
      setTier(parsed.tier);
    }
  };

  const cacheTier = async (newTier: SubscriptionTier) => {
    try {
      await AsyncStorage.setItem(TIER_CACHE_KEY, JSON.stringify({ tier: newTier, timestamp: Date.now() }));
    } catch {
      // Cache write failed — non-critical
    }
  };

  const presentPaywall = useCallback(async () => {
    if (isPurchasing) return;

    try {
      const result = await RevenueCatUI.presentPaywall();

      if (
        result === RevenueCatUI.PAYWALL_RESULT.PURCHASED ||
        result === RevenueCatUI.PAYWALL_RESULT.RESTORED
      ) {
        // Purchase succeeded — now wait for webhook → Firebase → listener
        setIsPurchasing(true);

        purchaseTimeoutRef.current = setTimeout(() => {
          setIsPurchasing(false);
          purchaseTimeoutRef.current = null;
        }, PURCHASE_TIMEOUT_MS);
      }
    } catch (error) {
      if (__DEV__) console.warn('Paywall presentation failed:', error);
    }
  }, [isPurchasing]);

  const presentCustomerCenter = useCallback(async () => {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (error) {
      if (__DEV__) console.warn('Customer Center failed:', error);
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    if (isPurchasing) return;

    try {
      setIsPurchasing(true);
      await Purchases.restorePurchases();

      // Wait for webhook to process the restore
      purchaseTimeoutRef.current = setTimeout(() => {
        setIsPurchasing(false);
        purchaseTimeoutRef.current = null;
      }, PURCHASE_TIMEOUT_MS);
    } catch (error) {
      setIsPurchasing(false);
      if (__DEV__) console.warn('Restore purchases failed:', error);
    }
  }, [isPurchasing]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (purchaseTimeoutRef.current) {
        clearTimeout(purchaseTimeoutRef.current);
      }
    };
  }, []);

  const hasEntitlement = customerInfo?.entitlements.active[ENTITLEMENT_ID] !== undefined;

  const value: RevenueCatContextType = {
    tier,
    customerInfo,
    offerings,
    isLoading,
    isPurchasing,
    presentPaywall,
    presentCustomerCenter,
    restorePurchases,
    hasEntitlement,
  };

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat(): RevenueCatContextType {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
}
