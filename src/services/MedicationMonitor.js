/**
 * Medication Monitor Service
 * Checks for missed medications and triggers caregiver alerts
 */

import DataService from './DataService';
import NotificationService from './NotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

class MedicationMonitor {
  static interval = null;
  static isMonitoring = false;
  static dailyReportInterval = null;

  /**
   * Start monitoring for missed medications
   * Checks every minute
   */
  static startMonitoring() {
    if (this.isMonitoring) {
      console.log('⚠️ Medication monitoring already active');
      return;
    }

    console.log('👁️ Starting medication monitoring...');
    this.isMonitoring = true;

    // Check immediately
    this.checkMissedMedications();

    // Then check every minute
    this.interval = setInterval(() => {
      this.checkMissedMedications();
    }, 60000); // 60 seconds
  }

  /**
   * Stop monitoring
   */
  static stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isMonitoring = false;
      console.log('⏹️ Medication monitoring stopped');
    }
  }

  /**
   * Check for missed medications and send alerts
   */
  static async checkMissedMedications() {
    try {
      // Check if caregiver alerts are enabled (default to FALSE if not set)
      const caregiverAlertsEnabled = await AsyncStorage.getItem('caregiverAlerts');
      console.log('🔍 Caregiver alerts setting:', caregiverAlertsEnabled);
      
      // If explicitly set to 'false' or null/undefined, skip checking
      if (caregiverAlertsEnabled !== 'true') {
        console.log('ℹ️ Caregiver alerts disabled or not enabled, skipping check');
        return;
      }

      const reminders = await DataService.getReminders();
      const history = await DataService.getMedicationHistory();
      const userName = await AsyncStorage.getItem('userName') || 'Patient';
      
      const now = new Date();
      const today = now.toDateString();
      
      console.log(`🔍 Checking ${reminders.length} reminders at ${now.toLocaleTimeString()}`);

      for (const reminder of reminders) {
        // Only check active reminders
        if (reminder.status !== 'active') {
          console.log(`⏭️ Skipping inactive reminder: ${reminder.medicine}`);
          continue;
        }
        
        // Check if reminder has a specific date (like "tomorrow" or a one-time reminder)
        // If it does, only check on that date
        if (reminder.date && reminder.frequency === 'once') {
          const reminderDate = new Date(reminder.date);
          const reminderDateStr = reminderDate.toDateString();
          
          console.log(`📅 ${reminder.medicine} - Scheduled for: ${reminderDateStr}, Today: ${today}`);
          
          // Skip if not scheduled for today
          if (reminderDateStr !== today) {
            console.log(`⏭️ Skipping ${reminder.medicine} - not scheduled for today`);
            continue;
          }
        }

        // Parse scheduled time
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

        // Check if scheduled time has passed
        const timeDiffMinutes = (now - scheduledTime) / (1000 * 60);
        
        console.log(`📊 ${reminder.medicine} - Scheduled: ${reminder.time}, Diff: ${timeDiffMinutes.toFixed(1)} min`);

        // If more than 5 minutes past scheduled time (REDUCED GRACE PERIOD)
        if (timeDiffMinutes > 5 && timeDiffMinutes < 1440) { // Between 5 min and 24 hours
          
          // Check if already taken or alerted today
          const todayHistory = history.filter(h => 
            h.medicationId === reminder.id && 
            new Date(h.actualTime).toDateString() === today
          );

          const alreadyTaken = todayHistory.some(h => h.status === 'taken');
          const alreadyAlerted = await this.hasBeenAlerted(reminder.id, today);
          
          console.log(`   📝 Already taken: ${alreadyTaken}, Already alerted: ${alreadyAlerted}`);

          if (!alreadyTaken && !alreadyAlerted) {
            console.log(`⚠️ Missed medication detected: ${reminder.medicine} at ${reminder.time}`);
            
            // Record as missed in history
            await DataService.recordMedicationMissed(
              reminder.id,
              scheduledTime.toISOString(),
              now.toISOString()
            );
            
            await DataService.updateReminder(reminder.id, {
              lastMissed: now.toISOString()
            });

            // Send caregiver alert
            const alertResult = await NotificationService.handleMissedMedication(
              reminder,
              userName
            );

            console.log('📧 Caregiver alert result:', alertResult);

            // Only mark as alerted if email was successfully sent
            if (alertResult.success && alertResult.notified > 0) {
              await this.markAsAlerted(reminder.id, today);
              console.log('✅ Marked as alerted after successful email send');
              
              // Also send local notification to user
              await NotificationService.sendImmediateNotification({
                title: '⚠️ Medication Missed',
                body: `You missed ${reminder.medicine} at ${reminder.time}. Caregivers have been notified.`,
                data: { type: 'missed', medicationId: reminder.id }
              });
            } else {
              console.log('⚠️ Email failed - will retry on next check');
              
              // Send notification without caregiver mention
              await NotificationService.sendImmediateNotification({
                title: '⚠️ Medication Missed',
                body: `You missed ${reminder.medicine} at ${reminder.time}. Please take it now.`,
                data: { type: 'missed', medicationId: reminder.id }
              });
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Error checking missed medications:', error);
    }
  }

  /**
   * Check if reminder has already been alerted today
   */
  static async hasBeenAlerted(reminderId, date) {
    try {
      const key = `alerted_${reminderId}_${date}`;
      const alerted = await AsyncStorage.getItem(key);
      return alerted === 'true';
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark reminder as alerted for today
   */
  static async markAsAlerted(reminderId, date) {
    try {
      const key = `alerted_${reminderId}_${date}`;
      await AsyncStorage.setItem(key, 'true');
      
      // Clean up old alert markers (older than 7 days)
      this.cleanupOldAlertMarkers();
    } catch (error) {
      console.error('Error marking as alerted:', error);
    }
  }

  /**
   * Clean up old alert markers to prevent storage bloat
   */
  static async cleanupOldAlertMarkers() {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const alertKeys = allKeys.filter(key => key.startsWith('alerted_'));
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      for (const key of alertKeys) {
        // Extract date from key format: alerted_{id}_{date}
        const parts = key.split('_');
        if (parts.length >= 3) {
          const dateStr = parts.slice(2).join('_');
          const alertDate = new Date(dateStr);
          
          if (alertDate < sevenDaysAgo) {
            await AsyncStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up alert markers:', error);
    }
  }

  /**
   * Start monitoring for daily reports
   * Checks every hour
   */
  static startDailyReportMonitoring() {
    console.log('📊 Starting daily report monitoring...');
    // Set an interval to check for daily report sending, e.g., every hour
    this.dailyReportInterval = setInterval(() => {
      this.checkAndSendDailyReport();
    }, 60 * 60 * 1000); // Check every hour

    // Also check immediately on start, in case the app starts after 9 AM
    this.checkAndSendDailyReport();
  }

  /**
   * Stop monitoring daily reports
   */
  static stopDailyReportMonitoring() {
    if (this.dailyReportInterval) {
      clearInterval(this.dailyReportInterval);
      this.dailyReportInterval = null;
      console.log('⏹️ Daily report monitoring stopped');
    }
  }

  /**
   * Check and send daily report if due
   */
  static async checkAndSendDailyReport() {
    const now = new Date();
    // Send the daily report after 11 PM (23:00) once per day
    // If the app wasn't running exactly at 23:00, allow sending any time after 23:00 until midnight
    if (now.getHours() >= 23) {
      const lastReportDate = await AsyncStorage.getItem('lastDailyReportDate');
      const today = now.toDateString();
      if (lastReportDate !== today) {
        console.log('⏰ Time to send daily report (post 11pm)!');
        await this.sendDailyReport();
        await AsyncStorage.setItem('lastDailyReportDate', today);
      } else {
        console.log('ℹ️ Daily report already sent today.');
      }
    }
  }

  /**
   * Send the daily report to caregivers
   */
  static async sendDailyReport() {
    try {
      const userName = await AsyncStorage.getItem('userName') || 'Patient';
      const caregivers = await DataService.getCaretakers();

      if (caregivers.length === 0) {
        console.log('ℹ️ No caregivers configured for daily reports.');
        return;
      }

      // Get history for yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();

      const history = await DataService.getMedicationHistory();
      const yesterdayHistory = history.filter(h => new Date(h.scheduledTime).toDateString() === yesterdayStr);

      let takenCount = 0;
      let lateTakenCount = 0;
      let missedCount = 0;
      let scheduledCount = 0;

      // To accurately count scheduled, we need to consider all reminders that were active yesterday
      const reminders = await DataService.getReminders();
      const relevantReminders = reminders.filter(r => {
        // Simple check: if reminder was active yesterday. More complex logic needed for 'once' reminders.
        return r.status === 'active' || (r.frequency === 'once' && new Date(r.date).toDateString() === yesterdayStr);
      });

      // For simplicity, let's assume `scheduledCount` for now is based on how many unique reminders *should* have been taken.
      // A more robust solution would involve checking each reminder's schedule for yesterday.
      // For this implementation, we'll use a placeholder for scheduledCount and refine if needed.
      
      const uniqueScheduledTimes = new Set();
      for (const reminder of relevantReminders) {
        // This is a simplification. A real implementation needs to generate all scheduled times for yesterday
        // for each relevant reminder and add them to a set to get unique scheduled doses.
        // For now, let's assume each relevant reminder represents at least one scheduled dose.
        uniqueScheduledTimes.add(reminder.id); 
      }
      scheduledCount = uniqueScheduledTimes.size;


      yesterdayHistory.forEach(record => {
        if (record.status === 'taken') {
          takenCount++;
        } else if (record.status === 'late_taken') {
          lateTakenCount++;
        } else if (record.status === 'missed') {
          missedCount++;
        }
      });
      
      // Calculate adherence percentage
      const totalTaken = takenCount + lateTakenCount;
      const adherence = scheduledCount > 0 ? ((totalTaken / scheduledCount) * 100).toFixed(2) : 0;

      // Send the email
      const emailResult = await EmailService.sendDailyReportEmail(
        caregivers,
        userName,
        yesterdayStr,
        scheduledCount,
        takenCount,
        lateTakenCount,
        missedCount,
        adherence
      );
      console.log('📧 Caregiver daily report sent:', emailResult);

    } catch (error) {
      console.error('❌ Error sending daily report:', error);
    }
  }
}

export default MedicationMonitor;
