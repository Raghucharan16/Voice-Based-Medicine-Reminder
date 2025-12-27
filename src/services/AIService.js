import Constants from 'expo-constants';
import { Platform } from 'react-native';

class AIService {
  constructor() {
    this.SERVER_URL = this.getServerURL();
    this.currentLanguage = 'en';
    
    // Adaptive timeout based on connection type
    const isTunnelMode = this.SERVER_URL.includes('.exp.direct');
    this.requestTimeout = isTunnelMode ? 120000 : 60000; // 2 min for tunnel, 1 min for LAN
    this.transcriptionTimeout = isTunnelMode ? 180000 : 90000; // 3 min for tunnel, 1.5 min for LAN
    
    this.retryAttempts = 2;
    this.conversationContext = null;
    
    console.log(`AIService initialized with server: ${this.SERVER_URL}`);
    console.log(`⏱️ Request timeout: ${this.requestTimeout / 1000}s (${isTunnelMode ? 'Tunnel mode' : 'LAN mode'})`);
    
    // Debug: Log all Constants info to help troubleshoot
    this.logConnectionInfo();
  }

  logConnectionInfo() {
    try {
      console.log('🔍 Connection Debug Info:');
      console.log('  - Platform:', Platform.OS);
      console.log('  - Dev mode:', __DEV__);
      
      if (Constants.manifest?.debuggerHost) {
        console.log('  - debuggerHost:', Constants.manifest.debuggerHost);
      }
      
      if (Constants.manifest2?.extra?.expoGo?.debuggerHost) {
        console.log('  - manifest2 debuggerHost:', Constants.manifest2.extra.expoGo.debuggerHost);
      }
      
      if (Constants.expoConfig?.hostUri) {
        console.log('  - expoConfig hostUri:', Constants.expoConfig.hostUri);
      }
      
      console.log('  - Final Server URL:', this.SERVER_URL);
      
      // Test connection in background (non-blocking)
      this.testConnectionInBackground();
      
    } catch (error) {
      console.warn('Could not log connection info:', error);
    }
  }

  async testConnectionInBackground() {
    // Non-blocking test - don't await, just fire and forget
    setTimeout(async () => {
      try {
        console.log('🔌 Testing server connection...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${this.SERVER_URL}/health`, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ Server connection successful!');
          console.log('   Server version:', data.version);
        } else {
          console.warn('⚠️ Server responded with status:', response.status);
        }
      } catch (error) {
        console.warn('⚠️ Server not reachable (this is OK for offline mode)');
        console.log('💡 To enable AI features:');
        console.log('   1. Run: node server/index-enhanced.js');
        console.log('   2. Check firewall allows port 3333');
      }
    }, 1000); // Delay 1 second
  }

  getServerURL() {
    try {
      // Try multiple methods to get the host IP
      let detectedHost = null;
      
      // Method 1: Get from debuggerHost (Expo Go tunnel/LAN mode)
      if (Constants.manifest?.debuggerHost) {
        detectedHost = Constants.manifest.debuggerHost.split(':')[0];
        console.log('🌐 Auto-detected server IP from debuggerHost:', detectedHost);
      }
      
      // Method 2: Get from manifest2 (newer Expo SDK)
      else if (Constants.manifest2?.extra?.expoGo?.debuggerHost) {
        detectedHost = Constants.manifest2.extra.expoGo.debuggerHost.split(':')[0];
        console.log('🌐 Auto-detected server IP from manifest2:', detectedHost);
      }
      
      // Method 3: Get from expoConfig
      else if (Constants.expoConfig?.hostUri) {
        detectedHost = Constants.expoConfig.hostUri.split(':')[0];
        console.log('🌐 Auto-detected server IP from expoConfig:', detectedHost);
      }
      
      // If we found a host, use it
      if (detectedHost) {
        return `http://${detectedHost}:3333`;
      }
      
      // Fallback: Platform-specific defaults
      console.warn('⚠️ Could not auto-detect server IP, using platform defaults');
      
      if (__DEV__) {
        if (Platform.OS === 'android') {
          // Try localhost for emulator first, then common LAN IPs
          return 'http://10.0.2.2:3333'; // Android emulator host
        } else if (Platform.OS === 'ios') {
          return 'http://localhost:3333';
        }
      }
      
      // Last resort fallback
      return 'http://localhost:3333';
      
    } catch (error) {
      console.error('❌ Error determining server URL:', error);
      return 'http://localhost:3333';
    }
  }

  async testConnection() {
    try {
      const response = await fetch(`${this.SERVER_URL}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Server connection successful:', data);
        return true;
      }
      
      console.warn('Server responded but not OK:', response.status);
      return false;
      
    } catch (error) {
      console.error('Server connection failed:', error.message);
      return false;
    }
  }

  async processVoiceCommand(input, context = null) {
    try {
      console.log('Starting voice command processing...');
      
      let transcriptionText;
      
      // Check if input is text or audio URI
      if (typeof input === 'string' && (input.startsWith('file://') || input.startsWith('content://'))) {
        // It's an audio URI
        const transcription = await this.transcribeAudio(input);
        
        if (!transcription || !transcription.text) {
          throw new Error('Transcription failed or empty');
        }
        
        transcriptionText = transcription.text;
        console.log(`Transcribed: "${transcriptionText}"`);
      } else {
        // It's already text
        transcriptionText = input;
        console.log(`Using provided text: "${transcriptionText}"`);
      }
      
      const reminderData = await this.parseReminderText(transcriptionText);
      
      console.log('Parsed reminder data:', reminderData);
      
      let response = {
        success: true,
        transcription: transcriptionText,
        reminderData: reminderData,
        needsMoreInfo: !reminderData.isComplete,
        followUpQuestion: null,
        message: null
      };
      
      if (!reminderData.isComplete) {
        const question = await this.generateFollowUpQuestion(reminderData);
        response.followUpQuestion = question;
        response.message = question;
        response.type = 'question';
        response.question = question;
        response.conversationContext = { ...reminderData, context };
      } else {
        response.message = this.generateConfirmationMessage(reminderData);
        response.type = 'complete_reminder';
        response.reminder = reminderData;
        response.response = response.message;
      }
      
      console.log('Voice command processing complete!');
      return response;
      
    } catch (error) {
      console.error('Voice command processing failed:', error);
      return {
        success: false,
        error: error.message,
        message: "Sorry, I could not understand that. Could you please try again?",
        type: 'error'
      };
    }
  }

  async transcribeAudio(audioUri) {
    if (!audioUri) {
      throw new Error('Audio URI is required');
    }

    console.log(`Transcribing audio: ${audioUri}`);

    try {
      // First try server transcription
      const formData = new FormData();
      
      const audioFile = {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'voice_recording.m4a',
      };
      
      formData.append('audio', audioFile);
      formData.append('language', this.currentLanguage);

      console.log('⏳ Transcription may take 30-60 seconds (especially in tunnel mode)...');
      
      const response = await this.makeRequest('/transcribe-enhanced', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }, true); // Pass true to use transcription timeout

      console.log('Server transcription successful:', response.transcription);
      
      // Clean up transcription - remove TTS artifacts
      let cleanedText = response.transcription;
      
      // Remove common TTS phrases that get recorded
      const ttsArtifacts = [
        /^I'm listening\.?\s*/i,
        /^Remind me\.?\s*/i,
        /^Processing\.?\s*/i,
        /^Let me process that\.?\s*/i,
        /^Okay\.?\s*/i,
      ];
      
      ttsArtifacts.forEach(pattern => {
        cleanedText = cleanedText.replace(pattern, '');
      });
      
      cleanedText = cleanedText.trim();
      
      console.log('Cleaned transcription:', cleanedText);
      
      return {
        text: cleanedText,
        language: response.detectedLanguage || this.currentLanguage,
        confidence: response.confidence || 0.9
      };

    } catch (error) {
      console.error('Server transcription failed:', error);
      
      // Try local/device-based transcription (placeholder for now)
      try {
        console.log('Attempting alternative transcription...');
        const localResult = await this.tryLocalTranscription(audioUri);
        if (localResult) {
          return localResult;
        }
      } catch (localError) {
        console.error('Local transcription also failed:', localError);
      }
      
      // Fallback to interactive mode - ask user to type
      console.log('All transcription methods failed, requesting user input...');
      return {
        text: null, // Signal that we need user input
        requiresUserInput: true,
        language: 'en',
        confidence: 0.0,
        fallback: true
      };
    }
  }

  async tryLocalTranscription(audioUri) {
    // For now, return null - this could be enhanced with device speech recognition
    // or other local transcription methods
    console.log('Local transcription not implemented yet');
    return null;
  }

  async parseReminderText(text) {
    if (!text || text.trim() === '') {
      throw new Error('Text is required for parsing');
    }

    console.log(`Parsing reminder: "${text}"`);

    try {
      const requestBody = {
        text: text.trim(),
        language: this.currentLanguage
      };

      const response = await this.makeRequest('/parse-reminder-enhanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      return {
        medicine: response.medicine,
        time: response.time,
        dosage: response.dosage || 'As prescribed',
        frequency: response.frequency || 'daily',
        isComplete: response.isComplete,
        missingFields: response.missingFields || []
      };

    } catch (error) {
      console.error('Parsing failed, using fallback:', error);
      
      // Fallback parsing
      return this.parseReminderFallback(text.trim());
    }
  }

  /**
   * Fallback reminder parsing when server is unavailable
   */
  parseReminderFallback(text) {
    console.log('Using fallback parsing for:', text);
    
    const result = {
      medicine: null,
      time: null,
      dosage: null,
      frequency: 'daily',
      isComplete: false,
      missingFields: []
    };

    // Extract medicine names - improved patterns
    const medicinePatterns = [
      /(?:take|taking|remind.*?to take)\s+([a-zA-Z][a-zA-Z\s]*?)(?:\s+\d+|\s+at|\s+in|\s+every|\s+daily|$)/i,
      /([a-zA-Z][a-zA-Z\s]*?)\s+\d+\s*(?:mg|milligrams?|g|grams?|ml|milliliters?|tablets?|pills?|units?|iu)/i,
      /(aspirin|paracetamol|acetaminophen|ibuprofen|vitamin\s*[a-z0-9]*|insulin|metformin|lisinopril|atorvastatin|omeprazole|amlodipine|levothyroxine)/i,
      /([a-zA-Z][a-zA-Z\s]*?(?:medicine|medication|tablet|pill|capsule))/i
    ];

    for (const pattern of medicinePatterns) {
      const match = text.match(pattern);
      if (match) {
        result.medicine = match[1].trim();
        break;
      }
    }

    // Extract dosage - improved patterns
    const dosagePatterns = [
      /(\d+(?:\.\d+)?\s*(?:mg|milligrams?|g|grams?|ml|milliliters?|tablets?|pills?|units?|iu))/i,
      /(\d+(?:\.\d+)?)\s*(?:mg|milligrams?|g|grams?|ml|milliliters?|tablets?|pills?|units?|iu)/i
    ];
    
    for (const pattern of dosagePatterns) {
      const match = text.match(pattern);
      if (match) {
        result.dosage = match[1];
        break;
      }
    }

    // Extract time and handle relative dates
    const timePatterns = [
      /at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/i,
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/i,
      /(morning|evening|night|noon|midnight)/i
    ];

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        let timeStr = match[1];
        
        // Add date context if temporal words present
        if (/tomorrow/i.test(text)) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          result.date = tomorrow.toISOString().split('T')[0]; // Store YYYY-MM-DD
          result.time = timeStr + ' (Tomorrow)';
        } else if (/today/i.test(text)) {
          result.date = new Date().toISOString().split('T')[0];
          result.time = timeStr + ' (Today)';
        } else {
          result.time = timeStr;
        }
        break;
      }
    }

    // Extract frequency - check for one-time events FIRST
    if (/tomorrow|today|tonight|this evening|this morning/i.test(text)) {
      result.frequency = 'once'; // One-time reminder, not recurring
    } else if (/once|one time|single/i.test(text)) {
      result.frequency = 'once';
    } else if (/daily|every day|each day/i.test(text)) {
      result.frequency = 'daily';
    } else if (/twice.*?day|two.*?day|2.*?day/i.test(text)) {
      result.frequency = 'twice daily';
    } else if (/three times.*?day|thrice.*?day|3.*?day/i.test(text)) {
      result.frequency = '3 times daily';
    } else if (/weekly|once.*?week|every week/i.test(text)) {
      result.frequency = 'weekly';
    } else if (/monthly|once.*?month|every month/i.test(text)) {
      result.frequency = 'monthly';
    } else {
      result.frequency = 'daily'; // Default to daily only if no temporal words
    }

    // Determine missing fields
    if (!result.medicine) result.missingFields.push('medicine');
    if (!result.time) result.missingFields.push('time');
    if (!result.dosage) result.missingFields.push('dosage');

    result.isComplete = result.missingFields.length === 0;

    console.log('Fallback parsing result:', result);
    return result;
  }

  async generateFollowUpQuestion(reminderData) {
    try {
      const requestBody = {
        incompleteData: reminderData,
        language: this.currentLanguage
      };

      const response = await this.makeRequest('/generate-question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      return response.question;

    } catch (error) {
      console.error('Question generation failed:', error);
      return this.getFallbackQuestion(reminderData.missingFields[0]);
    }
  }

  generateConfirmationMessage(reminderData) {
    return `Got it! I will remind you to take ${reminderData.medicine} ${reminderData.dosage} at ${reminderData.time} ${reminderData.frequency}. Should I save this reminder?`;
  }

  async makeRequest(endpoint, options = {}, useTranscriptionTimeout = false) {
    const url = `${this.SERVER_URL}${endpoint}`;
    
    // Use longer timeout for transcription requests
    const timeout = useTranscriptionTimeout ? this.transcriptionTimeout : this.requestTimeout;
    
    const requestOptions = {
      timeout: timeout,
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
    };

    console.log(`Making request to: ${endpoint}`);
    if (useTranscriptionTimeout) {
      console.log(`⏱️ Using extended timeout: ${timeout / 1000}s for transcription`);
    }

    for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

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
          console.error(`⏱️ Request timeout on attempt ${attempt + 1} (waited ${timeout / 1000}s)`);
        } else {
          console.error(`Request failed on attempt ${attempt + 1}: ${error.message}`);
        }

        if (isLastAttempt) {
          throw error;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  getDemoTranscription() {
    // Use more realistic medicine commands
    const demoSamples = [
      'Remind me to take Paracetamol 500 milligrams at 8 AM every day',
      'I need to take Aspirin 100mg at 10 PM daily',
      'Set a reminder for Vitamin D 1000 IU in the morning daily',
      'Take blood pressure medicine Lisinopril 10mg at 7 PM daily',
      'Remind me to take Metformin 500mg twice daily with meals',
      'I need my insulin 20 units before breakfast at 8 AM'
    ];
    return demoSamples[Math.floor(Math.random() * demoSamples.length)];
  }

  getFallbackQuestion(missingField) {
    const questions = {
      medicine: "What medicine do you need a reminder for?",
      time: "What time should I remind you to take it?",
      dosage: "What is the dosage amount? For example, 500mg or 2 tablets.",
      frequency: "How often should you take this medicine? Daily, twice daily, or weekly?"
    };
    
    return questions[missingField] || "Could you provide more details about your medication?";
  }

  setLanguage(language) {
    if (['en', 'te'].includes(language)) {
      this.currentLanguage = language;
      console.log(`Language set to: ${language}`);
    } else {
      console.warn(`Unsupported language: ${language}`);
    }
  }

  getLanguage() {
    return this.currentLanguage;
  }

  getStatus() {
    return {
      serverURL: this.SERVER_URL,
      language: this.currentLanguage,
      timeout: this.requestTimeout,
      retryAttempts: this.retryAttempts,
      version: '1.0.0'
    };
  }

  /**
   * Reset conversation context
   */
  resetContext() {
    this.conversationContext = null;
    console.log('Conversation context reset');
  }

  /**
   * Set conversation context
   */
  setContext(context) {
    this.conversationContext = context;
    console.log('Conversation context updated');
  }

  /**
   * Get conversation context
   */
  getContext() {
    return this.conversationContext;
  }

  /**
   * Generate AI-powered health report
   * @param {Array} medicationHistory - Array of medication records
   * @param {Array} feedbackHistory - Array of feedback records (optional)
   * @returns {Promise<Object>} - AI-generated health report
   */
  async generateHealthReport(medicationHistory, feedbackHistory = []) {
    console.log('🏥 Generating AI health report...');
    console.log('Medication history records:', medicationHistory.length);
    console.log('Feedback history records:', feedbackHistory.length);

    try {
      // Limit data to prevent token overflow
      const limitedHistory = medicationHistory.slice(0, 50); // Max 50 records
      const limitedFeedback = feedbackHistory.slice(-20); // Last 20 feedback
      
      const response = await fetch(`${this.SERVER_URL}/generate-ai-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          medicationHistory: limitedHistory,
          feedbackHistory: limitedFeedback,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ AI health report generated:', result.aiPowered ? 'AI-powered' : 'Basic stats');

      return {
        report: result.report,
        aiPowered: result.aiPowered || false,
        timestamp: new Date().toISOString(),
        stats: result.stats || {},
      };

    } catch (error) {
      console.error('❌ Health report generation error:', error);
      
      // Return basic fallback report
      return {
        report: this.generateBasicReport(medicationHistory, feedbackHistory),
        aiPowered: false,
        timestamp: new Date().toISOString(),
        stats: this.calculateBasicStats(medicationHistory),
        error: error.message,
      };
    }
  }

  /**
   * Generate basic fallback report (client-side)
   */
  generateBasicReport(medicationHistory, feedbackHistory) {
    const totalMeds = medicationHistory.length;
    const taken = medicationHistory.filter(m => m.status === 'taken').length;
    const missed = medicationHistory.filter(m => m.status === 'missed').length;
    const adherenceRate = totalMeds > 0 ? Math.round((taken / totalMeds) * 100) : 0;
    
    // Group by medicine
    const medicineGroups = {};
    medicationHistory.forEach(med => {
      const name = med.medicine || 'Unknown';
      if (!medicineGroups[name]) {
        medicineGroups[name] = { taken: 0, missed: 0, dosage: med.dosage, frequency: med.frequency };
      }
      if (med.status === 'taken') medicineGroups[name].taken++;
      if (med.status === 'missed') medicineGroups[name].missed++;
    });

    // Generate comprehensive report
    let report = `# 📊 Health & Medication Report\n\n`;
    report += `**Generated:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}\n\n`;
    
    // Overview
    report += `## 💊 Medication Overview\n\n`;
    report += `- **Overall Adherence:** ${adherenceRate}% ${this.getAdherenceEmoji(adherenceRate)}\n`;
    report += `- **Doses Taken:** ${taken} ✅\n`;
    report += `- **Doses Missed:** ${missed} ❌\n`;
    report += `- **Total Scheduled:** ${totalMeds}\n`;
    report += `- **Feedback Entries:** ${feedbackHistory?.length || 0} 💬\n\n`;
    
    // Individual medicines
    report += `## 📋 Your Medications\n\n`;
    Object.entries(medicineGroups).forEach(([name, data]) => {
      const medTotal = data.taken + data.missed;
      const medAdherence = medTotal > 0 ? Math.round((data.taken / medTotal) * 100) : 0;
      report += `### ${name}\n`;
      report += `- **Dosage:** ${data.dosage || 'As prescribed'}\n`;
      report += `- **Frequency:** ${data.frequency || 'Daily'}\n`;
      report += `- **Adherence:** ${medAdherence}% (${data.taken} taken, ${data.missed} missed)\n\n`;
    });
    
    // Feedback section (if available)
    if (feedbackHistory && feedbackHistory.length > 0) {
      report += `## 💬 Recent Feedback\n\n`;
      const recentFeedback = feedbackHistory.slice(-5); // Last 5 feedback entries
      recentFeedback.forEach(f => {
        const medName = medicationHistory.find(h => h.medicationId === f.medicationId)?.medicine || 'Unknown';
        const timestamp = new Date(f.timestamp).toLocaleString();
        report += `- **${medName}** (${timestamp}): "${f.feedback}" ${f.sentiment ? `[${f.sentiment}]` : ''}\n`;
      });
      report += `\n`;
    }
    
    // Insights
    report += `## 📈 Health Insights\n\n`;
    if (adherenceRate >= 90) {
      report += `🌟 **Excellent!** You're doing a great job staying on track with your medications!\n\n`;
    } else if (adherenceRate >= 70) {
      report += `👍 **Good progress!** You're mostly consistent. Try to improve further.\n\n`;
    } else if (adherenceRate >= 50) {
      report += `⚠️ **Needs Attention:** You're missing quite a few doses. Let's work on improving adherence.\n\n`;
    } else {
      report += `🚨 **Critical:** You're missing most doses. Please consult your doctor immediately.\n\n`;
    }
    
    // Diet recommendations
    report += `## 🥗 Dietary Recommendations\n\n`;
    report += `### Foods to Include:\n`;
    report += `- **Leafy Greens:** Spinach, kale for vitamins and minerals\n`;
    report += `- **Fruits:** Berries, citrus for antioxidants\n`;
    report += `- **Whole Grains:** Brown rice, oats for sustained energy\n`;
    report += `- **Lean Proteins:** Fish, chicken, legumes\n`;
    report += `- **Healthy Fats:** Nuts, seeds, olive oil\n\n`;
    
    report += `### Foods to Avoid:\n`;
    report += `- **Grapefruit:** Can interfere with many medications\n`;
    report += `- **Alcohol:** May interact with medications\n`;
    report += `- **High Sodium:** Limit processed foods\n`;
    report += `- **Excessive Caffeine:** Can affect medication absorption\n\n`;
    
    report += `### Meal Timing:\n`;
    report += `- Take medications with food unless specified otherwise\n`;
    report += `- Maintain regular meal times\n`;
    report += `- Stay hydrated (8 glasses of water daily)\n\n`;
    
    // Exercise
    report += `## 🏃 Exercise Suggestions\n\n`;
    report += `### Recommended Activities:\n`;
    report += `- **Walking:** 30 minutes daily, low impact\n`;
    report += `- **Swimming:** Gentle on joints, full body workout\n`;
    report += `- **Yoga:** Flexibility and stress reduction\n`;
    report += `- **Light Cycling:** Cardiovascular health\n\n`;
    
    report += `### Exercise Guidelines:\n`;
    report += `- **Duration:** 20-30 minutes per session\n`;
    report += `- **Frequency:** 4-5 days per week\n`;
    report += `- **Intensity:** Moderate (can talk while exercising)\n`;
    report += `- **Best Time:** Morning or 2 hours after meals\n\n`;
    
    report += `### Precautions:\n`;
    report += `- ⚠️ Consult your doctor before starting new exercise\n`;
    report += `- ⚠️ Avoid exercise if feeling dizzy or unwell\n`;
    report += `- ⚠️ Stay hydrated before, during, and after exercise\n`;
    report += `- ⚠️ Stop if you experience chest pain or breathing difficulty\n\n`;
    
    // Reminders
    report += `## ⚠️ Important Reminders\n\n`;
    report += `- Never skip medication doses without consulting your doctor\n`;
    report += `- Set up multiple reminders to improve adherence\n`;
    report += `- Keep track of side effects and report to your doctor\n`;
    report += `- Store medications in a cool, dry place\n`;
    report += `- Check expiration dates regularly\n\n`;
    
    // Action items
    report += `## ✅ Action Items for Better Health\n\n`;
    report += `1. **Improve Adherence:** Set phone alarms for medication times\n`;
    report += `2. **Stay Active:** Start with 15-minute walks daily\n`;
    report += `3. **Eat Better:** Add one extra serving of vegetables daily\n\n`;
    
    report += `---\n`;
    report += `\n*📝 Note: This is a basic report. For AI-powered personalized insights, ensure your server is running and connected.*\n`;

    return report;
  }

  /**
   * Calculate basic adherence from medication history
   */
  calculateClientAdherence(medicationHistory) {
    if (medicationHistory.length === 0) return 0;
    
    const taken = medicationHistory.filter(m => m.status === 'taken').length;
    return Math.round((taken / medicationHistory.length) * 100);
  }

  /**
   * Get emoji based on adherence rate
   */
  getAdherenceEmoji(rate) {
    if (rate >= 90) return '🌟';
    if (rate >= 70) return '👍';
    if (rate >= 50) return '⚠️';
    return '🚨';
  }

  /**
   * Calculate basic statistics from medication history
   */
  calculateBasicStats(medicationHistory) {
    const totalReminders = medicationHistory.length;
    const taken = medicationHistory.filter(m => m.status === 'taken').length;
    const missed = medicationHistory.filter(m => m.status === 'missed').length;
    const adherenceRate = totalReminders > 0 ? Math.round((taken / totalReminders) * 100) : 0;

    return {
      totalReminders,
      taken,
      missed,
      adherenceRate,
    };
  }
}

const aiService = new AIService();
export default aiService;
