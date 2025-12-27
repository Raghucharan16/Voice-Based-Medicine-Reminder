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
    
    // Auto-sync with Medicines page every 2 seconds
    const interval = setInterval(loadReminders, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadReminders = async () => {
    try {
      const storedReminders = await DataService.getReminders();
      
      // Remove duplicates based on medicine name + time
      const uniqueReminders = [];
      const seenKeys = new Set();
      
      storedReminders.forEach(reminder => {
        const key = `${reminder.medicine.toLowerCase()}-${reminder.time}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          uniqueReminders.push(reminder);
        }
      });
      
      setReminders(uniqueReminders);
    } catch (error) {
      console.error('Error loading reminders:', error);
    }
  };

  const setupNotificationListeners = () => {
    const subscription = NotificationService.addNotificationResponseListener((response) => {
      const { data } = response.notification.request.content;
      
      if (data.type === 'medication_reminder') {
        setTimeout(() => {
          setSelectedMedication({
            id: data.reminderId,
            medicine: data.medicine,
            dosage: data.dosage
          });
          setShowFeedbackModal(true);
        }, 60000);
      }
    });

    return () => subscription.remove();
  };

  const markMedicationTaken = async (reminder) => {
    try {
      // Parse scheduled time and check if it has passed
      const now = new Date();
      const [timeStr, period] = reminder.time.split(' ');
      const [hours, minutes] = timeStr.split(':').map(Number);
      let scheduledHour = hours;
      
      if (period === 'PM' && hours !== 12) {
        scheduledHour += 12;
      } else if (period === 'AM' && hours === 12) {
        scheduledHour = 0;
      }

      const scheduledTime = new Date();
      scheduledTime.setHours(scheduledHour, minutes, 0, 0);

      // Check if current time is past scheduled time
      if (now < scheduledTime) {
        Alert.alert(
          'Too Early! ⏰',
          `You can only mark this medicine as taken after the scheduled time (${reminder.time}).\n\nThis ensures accurate medication tracking.`,
          [{ text: 'Understood', style: 'default' }]
        );
        await TTSService.speak(`Please wait until ${reminder.time} to mark this medicine as taken.`);
        return;
      }

      // Record with scheduled time (IST system time)
      await DataService.recordMedicationTaken(reminder.id, scheduledTime.toISOString());
      await NotificationService.scheduleFeedbackPrompt(
        reminder.id,
        reminder.medicine,
        60
      );
      
      Alert.alert(
        'Medication Taken! ✅',
        `Great job taking your ${reminder.medicine}. We'll check how you're feeling later.`,
        [{ text: 'OK', style: 'default' }]
      );
      
      await TTSService.speak(`Great job taking your ${reminder.medicine}!`);
      
    } catch (error) {
      console.error('Error marking medication taken:', error);
      Alert.alert('Error', 'Failed to record medication: ' + error.message);
    }
  };

  const handleFeedbackSubmitted = async (feedbackData) => {
    console.log('Feedback submitted:', feedbackData);
    await loadReminders();
  };

  const toggleReminder = async (id) => {
    try {
      const updatedReminder = await DataService.updateReminder(id, { 
        status: reminders.find(r => r.id === id).status === 'active' ? 'paused' : 'active' 
      });
      
      if (updatedReminder.status === 'active') {
        await NotificationService.scheduleMedicationReminder(updatedReminder);
      }
      
      await loadReminders();
      
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
            <Ionicons name="calendar-outline" size={16} color={isActive ? '#666' : '#ccc'} />
            <Text style={[styles.detailText, !isActive && styles.disabledText]}>
              Daily reminder
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={isActive ? '#666' : '#ccc'} />
            <Text style={[styles.detailText, !isActive && styles.disabledText]}>
              Created: {new Date(reminder.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => markMedicationTaken(reminder)}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={[styles.actionButtonText, { color: '#4CAF50' }]}>Mark Taken</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.actionButton} onPress={() => testReminder(reminder)}>
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
      <LinearGradient colors={['#FF9800', '#F57C00']} style={styles.header}>
        <Text style={styles.headerTitle}>Medicine Reminders</Text>
        <Text style={styles.headerSubtitle}>
          {activeReminders} of {totalReminders} reminders active
        </Text>
      </LinearGradient>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickActionButton} onPress={handleReadAllReminders}>
          <Ionicons name="volume-high" size={20} color="#2196F3" />
          <Text style={styles.quickActionText}>Read All</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickActionButton} onPress={handleTestReminderSound}>
          <Ionicons name="megaphone" size={20} color="#9C27B0" />
          <Text style={styles.quickActionText}>Test Sound</Text>
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

      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <Ionicons name="information-circle" size={20} color="#2196F3" />
          <Text style={styles.infoTitle}>💡 Reminder Tips</Text>
        </View>
        <Text style={styles.infoText}>• Mark medications as taken to track adherence</Text>
        <Text style={styles.infoText}>• Test notifications to ensure they work properly</Text>
        <Text style={styles.infoText}>• Provide feedback to help improve your care</Text>
      </View>

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
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 20, paddingTop: 40, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  headerSubtitle: { color: 'white', fontSize: 14, opacity: 0.9, marginTop: 5 },
  quickActions: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 15, justifyContent: 'space-between' },
  quickActionButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  quickActionText: { fontSize: 12, fontWeight: '600', marginLeft: 4, color: '#333' },
  content: { flex: 1, paddingHorizontal: 20 },
  reminderCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
  disabledCard: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  reminderInfo: { flex: 1 },
  medicineName: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  reminderTime: { fontSize: 16, color: '#666', marginBottom: 2 },
  dosageText: { fontSize: 14, color: '#888' },
  disabledText: { color: '#ccc' },
  reminderDetails: { marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { fontSize: 12, color: '#666', marginLeft: 6 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  actionButton: { flexDirection: 'row', alignItems: 'center' },
  actionButtonText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, color: '#999', marginTop: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#bbb', marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },
  infoCard: { backgroundColor: '#E3F2FD', margin: 16, padding: 16, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#2196F3' },
  infoHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1976D2', marginLeft: 8 },
  infoText: { fontSize: 13, color: '#1565C0', marginBottom: 6, lineHeight: 20 },
});

export default RemindersScreen;
