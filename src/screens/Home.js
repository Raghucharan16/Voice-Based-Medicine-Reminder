import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import VoiceRecorder from '../services/VoiceRecorder';
import TTSService from '../services/TTSService';
import ReminderService from '../services/ReminderService';
import AIService from '../services/AIService';

export default function Home() {
  const [lastTranscription, setLastTranscription] = useState('');

  const recordAndTranscribe = async () => {
    const fileUri = await VoiceRecorder.recordAndSave();
    const text = await AIService.transcribeAudio(fileUri);
    setLastTranscription(text || 'No transcription');
  };

  const speakReminder = async () => {
    await TTSService.speak('This is a test reminder. Time to take your medicine.');
  };

  const scheduleTestReminder = async () => {
    await ReminderService.scheduleReminder(new Date(Date.now() + 10000), 'Take Med: Aspirin');
  };

  const generateReport = async () => {
    const report = await AIService.generateAdherenceReport([{ medicine: 'Aspirin', taken: true }]);
    alert(report);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Voice Medicine Reminder (Minimal)</Text>
      <Button title="Record and Transcribe" onPress={recordAndTranscribe} />
      <View style={styles.spacer} />
      <Button title="Speak Test Reminder" onPress={speakReminder} />
      <View style={styles.spacer} />
      <Button title="Schedule Test Reminder (10s)" onPress={scheduleTestReminder} />
      <View style={styles.spacer} />
      <Button title="Generate AI Report" onPress={generateReport} />
      <View style={styles.spacer} />
      <Text>Last transcription:</Text>
      <Text style={styles.transcription}>{lastTranscription}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  spacer: { height: 12 },
  transcription: { marginTop: 8, fontStyle: 'italic' }
});
