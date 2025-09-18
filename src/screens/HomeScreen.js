import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VoiceService from '../services/VoiceService';
import TTSService from '../services/TTSService';
import ReminderService from '../services/ReminderService';
import AIService from '../services/AIService';
import DataService from '../services/DataService';
import NotificationService from '../services/NotificationService';
import VoiceAssistant from '../components/VoiceAssistant';

const HomeScreen = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState('');
  const [serverStatus, setServerStatus] = useState('Checking...');
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false);
  const [todayStats, setTodayStats] = useState({
    medicines: 0,
    taken: 0,
    pending: 0
  });

  useEffect(() => {
    checkServerConnection();
    requestPermissions();
    initializeServices();
    loadTodayStats();
  }, []);

  const checkServerConnection = async () => {
    try {
      const status = await AIService.checkHealth();
      setServerStatus(status ? 'Connected ✅' : 'Offline Mode 📱');
    } catch (error) {
      setServerStatus('Offline Mode 📱');
    }
  };

  const requestPermissions = async () => {
    try {
      await VoiceService.requestPermissions();
      await ReminderService.requestPermissions();
    } catch (error) {
      console.warn('Permission error:', error);
    }
  };

  const initializeServices = async () => {
    try {
      await NotificationService.initialize();
    } catch (error) {
      console.warn('Service initialization error:', error);
    }
  };

  const loadTodayStats = async () => {
    try {
      const stats = await DataService.getAdherenceStats(1); // Today only
      setTodayStats({
        medicines: await getTodayRemindersCount(),
        taken: stats.takenOnTime + stats.takenLate,
        pending: Math.max(0, await getTodayRemindersCount() - stats.takenOnTime - stats.takenLate)
      });
    } catch (error) {
      console.warn('Error loading stats:', error);
    }
  };

  const getTodayRemindersCount = async () => {
    try {
      const reminders = await DataService.getReminders();
      return reminders.filter(r => r.status === 'active').length;
    } catch (error) {
      return 0;
    }
  };

  const handleRecord = async () => {
    try {
      setIsRecording(true);
      setIsProcessing(false);
      
      const audioUri = await VoiceService.startRecording();
      
      if (audioUri) {
        setIsRecording(false);
        setIsProcessing(true);
        
        const transcription = await AIService.transcribeAudio(audioUri);
        setLastTranscription(transcription || 'Recording completed - transcription available in offline mode');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to record audio: ' + error.message);
    } finally {
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleSpeak = async () => {
    const message = "Hello! This is your medicine reminder. Please take your prescribed medication now.";
    await TTSService.speak(message);
  };

  const handleQuickReminder = async () => {
    try {
      await ReminderService.scheduleReminder(
        new Date(Date.now() + 10000), // 10 seconds from now
        'Medicine Reminder',
        'Time to take your medicine!'
      );
      Alert.alert('Success', 'Reminder scheduled for 10 seconds from now');
    } catch (error) {
      Alert.alert('Error', 'Failed to schedule reminder: ' + error.message);
    }
  };

  const handleReminderCreated = async (reminder) => {
    try {
      // Save reminder to local storage
      const savedReminder = await DataService.saveReminder(reminder);
      
      // Schedule notification
      await NotificationService.scheduleMedicationReminder(savedReminder);
      
      // Refresh stats
      await loadTodayStats();
      
      Alert.alert(
        'Reminder Created! 🎉',
        `I've set up a reminder for ${reminder.medicine} at ${reminder.time}`,
        [{ text: 'Great!', style: 'default' }]
      );
    } catch (error) {
      console.error('Error creating reminder:', error);
      Alert.alert('Error', 'Failed to create reminder: ' + error.message);
    }
  };

  const QuickActionCard = ({ icon, title, subtitle, onPress, color, disabled }) => (
    <TouchableOpacity
      style={[styles.actionCard, disabled && styles.disabledCard]}
      onPress={onPress}
      disabled={disabled}
    >
      <LinearGradient
        colors={disabled ? ['#f0f0f0', '#e0e0e0'] : [color, color + '80']}
        style={styles.cardGradient}
      >
        <Ionicons name={icon} size={24} color={disabled ? '#999' : 'white'} />
        <Text style={[styles.cardTitle, disabled && styles.disabledText]}>{title}</Text>
        <Text style={[styles.cardSubtitle, disabled && styles.disabledText]}>{subtitle}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <LinearGradient colors={['#2196F3', '#21CBF3']} style={styles.header}>
          <Text style={styles.welcomeText}>Welcome Back!</Text>
          <Text style={styles.headerTitle}>Voice Medicine Reminder</Text>
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>AI Status: {serverStatus}</Text>
          </View>
        </LinearGradient>

        {/* Voice Assistant Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 AI Voice Assistant</Text>
          <TouchableOpacity
            style={styles.voiceAssistantButton}
            onPress={() => setShowVoiceAssistant(true)}
          >
            <LinearGradient
              colors={['#6A5ACD', '#9370DB']}
              style={styles.voiceAssistantGradient}
            >
              <Ionicons name="chatbubbles" size={32} color="white" />
              <View style={styles.assistantTextContainer}>
                <Text style={styles.assistantButtonTitle}>Start Voice Conversation</Text>
                <Text style={styles.assistantButtonSubtitle}>Add reminders with natural speech</Text>
              </View>
              <Ionicons name="arrow-forward" size={24} color="white" />
            </LinearGradient>
          </TouchableOpacity>

          {lastTranscription ? (
            <View style={styles.transcriptionCard}>
              <Text style={styles.transcriptionLabel}>📝 Last Recording:</Text>
              <Text style={styles.transcriptionText}>{lastTranscription}</Text>
            </View>
          ) : null}
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <QuickActionCard
              icon="volume-high"
              title="Voice Test"
              subtitle="Test TTS"
              onPress={handleSpeak}
              color="#9C27B0"
            />
            <QuickActionCard
              icon="alarm"
              title="Quick Reminder"
              subtitle="10 seconds"
              onPress={handleQuickReminder}
              color="#FF9800"
            />
          </View>
        </View>

        {/* Daily Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Today's Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNumber}>{todayStats.medicines}</Text>
                <Text style={styles.summaryLabel}>Medicines</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNumber}>{todayStats.taken}</Text>
                <Text style={styles.summaryLabel}>Taken</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNumber}>{todayStats.pending}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
      
      {/* Voice Assistant Modal */}
      <VoiceAssistant
        visible={showVoiceAssistant}
        onClose={() => setShowVoiceAssistant(false)}
        onReminderCreated={handleReminderCreated}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    padding: 20,
    paddingTop: 40,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 20,
  },
  welcomeText: {
    color: 'white',
    fontSize: 16,
    opacity: 0.9,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 5,
  },
  statusContainer: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 15,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 15,
  },
  recordButton: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  recordButtonGradient: {
    paddingVertical: 20,
    paddingHorizontal: 30,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  recordButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 10,
  },
  transcriptionCard: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  transcriptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  transcriptionText: {
    fontSize: 14,
    color: '#34495e',
    lineHeight: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionCard: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cardGradient: {
    padding: 20,
    alignItems: 'center',
  },
  cardTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  cardSubtitle: {
    color: 'white',
    fontSize: 12,
    opacity: 0.9,
    marginTop: 2,
  },
  disabledCard: {
    opacity: 0.6,
  },
  disabledText: {
    color: '#999',
  },
  voiceAssistantButton: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  voiceAssistantGradient: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assistantTextContainer: {
    flex: 1,
    marginLeft: 15,
  },
  assistantButtonTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  assistantButtonSubtitle: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});

export default HomeScreen;
