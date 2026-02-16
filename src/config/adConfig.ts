export const AD_UNIT_IDS = {
  banner: __DEV__
    ? 'ca-app-pub-3940256099942544/6300978111'
    : 'ca-app-pub-6393499933839379/4993173195',
  interstitial: __DEV__
    ? 'ca-app-pub-3940256099942544/1033173712'
    : 'ca-app-pub-6393499933839379/1924156722',
  rewarded: __DEV__
    ? 'ca-app-pub-3940256099942544/5224354917'
    : 'ca-app-pub-6393499933839379/5544671685',
};

export const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;
export const INTERSTITIAL_DELAY_MS = 3000;
export const MAX_RETRY_ATTEMPTS = 3;
