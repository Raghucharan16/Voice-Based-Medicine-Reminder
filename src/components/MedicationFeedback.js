import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VoiceService from '../services/VoiceService';
import TTSService from '../services/TTSService';
import AIService from '../services/AIService';
import DataService from '../services/DataService';

const MedicationFeedback = ({ visible, onClose, medication, onFeedbackSubmitted }) => {
  const [feedbackText, setFeedbackText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedMood, setSelectedMood] = useState(null);

  const moodOptions = [
    { id: 'great', emoji: '😊', label: 'Great', color: '#4CAF50' },
    { id: 'good', emoji: '🙂', label: 'Good', color: '#8BC34A' },
    { id: 'okay', emoji: '😐', label: 'Okay', color: '#FFC107' },
    { id: 'tired', emoji: '😴', label: 'Tired', color: '#FF9800' },
    { id: 'dizzy', emoji: '😵', label: 'Dizzy', color: '#FF5722' },
    { id: 'nauseous', emoji: '🤢', label: 'Nauseous', color: '#9C27B0' },
    { id: 'pain', emoji: '😣', label: 'In Pain', color: '#F44336' },
    { id: 'worse', emoji: '😷', label: 'Worse', color: '#795548' },
  ];

  const handleVoiceFeedback = async () => {
    try {
      setIsRecording(true);
      
      // Start with a prompt
      await TTSService.speak("How are you feeling after taking your medication? Please describe your experience.");
      
      const audioUri = await VoiceService.startRecording();
      
      if (audioUri) {
        setIsRecording(false);
        setIsProcessing(true);
        
        // Transcribe the audio
        const transcription = await AIService.transcribeAudio(audioUri);
        
        if (transcription) {
          setFeedbackText(transcription);
          
          // Process the feedback with AI
          const analysis = await AIService.processMedicationFeedback(
            medication.id,
            transcription
          );
          
          // Provide AI response
          if (analysis.analysis) {
            await TTSService.speak(analysis.analysis);
          }
        }
      }
    } catch (error) {
      console.error('Voice feedback error:', error);
      Alert.alert('Error', 'Failed to record voice feedback: ' + error.message);
    } finally {
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const handleSubmitFeedback = async () => {
    try {
      if (!feedbackText.trim() && !selectedMood) {
        Alert.alert('Feedback Required', 'Please provide some feedback or select how you\'re feeling.');
        return;
      }

      setIsProcessing(true);

      // Combine mood and text feedback
      let combinedFeedback = '';
      if (selectedMood) {
        const mood = moodOptions.find(m => m.id === selectedMood);
        combinedFeedback = `Feeling: ${mood.label}`;
        if (feedbackText.trim()) {
          combinedFeedback += `\nAdditional notes: ${feedbackText.trim()}`;
        }
      } else {
        combinedFeedback = feedbackText.trim();
      }

      // Save feedback locally
      await DataService.saveFeedback(
        medication.id,
        combinedFeedback,
        selectedMood
      );

      // Process with AI if available
      try {
        const analysis = await AIService.processMedicationFeedback(
          medication.id,
          combinedFeedback
        );
        
        if (analysis.analysis) {
          await TTSService.speak("Thank you for your feedback. " + analysis.analysis);
        }
      } catch (aiError) {
        console.log('AI processing not available:', aiError);
        await TTSService.speak("Thank you for your feedback. Your response has been recorded.");
      }

      // Notify parent component
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted({
          medicationId: medication.id,
          feedback: combinedFeedback,
          mood: selectedMood,
          timestamp: new Date().toISOString()
        });
      }

      // Reset and close
      setFeedbackText('');
      setSelectedMood(null);
      onClose();

      Alert.alert(
        'Feedback Recorded! 📝',
        'Your feedback helps us understand how medications affect you.',
        [{ text: 'Great!', style: 'default' }]
      );

    } catch (error) {
      console.error('Submit feedback error:', error);
      Alert.alert('Error', 'Failed to submit feedback: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const MoodButton = ({ mood }) => (
    <TouchableOpacity
      style={[
        styles.moodButton,
        selectedMood === mood.id && { backgroundColor: mood.color + '20', borderColor: mood.color }
      ]}
      onPress={() => setSelectedMood(selectedMood === mood.id ? null : mood.id)}
    >
      <Text style={styles.moodEmoji}>{mood.emoji}</Text>
      <Text style={[
        styles.moodLabel,
        selectedMood === mood.id && { color: mood.color, fontWeight: '600' }
      ]}>
        {mood.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient colors={['#4CAF50', '#45A049']} style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>💊 Medication Feedback</Text>
              <Text style={styles.headerSubtitle}>
                How did you feel after taking {medication?.medicine || 'your medication'}?
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={styles.content}>
          {/* Mood Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How are you feeling?</Text>
            <View style={styles.moodGrid}>
              {moodOptions.map((mood) => (
                <MoodButton key={mood.id} mood={mood} />
              ))}
            </View>
          </View>

          {/* Voice Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice Feedback</Text>
            <TouchableOpacity
              style={styles.voiceButton}
              onPress={handleVoiceFeedback}
              disabled={isRecording || isProcessing}
            >
              <LinearGradient
                colors={
                  isRecording 
                    ? ['#FF6B6B', '#FF5252'] 
                    : isProcessing 
                    ? ['#FFA726', '#FF9800']
                    : ['#9C27B0', '#7B1FA2']
                }
                style={styles.voiceButtonGradient}
              >
                {isProcessing ? (
                  <ActivityIndicator size="large" color="white" />
                ) : (
                  <Ionicons 
                    name={isRecording ? "radio-button-on" : "mic"} 
                    size={32} 
                    color="white" 
                  />
                )}
                <Text style={styles.voiceButtonText}>
                  {isRecording ? 'Listening...' : isProcessing ? 'Processing...' : 'Tap to Speak'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Text Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Notes (Optional)</Text>
            <TextInput
              style={styles.textInput}
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder="Type any additional feedback here..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmitFeedback}
            disabled={isProcessing}
          >
            <LinearGradient
              colors={['#4CAF50', '#45A049']}
              style={styles.submitGradient}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="checkmark-circle" size={24} color="white" />
              )}
              <Text style={styles.submitText}>
                {isProcessing ? 'Submitting...' : 'Submit Feedback'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Skip Option */}
          <TouchableOpacity
            style={styles.skipButton}
            onPress={onClose}
            disabled={isProcessing}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    marginRight: 15,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: 'white',
    fontSize: 16,
    opacity: 0.9,
    lineHeight: 22,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 15,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  moodButton: {
    width: '23%',
    aspectRatio: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  moodLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    textAlign: 'center',
  },
  voiceButton: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  voiceButtonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  submitButton: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginBottom: 15,
  },
  submitGradient: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 15,
  },
  skipText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default MedicationFeedback;
