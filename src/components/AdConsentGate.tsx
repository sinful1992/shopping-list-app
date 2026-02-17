import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAdMob } from '../contexts/AdMobContext';
import { useRevenueCat } from '../contexts/RevenueCatContext';
import { useAlert } from '../contexts/AlertContext';

interface AdConsentGateProps {
  children: React.ReactNode;
}

export default function AdConsentGate({ children }: AdConsentGateProps) {
  const { consentChecked, consentObtained, retryConsent } = useAdMob();
  const { tier, hasEntitlement, isLoading, presentPaywall } = useRevenueCat();
  const { showAlert } = useAlert();
  const [retrying, setRetrying] = useState(false);
  const shownRef = useRef(false);

  const isFreeUser = tier === 'free' && !hasEntitlement;

  useEffect(() => {
    if (!consentObtained || !isFreeUser || !consentChecked) return;
    if (shownRef.current) return;
    shownRef.current = true;

    AsyncStorage.getItem('ad_thank_you_shown').then((value) => {
      if (!value) {
        showAlert(
          'Thank You!',
          'Your support by viewing ads helps keep this app free for everyone.',
          undefined,
          { icon: 'success' },
        );
        AsyncStorage.setItem('ad_thank_you_shown', 'true');
      }
    });
  }, [consentObtained, isFreeUser, consentChecked]);

  if (isLoading || !isFreeUser) return <>{children}</>;

  if (!consentChecked) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!consentObtained) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Ads Required</Text>
        <Text style={styles.message}>
          This app is free thanks to ads. Please accept ads to continue using the app, or upgrade to Premium for an ad-free experience.
        </Text>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, retrying && styles.disabledButton]}
          onPress={async () => {
            setRetrying(true);
            try {
              await retryConsent();
            } finally {
              setRetrying(false);
            }
          }}
          disabled={retrying}
        >
          {retrying ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Accept Ads</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={presentPaywall}
          disabled={retrying}
        >
          <Text style={styles.buttonText}>Upgrade to Premium</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#2c2c2e',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
