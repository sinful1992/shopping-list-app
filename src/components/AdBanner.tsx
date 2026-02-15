import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useAdMob } from '../contexts/AdMobContext';
import { AD_UNIT_IDS } from '../config/adConfig';

interface AdBannerProps {
  visible: boolean;
}

function AdBanner({ visible }: AdBannerProps) {
  const { shouldShowAds, isInitialized } = useAdMob();
  const [adLoaded, setAdLoaded] = useState(false);

  if (!shouldShowAds || !isInitialized) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        !visible && styles.hidden,
        !adLoaded && styles.collapsed,
      ]}
    >
      <BannerAd
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setAdLoaded(true)}
        onAdFailedToLoad={() => setAdLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  hidden: {
    opacity: 0,
    height: 0,
    overflow: 'hidden',
  },
  collapsed: {
    height: 0,
    overflow: 'hidden',
  },
});

export default AdBanner;
