import React, { useEffect, useState } from 'react';
import { StatusBar, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import AuthenticationModule from './src/services/AuthenticationModule';
import SyncEngine from './src/services/SyncEngine';
import NotificationManager from './src/services/NotificationManager';
import PaymentService from './src/services/PaymentService';
import { User } from './src/models/types';

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
import HistoryDetailScreen from './src/screens/history/HistoryDetailScreen';
import ReceiptCameraScreen from './src/screens/receipts/ReceiptCameraScreen';
import ReceiptViewScreen from './src/screens/receipts/ReceiptViewScreen';
import SettingsScreen from './src/screens/settings/SettingsScreen';
import UrgentItemsScreen from './src/screens/urgent/UrgentItemsScreen';
import { SubscriptionScreen } from './src/screens/subscription/SubscriptionScreen';
import AnalyticsScreen from './src/screens/analytics/AnalyticsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Lists Stack Navigator
function ListsStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Shopping Lists' }}
      />
      <Stack.Screen
        name="ListDetail"
        component={ListDetailScreen}
        options={{ title: 'List Details' }}
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
      }}
    >
      <Tab.Screen
        name="Lists"
        component={ListsStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon name="list-outline" size={size} color={color} />
          ),
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
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings-outline" size={size} color={color} />
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

      // Subscribe to remote changes from Firebase
      const unsubscribe = SyncEngine.subscribeToRemoteChanges(
        user.familyGroupId,
        async (change) => {
          console.log('Remote change detected:', change);

          // Persist remote changes to local database
          try {
            const LocalStorageManager = (await import('./src/services/LocalStorageManager')).default;

            if (change.entityType === 'list') {
              // Get current local list to preserve syncStatus
              const existingList = await LocalStorageManager.getList(change.entityId);
              const dataToSave = {
                ...change.data,
                // Preserve local syncStatus (don't overwrite with remote data that doesn't have it)
                syncStatus: existingList?.syncStatus || 'synced',
              };
              await LocalStorageManager.saveList(dataToSave);
            } else if (change.entityType === 'item') {
              // Get current local item to preserve syncStatus
              const existingItem = await LocalStorageManager.getItem(change.entityId);
              const dataToSave = {
                ...change.data,
                // Preserve local syncStatus (don't overwrite with remote data that doesn't have it)
                syncStatus: existingItem?.syncStatus || 'synced',
              };
              await LocalStorageManager.saveItem(dataToSave);
            }

            console.log('Remote change synced to local DB:', change.entityType, change.entityId);
          } catch (error) {
            console.error('Failed to sync remote change to local DB:', error);
          }
        }
      );

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [user?.familyGroupId]);

  // Initialize RevenueCat on app launch
  useEffect(() => {
    const initializePayments = async () => {
      try {
        await PaymentService.initialize();
      } catch (error) {
        console.error('Failed to initialize payments:', error);
      }
    };

    initializePayments();
  }, []);

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

  if (loading) {
    return null; // Or show loading screen
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0a0a0a"
        translucent={false}
      />
      <NavigationContainer theme={DarkNavigationTheme}>
        {!user ? (
          // Authentication Stack
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="FamilyGroup" component={FamilyGroupScreen} />
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
          // Main App Tabs
          <MainTabNavigator />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
