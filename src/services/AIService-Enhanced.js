import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Enhanced AI Service for Voice-Based Medicine Reminder
 * Provides intelligent conversation management and multilingual support
 */
class AIService {
  constructor() {
    this.baseURL = this.getServerURL();
    this.requestTimeout = 30000; // 30 seconds
    this.retryAttempts = 2;
    this.supportedLanguages = ['en', 'te', 'hi'];
    
    console.log(`🤖 AIService initialized with server: ${this.baseURL}`);
  }

  /**
   * Dynamically determine server URL based on environment
   * @returns {string} Server URL
   */
  getServerURL() {
    try {
      // Try to get the local IP address from Expo
      const { manifest } = Constants;
      
      if (manifest?.debuggerHost) {
        const host = manifest.debuggerHost.split(':')[0];
        return `http://${host}:3333`;
      }
      
      // Fallback for different environments
      if (__DEV__) {
        if (Platform.OS === 'android') {
          return 'http://10.0.2.2:3333'; // Android emulator
        } else {
          return 'http://localhost:3333'; // iOS simulator
        }
      }
      
      // Production fallback - you should configure this
      return 'http://192.168.1.100:3333';
      
    } catch (error) {
      console.warn('⚠️ Could not determine server URL, using fallback');
      return 'http://192.168.1.100:3333';
    }
  }

  /**
   * Test server connectivity
   * @returns {Promise<boolean>} True if server is reachable
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Server connection successful:', data);
        return true;
      }
      
      console.warn('⚠️ Server responded but not OK:', response.status);
      return false;
      
    } catch (error) {
      console.error('❌ Server connection failed:', error.message);
      return false;
    }
  }

  /**
   * Enhanced audio transcription with language support
   * @param {string} audioUri - Local audio file URI
   * @param {string} language - Target language (en, te, hi, auto)
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioUri, language = 'auto') {
    if (!audioUri) {
      throw new Error('Audio URI is required');
    }

    console.log(`🎤 Transcribing audio with language: ${language}`);
    console.log(`📁 Audio URI: ${audioUri}`);

    try {
      const formData = new FormData();
      
      // Prepare file for upload
      const audioFile = {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'voice_recording.m4a',
      };
      
      formData.append('audio', audioFile);
      formData.append('language', language);

      const response = await this.makeRequest('/transcribe-enhanced', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.transcription) {
        throw new Error('No transcription received from server');
      }

      console.log('✅ Transcription successful:', response.transcription);
      console.log(`🌐 Detected language: ${response.detectedLanguage}`);
      console.log(`⏱️ Processing time: ${response.processingTime}ms`);

      return response;

    } catch (error) {
      console.error('❌ Transcription failed:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Enhanced reminder parsing with conversation context
   * @param {string} text - Text to parse
   * @param {string} language - Language preference
   * @param {Object} context - Conversation context
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Parsed reminder data
   */
  async parseReminderText(text, language = 'en', context = null, conversationId = null) {
    if (!text || text.trim() === '') {
      throw new Error('Text is required for parsing');
    }

    console.log(`🧠 Parsing reminder text: "${text}"`);
    console.log(`🌐 Language: ${language}`);
    console.log(`💬 Conversation ID: ${conversationId}`);

    try {
      const requestBody = {
        text: text.trim(),
        language,
        context,
        conversationId
      };

      const response = await this.makeRequest('/parse-reminder-enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('✅ Parsing successful:', response);
      console.log(`📊 Complete: ${response.isComplete}`);
      console.log(`❓ Missing fields: ${response.missingFields?.join(', ') || 'none'}`);

      return response;

    } catch (error) {
      console.error('❌ Parsing failed:', error);
      throw new Error(`Parsing failed: ${error.message}`);
    }
  }

  /**
   * Generate follow-up questions for incomplete reminders
   * @param {Object} incompleteData - Incomplete reminder data
   * @param {string} language - Language preference
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Generated question
   */
  async generateQuestion(incompleteData, language = 'en', conversationId = null) {
    if (!incompleteData || !incompleteData.missingFields || incompleteData.missingFields.length === 0) {
      throw new Error('Incomplete data with missing fields is required');
    }

    console.log(`❓ Generating question for missing fields: ${incompleteData.missingFields.join(', ')}`);
    console.log(`🌐 Language: ${language}`);

    try {
      const requestBody = {
        incompleteData,
        language,
        conversationId
      };

      const response = await this.makeRequest('/generate-question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('✅ Question generated:', response.question);
      console.log(`🎯 Expected field: ${response.expectedField}`);

      return response;

    } catch (error) {
      console.error('❌ Question generation failed:', error);
      throw new Error(`Question generation failed: ${error.message}`);
    }
  }

  /**
   * Generate adherence reports using AI
   * @param {Array} entries - Medication entries for analysis
   * @param {string} language - Language preference
   * @returns {Promise<Object>} Generated report
   */
  async generateReport(entries, language = 'en') {
    if (!entries || !Array.isArray(entries)) {
      throw new Error('Entries array is required');
    }

    console.log(`📊 Generating report for ${entries.length} entries in ${language}`);

    try {
      const requestBody = {
        entries,
        language
      };

      const response = await this.makeRequest('/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('✅ Report generated successfully');
      console.log(`⏱️ Processing time: ${response.processingTime}ms`);

      return response;

    } catch (error) {
      console.error('❌ Report generation failed:', error);
      throw new Error(`Report generation failed: ${error.message}`);
    }
  }

  /**
   * Get conversation context from server
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Conversation context
   */
  async getConversationContext(conversationId) {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    console.log(`💬 Fetching conversation context: ${conversationId}`);

    try {
      const response = await this.makeRequest(`/conversation/${conversationId}`, {
        method: 'GET',
      });

      console.log('✅ Conversation context retrieved');
      return response;

    } catch (error) {
      if (error.message.includes('404')) {
        console.log('ℹ️ Conversation not found (might be cleared or in demo mode)');
        return null;
      }
      
      console.error('❌ Failed to get conversation context:', error);
      throw error;
    }
  }

  /**
   * Clear conversation context on server
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<Object>} Clearing result
   */
  async clearConversationContext(conversationId) {
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    console.log(`🗑️ Clearing conversation context: ${conversationId}`);

    try {
      const response = await this.makeRequest(`/conversation/${conversationId}`, {
        method: 'DELETE',
      });

      console.log('✅ Conversation context cleared');
      return response;

    } catch (error) {
      console.error('❌ Failed to clear conversation context:', error);
      throw error;
    }
  }

  /**
   * Process complete voice command with conversation management
   * @param {string} audioUri - Audio file URI
   * @param {string} language - Language preference
   * @param {string} conversationId - Optional conversation ID
   * @param {Object} context - Optional conversation context
   * @returns {Promise<Object>} Complete processing result
   */
  async processVoiceCommand(audioUri, language = 'en', conversationId = null, context = null) {
    console.log('🎯 Processing complete voice command');
    
    try {
      // Step 1: Transcribe audio
      const transcription = await this.transcribeAudio(audioUri, language);
      
      if (!transcription.transcription) {
        throw new Error('Transcription failed or empty');
      }

      // Step 2: Parse reminder from transcription
      const parsing = await this.parseReminderText(
        transcription.transcription,
        transcription.detectedLanguage || language,
        context,
        conversationId
      );

      // Step 3: Generate follow-up question if needed
      let question = null;
      if (!parsing.isComplete && parsing.missingFields && parsing.missingFields.length > 0) {
        try {
          const questionResult = await this.generateQuestion(
            parsing,
            transcription.detectedLanguage || language,
            conversationId
          );
          question = questionResult.question;
        } catch (questionError) {
          console.warn('⚠️ Question generation failed, will use fallback');
        }
      }

      return {
        success: true,
        transcription: transcription.transcription,
        detectedLanguage: transcription.detectedLanguage || language,
        reminderData: parsing,
        followUpQuestion: question,
        processingSteps: {
          transcriptionTime: transcription.processingTime,
          parsingTime: parsing.processingTime,
          totalTime: (transcription.processingTime || 0) + (parsing.processingTime || 0)
        }
      };

    } catch (error) {
      console.error('❌ Voice command processing failed:', error);
      return {
        success: false,
        error: error.message,
        stage: 'processing'
      };
    }
  }

  /**
   * Make HTTP request with retry logic and timeout
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const requestOptions = {
      timeout: this.requestTimeout,
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
    };

    console.log(`🌐 Making request to: ${endpoint}`);

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        const response = await fetch(url, {
          ...requestOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorData}`);
        }

        const data = await response.json();
        
        if (attempt > 0) {
          console.log(`✅ Request succeeded on attempt ${attempt + 1}`);
        }
        
        return data;

      } catch (error) {
        const isLastAttempt = attempt === this.retryAttempts;
        
        if (error.name === 'AbortError') {
          console.error(`⏱️ Request timeout on attempt ${attempt + 1}`);
        } else {
          console.error(`❌ Request failed on attempt ${attempt + 1}: ${error.message}`);
        }

        if (isLastAttempt) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Validate language support
   * @param {string} language - Language code
   * @returns {boolean} True if supported
   */
  isLanguageSupported(language) {
    return this.supportedLanguages.includes(language);
  }

  /**
   * Get fallback responses for offline mode
   * @param {string} type - Response type
   * @param {string} language - Language preference
   * @returns {string} Fallback response
   */
  getFallbackResponse(type, language = 'en') {
    const responses = {
      en: {
        transcription_error: "I'm having trouble hearing you. Please try speaking again.",
        parsing_error: "I couldn't understand your request. Could you please repeat it?",
        connection_error: "I'm having trouble connecting to the server. Please check your internet connection.",
        general_error: "Something went wrong. Please try again."
      },
      te: {
        transcription_error: "మిమ్మల్ని వినడంలో నాకు ఇబ్బంది ఉంది. దయచేసి మళ్లీ మాట్లాడండి.",
        parsing_error: "మీ అభ్యర్థన అర్థం కాలేదు. దయచేసి మళ్లీ చెప్పండి?",
        connection_error: "సర్వర్‌కు కనెక్ట్ అవ్వడంలో ఇబ్బంది ఉంది. దయచేసి మీ ఇంటర్నెట్ కనెక్షన్‌ను తనిఖీ చేయండి.",
        general_error: "ఏదో తప్పు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి."
      }
    };

    const langResponses = responses[language] || responses.en;
    return langResponses[type] || langResponses.general_error;
  }

  /**
   * Get service status information
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      serverURL: this.baseURL,
      timeout: this.requestTimeout,
      retryAttempts: this.retryAttempts,
      supportedLanguages: this.supportedLanguages,
      version: '2.0.0'
    };
  }
}

// Export singleton instance
const aiService = new AIService();
export default aiService;
