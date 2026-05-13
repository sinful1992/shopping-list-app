import React, { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { useAdMob } from '../contexts/AdMobContext';
import { useTheme } from '../contexts/ThemeContext';
import { AD_UNIT_IDS } from '../config/adConfig';
import type { Theme } from '../styles/theme';

interface AdBannerProps {
  visible: boolean;
}

function AdBanner({ visible }: AdBannerProps) {
  const { shouldShowAds, isInitialized } = useAdMob();
  const { theme } = useTheme();
  const [adLoaded, setAdLoaded] = useState(false);
  const styles = useMemo(() => createStyles(theme), [theme]);

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

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    backgroundColor: theme.background.primary,
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
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
