import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import AIService from './AIService';

/**
 * ConversationManager - Handles intelligent conversation flow for medicine reminders
 * Supports multilingual conversations and context management
 */
class ConversationManager {
  constructor() {
    this.activeConversations = new Map();
    this.defaultLanguage = 'en';
    this.supportedLanguages = ['en', 'te', 'hi'];
    
    // Conversation states
    this.STATES = {
      IDLE: 'idle',
      COLLECTING_INFO: 'collecting_info',
      CONFIRMING: 'confirming',
      COMPLETED: 'completed',
      ERROR: 'error'
    };
    
    // TTS voice mappings for different languages
    this.voiceSettings = {
      en: {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.9,
        voice: Platform.OS === 'ios' ? 'com.apple.ttsbundle.Samantha-compact' : null
      },
      te: {
        language: 'te-IN',
        pitch: 1.0,
        rate: 0.8,
        voice: Platform.OS === 'ios' ? 'com.apple.ttsbundle.Veena-compact' : null
      },
      hi: {
        language: 'hi-IN',
        pitch: 1.0,
        rate: 0.8,
        voice: Platform.OS === 'ios' ? 'com.apple.ttsbundle.Lekha-compact' : null
      }
    };
  }

  /**
   * Start a new reminder conversation
   * @param {string} userId - Unique user identifier
   * @param {string} language - Language preference (en, te, hi)
   * @returns {Object} Conversation context
   */
  startReminderConversation(userId, language = 'en') {
    const conversationId = `${userId}_${Date.now()}`;
    
    const conversation = {
      id: conversationId,
      userId,
      language,
      state: this.STATES.IDLE,
      startTime: new Date(),
      lastActivity: new Date(),
      collectedData: {
        medicine: null,
        time: null,
        dosage: null,
        frequency: null
      },
      missingFields: [],
      attempts: 0,
      maxAttempts: 5,
      context: {
        previousResponses: [],
        clarificationNeeded: false,
        confirmationPending: false
      }
    };
    
    this.activeConversations.set(conversationId, conversation);
    console.log(`🗣️ Started conversation ${conversationId} in ${language}`);
    
    return conversation;
  }

  /**
   * Process voice input and manage conversation flow
   * @param {string} conversationId - Active conversation ID
   * @param {string} voiceInput - Transcribed voice input
   * @returns {Promise<Object>} Conversation response with next action
   */
  async processVoiceInput(conversationId, voiceInput) {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    try {
      conversation.lastActivity = new Date();
      conversation.attempts += 1;

      console.log(`🎤 Processing voice input for ${conversationId}: "${voiceInput}"`);
      console.log(`📊 Current state: ${conversation.state}, Attempt: ${conversation.attempts}`);

      // Parse the voice input using AI
      const parseResult = await AIService.parseReminderText(
        voiceInput, 
        conversation.language, 
        {
          collectedData: conversation.collectedData,
          conversationHistory: conversation.context.previousResponses.slice(-3) // Last 3 exchanges
        },
        conversationId
      );

      // Update collected data with new information
      this.mergeReminderData(conversation, parseResult);

      // Store this exchange in context
      conversation.context.previousResponses.push({
        userInput: voiceInput,
        parsedData: parseResult,
        timestamp: new Date()
      });

      // Determine next action based on completeness
      let response;
      if (parseResult.isComplete) {
        response = await this.handleCompleteReminder(conversation);
      } else {
        response = await this.handleIncompleteReminder(conversation, parseResult);
      }

      // Update conversation state
      this.activeConversations.set(conversationId, conversation);

      return response;

    } catch (error) {
      console.error(`❌ Error processing voice input for ${conversationId}:`, error);
      conversation.state = this.STATES.ERROR;
      
      return {
        success: false,
        conversationId,
        action: 'error',
        message: await this.getErrorMessage(conversation.language),
        shouldSpeak: true,
        conversation
      };
    }
  }

  /**
   * Merge new reminder data with existing collected data
   * @param {Object} conversation - Active conversation
   * @param {Object} newData - New parsed data
   */
  mergeReminderData(conversation, newData) {
    const fields = ['medicine', 'time', 'dosage', 'frequency'];
    
    fields.forEach(field => {
      if (newData[field] && newData[field] !== null) {
        conversation.collectedData[field] = newData[field];
        console.log(`✅ Updated ${field}: ${newData[field]}`);
      }
    });

    // Update missing fields
    conversation.missingFields = newData.missingFields || [];
    
    console.log(`📋 Current collected data:`, conversation.collectedData);
    console.log(`❓ Missing fields:`, conversation.missingFields);
  }

  /**
   * Handle complete reminder creation
   * @param {Object} conversation - Active conversation
   * @returns {Promise<Object>} Response object
   */
  async handleCompleteReminder(conversation) {
    conversation.state = this.STATES.CONFIRMING;
    
    const confirmationMessage = await this.generateConfirmationMessage(
      conversation.collectedData, 
      conversation.language
    );

    console.log(`✅ Reminder complete for ${conversation.id}`);

    return {
      success: true,
      conversationId: conversation.id,
      action: 'confirm',
      message: confirmationMessage,
      shouldSpeak: true,
      reminderData: conversation.collectedData,
      conversation
    };
  }

  /**
   * Handle incomplete reminder - ask for missing information
   * @param {Object} conversation - Active conversation
   * @param {Object} parseResult - Current parsing result
   * @returns {Promise<Object>} Response object
   */
  async handleIncompleteReminder(conversation, parseResult) {
    conversation.state = this.STATES.COLLECTING_INFO;

    // Check if we've exceeded max attempts
    if (conversation.attempts >= conversation.maxAttempts) {
      return {
        success: false,
        conversationId: conversation.id,
        action: 'timeout',
        message: await this.getTimeoutMessage(conversation.language),
        shouldSpeak: true,
        conversation
      };
    }

    // Generate appropriate question for missing information
    const question = await this.generateFollowUpQuestion(
      parseResult,
      conversation.language,
      conversation.id
    );

    console.log(`❓ Generated follow-up question: "${question}"`);

    return {
      success: true,
      conversationId: conversation.id,
      action: 'ask_question',
      message: question,
      shouldSpeak: true,
      expectedField: parseResult.missingFields?.[0],
      conversation
    };
  }

  /**
   * Generate follow-up question using AI or fallback templates
   * @param {Object} incompleteData - Incomplete reminder data
   * @param {string} language - Language preference
   * @param {string} conversationId - Conversation ID
   * @returns {Promise<string>} Generated question
   */
  async generateFollowUpQuestion(incompleteData, language, conversationId) {
    try {
      const result = await AIService.generateQuestion(incompleteData, language, conversationId);
      return result.question;
    } catch (error) {
      console.warn(`⚠️ AI question generation failed, using fallback: ${error.message}`);
      return this.getFallbackQuestion(incompleteData.missingFields?.[0], language);
    }
  }

  /**
   * Get fallback questions when AI is unavailable
   * @param {string} missingField - Field that needs to be collected
   * @param {string} language - Language preference
   * @returns {string} Fallback question
   */
  getFallbackQuestion(missingField, language) {
    const questions = {
      en: {
        medicine: "What medicine do you need a reminder for?",
        time: "What time should I remind you to take it?",
        dosage: "What's the dosage amount? For example, 500mg or 2 tablets.",
        frequency: "How often should you take this medicine? Daily, twice daily, weekly, or something else?"
      },
      te: {
        medicine: "ఏ మందుకు రిమైండర్ కావాలి?",
        time: "ఎప్పుడు తీసుకోవాలని గుర్తు చేయాలి?",
        dosage: "ఎంత మోతాదు తీసుకోవాలి? ఉదాహరణకు, 500mg లేదా 2 మాత్రలు.",
        frequency: "ఎంత సేపటికో ఈ మందు తీసుకోవాలి? రోజూ, రోజుకు రెండుసార్లు, వారానికి, లేదా వేరేదైనా?"
      }
    };

    const langQuestions = questions[language] || questions.en;
    return langQuestions[missingField] || langQuestions.medicine;
  }

  /**
   * Generate confirmation message for complete reminder
   * @param {Object} reminderData - Complete reminder data
   * @param {string} language - Language preference
   * @returns {Promise<string>} Confirmation message
   */
  async generateConfirmationMessage(reminderData, language) {
    const templates = {
      en: `Great! I'll remind you to take ${reminderData.medicine} ${reminderData.dosage} at ${reminderData.time} ${reminderData.frequency}. Should I save this reminder?`,
      te: `బాగుంది! నేను మిమ్మల్ని ${reminderData.medicine} ${reminderData.dosage} ${reminderData.time}కు ${reminderData.frequency} తీసుకోవాలని గుర్తు చేస్తాను. ఈ రిమైండర్‌ను సేవ్ చేయాలా?`
    };

    return templates[language] || templates.en;
  }

  /**
   * Confirm and save the reminder
   * @param {string} conversationId - Conversation ID
   * @param {boolean} confirmed - User confirmation
   * @returns {Object} Final response
   */
  async confirmReminder(conversationId, confirmed) {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (confirmed) {
      conversation.state = this.STATES.COMPLETED;
      
      const successMessage = await this.getSuccessMessage(conversation.language);
      
      // Clean up conversation after successful completion
      setTimeout(() => {
        this.activeConversations.delete(conversationId);
        console.log(`🧹 Cleaned up conversation ${conversationId}`);
      }, 5000);

      return {
        success: true,
        conversationId,
        action: 'save_reminder',
        message: successMessage,
        shouldSpeak: true,
        reminderData: conversation.collectedData,
        completed: true
      };
    } else {
      // User declined, restart the conversation
      conversation.state = this.STATES.IDLE;
      conversation.collectedData = {
        medicine: null,
        time: null,
        dosage: null,
        frequency: null
      };
      conversation.attempts = 0;

      const restartMessage = await this.getRestartMessage(conversation.language);
      
      return {
        success: true,
        conversationId,
        action: 'restart',
        message: restartMessage,
        shouldSpeak: true,
        conversation
      };
    }
  }

  /**
   * Speak a message using appropriate TTS settings
   * @param {string} message - Message to speak
   * @param {string} language - Language for TTS
   * @returns {Promise<void>}
   */
  async speakMessage(message, language = 'en') {
    if (!message || message.trim() === '') {
      console.warn('⚠️ Empty message provided to TTS');
      return;
    }

    const voiceConfig = this.voiceSettings[language] || this.voiceSettings.en;
    
    console.log(`🔊 Speaking in ${language}: "${message}"`);

    try {
      await Speech.speak(message, {
        language: voiceConfig.language,
        pitch: voiceConfig.pitch,
        rate: voiceConfig.rate,
        voice: voiceConfig.voice
      });
    } catch (error) {
      console.error('❌ TTS Error:', error);
      // Fallback to basic TTS
      try {
        await Speech.speak(message);
      } catch (fallbackError) {
        console.error('❌ Fallback TTS also failed:', fallbackError);
      }
    }
  }

  /**
   * Get conversation status
   * @param {string} conversationId - Conversation ID
   * @returns {Object|null} Conversation status or null if not found
   */
  getConversationStatus(conversationId) {
    const conversation = this.activeConversations.get(conversationId);
    
    if (!conversation) {
      return null;
    }

    return {
      id: conversation.id,
      state: conversation.state,
      language: conversation.language,
      progress: {
        collected: Object.values(conversation.collectedData).filter(v => v !== null).length,
        total: 4,
        missingFields: conversation.missingFields
      },
      attempts: conversation.attempts,
      maxAttempts: conversation.maxAttempts,
      duration: Date.now() - conversation.startTime.getTime()
    };
  }

  /**
   * Cancel an active conversation
   * @param {string} conversationId - Conversation ID
   * @returns {boolean} True if conversation was cancelled
   */
  cancelConversation(conversationId) {
    const existed = this.activeConversations.delete(conversationId);
    if (existed) {
      console.log(`❌ Cancelled conversation ${conversationId}`);
    }
    return existed;
  }

  /**
   * Get list of active conversations for a user
   * @param {string} userId - User ID
   * @returns {Array} List of active conversation IDs
   */
  getUserConversations(userId) {
    const userConversations = [];
    
    for (const [id, conversation] of this.activeConversations) {
      if (conversation.userId === userId) {
        userConversations.push({
          id,
          state: conversation.state,
          startTime: conversation.startTime,
          lastActivity: conversation.lastActivity
        });
      }
    }
    
    return userConversations;
  }

  /**
   * Clean up old conversations (call periodically)
   * @param {number} maxAgeMinutes - Maximum age in minutes
   * @returns {number} Number of conversations cleaned up
   */
  cleanupOldConversations(maxAgeMinutes = 30) {
    const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
    let cleanedUp = 0;
    
    for (const [id, conversation] of this.activeConversations) {
      if (conversation.lastActivity.getTime() < cutoffTime) {
        this.activeConversations.delete(id);
        cleanedUp++;
        console.log(`🧹 Cleaned up stale conversation ${id}`);
      }
    }
    
    return cleanedUp;
  }

  // Helper methods for message generation
  async getErrorMessage(language) {
    const messages = {
      en: "Sorry, I had trouble understanding that. Could you please try again?",
      te: "క్షమించండి, అది అర్థం చేసుకోవడంలో నాకు ఇబ్బంది ఉంది. దయచేసి మళ్లీ ప్రయత్నించండి?"
    };
    return messages[language] || messages.en;
  }

  async getTimeoutMessage(language) {
    const messages = {
      en: "I've tried several times but couldn't get all the information needed. Please start over when you're ready.",
      te: "నేను చాలాసార్లు ప్రయత్నించాను కానీ అవసరమైన మొత్తం సమాచారం పొందలేకపోయాను. మీరు సిద్ధంగా ఉన్నప్పుడు దయచేసి మళ్లీ ప్రారంభించండి."
    };
    return messages[language] || messages.en;
  }

  async getSuccessMessage(language) {
    const messages = {
      en: "Perfect! Your reminder has been saved successfully. I'll notify you at the scheduled time.",
      te: "అద్భుతం! మీ రిమైండర్ విజయవంతంగా సేవ్ చేయబడింది. నేను నిర్ణీత సమయంలో మిమ్మల్ని తెలియజేస్తాను."
    };
    return messages[language] || messages.en;
  }

  async getRestartMessage(language) {
    const messages = {
      en: "Okay, let's start fresh. What medicine reminder would you like to set up?",
      te: "సరే, మనం కొత్తగా ప్రారంభిద్దాం. మీరు ఏ మందు రిమైండర్‌ను సెటప్ చేయాలనుకుంటున్నారు?"
    };
    return messages[language] || messages.en;
  }
}

// Export singleton instance
const conversationManager = new ConversationManager();
export default conversationManager;
