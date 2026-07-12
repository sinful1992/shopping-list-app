import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import SyncEngine from '../services/SyncEngine';
import CrashReporting from '../services/CrashReporting';
import { SyncEngineStatus } from '../models/types';
import { useTheme } from '../contexts/ThemeContext';
import type { Theme } from '../styles/theme';

/**
 * SyncStatusBanner
 * Surfaces the offline/failed sync queue that was previously invisible:
 * - online with pending operations → "N changes not synced · Retry"
 * - offline with pending operations → "N changes waiting to sync"
 * Hidden when the queue is empty.
 */
const SyncStatusBanner: React.FC = () => {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [status, setStatus] = useState<SyncEngineStatus | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let mounted = true;

    SyncEngine.getSyncStatus()
      .then((s) => { if (mounted) setStatus(s); })
      .catch((error) => CrashReporting.recordError(error as Error, 'SyncStatusBanner initial status'));

    const unsubscribe = SyncEngine.onStatusChange((s) => {
      if (mounted) setStatus(s);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await SyncEngine.syncPendingChanges();
    } catch (error) {
      CrashReporting.recordError(error as Error, 'SyncStatusBanner retry');
    } finally {
      setRetrying(false);
    }
  };

  if (!status || status.pendingOperations === 0) {
    return null;
  }

  const count = status.pendingOperations;
  const label = count === 1 ? '1 change' : `${count} changes`;

  return (
    <View style={styles.banner}>
      <Icon
        name={status.isOnline ? 'cloud-upload-outline' : 'cloud-offline-outline'}
        size={16}
        color={theme.accent.yellow}
        style={styles.icon}
      />
      <Text style={styles.text}>
        {status.isOnline ? `${label} not synced` : `${label} waiting to sync`}
      </Text>
      {status.isOnline && (
        <TouchableOpacity
          onPress={handleRetry}
          disabled={retrying}
          accessibilityRole="button"
          accessibilityLabel="Retry sync"
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>{retrying ? 'Retrying…' : 'Retry'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) => StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: theme.accent.yellowDim,
  },
  icon: {
    marginRight: 8,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: theme.text.primary,
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.accent.blue,
  },
});

export default SyncStatusBanner;
