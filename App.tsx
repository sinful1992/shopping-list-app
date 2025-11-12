import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import AuthenticationModule from './src/services/AuthenticationModule';
import { User } from './src/models/types';

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

// History Stack Navigator
function HistoryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="HistoryHome"
        component={HistoryScreen}
        options={{ title: 'Shopping History' }}
      />
      <Stack.Screen
        name="HistoryDetail"
        component={HistoryDetailScreen}
        options={{ title: 'Trip Details' }}
      />
      <Stack.Screen
        name="ReceiptView"
        component={ReceiptViewScreen}
        options={{ title: 'Receipt Details' }}
      />
    </Stack.Navigator>
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

  if (loading) {
    return null; // Or show loading screen
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
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
          <Tab.Navigator
            screenOptions={{
              tabBarActiveTintColor: '#007AFF',
              tabBarInactiveTintColor: '#6E6E73',
              tabBarStyle: {
                paddingBottom: 5,
                paddingTop: 5,
                height: 60,
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
              name="Budget"
              component={BudgetScreen}
              options={{
                title: 'Budget',
                tabBarIcon: ({ color, size }) => (
                  <Icon name="wallet-outline" size={size} color={color} />
                ),
              }}
            />
            <Tab.Screen
              name="History"
              component={HistoryStack}
              options={{
                headerShown: false,
                tabBarIcon: ({ color, size }) => (
                  <Icon name="receipt-outline" size={size} color={color} />
                ),
              }}
            />
          </Tab.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
