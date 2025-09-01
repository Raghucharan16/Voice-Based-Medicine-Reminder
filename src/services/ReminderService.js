import * as Notifications from 'expo-notifications';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class ReminderService {
  static async requestPermissions() {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Notification permissions required');
      }
      return true;
    } catch (error) {
      console.error('Notification permission error:', error);
      throw error;
    }
  }

  static async scheduleReminder(date, title, body) {
    try {
      await this.requestPermissions();

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: title,
          body: body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
        },
        trigger: {
          date: date,
        },
      });

      return id;
    } catch (error) {
      console.error('Schedule reminder error:', error);
      throw error;
    }
  }

  static async cancelReminder(id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (error) {
      console.error('Cancel reminder error:', error);
      throw error;
    }
  }

  static async getAllScheduledReminders() {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Get reminders error:', error);
      throw error;
    }
  }
}

export default ReminderService;
