import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import DataService from './DataService';
import TTSService from './TTSService';
import { Audio } from 'expo-av';

// Configure how notifications are handled when the app is running
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  static expoPushToken = null;
  static soundObject = null;

  // Initialize notification system
  static async initialize() {
    try {
      await this.registerForPushNotificationsAsync();
      await this.setupNotificationChannels();
      await this.setupAudioMode();
      await this.setupNotificationListeners();
      return true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return false;
    }
  }

  // Setup audio mode for voice alerts
  static async setupAudioMode() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      console.log('✅ Audio mode configured for voice alerts');
    } catch (error) {
      console.error('Error setting up audio mode:', error);
    }
  }

  // Setup notification listeners for voice alerts
  static setupNotificationListeners() {
    // Listen for notification received (when app is in foreground)
    Notifications.addNotificationReceivedListener(async (notification) => {
      const { type, medicine, dosage } = notification.request.content.data;
      
      if (type === 'medication_reminder') {
        await this.playVoiceAlert(medicine, dosage);
      }
    });

    // Listen for notification response (when user taps notification)
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const { type, medicine, dosage } = response.notification.request.content.data;
      
      if (type === 'medication_reminder') {
        // Stop any ongoing speech
        TTSService.stop();
      }
    });
  }

  // Play voice alert for medication reminder
  static async playVoiceAlert(medicine, dosage) {
    try {
      // Create personalized voice message
      const messages = [
        `Time to take your medicine. ${medicine}${dosage ? `, ${dosage}` : ''}`,
        `Reminder! Please take ${medicine}${dosage ? `, ${dosage}` : ''}`,
        `It's time for your medication. ${medicine}${dosage ? `, ${dosage}` : ''}`,
        `Don't forget to take ${medicine}${dosage ? `, ${dosage}` : ''}`,
      ];

      // Pick a random message for variety
      const message = messages[Math.floor(Math.random() * messages.length)];

      console.log('🔊 Speaking:', message);

      // Speak with emphasis and clear voice
      await TTSService.speak(message, {
        language: 'en-US',
        pitch: 1.1,
        rate: 0.85,
        volume: 1.0,
      });

    } catch (error) {
      console.error('Error playing voice alert:', error);
    }
  }

  // Play urgent voice alert for missed medication
  static async playUrgentVoiceAlert(medicine, dosage, missedMinutes) {
    try {
      let urgencyMessage;
      
      if (missedMinutes < 15) {
        urgencyMessage = `Attention! You have a pending reminder. Please take ${medicine}${dosage ? `, ${dosage}` : ''} now.`;
      } else if (missedMinutes < 30) {
        urgencyMessage = `Important reminder! You missed taking ${medicine}${dosage ? `, ${dosage}` : ''}. It's been ${missedMinutes} minutes. Please take it now.`;
      } else {
        urgencyMessage = `Urgent! You missed your medication. ${medicine}${dosage ? `, ${dosage}` : ''} was due ${missedMinutes} minutes ago. Please take it immediately or contact your doctor.`;
      }

      console.log('🚨 Speaking urgent alert:', urgencyMessage);

      // Speak with higher pitch for urgency
      await TTSService.speak(urgencyMessage, {
        language: 'en-US',
        pitch: 1.2,
        rate: 0.9,
        volume: 1.0,
      });

      // Repeat after 3 seconds for critical alerts
      if (missedMinutes > 30) {
        setTimeout(async () => {
          await TTSService.speak(`This is a critical reminder. Please take ${medicine} now.`, {
            language: 'en-US',
            pitch: 1.2,
            rate: 0.9,
            volume: 1.0,
          });
        }, 3000);
      }

    } catch (error) {
      console.error('Error playing urgent voice alert:', error);
    }
  }

  // Register for push notifications
  static async registerForPushNotificationsAsync() {
    try {
      if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('Push notification permission not granted');
        return null;
      }
      
      // Skip push token registration for local notifications
      // const token = (await Notifications.getExpoPushTokenAsync()).data;
      // this.expoPushToken = token;
      
      return 'local-notifications-only';
    } catch (error) {
      console.warn('Push notification setup skipped:', error.message);
      return null;
    }
  }

  // Setup notification channels (Android)
  static async setupNotificationChannels() {
    if (Device.osName === 'Android') {
      await Notifications.setNotificationChannelAsync('medicine-reminders', {
        name: 'Medicine Reminders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2196F3',
      });

      await Notifications.setNotificationChannelAsync('caretaker-alerts', {
        name: 'Caretaker Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF5722',
      });
    }
  }

  // Schedule medication reminder
  static async scheduleMedicationReminder(reminder) {
    try {
      const trigger = this.createTriggerFromTime(reminder.time);
      
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '💊 Medicine Reminder',
          body: `Time to take ${reminder.medicine}${reminder.dosage ? ` (${reminder.dosage})` : ''}`,
          data: {
            type: 'medication_reminder',
            reminderId: reminder.id,
            medicine: reminder.medicine,
            dosage: reminder.dosage
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger,
      });

      console.log(`📅 Scheduled voice reminder for ${reminder.medicine} at ${reminder.time}`);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling medication reminder:', error);
      throw error;
    }
  }

  // Send immediate notification (no scheduling) with optional voice alert
  static async sendImmediateNotification({ title, body, data = {}, useVoice = false }) {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: null, // null means immediate
      });

      // Play voice alert if requested
      if (useVoice && data.medicine) {
        await this.playVoiceAlert(data.medicine, data.dosage);
      }

      return notificationId;
    } catch (error) {
      console.error('Error sending immediate notification:', error);
      throw error;
    }
  }

  // Schedule delayed medication alert to caretaker
  static async scheduleCaretakerAlert(reminder, delayMinutes = 30) {
    try {
      const caretakers = await DataService.getCaretakers();
      const activeCaretakers = caretakers.filter(c => c.active);

      if (activeCaretakers.length === 0) {
        console.log('No active caretakers to notify');
      }

      // Play urgent voice alert immediately for missed medication
      await this.playUrgentVoiceAlert(reminder.medicine, reminder.dosage, delayMinutes);

      // Schedule local notification first
      const trigger = {
        seconds: delayMinutes * 60,
      };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Medication Delayed',
          body: `${reminder.medicine} reminder was ${delayMinutes} minutes ago. Caretakers have been notified.`,
          data: {
            type: 'caretaker_alert',
            reminderId: reminder.id,
            medicine: reminder.medicine,
            delay: delayMinutes
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger,
      });

      // Send alerts to caretakers (email/SMS simulation)
      for (const caretaker of activeCaretakers) {
        await this.sendCaretakerAlert(caretaker, reminder, delayMinutes);
      }

      return notificationId;
    } catch (error) {
      console.error('Error scheduling caretaker alert:', error);
      throw error;
    }
  }

  // Send alert to caretaker (simulated - would integrate with email/SMS service)
  static async sendCaretakerAlert(caretaker, reminder, delayMinutes) {
    try {
      const userProfile = await DataService.getUserProfile();
      
      // In a real app, this would send actual email/SMS
      // For now, we'll create a local notification for demo purposes
      const alertData = {
        caretakerName: caretaker.name,
        caretakerEmail: caretaker.email,
        patientName: userProfile.name || 'Patient',
        medicine: reminder.medicine,
        scheduledTime: reminder.time,
        delayMinutes: delayMinutes,
        timestamp: new Date().toISOString()
      };

      console.log('Caretaker Alert Sent:', alertData);
      
      // Store alert in local data for tracking
      await this.storeCaretakerAlert(alertData);
      
      return alertData;
    } catch (error) {
      console.error('Error sending caretaker alert:', error);
      throw error;
    }
  }

  // Store caretaker alert for tracking
  static async storeCaretakerAlert(alertData) {
    try {
      const alerts = await this.getCaretakerAlerts();
      alerts.push({
        id: Date.now().toString(),
        ...alertData
      });
      
      // Keep only last 100 alerts
      const recentAlerts = alerts.slice(-100);
      await DataService.saveUserProfile({ 
        caretakerAlerts: recentAlerts 
      });
      
      return true;
    } catch (error) {
      console.error('Error storing caretaker alert:', error);
      return false;
    }
  }

  // Get caretaker alerts history
  static async getCaretakerAlerts() {
    try {
      const profile = await DataService.getUserProfile();
      return profile.caretakerAlerts || [];
    } catch (error) {
      console.error('Error getting caretaker alerts:', error);
      return [];
    }
  }

  // Schedule medication feedback prompt
  static async scheduleFeedbackPrompt(medicationId, medicine, delayMinutes = 60) {
    try {
      const trigger = {
        seconds: delayMinutes * 60,
      };

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📝 How are you feeling?',
          body: `How did you feel after taking ${medicine}? Tap to share your feedback.`,
          data: {
            type: 'feedback_prompt',
            medicationId: medicationId,
            medicine: medicine
          },
          sound: false,
        },
        trigger,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling feedback prompt:', error);
      throw error;
    }
  }

  // Cancel notification
  static async cancelNotification(notificationId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      return true;
    } catch (error) {
      console.error('Error canceling notification:', error);
      return false;
    }
  }

  // Cancel all notifications
  static async cancelAllNotifications() {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      return true;
    } catch (error) {
      console.error('Error canceling all notifications:', error);
      return false;
    }
  }

  // Get pending notifications
  static async getPendingNotifications() {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      return [];
    }
  }

  // Create trigger from time string (e.g., "8:30 PM")
  static createTriggerFromTime(timeString) {
    try {
      const [time, period] = timeString.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      
      let hour24 = hours;
      if (period?.toUpperCase() === 'PM' && hours !== 12) {
        hour24 += 12;
      } else if (period?.toUpperCase() === 'AM' && hours === 12) {
        hour24 = 0;
      }

      return {
        hour: hour24,
        minute: minutes || 0,
        repeats: true,
      };
    } catch (error) {
      console.error('Error creating trigger from time:', error);
      // Fallback to 12:00 PM
      return {
        hour: 12,
        minute: 0,
        repeats: true,
      };
    }
  }

  // Handle notification response (when user taps notification)
  static addNotificationResponseListener(callback) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }

  // Handle notification received (when app is in foreground)
  static addNotificationReceivedListener(callback) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  // Test notification (for debugging)
  static async sendTestNotification() {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🧪 Test Notification',
          body: 'This is a test notification from your medicine reminder app!',
          data: { type: 'test' },
        },
        trigger: { seconds: 2 },
      });
      
      return true;
    } catch (error) {
      console.error('Error sending test notification:', error);
      return false;
    }
  }

  /**
   * Handle missed medication and notify caregivers
   * @param {Object} medication - The missed medication object
   * @param {string} patientName - Patient's name
   */
  static async handleMissedMedication(medication, patientName = 'Patient') {
    try {
      console.log('⚠️ Handling missed medication:', medication.medicine);

      // Calculate how many minutes the medication was missed
      const now = new Date();
      const scheduledTime = this.parseTimeString(medication.time);
      const missedMinutes = Math.floor((now - scheduledTime) / (1000 * 60));

      // Play urgent voice alert immediately
      if (missedMinutes > 0) {
        await this.playUrgentVoiceAlert(medication.medicine, medication.dosage, missedMinutes);
      }

      // Import EmailService dynamically to avoid circular dependency
      const EmailService = require('./EmailService').default;
      
      // Get all active caretakers
      const caretakers = await DataService.getCaretakers();
      const activeCaretakers = caretakers.filter(c => c.active);

      if (activeCaretakers.length === 0) {
        console.log('ℹ️ No active caretakers to notify');
        return { success: true, message: 'No caregivers to notify' };
      }

      console.log(`📧 Notifying ${activeCaretakers.length} caregiver(s)`);

      // Send alert to each caregiver
      const results = await Promise.allSettled(
        activeCaretakers.map(caregiver => 
          EmailService.sendMissedMedicationAlert({
            caregiverEmail: caregiver.email,
            caregiverName: caregiver.name,
            patientName: patientName,
            medicineName: medication.medicine,
            dosage: medication.dosage,
            scheduledTime: medication.time,
            missedDate: new Date().toLocaleDateString(),
          })
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Caregiver alerts sent: ${successful} successful, ${failed} failed`);

      return {
        success: true,
        notified: successful,
        failed: failed,
        caregivers: activeCaretakers.length
      };

    } catch (error) {
      console.error('❌ Error handling missed medication:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper to parse time string to Date object for comparison
  static parseTimeString(timeString) {
    try {
      const [time, period] = timeString.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      
      let hour24 = hours;
      if (period?.toUpperCase() === 'PM' && hours !== 12) {
        hour24 += 12;
      } else if (period?.toUpperCase() === 'AM' && hours === 12) {
        hour24 = 0;
      }

      const now = new Date();
      const scheduledTime = new Date(now);
      scheduledTime.setHours(hour24, minutes || 0, 0, 0);

      return scheduledTime;
    } catch (error) {
      console.error('Error parsing time string:', error);
      return new Date();
    }
  }

  // Check for missed medications and trigger voice alerts
  static async checkAndAlertMissedMedications() {
    try {
      const reminders = await DataService.getReminders();
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      for (const reminder of reminders) {
        if (!reminder.time) continue;

        const scheduledTime = this.parseTimeString(reminder.time);
        const missedMinutes = Math.floor((now - scheduledTime) / (1000 * 60));

        // If medication is 5-60 minutes overdue, trigger voice alert
        if (missedMinutes >= 5 && missedMinutes <= 60) {
          console.log(`🚨 Medication ${reminder.medicine} is ${missedMinutes} minutes overdue`);
          
          // Send immediate notification with voice alert
          await this.sendImmediateNotification({
            title: '🚨 Missed Medication Alert',
            body: `You missed ${reminder.medicine}! It was due ${missedMinutes} minutes ago.`,
            data: {
              type: 'missed_medication',
              reminderId: reminder.id,
              medicine: reminder.medicine,
              dosage: reminder.dosage,
              missedMinutes: missedMinutes
            },
            useVoice: true
          });

          // Play urgent voice alert
          await this.playUrgentVoiceAlert(reminder.medicine, reminder.dosage, missedMinutes);
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking missed medications:', error);
      return false;
    }
  }
}

export default NotificationService;
