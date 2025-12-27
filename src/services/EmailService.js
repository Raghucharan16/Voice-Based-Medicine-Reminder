/**
 * Email Service for Caregiver Notifications
 * Sends email alerts when medication is missed
 */

class EmailService {
  constructor() {
    this.SERVER_URL = this.getServerURL();
  }

  getServerURL() {
    // Use the same server URL logic as AIService
    try {
      const Constants = require('expo-constants').default;
      
      // Try multiple methods to get host
      if (Constants.manifest?.debuggerHost) {
        const host = Constants.manifest.debuggerHost.split(':')[0];
        return `http://${host}:3333`;
      }
      
      if (Constants.manifest2?.extra?.expoGo?.debuggerHost) {
        const host = Constants.manifest2.extra.expoGo.debuggerHost.split(':')[0];
        return `http://${host}:3333`;
      }
      
      if (Constants.expoConfig?.hostUri) {
        const host = Constants.expoConfig.hostUri.split(':')[0];
        return `http://${host}:3333`;
      }
      
      // Fallback to localhost
      return 'http://localhost:3333';
      
    } catch (error) {
      console.warn('EmailService: Could not detect server URL, using localhost');
      return 'http://localhost:3333';
    }
  }

  /**
   * Send missed medication alert to caregiver
   * @param {Object} params - Alert parameters
   * @param {string} params.caregiverEmail - Caregiver's email address
   * @param {string} params.caregiverName - Caregiver's name
   * @param {string} params.patientName - Patient's name
   * @param {string} params.medicineName - Name of missed medicine
   * @param {string} params.scheduledTime - Scheduled time for the medicine
   * @param {string} params.missedDate - Date when medicine was missed
   */
  async sendMissedMedicationAlert(params) {
    const {
      caregiverEmail,
      caregiverName,
      patientName,
      medicineName,
      dosage,
      scheduledTime,
      missedDate,
    } = params;

    console.log('📧 Sending missed medication alert to:', caregiverEmail);

    try {
      const response = await fetch(`${this.SERVER_URL}/send-caregiver-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: caregiverEmail,
          caregiverName,
          patientName,
          medicineName,
          dosage,
          scheduledTime,
          missedDate: missedDate || new Date().toLocaleDateString(),
        }),
        timeout: 15000,
      });

      if (!response.ok) {
        throw new Error(`Email service error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Email alert sent successfully:', result);
      return result;

    } catch (error) {
      console.error('❌ Email alert failed:', error);
      throw error;
    }
  }

  /**
   * Send bulk missed medication report (daily summary)
   * @param {Object} params - Report parameters
   * @param {string} params.caregiverEmail - Caregiver's email
   * @param {string} params.caregiverName - Caregiver's name
   * @param {string} params.patientName - Patient's name
   * @param {Array} params.missedMedications - Array of missed medications
   */
  async sendDailyMissedReport(params) {
    const {
      caregiverEmail,
      caregiverName,
      patientName,
      missedMedications, // Array of { medicine, time, date }
    } = params;

    console.log('📧 Sending daily missed medications report to:', caregiverEmail);

    try {
      const response = await fetch(`${this.SERVER_URL}/send-daily-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: caregiverEmail,
          caregiverName,
          patientName,
          missedMedications,
          reportDate: new Date().toLocaleDateString(),
        }),
        timeout: 15000,
      });

      if (!response.ok) {
        throw new Error(`Email service error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Daily report sent successfully:', result);
      return result;

    } catch (error) {
      console.error('❌ Daily report failed:', error);
      throw error;
    }
  }

  /**
   * Test email configuration
   * @param {string} testEmail - Email to send test message to
   */
  async testEmailSetup(testEmail) {
    console.log('📧 Testing email setup with:', testEmail);

    try {
      const response = await fetch(`${this.SERVER_URL}/test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: testEmail,
        }),
        timeout: 10000,
      });

      if (!response.ok) {
        throw new Error(`Email test failed: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Email test successful:', result);
      return result;

    } catch (error) {
      console.error('❌ Email test failed:', error);
      throw error;
    }
  }
}

const emailService = new EmailService();
export default emailService;
