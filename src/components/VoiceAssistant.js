import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VoiceService from '../services/VoiceService';
import TTSService from '../services/TTSService';
import AIService from '../services/AIService';

const VoiceAssistant = ({ onReminderCreated, visible, onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [currentStep, setCurrentStep] = useState('idle'); // idle, listening, processing, questioning
  const [conversationContext, setConversationContext] = useState(null);

  useEffect(() => {
    if (visible) {
      startConversation();
    } else {
      resetConversation();
    }
  }, [visible]);

  const startConversation = async () => {
    const welcomeMessage = "Hi! I'm your voice assistant. You can say something like 'Remind me to take Aspirin at 8 PM' or just tell me about your medication.";
    setConversation([{ type: 'assistant', message: welcomeMessage }]);
    await TTSService.speak(welcomeMessage);
  };

  const resetConversation = () => {
    setConversation([]);
    setCurrentStep('idle');
    setConversationContext(null);
    AIService.resetContext();
    TTSService.stop();
  };

  const handleVoiceInput = async () => {
    try {
      if (isRecording) {
        // Stop recording and process
        console.log('🛑 Stopping recording in VoiceAssistant...');
        setIsRecording(false);
        setIsProcessing(true);
        setCurrentStep('processing');
        
        const audioUri = await VoiceService.stopRecording();
        console.log('📁 Audio file from VoiceAssistant:', audioUri);
        
        // Transcribe the audio
        const transcriptionResult = await AIService.transcribeAudio(audioUri);
        const transcript = transcriptionResult.text; // Extract text from result object
        
        if (transcript && transcript.trim()) {
          console.log('📝 Transcribed in VoiceAssistant:', transcript);
          
          // Add user message to conversation
          setConversation(prev => [...prev, { type: 'user', message: transcript }]);
          
          // Process with AI
          await processUserInput(transcript);
        } else {
          setIsProcessing(false);
          setCurrentStep('idle');
          await TTSService.speak("I couldn't understand that. Please try again.");
          Alert.alert('Error', 'Failed to transcribe audio');
        }
        
      } else {
        // Start recording - NO TTS to prevent recording system voice
        console.log('🎙️ Starting recording in VoiceAssistant...');
        setIsRecording(true);
        setCurrentStep('listening');
        
        await VoiceService.startRecording();
        // Don't speak during recording - it gets recorded!
      }
      
    } catch (error) {
      console.error('❌ Voice input error in VoiceAssistant:', error);
      Alert.alert('Error', 'Failed to process voice input: ' + error.message);
      setIsRecording(false);
      setIsProcessing(false);
      setCurrentStep('idle');
    }
  };

  const processUserInput = async (text) => {
    try {
      const result = await AIService.processVoiceCommand(text, conversationContext);
      
      if (result.type === 'question') {
        // AI needs more information - ask follow-up question
        setConversationContext(result.conversationContext);
        setCurrentStep('idle'); // Set to idle so user can record answer
        setIsProcessing(false); // Stop processing indicator
        
        const response = result.question;
        setConversation(prev => [...prev, { type: 'assistant', message: response }]);
        await TTSService.speak(response);
        
        // User can now tap to answer the question
        
      } else if (result.type === 'complete_reminder') {
        // Reminder is complete - ask for confirmation
        setCurrentStep('idle');
        setIsProcessing(false);
        
        // Build confirmation message with date/dayOfWeek if present
        let frequencyInfo = result.reminder.frequency;
        if (result.reminder.date) {
          const dateObj = new Date(result.reminder.date);
          const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          frequencyInfo = `${result.reminder.frequency} (${dateStr})`;
        } else if (result.reminder.dayOfWeek) {
          frequencyInfo = `${result.reminder.frequency} (Every ${result.reminder.dayOfWeek})`;
        }
        
        const confirmMessage = `I've got all the details:\n\n💊 Medicine: ${result.reminder.medicine}\n💉 Dosage: ${result.reminder.dosage}\n🕐 Time: ${result.reminder.time}\n📅 Frequency: ${frequencyInfo}\n\nShould I save this reminder?`;
        
        setConversation(prev => [...prev, { type: 'assistant', message: confirmMessage }]);
        await TTSService.speak("I've got all the details. Should I save this reminder?");
        
        // Wait for user confirmation
        Alert.alert(
          '✅ Reminder Ready',
          confirmMessage,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: async () => {
                await TTSService.speak("Okay, cancelled.");
                setConversationContext(null);
                const cancelMsg = "Reminder cancelled. You can start over anytime.";
                setConversation(prev => [...prev, { type: 'assistant', message: cancelMsg }]);
              }
            },
            {
              text: 'Save',
              onPress: async () => {
                await TTSService.speak("Saving your reminder now");
                
                // Notify parent component to save
                if (onReminderCreated) {
                  await onReminderCreated(result.reminder);
                }
                
                setConversationContext(null);
                const successMsg = `✅ Reminder saved for ${result.reminder.medicine} at ${result.reminder.time}!`;
                setConversation(prev => [...prev, { type: 'assistant', message: successMsg }]);
                await TTSService.speak(successMsg);
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('Error processing user input:', error);
      const errorMessage = "I'm sorry, I couldn't process that. Could you please try again?";
      setConversation(prev => [...prev, { type: 'assistant', message: errorMessage }]);
      await TTSService.speak(errorMessage);
      setCurrentStep('idle');
      setIsProcessing(false);
    }
  };

  const getButtonState = () => {
    if (isRecording) {
      return {
        colors: ['#FF6B6B', '#FF5252'],
        icon: 'radio-button-on',
        text: 'Listening...',
        disabled: false
      };
    } else if (isProcessing) {
      return {
        colors: ['#FFA726', '#FF9800'],
        icon: 'hourglass',
        text: 'Processing...',
        disabled: true
      };
    } else {
      return {
        colors: ['#4CAF50', '#45A049'],
        icon: 'mic',
        text: 'Tap to Speak',
        disabled: false
      };
    }
  };

  const buttonState = getButtonState();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient colors={['#2196F3', '#21CBF3']} style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>🤖 Voice Assistant</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>
            {currentStep === 'idle' && "Ready to help with your medications"}
            {currentStep === 'listening' && "Listening to your voice..."}
            {currentStep === 'processing' && "Understanding your request..."}
            {currentStep === 'questioning' && "Gathering more information..."}
          </Text>
        </LinearGradient>

        {/* Conversation - Now Scrollable */}
        <ScrollView 
          style={styles.conversationContainer}
          contentContainerStyle={styles.conversationContent}
          ref={(ref) => {
            if (ref && conversation.length > 0) {
              ref.scrollToEnd({ animated: true });
            }
          }}
        >
          {conversation.map((message, index) => (
            <View
              key={index}
              style={[
                styles.messageContainer,
                message.type === 'user' ? styles.userMessage : styles.assistantMessage
              ]}
            >
              <View style={[
                styles.messageBubble,
                message.type === 'user' ? styles.userBubble : styles.assistantBubble
              ]}>
                <Text style={[
                  styles.messageText,
                  message.type === 'user' ? styles.userText : styles.assistantText
                ]}>
                  {message.message}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Voice Input Button */}
        <View style={styles.inputContainer}>
          <TouchableOpacity
            style={styles.voiceButton}
            onPress={handleVoiceInput}
            disabled={buttonState.disabled}
          >
            <LinearGradient colors={buttonState.colors} style={styles.voiceButtonGradient}>
              {isProcessing ? (
                <ActivityIndicator size="large" color="white" />
              ) : (
                <Ionicons name={buttonState.icon} size={32} color="white" />
              )}
              <Text style={styles.voiceButtonText}>{buttonState.text}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Quick Actions */}
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => {
                const message = "You can say things like: 'Remind me to take Aspirin at 8 PM' or 'Set up a reminder for my blood pressure medication at 9 AM with 10mg dosage'";
                TTSService.speak(message);
              }}
            >
              <Ionicons name="help-circle" size={20} color="#2196F3" />
              <Text style={styles.quickActionText}>Examples</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={resetConversation}
            >
              <Ionicons name="refresh" size={20} color="#2196F3" />
              <Text style={styles.quickActionText}>Reset</Text>
            </TouchableOpacity>
          </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerSubtitle: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
  },
  conversationContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  conversationContent: {
    padding: 20,
    paddingBottom: 40, // Extra space at bottom for scrolling
  },
  messageContainer: {
    marginVertical: 8,
  },
  userMessage: {
    alignItems: 'flex-end',
  },
  assistantMessage: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#2196F3',
  },
  assistantBubble: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  userText: {
    color: 'white',
  },
  assistantText: {
    color: '#333',
  },
  inputContainer: {
    padding: 20,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  voiceButton: {
    borderRadius: 25,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginBottom: 15,
  },
  voiceButtonGradient: {
    paddingVertical: 18,
    paddingHorizontal: 30,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  voiceButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#f0f8ff',
    borderRadius: 20,
  },
  quickActionText: {
    color: '#2196F3',
    fontSize: 14,
    marginLeft: 6,
    fontWeight: '500',
  },
});

export default VoiceAssistant;
