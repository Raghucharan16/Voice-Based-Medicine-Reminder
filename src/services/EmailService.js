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

  /**
   * Send email alert for missed medication
   * @param {Array<Object>} caregivers - Array of caregiver objects
   * @param {string} patientName - Patient's name
   * @param {string} medicineName - Name of the missed medicine
   * @param {string} scheduledTime - Scheduled time for the medicine
   * @param {string} missedDate - Date when the medicine was missed
   */
  async sendMissedMedicationEmail(caregivers, patientName, medicineName, scheduledTime, missedDate) {
    try {
      const recipientEmails = caregivers.map(c => c.email);
      if (recipientEmails.length === 0) {
        console.log('No caregivers with emails found for missed medication alert.');
        return { success: false, message: 'No caregivers with emails.' };
      }

      const response = await fetch(`${this.SERVER_URL}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmails,
          subject: `Urgent: ${patientName} Missed Medication - ${medicineName}`,
          text: `Dear Caregiver,

This is an urgent notification. ${patientName} appears to have missed their ${medicineName} medication, which was scheduled for ${scheduledTime} on ${missedDate}.

Please check in with ${patientName} as soon as possible.

Thank you,
Your Medicine Reminder App`,
          html: `
            <p>Dear Caregiver,</p>
            <p>This is an urgent notification. <strong>${patientName}</strong> appears to have missed their <strong>${medicineName}</strong> medication, which was scheduled for ${scheduledTime} on ${missedDate}.</p>
            <p>Please check in with ${patientName} as soon as possible.</p>
            <p>Thank you,<br/>Your Medicine Reminder App</p>
          `,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send email');
      }
      return { success: true, message: 'Missed medication email sent successfully.', notified: recipientEmails.length };
    } catch (error) {
      console.error('Error sending missed medication email:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send late medication alert to caregiver
   * @param {Array<Object>} caregivers - Array of caregiver objects with name and email
   * @param {string} patientName - Patient's name
   * @param {string} medicineName - Name of late medicine
   * @param {number} delayMinutes - Delay in minutes
   */
  async sendLateMedicationEmail(caregivers, patientName, medicineName, delayMinutes) {
    try {
      const recipientEmails = caregivers.map(c => c.email);
      if (recipientEmails.length === 0) {
        console.log('No caregivers with emails found for late medication alert.');
        return { success: false, message: 'No caregivers with emails.' };
      }

      const response = await fetch(`${this.SERVER_URL}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmails,
          subject: `Alert: ${patientName} Took Medication Late - ${medicineName}`,
          text: `Dear Caregiver,

This is an alert to inform you that ${patientName} took their ${medicineName} medication ${delayMinutes} minutes late.

Thank you,
Your Medicine Reminder App`,
          html: `
            <p>Dear Caregiver,</p>
            <p>This is an alert to inform you that <strong>${patientName}</strong> took their <strong>${medicineName}</strong> medication <strong>${delayMinutes} minutes late</strong>.</p>
            <p>Thank you,<br/>Your Medicine Reminder App</p>
          `,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send email');
      }
      return { success: true, message: 'Late medication email sent successfully.', notified: recipientEmails.length };
    } catch (error) {
      console.error('Error sending late medication email:', error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Send daily report email to caregiver
   * @param {Array<Object>} caregivers - Array of caregiver objects with name and email
   * @param {string} patientName - Patient's name
   * @param {string} reportDate - Date of the report
   * @param {number} scheduledDoses - Total scheduled doses
   * @param {number} takenDoses - Total taken doses
   * @param {number} lateDoses - Total late doses
   * @param {number} missedDoses - Total missed doses
   * @param {number} adherencePercentage - Adherence percentage
   */
  async sendDailyReportEmail(caregivers, patientName, reportDate, scheduledDoses, takenDoses, lateDoses, missedDoses, adherencePercentage) {
    try {
      const recipientEmails = caregivers.map(c => c.email);
      if (recipientEmails.length === 0) {
        console.log('No caregivers with emails found for daily report.');
        return { success: false, message: 'No caregivers with emails.' };
      }

      const response = await fetch(`${this.SERVER_URL}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmails,
          subject: `Daily Medication Report for ${patientName} - ${reportDate}`,
          text: `Dear Caregiver,

Here is the daily medication adherence report for ${patientName} for ${reportDate}:

Summary:
- Scheduled Doses: ${scheduledDoses}
- Taken Doses (on time): ${takenDoses}
- Taken Doses (late): ${lateDoses}
- Missed Doses: ${missedDoses}

Overall Adherence: ${adherencePercentage}%

For a detailed view, please check the app.

Sincerely,
Your Medicine Reminder App`,
        }),
        timeout: 15000,
      });

      if (!response.ok) {
        throw new Error(`Email service error: ${response.status}`);
      }
      const result = await response.json();
      console.log('✅ Daily report email sent successfully:', result);
      return { success: true, notified: recipientEmails.length, result };

    } catch (error) {
      console.error('❌ Daily report email failed:', error);
      throw error;
    }
  }
}

const emailService = new EmailService();
export default emailService;
