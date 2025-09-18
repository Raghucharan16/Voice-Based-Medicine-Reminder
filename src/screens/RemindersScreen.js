import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, SafeAreaView, ScrollView, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DataService from '../services/DataService';
import NotificationService from '../services/NotificationService';
import TTSService from '../services/TTSService';
import MedicationFeedback from '../components/MedicationFeedback';

const RemindersScreen = () => {
  const [reminders, setReminders] = useState([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState(null);

  useEffect(() => {
    loadReminders();
    setupNotificationListeners();
  }, []);

  const loadReminders = async () => {
    try {
      const storedReminders = await DataService.getReminders();
      setReminders(storedReminders);
    } catch (error) {
      console.error('Error loading reminders:', error);
    }
  };

  const setupNotificationListeners = () => {
    // Listen for notification responses
    const subscription = NotificationService.addNotificationResponseListener((response) => {
      const { data } = response.notification.request.content;
      
      if (data.type === 'medication_reminder') {
        // Show feedback modal after a delay
        setTimeout(() => {
          setSelectedMedication({
            id: data.reminderId,
            medicine: data.medicine,
            dosage: data.dosage
          });
          setShowFeedbackModal(true);
        }, 60000); // Show feedback prompt after 1 minute
      }
    });

    return () => subscription.remove();
  };

  const markMedicationTaken = async (reminder) => {
    try {
      // Record medication as taken
      await DataService.recordMedicationTaken(reminder.id, new Date().toISOString());
      
      // Schedule feedback prompt
      await NotificationService.scheduleFeedbackPrompt(
        reminder.id,
        reminder.medicine,
        60 // 60 minutes after taking
      );
      
      Alert.alert(
        'Medication Taken! ✅',
        `Great job taking your ${reminder.medicine}. We'll check how you're feeling later.`,
        [{ text: 'OK', style: 'default' }]
      );
      
      // Speak confirmation
      await TTSService.speak(`Great job taking your ${reminder.medicine}!`);
      
    } catch (error) {
      console.error('Error marking medication taken:', error);
      Alert.alert('Error', 'Failed to record medication: ' + error.message);
    }
  };

  const handleFeedbackSubmitted = async (feedbackData) => {
    console.log('Feedback submitted:', feedbackData);
    // Refresh reminders or update UI as needed
    await loadReminders();
  };

  const toggleReminder = async (id) => {
    try {
      const updatedReminder = await DataService.updateReminder(id, { 
        status: reminders.find(r => r.id === id).status === 'active' ? 'paused' : 'active' 
      });
      
      if (updatedReminder.status === 'active') {
        // Schedule notification
        await NotificationService.scheduleMedicationReminder(updatedReminder);
      } else {
        // Cancel notification (would need to store notification ID)
        // await NotificationService.cancelNotification(notificationId);
      }
      
      await loadReminders(); // Refresh list
      
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle reminder: ' + error.message);
    }
  };

  const testReminder = async (reminder) => {
    try {
      await NotificationService.sendTestNotification();
      Alert.alert('Test Sent! 📱', 'Check if the notification appeared correctly.');
    } catch (error) {
      Alert.alert('Error', 'Failed to send test: ' + error.message);
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

  const handleTestReminderSound = async () => {
    const medicine = "Paracetamol";
    const time = "10:00 PM";
    const phrase = `This is a test reminder. Please remember to take ${medicine} at ${time}.`;
    await TTSService.speak(phrase);
  };

  const handleReadAllReminders = async () => {
    if (reminders.length === 0) {
      await TTSService.speak("You have no reminders set up yet.");
      return;
    }
    
    let text = `You have ${reminders.length} reminder${reminders.length > 1 ? 's' : ''} set up. `;
    reminders.forEach((reminder, index) => {
      text += `${index + 1}. ${reminder.medicine} at ${reminder.time}. `;
    });
    
    await TTSService.speak(text);
  };

  const ReminderCard = ({ reminder }) => {
    const isActive = reminder.status === 'active';
    
    return (
      <View style={[styles.reminderCard, !isActive && styles.disabledCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.reminderInfo}>
            <Text style={[styles.medicineName, !isActive && styles.disabledText]}>
              💊 {reminder.medicine}
            </Text>
            <Text style={[styles.reminderTime, !isActive && styles.disabledText]}>
              🕐 {reminder.time}
            </Text>
            {reminder.dosage && (
              <Text style={[styles.dosageText, !isActive && styles.disabledText]}>
                💉 {reminder.dosage}
              </Text>
            )}
          </View>
          <Switch
            value={isActive}
            onValueChange={() => toggleReminder(reminder.id)}
            trackColor={{ false: '#ccc', true: '#4CAF50' }}
            thumbColor={isActive ? '#2E7D32' : '#f4f3f4'}
          />
        </View>

        <View style={styles.reminderDetails}>
          <View style={styles.detailRow}>
            <Ionicons 
              name="calendar-outline" 
              size={16} 
              color={isActive ? '#666' : '#ccc'} 
            />
            <Text style={[styles.detailText, !isActive && styles.disabledText]}>
              Daily reminder
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Ionicons 
              name="time-outline" 
              size={16} 
              color={isActive ? '#666' : '#ccc'} 
            />
            <Text style={[styles.detailText, !isActive && styles.disabledText]}>
              Created: {new Date(reminder.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => markMedicationTaken(reminder)}
          >
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={[styles.actionButtonText, { color: '#4CAF50' }]}>Mark Taken</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => testReminder(reminder)}
          >
            <Ionicons name="notifications-outline" size={16} color="#2196F3" />
            <Text style={[styles.actionButtonText, { color: '#2196F3' }]}>Test</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const activeReminders = reminders.filter(r => r.status === 'active').length;
  const totalReminders = reminders.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#FF9800', '#F57C00']} style={styles.header}>
        <Text style={styles.headerTitle}>Medicine Reminders</Text>
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
              Use the Voice Assistant on the Home screen to add medication reminders
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="information-circle" size={20} color="#2196F3" />
          <Text style={styles.infoTitle}>💡 Reminder Tips</Text>
        </View>
        <Text style={styles.infoText}>
          • Mark medications as taken to track adherence
        </Text>
        <Text style={styles.infoText}>
          • Test notifications to ensure they work properly
        </Text>
        <Text style={styles.infoText}>
          • Provide feedback to help improve your care
        </Text>
      </View>

      {/* Medication Feedback Modal */}
      <MedicationFeedback
        visible={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        medication={selectedMedication}
        onFeedbackSubmitted={handleFeedbackSubmitted}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    alignItems: 'center', // Center items horizontally
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
  dosageText: {
    fontSize: 14,
    color: '#9C27B0',
    fontWeight: '500',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    marginLeft: 8,
  },
  actionButtonText: {
    fontSize: 12,
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
  voiceCommandSection: {
    alignItems: 'center',
    marginVertical: 20,
    width: '100%',
  },
  micButton: {
    marginVertical: 15,
  },
  micLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
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
