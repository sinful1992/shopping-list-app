import React, { useState } from 'react';
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

/**
 * SignUpScreen
 * New user registration
 * Implements Req 1.1
 */
const SignUpScreen = () => {
  const navigation = useNavigation();
  const { showAlert } = useAlert();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!name || !email || !password || !confirmPassword) {
      showAlert('Error', 'Please fill in all fields', undefined, { icon: 'error' });
      return;
    }

    if (password !== confirmPassword) {
      showAlert('Error', 'Passwords do not match', undefined, { icon: 'error' });
      return;
    }

    if (password.length < 6) {
      showAlert('Error', 'Password must be at least 6 characters', undefined, { icon: 'error' });
      return;
    }

    setLoading(true);
    try {
      await AuthenticationModule.signUp(email, password, name);
      // Navigation handled by App.tsx
    } catch (error: unknown) {
      showAlert('Sign Up Failed', error instanceof Error ? error.message : 'Something went wrong. Please try again.', undefined, { icon: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#12121C' }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={styles.container}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join your family shopping list</Text>

          <TextInput
            style={styles.input}
            placeholder="Your Name"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm Password"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={loading && styles.buttonDisabled}
            onPress={handleSignUp}
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
                <Text style={styles.buttonText}>Sign Up</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <Text style={styles.linkText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#12121C',
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
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 15,
    borderRadius: 14,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    color: '#ffffff',
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
    color: '#6EA8FE',
    textAlign: 'center',
    fontSize: 16,
    marginTop: 20,
  },
});

export default SignUpScreen;
