import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AdsConsent } from 'react-native-google-mobile-ads';
import { AdMobProvider, useAdMob } from '../AdMobContext';
import { useRevenueCat } from '../RevenueCatContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AdConsentGate from '../../components/AdConsentGate';
import { Text } from 'react-native';

jest.mock('react-native-google-mobile-ads', () => {
  const ad = () => ({
    addAdEventListener: jest.fn(() => jest.fn()),
    removeAllListeners: jest.fn(),
    load: jest.fn(),
    show: jest.fn(),
  });
  return {
    __esModule: true,
    default: () => ({ initialize: jest.fn().mockResolvedValue([]) }),
    InterstitialAd: { createForAdRequest: jest.fn(ad) },
    RewardedAd: { createForAdRequest: jest.fn(ad) },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
    AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed', OPENED: 'opened' },
    AdsConsentPrivacyOptionsRequirementStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', UNKNOWN: 'UNKNOWN' },
    AdsConsent: {
      gatherConsent: jest.fn(),
      getConsentInfo: jest.fn(),
      showPrivacyOptionsForm: jest.fn(),
      reset: jest.fn(),
    },
  };
});

jest.mock('../RevenueCatContext', () => ({ useRevenueCat: jest.fn() }));

jest.mock('../../services/CrashReporting', () => ({
  __esModule: true,
  default: { recordError: jest.fn() },
}));

const consent = AdsConsent as unknown as Record<string, jest.Mock>;
const useRevenueCatMock = useRevenueCat as jest.Mock;
const storage = AsyncStorage as unknown as Record<string, jest.Mock>;

type Ctx = ReturnType<typeof useAdMob>;

async function renderProvider(): Promise<{ result: { current: Ctx }; unmount: () => void }> {
  const result = { current: null as unknown as Ctx };
  const Harness = () => {
    result.current = useAdMob();
    return null;
  };
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <AdMobProvider>
        <Harness />
      </AdMobProvider>,
    );
  });
  return { result, unmount: () => act(() => renderer.unmount()) };
}

jest.mock('../AlertContext', () => ({ useAlert: () => ({ showAlert: jest.fn() }) }));
jest.mock('../ThemeContext', () => {
  const { DARK_THEME: theme } = jest.requireActual('../../styles/theme');
  return { useTheme: () => ({ theme }) };
});

const offline = () => consent.gatherConsent.mockRejectedValue(new Error('Error: network unavailable'));

async function renderGate(): Promise<{ text: () => string; unmount: () => void }> {
  let renderer: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <AdMobProvider>
        <AdConsentGate><Text>APP</Text></AdConsentGate>
      </AdMobProvider>,
    );
  });
  const text = () => JSON.stringify(renderer.toJSON());
  return { text, unmount: () => act(() => renderer.unmount()) };
}

beforeEach(() => {
  jest.clearAllMocks();
  useRevenueCatMock.mockReturnValue({ tier: 'free', hasEntitlement: false, isLoading: false, presentPaywall: jest.fn() });
  storage.getItem.mockResolvedValue(null);
});

describe('adabreak #9 AdMob offline', () => {
  // A refusal made on a build before 1.53.10 has no ads_consent_refused key;
  // only UMP's own cache (status OBTAINED, canRequestAds false) remembers it.
  // "Accept Ads" (retryConsent) calls AdsConsent.reset() first, which wipes
  // that cache, then gatherConsent fails offline.
  it('legacy refusal + Accept Ads tapped offline: the wall stays', async () => {
    offline();
    let umpCache: any = { status: 'OBTAINED', canRequestAds: false };
    consent.getConsentInfo.mockImplementation(async () => umpCache);
    consent.reset.mockImplementation(() => { umpCache = { status: 'UNKNOWN', canRequestAds: false }; });
    const { result, unmount } = await renderProvider();
    expect(result.current.consentObtained).toBe(false);
    expect(result.current.consentUnavailable).toBe(false); // wall on cold start
    await act(async () => { await result.current.retryConsent(); });
    expect(result.current.consentUnavailable).toBe(false); // must still show the wall
    unmount();
  });

  it('refusal recorded by this build + Accept Ads offline: the wall stays', async () => {
    offline();
    let umpCache: any = { status: 'OBTAINED', canRequestAds: false };
    consent.getConsentInfo.mockImplementation(async () => umpCache);
    consent.reset.mockImplementation(() => { umpCache = { status: 'UNKNOWN', canRequestAds: false }; });
    storage.getItem.mockImplementation(async (k: string) => (k === 'ads_consent_refused' ? '1' : null));
    const { result, unmount } = await renderProvider();
    await act(async () => { await result.current.retryConsent(); });
    expect(result.current.consentUnavailable).toBe(false);
    expect(result.current.consentObtained).toBe(false);
    unmount();
  });

  it('consent given before + offline now: ads are initialised', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'OBTAINED', canRequestAds: true });
    const { result, unmount } = await renderProvider();
    expect(result.current.consentObtained).toBe(true);
    expect(result.current.isInitialized).toBe(true);
    unmount();
  });

  it('previously refused (stored) + offline cold start: wall shown', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'UNKNOWN', canRequestAds: false });
    storage.getItem.mockImplementation(async (k: string) => (k === 'ads_consent_refused' ? '1' : null));
    const { text, unmount } = await renderGate();
    expect(text()).toContain('Ads Required');
    unmount();
  });
});
