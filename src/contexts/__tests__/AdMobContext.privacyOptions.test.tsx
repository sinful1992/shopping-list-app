import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AdsConsent } from 'react-native-google-mobile-ads';
import { AdMobProvider, useAdMob } from '../AdMobContext';
import { useRevenueCat } from '../RevenueCatContext';
import CrashReporting from '../../services/CrashReporting';

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
const recordErrorMock = CrashReporting.recordError as jest.Mock;

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

const info = (privacyOptionsRequirementStatus: string, canRequestAds = true) => ({
  canRequestAds,
  privacyOptionsRequirementStatus,
});

beforeEach(() => {
  jest.clearAllMocks();
  useRevenueCatMock.mockReturnValue({ tier: 'free', hasEntitlement: false, isLoading: false });
  consent.gatherConsent.mockResolvedValue(undefined);
});

describe('AdMobContext privacy options', () => {
  it('offers the privacy options to a free user when UMP says they are required (UK/EEA)', async () => {
    consent.getConsentInfo.mockResolvedValue(info('REQUIRED'));
    const { result, unmount } = await renderProvider();
    expect(result.current.privacyOptionsRequired).toBe(true);
    unmount();
  });

  it('does not offer them when UMP says they are not required', async () => {
    consent.getConsentInfo.mockResolvedValue(info('NOT_REQUIRED'));
    const { result, unmount } = await renderProvider();
    expect(result.current.privacyOptionsRequired).toBe(false);
    unmount();
  });

  it('never asks UMP for a paying user, and does not offer the row', async () => {
    useRevenueCatMock.mockReturnValue({ tier: 'premium', hasEntitlement: true, isLoading: false });
    consent.getConsentInfo.mockResolvedValue(info('REQUIRED'));
    const { result, unmount } = await renderProvider();
    expect(consent.gatherConsent).not.toHaveBeenCalled();
    expect(consent.getConsentInfo).not.toHaveBeenCalled();
    expect(result.current.privacyOptionsRequired).toBe(false);
    unmount();
  });

  it('opens the UMP privacy options form and keeps ads on when consent still allows them', async () => {
    consent.getConsentInfo.mockResolvedValue(info('REQUIRED'));
    consent.showPrivacyOptionsForm.mockResolvedValue(info('REQUIRED', true));
    const { result, unmount } = await renderProvider();
    await act(async () => {
      await result.current.showPrivacyOptions();
    });
    expect(consent.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(result.current.consentObtained).toBe(true);
    unmount();
  });

  it('stops ads when the form returns that ads can no longer be requested', async () => {
    consent.getConsentInfo.mockResolvedValue(info('REQUIRED'));
    consent.showPrivacyOptionsForm.mockResolvedValue(info('REQUIRED', false));
    const { result, unmount } = await renderProvider();
    await act(async () => {
      await result.current.showPrivacyOptions();
    });
    expect(result.current.consentObtained).toBe(false);
    expect(result.current.shouldShowAds).toBe(false);
    unmount();
  });

  it('records the error and does not throw when the form fails', async () => {
    consent.getConsentInfo.mockResolvedValue(info('REQUIRED'));
    consent.showPrivacyOptionsForm.mockRejectedValue(new Error('form unavailable'));
    const { result, unmount } = await renderProvider();
    await act(async () => {
      await result.current.showPrivacyOptions();
    });
    expect(recordErrorMock).toHaveBeenCalledWith(expect.any(Error), 'AdMobContext UMP privacy options');
    expect(result.current.consentObtained).toBe(true);
    unmount();
  });
});
