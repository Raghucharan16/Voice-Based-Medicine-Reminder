/**
 * Manual Test Script for Medication Monitor
 * Run this in the app to manually trigger a check
 */

import MedicationMonitor from './MedicationMonitor';
import DataService from './DataService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function testMedicationMonitor() {
  console.log('\n==========================================');
  console.log('🧪 MANUAL MEDICATION MONITOR TEST');
  console.log('==========================================\n');

  // Check caregiver alerts setting
  const caregiverAlertsEnabled = await AsyncStorage.getItem('caregiverAlerts');
  console.log('1️⃣ Caregiver Alerts Enabled:', caregiverAlertsEnabled);

  // Get all reminders
  const reminders = await DataService.getReminders();
  console.log('\n2️⃣ Active Reminders:', reminders.length);
  reminders.forEach(r => {
    console.log(`   - ${r.medicine} at ${r.time} (${r.frequency}) [Status: ${r.status}]`);
    if (r.date) console.log(`     Date: ${r.date}`);
  });

  // Get all caretakers
  const caretakers = await DataService.getCaretakers();
  const activeCaretakers = caretakers.filter(c => c.active);
  console.log('\n3️⃣ Active Caretakers:', activeCaretakers.length);
  activeCaretakers.forEach(c => {
    console.log(`   - ${c.name}: ${c.email}, ${c.phone}`);
  });

  // Get medication history
  const history = await DataService.getMedicationHistory();
  const today = new Date().toDateString();
  const todayHistory = history.filter(h => 
    new Date(h.actualTime).toDateString() === today
  );
  console.log('\n4️⃣ Today\'s History:', todayHistory.length, 'records');
  todayHistory.forEach(h => {
    const reminder = reminders.find(r => r.id === h.medicationId);
    console.log(`   - ${reminder?.medicine || 'Unknown'}: ${h.status} at ${new Date(h.actualTime).toLocaleTimeString()}`);
  });

  // Current time
  const now = new Date();
  console.log('\n5️⃣ Current Time:', now.toLocaleString());

  console.log('\n6️⃣ Running Manual Check...\n');
  
  // Manually trigger check
  await MedicationMonitor.checkMissedMedications();

  console.log('\n==========================================');
  console.log('✅ TEST COMPLETE');
  console.log('==========================================\n');
}

// Instructions to use:
// 1. Import this in your component (e.g., HomeScreen.js)
// 2. Add a button that calls testMedicationMonitor()
// 3. Press the button to see detailed logs
