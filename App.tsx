import React, { useEffect, useState } from 'react';
import { Linking, LogBox, StatusBar, TouchableOpacity } from 'react-native';

LogBox.ignoreLogs(['VirtualizedLists should never be nested inside plain ScrollViews']);

const _consoleError = console.error.bind(console);
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('VirtualizedLists should never be nested')) return;
  _consoleError(...args);
};
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, useNavigation, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from './src/types/navigation';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import { getDatabase, ref, update, onValue } from '@react-native-firebase/database';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import SplashScreen from 'react-native-splash-screen';
import AuthenticationModule from './src/services/AuthenticationModule';
import SyncEngine from './src/services/SyncEngine';
import { runReceiptSyncBackfill } from './src/services/receiptSyncBackfill';
import { runHoistedFieldsBackfill } from './src/services/hoistedFieldsBackfill';
import NotificationManager from './src/services/NotificationManager';
import CrashReporting from './src/services/CrashReporting';
import AppCheckService from './src/services/AppCheckService';
import FirebaseAnalytics from './src/services/FirebaseAnalytics';
import { AlertProvider, useAlert } from './src/contexts/AlertContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { DARK_THEME, LIGHT_THEME } from './src/styles/theme';
import { useInAppUpdate } from './src/hooks';
import { RevenueCatProvider } from './src/contexts/RevenueCatContext';
import { AdMobProvider } from './src/contexts/AdMobContext';
import AdBanner from './src/components/AdBanner';
import AdConsentGate from './src/components/AdConsentGate';
import ErrorBoundary from './src/components/ErrorBoundary';
import { User } from './src/models/types';

// Map an FCM message to a deep-link path, or null if it shouldn't navigate.
function notificationToDeepLink(message: FirebaseMessagingTypes.RemoteMessage | null): string | null {
  if (message?.data?.type === 'urgent_item') {
    return 'familyshoppinglist://urgent';
  }
  return null;
}

// Deep linking configuration. Notification taps are fed through the linking
// layer (React Navigation's documented push-notification pattern) so cold-start
// navigation waits for the container to be ready — no navigation-ref race.
const linking = {
  prefixes: ['familyshoppinglist://', 'https://familyshoppinglist.app'],
  // Quit state: app opened from a notification
  async getInitialURL(): Promise<string | null> {
    const message = await messaging().getInitialNotification();
    const deepLink = notificationToDeepLink(message);
    if (deepLink) {
      return deepLink;
    }
    return Linking.getInitialURL();
  },
  // Background state: notification tapped while the app is alive
  subscribe(listener: (url: string) => void) {
    const unsubNotification = messaging().onNotificationOpenedApp((message) => {
      const deepLink = notificationToDeepLink(message);
      if (deepLink) {
        listener(deepLink);
      }
    });
    const linkingSub = Linking.addEventListener('url', ({ url }) => listener(url));
    return () => {
      unsubNotification();
      linkingSub.remove();
    };
  },
  config: {
    screens: {
      MainTabs: {
        screens: {
          Lists: {
            screens: {
              Home: 'home',
              ListDetail: 'list/:listId',
            },
          },
          Urgent: 'urgent',
          History: 'history',
          Analytics: 'analytics',
          Budget: 'budget',
        },
      },
      Settings: 'settings',
      Subscription: 'subscription',
    },
  },
};

// Navigation themes — derived from theme tokens so they stay in sync automatically
const DarkNavigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary:      DARK_THEME.accent.blue,
    background:   DARK_THEME.background.primary,
    card:         DARK_THEME.background.secondary,
    text:         DARK_THEME.text.primary,
    border:       DARK_THEME.border.subtle,
    notification: DARK_THEME.accent.blue,
  },
};

const LightNavigationTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary:      LIGHT_THEME.accent.blue,
    background:   LIGHT_THEME.background.primary,
    card:         LIGHT_THEME.background.secondary,
    text:         LIGHT_THEME.text.primary,
    border:       LIGHT_THEME.border.subtle,
    notification: LIGHT_THEME.accent.blue,
  },
};

// Import screens
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import EmailLoginScreen from './src/screens/auth/EmailLoginScreen';
import EmailSignUpScreen from './src/screens/auth/EmailSignUpScreen';
import FamilyGroupScreen from './src/screens/auth/FamilyGroupScreen';
import HomeScreen from './src/screens/lists/HomeScreen';
import ListDetailScreen from './src/screens/lists/ListDetailScreen';
import BudgetScreen from './src/screens/budget/BudgetScreen';
import HistoryScreen from './src/screens/history/HistoryScreen';
import HistoryDetailScreen from './src/screens/history/HistoryDetailScreen';
import ReceiptCameraScreen from './src/screens/receipts/ReceiptCameraScreen';
import ReceiptMatchScreen from './src/screens/receipts/ReceiptMatchScreen';
import ReceiptViewScreen from './src/screens/receipts/ReceiptViewScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import LegalDocumentScreen from './src/screens/settings/LegalDocumentScreen';
import UrgentItemsScreen from './src/screens/urgent/UrgentItemsScreen';
import { SubscriptionScreen } from './src/screens/subscription/SubscriptionScreen';
import AnalyticsScreen from './src/screens/analytics/AnalyticsScreen';
import TermsAcceptanceScreen from './src/screens/auth/TermsAcceptanceScreen';
import { CURRENT_TERMS_VERSION } from './src/legal';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Lists Stack Navigator
function ListsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HistoryDetail"
        component={HistoryDetailScreen}
        options={{ title: 'List Details' }}
      />
      <Stack.Screen
        name="ReceiptCamera"
        component={ReceiptCameraScreen}
        options={{ title: 'Capture Receipt' }}
      />
      <Stack.Screen
        name="ReceiptMatch"
        component={ReceiptMatchScreen}
        options={{ title: 'Match Receipt' }}
      />
      <Stack.Screen
        name="ReceiptView"
        component={ReceiptViewScreen}
        options={{ title: 'Receipt Details' }}
      />
    </Stack.Navigator>
  );
}

// History Stack Navigator
function HistoryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HistoryHome"
        component={HistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="HistoryDetail"
        component={HistoryDetailScreen}
        options={{ title: 'List Details' }}
      />
      <Stack.Screen
        name="ReceiptView"
        component={ReceiptViewScreen}
        options={{ title: 'Receipt Details' }}
      />
    </Stack.Navigator>
  );
}

// Main Tab Navigator with safe area handling
function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { showAlert } = useAlert();
  const { isDark } = useTheme();
  useInAppUpdate(showAlert);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: isDark ? '#6EA8FE' : '#2563EB',
        tabBarInactiveTintColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(17,24,39,0.4)',
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 5),
          paddingTop: 5,
          height: Math.max(insets.bottom + 60, 60),
          backgroundColor: isDark ? 'rgba(18, 18, 28, 0.95)' : 'rgba(255, 255, 255, 0.97)',
          borderTopWidth: 1,
          borderTopColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={{ marginRight: 15 }}
          >
            <Icon name="settings-outline" size={24} color={isDark ? '#6EA8FE' : '#2563EB'} />
          </TouchableOpacity>
        ),
      }}
      tabBar={(props) => (
        <>
          <AdBanner visible />
          <BottomTabBar {...props} />
        </>
      )}
    >
      <Tab.Screen
        name="Lists"
        component={ListsStack}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'Home';
          return {
            title: 'Shopping Lists',
            headerShown: routeName === 'Home',
            tabBarIcon: ({ color, size }) => (
              <Icon name="list-outline" size={size} color={color} />
            ),
          };
        }}
      />
      <Tab.Screen
        name="Urgent"
        component={UrgentItemsScreen}
        options={{
          title: 'Urgent',
          tabBarIcon: ({ color, size }) => (
            <Icon name="flame" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryStack}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'HistoryHome';
          return {
            title: 'History',
            headerShown: routeName === 'HistoryHome',
            tabBarIcon: ({ color, size }) => (
              <Icon name="time-outline" size={size} color={color} />
            ),
          };
        }}
      />
      <Tab.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, size }) => (
            <Icon name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Budget"
        component={BudgetScreen}
        options={{
          title: 'Budget',
          tabBarIcon: ({ color, size}) => (
            <Icon name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Main App Component
 * Sets up navigation and authentication flow
 */
function App(): JSX.Element {
  const { isDark } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication status on mount
    const unsubscribe = AuthenticationModule.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Initialize SyncEngine with family group ID when user has one
  useEffect(() => {
    if (user?.familyGroupId) {
      SyncEngine.setFamilyGroupId(user.familyGroupId);
    }
  }, [user?.familyGroupId]);

  // Backfill orphan receiptData rows that were written before the sync fix
  useEffect(() => {
    if (user) {
      runReceiptSyncBackfill().catch(e => console.warn('Receipt sync backfill failed:', e));
      runHoistedFieldsBackfill().catch(e => console.warn('Hoisted fields backfill failed:', e));
    }
  }, [user?.uid]);

  // Get showAlert from context
  const { showAlert } = useAlert();

  // Listen for family group deletion
  useEffect(() => {
    if (user?.familyGroupId) {
      const db = getDatabase();
      const familyGroupRef = ref(db, `/familyGroups/${user.familyGroupId}/createdAt`);

      const onFamilyGroupChange = async (snapshot: any) => {
        try {
          if (!snapshot.exists()) {
            await update(ref(db, `/users/${user.uid}`), { familyGroupId: null });
            showAlert(
              'Family Group Deleted',
              'Your family group was deleted. You will be signed out. Please sign in and create or join a new group.',
              [
                {
                  text: 'OK',
                  onPress: async () => {
                    await AuthenticationModule.signOut();
                  },
                },
              ],
              { icon: 'warning' }
            );
          }
        } catch (error) {
          CrashReporting.recordError(error as Error, 'App onFamilyGroupChange');
        }
      };

      const unsubscribe = onValue(familyGroupRef, onFamilyGroupChange);

      return () => {
        unsubscribe();
      };
    }
  }, [user?.familyGroupId, user?.uid, showAlert]);

  // Initialize App Check, Crashlytics and Analytics on app launch.
  // App Check goes first so attestation tokens are attached to subsequent
  // Firebase traffic.
  useEffect(() => {
    const initializeServices = async () => {
      try {
        await AppCheckService.initialize();
        await CrashReporting.initialize();
        await FirebaseAnalytics.initialize();
      } catch (_error) {
        // Can't report to Crashlytics if it failed to initialize
      }
    };

    initializeServices();
  }, []);

  // Set user ID for Crashlytics and Analytics when user logs in
  useEffect(() => {
    if (user) {
      CrashReporting.setUserId(user.uid);
      CrashReporting.setAttributes({
        familyGroupId: user.familyGroupId || 'none',
        role: user.role || 'none',
      });
      FirebaseAnalytics.setUserId(user.uid);
      FirebaseAnalytics.setUserProperties({
        family_group_id: user.familyGroupId || null,
        user_role: user.role || null,
      });
    }
  }, [user]);

  // Initialize FCM notifications when user logs in
  useEffect(() => {
    if (user && user.familyGroupId) {
      // Register FCM token
      NotificationManager.registerToken(user.uid, user.familyGroupId);

      // Initialize notification listeners — foreground messages surface as the
      // themed in-app alert instead of the raw system Alert
      const unsubscribeListeners = NotificationManager.initializeListeners((message) => {
        showAlert(
          message.notification?.title ?? 'Notification',
          message.notification?.body ?? ''
        );
      });

      // Create notification channel (Android)
      NotificationManager.createNotificationChannel();

      return unsubscribeListeners;
    }
  }, [user?.uid, user?.familyGroupId, showAlert]);

  // Hide splash screen when app is ready
  useEffect(() => {
    if (!loading) {
      SplashScreen.hide();
    }
  }, [loading]);

  if (loading) {
    return null; // Splash screen is still showing
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent={true}
      />
      <RevenueCatProvider user={user}>
      <NavigationContainer theme={isDark ? DarkNavigationTheme : LightNavigationTheme} linking={linking}>
        {!user ? (
          // Authentication Stack
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="EmailLogin" component={EmailLoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="EmailSignUp" component={EmailSignUpScreen} />
            <Stack.Screen name="FamilyGroup" component={FamilyGroupScreen} />
          </Stack.Navigator>
        ) : (
          // AdMobProvider is intentionally inside the auth gate — mounting it before login
          // caused the UMP consent dialog to appear on the login screen and the thank-you
          // alert to fire immediately after login (v1.2.3 fix).
          <AdMobProvider>
            {(user.termsAcceptedVersion ?? 0) < CURRENT_TERMS_VERSION ? (
              // Terms Acceptance
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="TermsAcceptance" component={TermsAcceptanceScreen} />
              </Stack.Navigator>
            ) : !user.familyGroupId ? (
              // Family Group Setup
              <Stack.Navigator>
                <Stack.Screen
                  name="FamilyGroup"
                  component={FamilyGroupScreen}
                  options={{ title: 'Join or Create Family Group' }}
                />
              </Stack.Navigator>
            ) : (
              // Main App with Settings accessible from header
              <AdConsentGate>
                <Stack.Navigator>
                  <Stack.Screen
                    name="MainTabs"
                    component={MainTabNavigator}
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="Settings"
                    component={SettingsScreen}
                    options={{ title: 'Settings' }}
                  />
                  <Stack.Screen
                    name="Subscription"
                    component={SubscriptionScreen}
                    options={{ title: 'Subscription' }}
                  />
                  <Stack.Screen
                    name="LegalDocument"
                    component={LegalDocumentScreen}
                    options={({ route }: any) => ({ title: route.params?.title || 'Legal' })}
                  />
                </Stack.Navigator>
              </AdConsentGate>
            )}
          </AdMobProvider>
        )}
      </NavigationContainer>
      </RevenueCatProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ThemeProvider must be outermost: AlertProvider renders CustomAlert which calls
// useTheme(), so CustomAlert must be a descendant of ThemeProvider.
function AppWithProvider(): JSX.Element {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default AppWithProvider;
