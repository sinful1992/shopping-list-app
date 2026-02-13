import React, { useEffect, useState } from 'react';
import { StatusBar, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme, useNavigation, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import database from '@react-native-firebase/database';
import SplashScreen from 'react-native-splash-screen';
import AuthenticationModule from './src/services/AuthenticationModule';
import SyncEngine from './src/services/SyncEngine';
import NotificationManager from './src/services/NotificationManager';
import CrashReporting from './src/services/CrashReporting';
import FirebaseAnalytics from './src/services/FirebaseAnalytics';
import { AlertProvider, useAlert } from './src/contexts/AlertContext';
import { RevenueCatProvider } from './src/contexts/RevenueCatContext';
import { User } from './src/models/types';

// Deep linking configuration
const linking = {
  prefixes: ['familyshoppinglist://', 'https://familyshoppinglist.app'],
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
          Subscription: 'subscription',
        },
      },
      Settings: 'settings',
    },
  },
};

// Dark theme for navigation
const DarkNavigationTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: '#007AFF',
    background: '#0a0a0a',
    card: '#1c1c1e',
    text: '#ffffff',
    border: 'rgba(255, 255, 255, 0.1)',
    notification: '#007AFF',
  },
};

// Import screens
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import FamilyGroupScreen from './src/screens/auth/FamilyGroupScreen';
import HomeScreen from './src/screens/lists/HomeScreen';
import ListDetailScreen from './src/screens/lists/ListDetailScreen';
import BudgetScreen from './src/screens/budget/BudgetScreen';
import HistoryScreen from './src/screens/history/HistoryScreen';
import HistoryDetailScreen from './src/screens/history/HistoryDetailScreen';
import ReceiptCameraScreen from './src/screens/receipts/ReceiptCameraScreen';
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
  const navigation = useNavigation();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#6E6E73',
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 5),
          paddingTop: 5,
          height: Math.max(insets.bottom + 60, 60),
          backgroundColor: 'rgba(18, 18, 18, 0.95)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
        },
        headerRight: () => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings' as never)}
            style={{ marginRight: 15 }}
          >
            <Icon name="settings-outline" size={24} color="#007AFF" />
          </TouchableOpacity>
        ),
      }}
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
        component={HistoryScreen}
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Icon name="time-outline" size={size} color={color} />
          ),
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
      <Tab.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{
          title: 'Pro',
          tabBarIcon: ({ color, size }) => (
            <Icon name="star-outline" size={size} color={color} />
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

  // Get showAlert from context
  const { showAlert } = useAlert();

  // Listen for family group deletion
  useEffect(() => {
    if (user?.familyGroupId) {
      const familyGroupRef = database().ref(`/familyGroups/${user.familyGroupId}`);

      const onFamilyGroupChange = async (snapshot: any) => {
        if (!snapshot.exists()) {
          // Family group was deleted

          // Clear user's familyGroupId
          await database().ref(`/users/${user.uid}`).update({
            familyGroupId: null,
          });

          // Show alert and sign out user
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
      };

      familyGroupRef.on('value', onFamilyGroupChange);

      // Store cleanup function
      return () => {
        familyGroupRef.off('value', onFamilyGroupChange);
      };
    }
  }, [user?.familyGroupId, user?.uid, showAlert]);

  // Initialize Crashlytics and Analytics on app launch
  useEffect(() => {
    const initializeServices = async () => {
      try {
        await CrashReporting.initialize();
        await FirebaseAnalytics.initialize();
      } catch (error) {
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

      // Initialize notification listeners
      NotificationManager.initializeListeners();

      // Create notification channel (Android)
      NotificationManager.createNotificationChannel();
    }
  }, [user]);

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
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0a0a0a"
        translucent={false}
      />
      <RevenueCatProvider user={user}>
      <NavigationContainer theme={DarkNavigationTheme} linking={linking}>
        {!user ? (
          // Authentication Stack
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="FamilyGroup" component={FamilyGroupScreen} />
          </Stack.Navigator>
        ) : (user.termsAcceptedVersion ?? 0) < CURRENT_TERMS_VERSION ? (
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
              name="LegalDocument"
              component={LegalDocumentScreen}
              options={({ route }: any) => ({ title: route.params?.title || 'Legal' })}
            />
          </Stack.Navigator>
        )}
      </NavigationContainer>
      </RevenueCatProvider>
    </SafeAreaProvider>
  );
}

// Wrap App with AlertProvider
function AppWithProvider(): JSX.Element {
  return (
    <AlertProvider>
      <App />
    </AlertProvider>
  );
}

export default AppWithProvider;
