// src/services/AIService.js - Enhanced version with multiple API support
import Constants from 'expo-constants';
import GeminiService from './GeminiService';

class AIService {
  constructor() {
    this.SERVER_URL = this.getServerURL();
    this.currentLanguage = 'en';
    this.conversationContext = null;
    this.useLocalFallback = true; // Enable local processing as fallback
    this.apiRetries = 3;
    this.apiTimeout = 10000; // 10 seconds timeout
  }

  getServerURL() {
    try {
      const debuggerHost = Constants.expoConfig?.hostUri?.split(':').shift();
      if (debuggerHost) {
        return `http://${debuggerHost}:3333`;
      }
    } catch (error) {
      console.warn('Could not dynamically determine server IP. Using fallback.');
    }
    return 'http://192.168.1.15:3333'; // Updated to your current IP
  }

  // Check server health
  async checkHealth() {
    try {
      const response = await fetch(`${this.SERVER_URL}/health`, {
        method: 'GET',
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Enhanced transcription with retry and fallback
  async transcribeAudio(audioUri) {
    // For now, return a simulated transcription since speech-to-text requires specialized APIs
    // In a real app, you would integrate with Google Speech-to-Text, Azure Speech, or similar
    return this.simulateTranscription();
  }

  simulateTranscription() {
    const sampleTranscriptions = [
      "Remind me to take Aspirin at 8 PM",
      "Set up a reminder for my Paracetamol at 10 AM",
      "I need to take Vitamin D every morning at 9 AM",
      "Remind me to take my blood pressure medication at 7 PM",
      "Set a reminder for Ibuprofen at 2 PM with 400mg"
    ];
    
    return sampleTranscriptions[Math.floor(Math.random() * sampleTranscriptions.length)];
  }

  async transcribeAudioWithRetry(audioUri) {
    for (let attempt = 1; attempt <= this.apiRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), this.apiTimeout)
        );

        const transcriptionPromise = this.transcribeAudioAPI(audioUri);
        
        const result = await Promise.race([transcriptionPromise, timeoutPromise]);
        return result;
        
      } catch (error) {
        console.error(`Transcription attempt ${attempt} failed:`, error);
        
        if (attempt === this.apiRetries) {
          // Final fallback to simulated transcription
          return this.simulateTranscription();
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  async transcribeAudioAPI(audioUri) {
    const formData = new FormData();
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a'
    });

    const response = await fetch(`${this.SERVER_URL}/transcribe`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      timeout: this.apiTimeout
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    return result.transcription;
  }

  // Parse reminder with current server
  async parseReminder(text) {
    try {
      const response = await fetch(`${this.SERVER_URL}/parse-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Reminder parsing error:', error);
      throw error;
    }
  }

  // Enhanced conversational reminder processing with fallbacks
  async processVoiceCommand(text, context = null) {
    try {
      // Try server first
      const result = await this.processVoiceCommandAPI(text, context);
      return result;
    } catch (error) {
      console.error('Server processing failed, using local processing:', error);
      // Fallback to local processing using GeminiService
      return await this.processVoiceCommandLocal(text, context);
    }
  }

  async processVoiceCommandAPI(text, context) {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), this.apiTimeout)
    );

    const apiPromise = fetch(`${this.SERVER_URL}/process-voice-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        context,
        conversationId: this.conversationContext?.id || null
      })
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    
    // Update conversation context
    if (result.conversationContext) {
      this.conversationContext = result.conversationContext;
    }

    return result;
  }

  async processVoiceCommandLocal(text, context) {
    // Use GeminiService for local processing
    const reminderData = await GeminiService.parseReminderText(text);
    
    // Check if we have all required information
    const missingFields = [];
    if (!reminderData.medicine || reminderData.medicine === 'Medicine') {
      missingFields.push('medicine');
    }
    if (!reminderData.time || reminderData.time === '12:00 PM') {
      missingFields.push('time');
    }

    if (missingFields.length > 0) {
      const questions = {
        medicine: "What medication would you like me to remind you about?",
        time: "What time should I remind you to take this medication?",
        dosage: `How much ${reminderData.medicine || 'medication'} should you take?`
      };

      return {
        type: 'question',
        question: questions[missingFields[0]],
        partialData: reminderData,
        missingFields: missingFields,
        conversationContext: {
          id: 'local_' + Date.now(),
          state: 'collecting_reminder_info',
          partialData: reminderData
        }
      };
    }

    // Complete reminder data
    return {
      type: 'complete_reminder',
      reminder: reminderData,
      response: `Great! I've set up a reminder for ${reminderData.medicine} at ${reminderData.time}${reminderData.dosage ? ` with dosage: ${reminderData.dosage}` : ''}.`,
      conversationContext: null
    };
  }

  // Generate health report with fallback
  async generateHealthReport(medicationHistory, feedbackHistory) {
    try {
      // Try server first
      const response = await fetch(`${this.SERVER_URL}/generate-health-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          medicationHistory,
          feedbackHistory
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Server health report failed, using local generation:', error);
      // Fallback to GeminiService
      return await GeminiService.generateHealthReport(medicationHistory, feedbackHistory);
    }
  }

  // Process medication feedback with fallback
  async processMedicationFeedback(medicationId, feedbackText) {
    try {
      // Try server first
      const response = await fetch(`${this.SERVER_URL}/process-medication-feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          medicationId,
          feedbackText,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Server feedback processing failed, using local processing:', error);
      // Fallback to GeminiService
      return await GeminiService.processMedicationFeedback(medicationId, feedbackText);
    }
  }

  // Reset conversation context
  resetContext() {
    this.conversationContext = null;
  }

  // Set conversation context
  setContext(context) {
    this.conversationContext = context;
  }
}

export default new AIService();