import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack'; // Import stack navigator
import { Ionicons } from '@expo/vector-icons';

// Import screens
import HomeScreen from './src/screens/HomeScreen';
import MedicinesScreen from './src/screens/MedicinesScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LoginScreen from './src/screens/LoginScreen';       // Import LoginScreen
import RegisterScreen from './src/screens/RegisterScreen'; // Import RegisterScreen

// Import services
import MedicationMonitor from './src/services/MedicationMonitor';
import AuthService from './src/services/AuthService'; // Import AuthService

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator(); // Create a Stack navigator

// Main Tab Navigator for authenticated users
function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Medicines') {
            iconName = focused ? 'medical' : 'medical-outline';
          } else if (route.name === 'Reminders') {
            iconName = focused ? 'alarm' : 'alarm-outline';
          } else if (route.name === 'Reports') {
            iconName = focused ? 'analytics' : 'analytics-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2196F3',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Medicines" component={MedicinesScreen} />
      <Tab.Screen name="Reminders" component={RemindersScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [userToken, setUserToken] = useState(null); // State to hold user authentication token

  useEffect(() => {
    console.log('🚀 App launching...');
    
    const initApp = async () => {
      try {
        // In a real app, you'd check for an existing token/session here
        // For now, we'll directly navigate to Auth flow

        console.log('✅ App initialized successfully');
        setIsReady(true);
        
        // Start monitoring after UI is ready (delayed)
        setTimeout(() => {
          console.log('⏰ Starting medication monitor...');
          MedicationMonitor.startMonitoring();
        }, 3000);
      } catch (error) {
        console.error('❌ App initialization error:', error);
        setIsReady(true); // Load anyway
      }
    };

    initApp();

    return () => {
      MedicationMonitor.stopMonitoring();
    };
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading Medicine Reminder...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {userToken ? (
            <Stack.Screen name="AppTabs" component={AppTabs} />
          ) : (
            <> 
              <Stack.Screen name="Login">
                {(props) => <LoginScreen {...props} setUserToken={setUserToken} />}
              </Stack.Screen>
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
});
