import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import SplashScreen from 'react-native-splash-screen';
import CrashReporting from '../services/CrashReporting';
import Icon from 'react-native-vector-icons/Ionicons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-root error boundary. Catches render/lifecycle errors anywhere below it,
 * reports them to Crashlytics, and shows a reload fallback instead of a white
 * screen.
 *
 * The fallback is intentionally self-contained — no theme, no context, no
 * external state — so it cannot itself throw while handling a crash (a fallback
 * that throws would white-screen worse than the bug it catches).
 *
 * Scope: React boundaries only catch render-phase errors. Errors in event
 * handlers, async code, and native crashes are NOT caught here — those already
 * reach Crashlytics via React Native Firebase's global handler.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // If App throws before its own "hide splash" effect runs, the native splash
    // stays on top and covers this fallback — leaving the user stuck on the
    // splash instead of the recoverable error screen. Hide it here too. Wrapped
    // so a splash-module failure can't re-throw while we're handling a crash.
    try { SplashScreen.hide(); } catch { /* never throw from the fallback path */ }
    CrashReporting.recordJSError(error, errorInfo.componentStack ?? undefined);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.centered}>
          <Icon name="warning-outline" size={52} color="#FFB340" style={styles.errorIcon} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorSub}>{this.state.error?.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={this.handleReset}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#12121C', paddingHorizontal: 40 },
  errorIcon:    { fontSize: 52, marginBottom: 12 },
  errorTitle:   { fontSize: 18, fontWeight: '700', color: '#ffffff', marginBottom: 6, textAlign: 'center' },
  errorSub:     { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 20 },
  retryBtn:     { backgroundColor: 'rgba(110,168,254,0.8)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

export default ErrorBoundary;
