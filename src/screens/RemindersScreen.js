import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ReminderService from '../services/ReminderService';
import { Button } from 'react-native-paper';
import * as Speech from 'expo-speech';

const RemindersScreen = () => {
  const [reminders, setReminders] = useState([
    {
      id: 1,
      medicine: 'Aspirin',
      time: '09:00 AM',
      enabled: true,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      nextReminder: new Date(2025, 8, 2, 9, 0),
    },
    {
      id: 2,
      medicine: 'Vitamin D',
      time: '08:00 AM',
      enabled: true,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      nextReminder: new Date(2025, 8, 2, 8, 0),
    },
    {
      id: 3,
      medicine: 'Metformin',
      time: '07:00 AM',
      enabled: false,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      nextReminder: new Date(2025, 8, 2, 7, 0),
    },
    {
      id: 4,
      medicine: 'Metformin',
      time: '07:00 PM',
      enabled: false,
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      nextReminder: new Date(2025, 8, 1, 19, 0),
    },
  ]);

  const toggleReminder = async (id) => {
    const reminder = reminders.find(r => r.id === id);
    
    try {
      if (!reminder.enabled) {
        // Schedule the reminder
        const nextReminderDate = new Date();
        nextReminderDate.setHours(reminder.nextReminder.getHours());
        nextReminderDate.setMinutes(reminder.nextReminder.getMinutes());
        nextReminderDate.setSeconds(0);
        
        // If time has passed today, schedule for tomorrow
        if (nextReminderDate < new Date()) {
          nextReminderDate.setDate(nextReminderDate.getDate() + 1);
        }

        await ReminderService.scheduleReminder(
          nextReminderDate,
          'Medicine Reminder',
          `Time to take your ${reminder.medicine}`
        );
      }

      setReminders(reminders.map(r => 
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ));
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle reminder: ' + error.message);
    }
  };

  const testReminder = async (reminder) => {
    try {
      const testDate = new Date(Date.now() + 5000); // 5 seconds from now
      await ReminderService.scheduleReminder(
        testDate,
        'Test Reminder',
        `Test: Time to take your ${reminder.medicine}`
      );
      Alert.alert('Test Scheduled', 'Test reminder will appear in 5 seconds');
    } catch (error) {
      Alert.alert('Error', 'Failed to schedule test: ' + error.message);
    }
  };

  const formatNextReminder = (date) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleTestReminderSound = () => {
    const medicine = "Paracetamol";
    const time = "10:00 PM";
    const phrase = `This is a test reminder. Please remember to take ${medicine} at ${time}.`;
    Speech.speak(phrase, { language: 'en-US' });
  };

  const ReminderCard = ({ reminder }) => (
    <View style={[styles.reminderCard, !reminder.enabled && styles.disabledCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.reminderInfo}>
          <Text style={[styles.medicineName, !reminder.enabled && styles.disabledText]}>
            {reminder.medicine}
          </Text>
          <Text style={[styles.reminderTime, !reminder.enabled && styles.disabledText]}>
            {reminder.time}
          </Text>
        </View>
        <Switch
          value={reminder.enabled}
          onValueChange={() => toggleReminder(reminder.id)}
          trackColor={{ false: '#ccc', true: '#4CAF50' }}
          thumbColor={reminder.enabled ? '#2E7D32' : '#f4f3f4'}
        />
      </View>

      <View style={styles.reminderDetails}>
        <View style={styles.detailRow}>
          <Ionicons 
            name="calendar-outline" 
            size={16} 
            color={reminder.enabled ? '#666' : '#ccc'} 
          />
          <Text style={[styles.detailText, !reminder.enabled && styles.disabledText]}>
            {reminder.days.join(', ')}
          </Text>
        </View>
        
        {reminder.enabled && (
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.detailText}>
              Next: {formatNextReminder(reminder.nextReminder)}
            </Text>
          </View>
        )}
      </View>

      {reminder.enabled && (
        <View style={styles.cardActions}>
          <TouchableOpacity 
            style={styles.testButton}
            onPress={() => testReminder(reminder)}
          >
            <Ionicons name="notifications-outline" size={16} color="#2196F3" />
            <Text style={styles.testButtonText}>Test</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const activeReminders = reminders.filter(r => r.enabled).length;
  const totalReminders = reminders.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#FF9800', '#F57C00']} style={styles.header}>
        <Text style={styles.headerTitle}>Reminders</Text>
        <Text style={styles.headerSubtitle}>
          {activeReminders} of {totalReminders} reminders active
        </Text>
      </LinearGradient>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => {
            // Enable all reminders
            setReminders(reminders.map(r => ({ ...r, enabled: true })));
          }}
        >
          <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
          <Text style={styles.quickActionText}>Enable All</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={() => {
            // Disable all reminders
            setReminders(reminders.map(r => ({ ...r, enabled: false })));
          }}
        >
          <Ionicons name="pause-circle" size={20} color="#FF5722" />
          <Text style={styles.quickActionText}>Pause All</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.quickActionButton}
          onPress={async () => {
            try {
              const testDate = new Date(Date.now() + 3000);
              await ReminderService.scheduleReminder(
                testDate,
                'System Test',
                'This is a test notification to check if reminders are working properly.'
              );
              Alert.alert('Test Scheduled', 'Test notification will appear in 3 seconds');
            } catch (error) {
              Alert.alert('Error', 'Failed to schedule test: ' + error.message);
            }
          }}
        >
          <Ionicons name="flask" size={20} color="#9C27B0" />
          <Text style={styles.quickActionText}>System Test</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {reminders.map((reminder) => (
          <ReminderCard key={reminder.id} reminder={reminder} />
        ))}

        {reminders.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="alarm-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No reminders set</Text>
            <Text style={styles.emptySubtext}>
              Add medicines to automatically create reminders
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="information-circle" size={20} color="#2196F3" />
          <Text style={styles.infoTitle}>Reminder Tips</Text>
        </View>
        <Text style={styles.infoText}>
          • Make sure notifications are enabled for this app
        </Text>
        <Text style={styles.infoText}>
          • Test reminders to ensure they work properly
        </Text>
        <Text style={styles.infoText}>
          • Voice reminders work even when the app is closed
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    paddingTop: 40,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
    marginTop: 5,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    justifyContent: 'space-between',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    color: '#333',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  reminderCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  disabledCard: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reminderInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  reminderTime: {
    fontSize: 16,
    color: '#FF9800',
    fontWeight: '600',
    marginTop: 2,
  },
  disabledText: {
    color: '#ccc',
  },
  reminderDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  testButtonText: {
    fontSize: 14,
    color: '#2196F3',
    marginLeft: 4,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: 'white',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginLeft: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    lineHeight: 20,
  },
});

export default RemindersScreen;
