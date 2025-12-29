import AsyncStorage from '@react-native-async-storage/async-storage';

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
  static async recordMedicationTaken(medicationId, scheduledTime, actualTime = null) {
    try {
      const history = await this.getMedicationHistory();
      const actualTakenTime = actualTime || new Date().toISOString();
      
      // Enhanced duplicate check: prevent multiple records for same medication on same scheduled time
      // Check within a 30-minute window of the scheduled time to handle late taking within threshold
      const scheduledDate = new Date(scheduledTime);
      const scheduledDateStr = scheduledDate.toDateString();
      
      // Find existing record for this medication on this scheduled date/time
      const alreadyRecorded = history.find(h => {
        if (h.medicationId !== medicationId || h.status !== 'taken') return false;
        
        const hScheduledDate = new Date(h.scheduledTime);
        const hScheduledDateStr = hScheduledDate.toDateString();
        
        // Check if it's the same date and within 30 min of scheduled time
        if (hScheduledDateStr !== scheduledDateStr) return false;
        
        // Check if scheduled times are within 30 minutes of each other (same dose)
        const timeDiff = Math.abs(hScheduledDate - scheduledDate) / (1000 * 60);
        return timeDiff < 30;
      });
      
      if (alreadyRecorded) {
        console.log('⚠️ Medication already recorded for this scheduled time:', {
          medicationId,
          scheduledTime,
          existingRecord: alreadyRecorded.id
        });
        return alreadyRecorded; // Return existing record, don't create duplicate
      }
      
      const record = {
        id: Date.now().toString(),
        medicationId,
        scheduledTime: scheduledTime, // When it was supposed to be taken
        actualTime: actualTakenTime,  // When it was actually taken (system time in IST)
        status: 'taken',
        delay: this.calculateDelay(scheduledTime, actualTakenTime)
      };
      
      console.log('✅ Recording new medication taken:', {
        medicationId,
        scheduledTime,
        actualTime: actualTakenTime,
        delay: record.delay
      });
      
      history.push(record);
      await AsyncStorage.setItem(this.KEYS.MEDICATION_HISTORY, JSON.stringify(history));
      return record;
    } catch (error) {
      console.error('Error recording medication taken:', error);
      throw error;
    }
  }

  // Record late taken medication (after 15 min buffer)
  static async recordMedicationLateTaken(medicationId, scheduledTime, actualTime = null) {
    try {
      const history = await this.getMedicationHistory();
      const actualTakenTime = actualTime || new Date().toISOString();
      
      // Prevent duplicate late records for same medication at same scheduled time
      const scheduledDate = new Date(scheduledTime);
      const scheduledDateStr = scheduledDate.toDateString();
      
      const alreadyRecorded = history.find(h => {
        if (h.medicationId !== medicationId || h.status !== 'late_taken') return false;
        
        const hScheduledDate = new Date(h.scheduledTime);
        const hScheduledDateStr = hScheduledDate.toDateString();
        
        if (hScheduledDateStr !== scheduledDateStr) return false;
        
        const timeDiff = Math.abs(hScheduledDate - scheduledDate) / (1000 * 60);
        return timeDiff < 30;
      });
      
      if (alreadyRecorded) {
        console.log('⚠️ Medication already recorded as late taken for this scheduled time:', {
          medicationId,
          scheduledTime,
          existingRecord: alreadyRecorded.id
        });
        return alreadyRecorded;
      }
      
      const record = {
        id: Date.now().toString(),
        medicationId,
        scheduledTime: scheduledTime,
        actualTime: actualTakenTime,
        status: 'late_taken',
        delay: this.calculateDelay(scheduledTime, actualTakenTime)
      };
      
      console.log('✅ Recording medication late taken:', {
        medicationId,
        scheduledTime,
        actualTime: actualTakenTime,
        delay: record.delay
      });
      
      history.push(record);
      await AsyncStorage.setItem(this.KEYS.MEDICATION_HISTORY, JSON.stringify(history));
      return record;
    } catch (error) {
      console.error('Error recording medication late taken:', error);
      throw error;
    }
  }

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
      
      const recentHistory = history.filter(record => 
        new Date(record.actualTime) >= cutoffDate
      );
      
      const totalReminders = recentHistory.length;
      const takenOnTime = recentHistory.filter(record => record.delay <= 15).length; // Within 15 minutes
      const takenLate = recentHistory.filter(record => record.delay > 15 && record.delay <= 60).length;
      const missedCount = await this.getMissedCount(days);
      
      return {
        totalReminders,
        takenOnTime,
        takenLate,
        missed: missedCount,
        adherenceRate: totalReminders > 0 ? Math.round((takenOnTime / totalReminders) * 100) : 0,
        averageDelay: recentHistory.length > 0 
          ? Math.round(recentHistory.reduce((sum, r) => sum + r.delay, 0) / recentHistory.length)
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
      const reminders = await this.getReminders();
      const history = await this.getMedicationHistory();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      // This is a simplified calculation - in a real app, you'd track missed reminders more accurately
      const activeReminders = reminders.filter(r => r.status === 'active');
      const expectedCount = activeReminders.length * days; // Simplified assumption
      const actualCount = history.filter(record => 
        new Date(record.actualTime) >= cutoffDate
      ).length;
      
      return Math.max(0, expectedCount - actualCount);
    } catch (error) {
      console.error('Error calculating missed count:', error);
      return 0;
    }
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
