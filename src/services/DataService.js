import AsyncStorage from '@react-native-async-storage/async-storage';
import EmailService from './EmailService'; // Import EmailService

class DataService {
  // Storage keys
  static KEYS = {
    REMINDERS: 'medicine_reminders',
    MEDICATIONS: 'medications',
    CARETAKERS: 'caretakers',
    MEDICATION_HISTORY: 'medication_history',
    FEEDBACK_HISTORY: 'feedback_history',
    USER_PROFILE: 'user_profile'
  };

  // Reminder Management
  static async saveReminder(reminder) {
    try {
      const reminders = await this.getReminders();
      const newReminder = {
        id: Date.now().toString(),
        ...reminder,
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      
      reminders.push(newReminder);
      await AsyncStorage.setItem(this.KEYS.REMINDERS, JSON.stringify(reminders));
      return newReminder;
    } catch (error) {
      console.error('Error saving reminder:', error);
      throw error;
    }
  }

  static async getReminders() {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.REMINDERS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting reminders:', error);
      return [];
    }
  }

  static async updateReminder(id, updates) {
    try {
      const reminders = await this.getReminders();
      const index = reminders.findIndex(r => r.id === id);
      
      if (index !== -1) {
        reminders[index] = { ...reminders[index], ...updates };
        await AsyncStorage.setItem(this.KEYS.REMINDERS, JSON.stringify(reminders));
        return reminders[index];
      }
      
      throw new Error('Reminder not found');
    } catch (error) {
      console.error('Error updating reminder:', error);
      throw error;
    }
  }

  static async deleteReminder(id) {
    try {
      const reminders = await this.getReminders();
      const filtered = reminders.filter(r => r.id !== id);
      await AsyncStorage.setItem(this.KEYS.REMINDERS, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error deleting reminder:', error);
      throw error;
    }
  }

  // Medication History
  static LATE_TAKEN_GRACE_PERIOD_MINUTES = 15;

  static async recordMedicationTaken(medicationId, scheduledTime, actualTime = null) {
    try {
      const history = await this.getMedicationHistory();
      const actualTakenTime = actualTime || new Date().toISOString();
      
      const scheduledDate = new Date(scheduledTime);
      const scheduledDateStr = scheduledDate.toDateString();
      
      const alreadyRecorded = history.find(h => {
        if (h.medicationId !== medicationId) return false;
        
        const hScheduledDate = new Date(h.scheduledTime);
        const hScheduledDateStr = hScheduledDate.toDateString();
        
        if (hScheduledDateStr !== scheduledDateStr) return false;
        
        const timeDiff = Math.abs(hScheduledDate - scheduledDate) / (1000 * 60);
        return timeDiff < 30; // Check within 30 minutes for same dose
      });

      // If a record already exists for this scheduled window
      if (alreadyRecorded) {
        // If it was previously marked as 'missed', update it to taken/late_taken
        if (alreadyRecorded.status === 'missed') {
          const delay = this.calculateDelay(scheduledTime, actualTakenTime);
          const newStatus = delay > this.LATE_TAKEN_GRACE_PERIOD_MINUTES ? 'late_taken' : 'taken';

          alreadyRecorded.actualTime = actualTakenTime;
          alreadyRecorded.status = newStatus;
          alreadyRecorded.delay = delay;

          // Persist updated history
          const updatedHistory = history.map(h => h.id === alreadyRecorded.id ? alreadyRecorded : h);
          await AsyncStorage.setItem(this.KEYS.MEDICATION_HISTORY, JSON.stringify(updatedHistory));

          console.log('🔁 Updated missed record to', newStatus, { medicationId, scheduledTime, existingRecord: alreadyRecorded.id });

          // If caregivers were alerted for this missed dose, send acknowledgement
          try {
            const alertedKey = `alerted_${medicationId}_${scheduledDateStr}`;
            const alertedVal = await AsyncStorage.getItem(alertedKey);
            if (alertedVal === 'true') {
              const caretakers = await this.getCaretakers();
              const patientName = (await this.getUserProfile()).name || 'Patient';
              const EmailService = require('./EmailService').default;
              const reminders = await this.getReminders();
              const reminder = reminders.find(r => r.id === medicationId) || {};
              await EmailService.sendAcknowledgementEmail(
                caretakers,
                patientName,
                reminder.medicine || 'medicine',
                scheduledTime,
                actualTakenTime,
                delay
              );

              // Clear the alerted flag so we don't ack repeatedly
              await AsyncStorage.removeItem(alertedKey);
            }
          } catch (e) {
            console.warn('Error sending acknowledgement email:', e);
          }

          return alreadyRecorded;
        }

        console.log('⚠️ Medication already recorded for this scheduled time:', {
          medicationId,
          scheduledTime,
          existingRecord: alreadyRecorded.id
        });
        return alreadyRecorded;
      }
      
      const delay = this.calculateDelay(scheduledTime, actualTakenTime);
      const status = delay > this.LATE_TAKEN_GRACE_PERIOD_MINUTES ? 'late_taken' : 'taken';

      const record = {
        id: Date.now().toString(),
        medicationId,
        scheduledTime: scheduledTime,
        actualTime: actualTakenTime,
        status,
        delay
      };
      
      console.log(`✅ Recording medication (${status}):`, {
        medicationId,
        scheduledTime,
        actualTime: actualTakenTime,
        delay: record.delay
      });
      
      history.push(record);
      await AsyncStorage.setItem(this.KEYS.MEDICATION_HISTORY, JSON.stringify(history));

      if (status === 'late_taken') {
        const reminder = await this.getReminderById(medicationId);
        const caregivers = await this.getCaretakers();
        if (reminder && caregivers.length > 0) {
          const patientName = await AsyncStorage.getItem('userName') || 'Patient';
          const emailResult = await EmailService.sendLateMedicationEmail(
            caregivers,
            patientName,
            reminder.medicine,
            delay
          );
          console.log('📧 Caregiver late medication alert sent:', emailResult);
        }
      }

      return record;
    } catch (error) {
      console.error('Error recording medication taken:', error);
      throw error;
    }
  }

  // Record a medication explicitly as late taken (wrapper for UI calls)
  static async recordMedicationLateTaken(medicationId, scheduledTime, actualTime = null) {
    try {
      const actualTakenTime = actualTime || new Date().toISOString();
      // Force late_taken by providing an actualTime sufficiently after scheduledTime
      const scheduled = new Date(scheduledTime);
      const forcedActual = new Date(actualTakenTime);
      // If actual is not at least 16 minutes after scheduled, push it forward to mark late
      if ((forcedActual - scheduled) / (1000 * 60) <= this.LATE_TAKEN_GRACE_PERIOD_MINUTES) {
        forcedActual.setMinutes(scheduled.getMinutes() + this.LATE_TAKEN_GRACE_PERIOD_MINUTES + 1);
      }
      return await this.recordMedicationTaken(medicationId, scheduledTime, forcedActual.toISOString());
    } catch (error) {
      console.error('Error recording medication late taken:', error);
      throw error;
    }
  }

  // ...existing code...

  // Record missed medication
  static async recordMedicationMissed(medicationId, scheduledTime, actualTime = null) {
    try {
      const history = await this.getMedicationHistory();
      
      // Prevent duplicate missed records for same medication at same scheduled time
      const scheduledDate = new Date(scheduledTime);
      const scheduledDateStr = scheduledDate.toDateString();
      
      const alreadyRecorded = history.find(h => {
        if (h.medicationId !== medicationId || h.status !== 'missed') return false;
        
        const hScheduledDate = new Date(h.scheduledTime);
        const hScheduledDateStr = hScheduledDate.toDateString();
        
        // Same date and within 30 min window
        if (hScheduledDateStr !== scheduledDateStr) return false;
        
        const timeDiff = Math.abs(hScheduledDate - scheduledDate) / (1000 * 60);
        return timeDiff < 30;
      });
      
      if (alreadyRecorded) {
        console.log('⚠️ Medication already recorded as missed for this scheduled time:', {
          medicationId,
          scheduledTime,
          existingRecord: alreadyRecorded.id
        });
        return alreadyRecorded;
      }
      
      const record = {
        id: Date.now().toString(),
        medicationId,
        scheduledTime: scheduledTime, // When it was supposed to be taken
        actualTime: actualTime || new Date().toISOString(),
        status: 'missed',
        delay: 0
      };
      
      console.log('✅ Recording medication missed:', {
        medicationId,
        scheduledTime
      });
      
      history.push(record);
      await AsyncStorage.setItem(this.KEYS.MEDICATION_HISTORY, JSON.stringify(history));
      return record;
    } catch (error) {
      console.error('Error recording medication missed:', error);
      throw error;
    }
  }

  static async getMedicationHistory() {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.MEDICATION_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting medication history:', error);
      return [];
    }
  }

  static calculateDelay(scheduledTime, actualTime) {
    const scheduled = new Date(scheduledTime);
    const actual = new Date(actualTime);
    return Math.max(0, Math.floor((actual - scheduled) / (1000 * 60))); // Delay in minutes
  }

  // Feedback Management
  static async saveFeedback(medicationId, feedbackText, sentiment = null) {
    try {
      const feedback = await this.getFeedbackHistory();
      const record = {
        id: Date.now().toString(),
        medicationId,
        feedback: feedbackText,
        sentiment,
        timestamp: new Date().toISOString()
      };
      
      feedback.push(record);
      await AsyncStorage.setItem(this.KEYS.FEEDBACK_HISTORY, JSON.stringify(feedback));
      return record;
    } catch (error) {
      console.error('Error saving feedback:', error);
      throw error;
    }
  }

  static async getFeedbackHistory() {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.FEEDBACK_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting feedback history:', error);
      return [];
    }
  }

  // Caretaker Management
  static async saveCaretaker(caretaker) {
    try {
      const caretakers = await this.getCaretakers();
      const newCaretaker = {
        id: Date.now().toString(),
        ...caretaker,
        createdAt: new Date().toISOString(),
        active: true
      };
      
      caretakers.push(newCaretaker);
      await AsyncStorage.setItem(this.KEYS.CARETAKERS, JSON.stringify(caretakers));
      return newCaretaker;
    } catch (error) {
      console.error('Error saving caretaker:', error);
      throw error;
    }
  }

  static async getCaretakers() {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.CARETAKERS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting caretakers:', error);
      return [];
    }
  }

  static async updateCaretaker(id, updates) {
    try {
      const caretakers = await this.getCaretakers();
      const index = caretakers.findIndex(c => c.id === id);
      
      if (index !== -1) {
        caretakers[index] = { ...caretakers[index], ...updates };
        await AsyncStorage.setItem(this.KEYS.CARETAKERS, JSON.stringify(caretakers));
        return caretakers[index];
      }
      
      throw new Error('Caretaker not found');
    } catch (error) {
      console.error('Error updating caretaker:', error);
      throw error;
    }
  }

  // User Profile
  static async saveUserProfile(profile) {
    try {
      const currentProfile = await this.getUserProfile();
      const updatedProfile = { ...currentProfile, ...profile };
      await AsyncStorage.setItem(this.KEYS.USER_PROFILE, JSON.stringify(updatedProfile));
      return updatedProfile;
    } catch (error) {
      console.error('Error saving user profile:', error);
      throw error;
    }
  }

  static async getUserProfile() {
    try {
      const data = await AsyncStorage.getItem(this.KEYS.USER_PROFILE);
      return data ? JSON.parse(data) : {
        name: '',
        email: '',
        phone: '',
        emergencyContact: '',
        medicalConditions: [],
        allergies: []
      };
    } catch (error) {
      console.error('Error getting user profile:', error);
      return {};
    }
  }

  // Statistics and Analytics
  static async getAdherenceStats(days = 30) {
    try {
      const history = await this.getMedicationHistory();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      const recentTakenHistory = history.filter(record => 
        (record.status === 'taken' || record.status === 'late_taken') &&
        new Date(record.actualTime || record.scheduledTime) >= cutoffDate
      );
      
      const totalScheduled = await this.getScheduledDosesForPeriod(days);
      const taken = recentTakenHistory.length;
      const missed = Math.max(0, totalScheduled - taken);

      const takenOnTime = recentTakenHistory.filter(record => record.delay <= 15).length; 
      const takenLate = recentTakenHistory.filter(record => record.delay > 15).length;

      return {
        totalReminders: totalScheduled,
        takenOnTime,
        takenLate,
        missed,
        adherenceRate: totalScheduled > 0 ? Math.round((taken / totalScheduled) * 100) : 0,
        averageDelay: recentTakenHistory.length > 0 
          ? Math.round(recentTakenHistory.reduce((sum, r) => sum + r.delay, 0) / recentTakenHistory.length)
          : 0
      };
    } catch (error) {
      console.error('Error getting adherence stats:', error);
      return {
        totalReminders: 0,
        takenOnTime: 0,
        takenLate: 0,
        missed: 0,
        adherenceRate: 0,
        averageDelay: 0
      };
    }
  }

  static async getMissedCount(days = 30) {
    try {
      const totalScheduled = await this.getScheduledDosesForPeriod(days);
      const history = await this.getMedicationHistory();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const takenDoses = history.filter(h => 
        (h.status === 'taken' || h.status === 'late_taken')
        && new Date(h.actualTime || h.scheduledTime) >= cutoffDate
      ).length;

      return Math.max(0, totalScheduled - takenDoses);
    } catch (error) {
      console.error('Error calculating missed count:', error);
      return 0;
    }
  }

  static async getScheduledDosesForPeriod(days = 30) {
    const reminders = await this.getReminders();
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - days);

    let scheduledCount = 0;

    for (const reminder of reminders) {
      if (reminder.status !== 'active') continue;

      // Simple daily frequency assumption for now
      // In a real app, this would be more complex, checking exact schedules
      scheduledCount += days; 
    }
    return scheduledCount;
  }

  // Utility functions
  static async clearAllData() {
    try {
      await AsyncStorage.multiRemove([
        this.KEYS.REMINDERS,
        this.KEYS.MEDICATIONS,
        this.KEYS.CARETAKERS,
        this.KEYS.MEDICATION_HISTORY,
        this.KEYS.FEEDBACK_HISTORY,
        this.KEYS.USER_PROFILE
      ]);
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  static async exportData() {
    try {
      const data = {
        reminders: await this.getReminders(),
        caretakers: await this.getCaretakers(),
        medicationHistory: await this.getMedicationHistory(),
        feedbackHistory: await this.getFeedbackHistory(),
        userProfile: await this.getUserProfile(),
        exportDate: new Date().toISOString()
      };
      
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }
}

export default DataService;
