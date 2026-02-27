import messaging from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';
import supabase from './SupabaseClient';

/**
 * NotificationManager
 * Handles FCM token registration, notification permissions, and notification handling
 */
class NotificationManager {
  private fcmToken: string | null = null;
  private readonly FCM_TOKEN_KEY = '@fcm_token';

  /**
   * Request notification permissions (Android 13+)
   */
  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }

      // For iOS or older Android versions
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      return enabled;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get FCM token for this device
   */
  async getFCMToken(): Promise<string | null> {
    try {
      // Check if we already have a token cached
      if (this.fcmToken) {
        return this.fcmToken;
      }

      // Try EncryptedStorage first (new location)
      const storedToken = await EncryptedStorage.getItem(this.FCM_TOKEN_KEY);
      if (storedToken) {
        this.fcmToken = storedToken;
        return storedToken;
      }
      // Migration: move from AsyncStorage on first access after upgrade
      const legacyToken = await AsyncStorage.getItem(this.FCM_TOKEN_KEY);
      if (legacyToken) {
        await EncryptedStorage.setItem(this.FCM_TOKEN_KEY, legacyToken);
        await AsyncStorage.removeItem(this.FCM_TOKEN_KEY);
        this.fcmToken = legacyToken;
        return legacyToken;
      }

      // Request permission first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      // Get new token from FCM
      const token = await messaging().getToken();

      // Cache the token
      this.fcmToken = token;
      await EncryptedStorage.setItem(this.FCM_TOKEN_KEY, token);

      return token;
    } catch (error) {
      return null;
    }
  }

  /**
   * Register FCM token with Supabase
   * This will be called when user logs in or token refreshes
   */
  async registerToken(userId: string, familyGroupId: string): Promise<void> {
    try {
      const token = await this.getFCMToken();
      if (!token) {
        return;
      }

      const { error } = await supabase.functions.invoke('register-device-token', {
        body: {
          user_id: userId,
          family_group_id: familyGroupId,
          fcm_token: token,
          platform: Platform.OS,
        },
      });

      if (error) {
        throw error;
      }

      await EncryptedStorage.setItem(
        '@fcm_token_data',
        JSON.stringify({
          token,
          userId,
          familyGroupId,
          registeredAt: Date.now(),
        })
      );
    } catch (error) {
      // Token registration failed - will retry later
    }
  }

  /**
   * Initialize notification listeners
   */
  initializeListeners(onNotificationReceived?: (notification: any) => void): void {
    // Handle foreground notifications
    messaging().onMessage(async (remoteMessage) => {
      if (onNotificationReceived) {
        onNotificationReceived(remoteMessage);
      }

      // Show local notification or in-app alert
      if (remoteMessage.notification) {
        Alert.alert(
          remoteMessage.notification.title || 'Notification',
          remoteMessage.notification.body || ''
        );
      }
    });

    // Handle background/quit state notification tap
    messaging().onNotificationOpenedApp((remoteMessage) => {
      // TODO: Navigate to UrgentItemsScreen based on remoteMessage.data
    });

    // Check if app was opened from a notification (quit state)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          // TODO: Navigate to UrgentItemsScreen based on remoteMessage.data
        }
      });

    // Handle token refresh
    messaging().onTokenRefresh(async (token) => {
      this.fcmToken = token;
      await EncryptedStorage.setItem(this.FCM_TOKEN_KEY, token);

      // Update token in Supabase
      try {
        const tokenData = await EncryptedStorage.getItem('@fcm_token_data');
        if (tokenData) {
          const { userId, familyGroupId } = JSON.parse(tokenData);
          await this.registerToken(userId, familyGroupId);
        }
      } catch (error) {
        // Token update failed - will retry on next refresh
      }
    });
  }

  /**
   * Create notification channel for Android (high priority)
   */
  async createNotificationChannel(): Promise<void> {
    // Note: For Android, we'll need to use a library like @notifee/react-native
    // for custom notification channels. For now, FCM will use default channel.
  }

  /**
   * Clear FCM token (on logout)
   */
  async clearToken(): Promise<void> {
    try {
      await messaging().deleteToken();
      await EncryptedStorage.removeItem(this.FCM_TOKEN_KEY);
      await EncryptedStorage.removeItem('@fcm_token_data');
      this.fcmToken = null;
    } catch (error) {
      // Token clear failed - not critical
    }
  }
}

export default new NotificationManager();
