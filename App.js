import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

// Import screens
import HomeScreen from './src/screens/HomeScreen';
import MedicinesScreen from './src/screens/MedicinesScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Import services
import MedicationMonitor from './src/services/MedicationMonitor';

const Tab = createBottomTabNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    console.log('🚀 App launching...');
    
    // Initialize app
    const initApp = async () => {
      try {
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
