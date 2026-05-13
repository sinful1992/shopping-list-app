import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AuthenticationModule from '../../services/AuthenticationModule';
import { useAlert } from '../../contexts/AlertContext';
import { useTheme } from '../../contexts/ThemeContext';

const EmailLoginScreen = () => {
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Error', 'Please enter email and password', undefined, { icon: 'error' });
      return;
    }

    setLoading(true);
    try {
      await AuthenticationModule.signIn(email, password);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background.primary }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View style={styles.container}>
            <Text style={styles.title}>Sign in with Email</Text>
            <Text style={styles.subtitle}>Enter your email and password</Text>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={theme.text.tertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={theme.text.tertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={loading ? styles.buttonDisabled : undefined}
              onPress={handleLogin}
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
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.linkText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const createStyles = (theme: import('../../styles/theme').Theme) => StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.background.primary,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: theme.text.primary,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: theme.text.secondary,
  },
  input: {
    backgroundColor: theme.glass.subtle,
    padding: 15,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: theme.border.medium,
    color: theme.text.primary,
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
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    color: theme.accent.blue,
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
});

export default EmailLoginScreen;
