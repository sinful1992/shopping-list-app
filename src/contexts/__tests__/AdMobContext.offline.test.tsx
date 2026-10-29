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

describe('AdMobContext offline cold start (review #9)', () => {
  it('lets a free user in when UMP is unreachable and the phone has no consent answer yet', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'UNKNOWN', canRequestAds: false });
    const { text, unmount } = await renderGate();
    expect(text()).toContain('APP');
    expect(text()).not.toContain('Ads Required');
    unmount();
  });

  it('keeps ads on offline when consent was given before (UMP cache)', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'OBTAINED', canRequestAds: true });
    const { result, unmount } = await renderProvider();
    expect(result.current.consentObtained).toBe(true);
    expect(result.current.shouldShowAds).toBe(true);
    unmount();
  });

  it('keeps the wall offline when consent was refused before (stored answer)', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'REQUIRED', canRequestAds: false });
    storage.getItem.mockImplementation(async (k: string) => (k === 'ads_consent_refused' ? '1' : null));
    const { text, unmount } = await renderGate();
    expect(text()).toContain('Ads Required');
    expect(text()).not.toContain('APP');
    unmount();
  });

  it('keeps the wall offline when the UMP cache says the user answered and ads are off', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'OBTAINED', canRequestAds: false });
    const { text, unmount } = await renderGate();
    expect(text()).toContain('Ads Required');
    unmount();
  });

  it('keeps the wall when even the cached info cannot be read and a refusal is stored', async () => {
    offline();
    consent.getConsentInfo.mockRejectedValue(new Error('no cache'));
    storage.getItem.mockResolvedValue('1');
    const { text, unmount } = await renderGate();
    expect(text()).toContain('Ads Required');
    unmount();
  });

  it('lets the user in when the stored answer cannot be read and nothing says refused', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'UNKNOWN', canRequestAds: false });
    storage.getItem.mockRejectedValue(new Error('storage broken'));
    const { text, unmount } = await renderGate();
    expect(text()).toContain('APP');
    unmount();
  });

  it('records an online refusal and clears it after a later yes', async () => {
    consent.gatherConsent.mockResolvedValue(undefined);
    consent.getConsentInfo.mockResolvedValue({ status: 'REQUIRED', canRequestAds: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    const first = await renderProvider();
    expect(storage.setItem).toHaveBeenCalledWith('ads_consent_refused', '1');
    first.unmount();
    consent.getConsentInfo.mockResolvedValue({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    const second = await renderProvider();
    expect(storage.removeItem).toHaveBeenCalledWith('ads_consent_refused');
    second.unmount();
  });

  it('online answer still wins: a refusal online shows the wall', async () => {
    consent.gatherConsent.mockResolvedValue(undefined);
    consent.getConsentInfo.mockResolvedValue({ status: 'REQUIRED', canRequestAds: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    const { text, unmount } = await renderGate();
    expect(text()).toContain('Ads Required');
    unmount();
  });

  it('asks UMP again when the app returns to the foreground after an offline start', async () => {
    offline();
    consent.getConsentInfo.mockResolvedValue({ status: 'UNKNOWN', canRequestAds: false });
    const { AppState } = jest.requireActual('react-native');
    const listeners: Array<(s: string) => void> = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((...args: unknown[]) => {
      listeners.push(args[1] as (s: string) => void);
      return { remove: jest.fn() } as never;
    });
    const { result, unmount } = await renderProvider();
    expect(result.current.consentUnavailable).toBe(true);
    consent.gatherConsent.mockResolvedValue(undefined);
    consent.getConsentInfo.mockResolvedValue({ status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
    await act(async () => { listeners.forEach(l => l('active')); });
    expect(result.current.consentUnavailable).toBe(false);
    expect(result.current.consentObtained).toBe(true);
    spy.mockRestore();
    unmount();
  });
});
