import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Button, Card, Title, Paragraph } from 'react-native-paper';
import * as Speech from 'expo-speech';
import AIService from '../services/AIService';
import * as ReminderService from '../services/ReminderService';

const ReportsScreen = () => {
  const [report, setReport] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const generateReport = async () => {
    setIsLoading(true);
    setReport('');
    try {
      // Fetching medicine data from reminders as a proxy for adherence logs
      const reminders = await ReminderService.getReminders();
      if (!reminders) {
        Alert.alert("No Reminders", "You don't have any reminders set up to generate a report from.");
        setIsLoading(false);
        return;
      }
      const adherenceData = reminders.map(r => ({
        medicine: r.medicine,
        time: r.time,
        // In a real app, this would be a log of actual taken times vs scheduled
        status: r.enabled ? 'Taken (Simulated)' : 'Missed (Simulated)'
      }));

      const generatedReport = await AIService.generateReport(adherenceData);
      setReport(generatedReport);
    } catch (error) {
      console.error('Report generation error:', error);
      Alert.alert('Error', 'Failed to generate AI report. Please ensure the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeak = () => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      if (report) {
        setIsSpeaking(true);
        Speech.speak(report, {
          language: 'en-US',
          onDone: () => setIsSpeaking(false),
          onStopped: () => setIsSpeaking(false),
          onError: () => setIsSpeaking(false),
        });
      }
    }
  };

  useEffect(() => {
    // Stop speech if the component is unmounted
    return () => {
      if (isSpeaking) {
        Speech.stop();
      }
    };
  }, [isSpeaking]);

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title style={styles.title}>AI Adherence Report</Title>
          <Paragraph style={styles.paragraph}>
            Click the button to generate an AI-powered report based on your simulated medication adherence history. The report will provide insights and recommendations.
          </Paragraph>
        </Card.Content>
        <Card.Actions style={styles.actions}>
          <Button 
            mode="contained" 
            onPress={generateReport}
            disabled={isLoading}
            icon="brain"
          >
            {isLoading ? 'Generating...' : 'Generate AI Report'}
          </Button>
        </Card.Actions>
      </Card>

      {isLoading && <ActivityIndicator size="large" style={styles.loader} />}

      {report && (
        <Card style={styles.reportCard}>
          <Card.Content>
            <Title>Your Report</Title>
            <Paragraph>{report}</Paragraph>
          </Card.Content>
          <Card.Actions style={styles.actions}>
            <Button 
              mode="outlined" 
              onPress={handleSpeak}
              icon={isSpeaking ? "stop-circle-outline" : "volume-high"}
            >
              {isSpeaking ? 'Stop Speaking' : 'Read Report Aloud'}
            </Button>
          </Card.Actions>
        </Card>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#f0f2f5',
  },
  card: {
    marginBottom: 20,
  },
  reportCard: {
    marginTop: 10,
    backgroundColor: '#E3F2FD',
  },
  title: {
    textAlign: 'center',
    marginBottom: 10,
  },
  paragraph: {
    textAlign: 'center',
    marginBottom: 20,
  },
  actions: {
    justifyContent: 'center',
    paddingBottom: 10,
  },
  loader: {
    marginVertical: 20,
  },
});

export default ReportsScreen;
