import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
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
      setIsRecording(true);
      setCurrentStep('listening');
      
      const audioUri = await VoiceService.startRecording();
      
      if (audioUri) {
        setIsRecording(false);
        setIsProcessing(true);
        setCurrentStep('processing');
        
        // Transcribe audio
        const transcription = await AIService.transcribeAudio(audioUri);
        
        if (transcription) {
          // Add user message to conversation
          setConversation(prev => [...prev, { type: 'user', message: transcription }]);
          
          // Process with AI
          await processUserInput(transcription);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process voice input: ' + error.message);
      setCurrentStep('idle');
    } finally {
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const processUserInput = async (text) => {
    try {
      const result = await AIService.processVoiceCommand(text, conversationContext);
      
      if (result.type === 'question') {
        // AI needs more information
        setConversationContext(result.conversationContext);
        setCurrentStep('questioning');
        
        const response = result.question;
        setConversation(prev => [...prev, { type: 'assistant', message: response }]);
        await TTSService.speak(response);
        
      } else if (result.type === 'complete_reminder') {
        // Reminder is complete
        setCurrentStep('idle');
        setConversationContext(null);
        
        const response = result.response;
        setConversation(prev => [...prev, { type: 'assistant', message: response }]);
        await TTSService.speak(response);
        
        // Notify parent component
        if (onReminderCreated) {
          onReminderCreated(result.reminder);
        }
        
        // Ask if they want to add another reminder
        setTimeout(async () => {
          const followUp = "Would you like to add another reminder or is there anything else I can help you with?";
          setConversation(prev => [...prev, { type: 'assistant', message: followUp }]);
          await TTSService.speak(followUp);
        }, 2000);
      }
    } catch (error) {
      console.error('Error processing user input:', error);
      const errorMessage = "I'm sorry, I couldn't process that. Could you please try again?";
      setConversation(prev => [...prev, { type: 'assistant', message: errorMessage }]);
      await TTSService.speak(errorMessage);
      setCurrentStep('idle');
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

        {/* Conversation */}
        <View style={styles.conversationContainer}>
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
        </View>

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
    padding: 20,
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
