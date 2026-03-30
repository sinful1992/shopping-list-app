import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import GoogleLogo from '../../components/GoogleLogo';
import AuthenticationModule from '../../services/AuthenticationModule';
import { useAlert } from '../../contexts/AlertContext';

const LoginScreen = () => {
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await AuthenticationModule.signInWithGoogle();
      if (!result) {
        // User cancelled — do nothing
      }
    } catch (error: unknown) {
      showAlert(
        'Login Failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
        undefined,
        { icon: 'error' },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#12121C' }}>
      <View style={styles.container}>
        <Text style={styles.title}>Family Shopping List</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <TouchableOpacity
          style={loading ? styles.buttonDisabled : undefined}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <LinearGradient
            colors={['#6EA8FE', '#A78BFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.button}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.buttonContent}>
                <GoogleLogo size={20} />
                <Text style={[styles.buttonText, { marginLeft: 8 }]}>Sign in with Google</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
          onPress={() => navigation.navigate('EmailLogin' as never)}
          disabled={loading}
        >
          <View style={styles.buttonContent}>
            <Icon name="mail-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.buttonSecondaryText}>Sign in with Email</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('SignUp' as never)}
          disabled={loading}
        >
          <Text style={styles.linkText}>Don't have an account? Sign Up</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#12121C',
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: 'rgba(255,255,255,0.45)',
  },
  button: {
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  buttonSecondaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    color: '#6EA8FE',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
});

export default LoginScreen;
