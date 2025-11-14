import messaging from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

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
      console.error('Error requesting notification permissions:', error);
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

      // Try to get from AsyncStorage
      const storedToken = await AsyncStorage.getItem(this.FCM_TOKEN_KEY);
      if (storedToken) {
        this.fcmToken = storedToken;
        return storedToken;
      }

      // Request permission first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.log('Notification permission denied');
        return null;
      }

      // Get new token from FCM
      const token = await messaging().getToken();

      // Cache the token
      this.fcmToken = token;
      await AsyncStorage.setItem(this.FCM_TOKEN_KEY, token);

      return token;
    } catch (error) {
      console.error('Error getting FCM token:', error);
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
        console.log('No FCM token available');
        return;
      }

      console.log('Registering FCM Token with Supabase...');

      // Check if environment variables are loaded
      if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Supabase environment variables not loaded!');
        console.error('SUPABASE_URL:', SUPABASE_URL);
        console.error('SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY ? 'exists' : 'missing');
        return;
      }

      const url = `${SUPABASE_URL}/rest/v1/device_tokens`;
      console.log('Sending token to:', url);

      // Send token to Supabase
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_id: userId,
          family_group_id: familyGroupId,
          fcm_token: token,
          platform: Platform.OS
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to register token with Supabase:', errorText);
        throw new Error('Failed to register token');
      }

      console.log('FCM Token registered with Supabase successfully');

      // Store token data locally as well
      await AsyncStorage.setItem(
        '@fcm_token_data',
        JSON.stringify({
          token,
          userId,
          familyGroupId,
          registeredAt: Date.now(),
        })
      );
    } catch (error) {
      console.error('Error registering FCM token:', error);
    }
  }

  /**
   * Initialize notification listeners
   */
  initializeListeners(onNotificationReceived?: (notification: any) => void): void {
    // Handle foreground notifications
    messaging().onMessage(async (remoteMessage) => {
      console.log('Foreground notification received:', remoteMessage);

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
      console.log('Notification opened app from background:', remoteMessage);
      // TODO: Navigate to UrgentItemsScreen
    });

    // Check if app was opened from a notification (quit state)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log('Notification opened app from quit state:', remoteMessage);
          // TODO: Navigate to UrgentItemsScreen
        }
      });

    // Handle token refresh
    messaging().onTokenRefresh(async (token) => {
      console.log('FCM token refreshed:', token);
      this.fcmToken = token;
      await AsyncStorage.setItem(this.FCM_TOKEN_KEY, token);

      // Update token in Supabase
      try {
        const tokenData = await AsyncStorage.getItem('@fcm_token_data');
        if (tokenData) {
          const { userId, familyGroupId } = JSON.parse(tokenData);
          await this.registerToken(userId, familyGroupId);
        }
      } catch (error) {
        console.error('Error updating token in Supabase:', error);
      }
    });
  }

  /**
   * Create notification channel for Android (high priority)
   */
  async createNotificationChannel(): Promise<void> {
    if (Platform.OS === 'android') {
      // Note: For Android, we'll need to use a library like @notifee/react-native
      // for custom notification channels. For now, FCM will use default channel.
      console.log('Notification channel creation pending (requires @notifee/react-native)');
    }
  }

  /**
   * Clear FCM token (on logout)
   */
  async clearToken(): Promise<void> {
    try {
      await messaging().deleteToken();
      await AsyncStorage.removeItem(this.FCM_TOKEN_KEY);
      await AsyncStorage.removeItem('@fcm_token_data');
      this.fcmToken = null;
    } catch (error) {
      console.error('Error clearing FCM token:', error);
    }
  }
}

export default new NotificationManager();
