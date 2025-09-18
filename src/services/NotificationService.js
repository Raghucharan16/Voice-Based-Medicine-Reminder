import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import DataService from './DataService';

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

  // Initialize notification system
  static async initialize() {
    try {
      await this.registerForPushNotificationsAsync();
      await this.setupNotificationChannels();
      return true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
      return false;
    }
  }

  // Register for push notifications
  static async registerForPushNotificationsAsync() {
    let token;

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        throw new Error('Failed to get push token for push notification!');
      }
      
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId || 'voice-medicine-reminder-2024',
      })).data;
    } else {
      console.warn('Must use physical device for Push Notifications');
    }

    this.expoPushToken = token;
    return token;
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
        },
        trigger,
      });

      return notificationId;
    } catch (error) {
      console.error('Error scheduling medication reminder:', error);
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
        return null;
      }

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
}

export default NotificationService;
