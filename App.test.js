import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Minimal test app to verify basic functionality
export default function App() {
  console.log('✅ Test App Loaded Successfully!');
  
  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Text style={styles.title}>✅ App is Working!</Text>
        <Text style={styles.subtitle}>If you see this, the basic app loads fine.</Text>
        <Text style={styles.info}>Check the console for any errors.</Text>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  info: {
    fontSize: 14,
    color: '#999',
    marginTop: 20,
  },
});
