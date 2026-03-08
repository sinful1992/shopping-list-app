import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import database from '@react-native-firebase/database';
import AuthenticationModule from '../../services/AuthenticationModule';
import { useAlert } from '../../contexts/AlertContext';
import {
  PRIVACY_POLICY_CONTENT,
  TERMS_OF_SERVICE_CONTENT,
  CURRENT_TERMS_VERSION,
} from '../../legal';
import SimpleMarkdown from '../../components/SimpleMarkdown';

const TermsAcceptanceScreen = () => {
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    setLoading(true);
    try {
      const user = await AuthenticationModule.getCurrentUser();
      if (!user) {
        throw new Error('No authenticated user found');
      }

      await database().ref(`/users/${user.uid}`).update({
        termsAcceptedVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: Date.now(),
      });
    } catch (error: any) {
      showAlert(
        'Error',
        'Failed to save your acceptance. Please try again.',
        [
          { text: 'Try Again', onPress: handleAccept },
          { text: 'Cancel', style: 'cancel' },
        ],
        { icon: 'error' },
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = () => {
    showAlert(
      'Decline Terms',
      'You must accept the Terms of Service and Privacy Policy to use the app. Declining will sign you out.',
      [
        { text: 'Go Back', style: 'cancel' },
        {
          text: 'Decline & Log Out',
          style: 'destructive',
          onPress: () => AuthenticationModule.signOut(),
        },
      ],
      { icon: 'warning' },
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Terms & Privacy Policy</Text>
      <Text style={styles.subtitle}>
        Please review and accept our Terms of Service and Privacy Policy to
        continue.
      </Text>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}>
        <SimpleMarkdown content={PRIVACY_POLICY_CONTENT} />
        <View style={styles.divider} />
        <SimpleMarkdown content={TERMS_OF_SERVICE_CONTENT} />
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={loading && styles.buttonDisabled}
          onPress={handleAccept}
          disabled={loading}>
          <LinearGradient
            colors={['#6EA8FE', '#A78BFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.acceptButton}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.acceptButtonText}>I Accept</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.declineButton}
          onPress={handleDecline}
          disabled={loading}>
          <Text style={styles.declineButtonText}>Decline & Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D14',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 20,
    marginHorizontal: 20,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  scrollView: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 20,
  },
  buttonContainer: {
    padding: 20,
    paddingBottom: 30,
  },
  acceptButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  declineButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineButtonText: {
    color: '#FF453A',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default TermsAcceptanceScreen;
