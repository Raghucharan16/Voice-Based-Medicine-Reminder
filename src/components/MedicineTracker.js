import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DataService from '../services/DataService';
import NotificationService from '../services/NotificationService';
import TTSService from '../services/TTSService';

const MedicineTracker = ({ visible, onClose, reminder, onMedicationTaken }) => {
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper function to parse time string and check if scheduled time has passed
  const canMarkAsTaken = () => {
    if (!reminder || !reminder.time) return false;

    const now = new Date();
    
    // Parse scheduled time from reminder (e.g., "02:30 PM")
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
    return now >= scheduledTime;
  };

  const handleTakeMedicine = async () => {
    try {
      // Check if scheduled time has passed
      if (!canMarkAsTaken()) {
        const [timeStr, period] = reminder.time.split(' ');
        Alert.alert(
          'Too Early! ⏰',
          `You can only mark this medicine as taken after the scheduled time (${reminder.time}).\n\nThis ensures accurate medication tracking.`,
          [{ text: 'Understood', style: 'default' }]
        );
        await TTSService.speak(`Please wait until ${reminder.time} to mark this medicine as taken.`);
        return;
      }

      setIsProcessing(true);
      
      // Record medication as taken with scheduled time
      const scheduledTimeISO = new Date();
      const [timeStr, period] = reminder.time.split(' ');
      const [hours, minutes] = timeStr.split(':').map(Number);
      let scheduledHour = hours;
      
      if (period === 'PM' && hours !== 12) {
        scheduledHour += 12;
      } else if (period === 'AM' && hours === 12) {
        scheduledHour = 0;
      }
      
      scheduledTimeISO.setHours(scheduledHour, minutes, 0, 0);
      
      await DataService.recordMedicationTaken(reminder.id, scheduledTimeISO.toISOString());
      
      // Schedule feedback prompt for later
      await NotificationService.scheduleFeedbackPrompt(
        reminder.id,
        reminder.medicine,
        60 // 60 minutes later
      );
      
      // Speak confirmation
      await TTSService.speak(`Great job taking your ${reminder.medicine}! I'll check how you're feeling later.`);
      
      // Notify parent component
      if (onMedicationTaken) {
        onMedicationTaken(reminder);
      }
      
      onClose();
      
      Alert.alert(
        'Medicine Taken! ✅',
        `Great job taking your ${reminder.medicine}. We'll check how you're feeling in about an hour.`,
        [{ text: 'Perfect!', style: 'default' }]
      );
      
    } catch (error) {
      console.error('Error recording medication:', error);
      Alert.alert('Error', 'Failed to record medication: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSnooze = async () => {
    try {
      // Snooze for 15 minutes
      await NotificationService.scheduleMedicationReminder({
        ...reminder,
        time: new Date(Date.now() + 15 * 60 * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
      });
      
      await TTSService.speak("I'll remind you again in 15 minutes.");
      
      onClose();
      
      Alert.alert(
        'Reminder Snoozed ⏰',
        'I\'ll remind you again in 15 minutes.',
        [{ text: 'OK', style: 'default' }]
      );
      
    } catch (error) {
      console.error('Error snoozing reminder:', error);
      Alert.alert('Error', 'Failed to snooze reminder: ' + error.message);
    }
  };

  const handleSkip = async () => {
    Alert.alert(
      'Skip Medication?',
      `Are you sure you want to skip taking ${reminder.medicine}? This will be recorded in your adherence history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: async () => {
            try {
              // Record as missed
              await DataService.recordMedicationTaken(reminder.id, null, 'missed');
              
              await TTSService.speak("Medication skipped. Please remember to maintain your medication schedule.");
              
              onClose();
              
            } catch (error) {
              console.error('Error recording skip:', error);
            }
          }
        }
      ]
    );
  };

  if (!reminder) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient colors={['#4CAF50', '#45A049']} style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>💊 Time for Medicine!</Text>
            <Text style={styles.headerSubtitle}>
              It's time to take your {reminder.medicine}
            </Text>
          </View>
        </LinearGradient>

        {/* Medicine Info */}
        <View style={styles.content}>
          <View style={styles.medicineCard}>
            <View style={styles.medicineIcon}>
              <Ionicons name="medical" size={48} color="#4CAF50" />
            </View>
            
            <Text style={styles.medicineName}>{reminder.medicine}</Text>
            
            {reminder.dosage && (
              <Text style={styles.dosage}>💉 {reminder.dosage}</Text>
            )}
            
            <Text style={styles.time}>🕐 Scheduled for {reminder.time}</Text>
            <Text style={styles.currentTime}>
              Current time: {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {/* Time Status Indicator */}
            {!canMarkAsTaken() && (
              <View style={styles.timeWarning}>
                <Ionicons name="time-outline" size={20} color="#FF9800" />
                <Text style={styles.timeWarningText}>
                  Wait until scheduled time to mark as taken
                </Text>
              </View>
            )}
            
            {/* Take Medicine Button */}
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !canMarkAsTaken() && styles.primaryButtonDisabled
              ]}
              onPress={handleTakeMedicine}
              disabled={isProcessing || !canMarkAsTaken()}
            >
              <LinearGradient
                colors={
                  !canMarkAsTaken() 
                    ? ['#ccc', '#999'] 
                    : ['#4CAF50', '#45A049']
                }
                style={styles.buttonGradient}
              >
                <Ionicons name="checkmark-circle" size={24} color="white" />
                <Text style={styles.primaryButtonText}>
                  {isProcessing ? 'Recording...' : 'I Took It!'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Secondary Actions */}
            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleSnooze}
                disabled={isProcessing}
              >
                <Ionicons name="time" size={20} color="#FF9800" />
                <Text style={styles.secondaryButtonText}>Snooze 15min</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleSkip}
                disabled={isProcessing}
              >
                <Ionicons name="close-circle" size={20} color="#F44336" />
                <Text style={styles.secondaryButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>💡 Quick Tips</Text>
            <Text style={styles.tipText}>• Take with water for better absorption</Text>
            <Text style={styles.tipText}>• Don't skip doses to maintain effectiveness</Text>
            <Text style={styles.tipText}>• Note any side effects for your doctor</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: 'white',
    fontSize: 16,
    opacity: 0.9,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  medicineCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginBottom: 30,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  medicineIcon: {
    marginBottom: 20,
  },
  medicineName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
    textAlign: 'center',
  },
  dosage: {
    fontSize: 18,
    color: '#9C27B0',
    marginBottom: 10,
    fontWeight: '600',
  },
  time: {
    fontSize: 16,
    color: '#4CAF50',
    marginBottom: 5,
    fontWeight: '500',
  },
  currentTime: {
    fontSize: 14,
    color: '#666',
  },
  actionsContainer: {
    marginBottom: 30,
  },
  primaryButton: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginBottom: 20,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  timeWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  timeWarningText: {
    marginLeft: 8,
    fontSize: 13,
    color: '#E65100',
    fontWeight: '600',
    flex: 1,
  },
  buttonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
    color: '#333',
  },
  tipsContainer: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    lineHeight: 20,
  },
});

export default MedicineTracker;
