import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import CrashReporting from '../services/CrashReporting';
import { RADIUS, Theme } from '../styles/theme';
import { useTheme } from '../contexts/ThemeContext';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface InnerProps extends Props {
  theme: Theme;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryInner extends Component<InnerProps, State> {
  constructor(props: InnerProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    CrashReporting.recordJSError(error, errorInfo.componentStack || undefined);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const { theme } = this.props;
      const styles = createStyles(theme);
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function ErrorBoundary({ children, fallback }: Props) {
  const { theme } = useTheme();
  return <ErrorBoundaryInner theme={theme} fallback={fallback}>{children}</ErrorBoundaryInner>;
}

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.background.primary,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.accent.red,
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: theme.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: theme.accent.blue,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: RADIUS.large,
  },
  buttonText: {
    color: theme.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
