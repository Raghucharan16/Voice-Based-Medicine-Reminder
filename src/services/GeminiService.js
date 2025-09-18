import Constants from 'expo-constants';

class GeminiService {
  constructor() {
    this.API_KEY = null; // Will be set from server or environment
    this.BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
  }

  setApiKey(apiKey) {
    this.API_KEY = apiKey;
  }

  async transcribeAudioLocal(audioText) {
    // For demo purposes, we'll simulate transcription
    // In a real app, you'd use a speech-to-text service
    return audioText || "I want to set a reminder for my medicine";
  }

  async parseReminderText(text) {
    if (!this.API_KEY) {
      return this.parseReminderLocal(text);
    }

    try {
      const prompt = `Parse this medication reminder request and extract the information in JSON format:
      
      Text: "${text}"
      
      Extract:
      - medicine: name of the medication
      - time: time in HH:MM AM/PM format
      - dosage: amount (if mentioned)
      - frequency: how often (if mentioned)
      
      Respond with only valid JSON in this format:
      {"medicine": "name", "time": "HH:MM AM/PM", "dosage": "amount", "frequency": "daily"}`;

      const response = await this.callGemini(prompt);
      return this.parseGeminiResponse(response);
    } catch (error) {
      console.error('Gemini API error:', error);
      return this.parseReminderLocal(text);
    }
  }

  parseReminderLocal(text) {
    // Local parsing fallback
    const lowerText = text.toLowerCase();
    let medicine = 'Medicine';
    let time = '12:00 PM';
    let dosage = null;

    // Extract medicine name
    const medicinePatterns = [
      /(?:take|remind|medication|medicine)\s+([a-zA-Z]+)/i,
      /([a-zA-Z]+)\s+(?:at|medicine|tablet|pill)/i,
      /(aspirin|paracetamol|ibuprofen|vitamin|calcium|iron)/i
    ];
    
    for (const pattern of medicinePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        medicine = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        break;
      }
    }

    // Extract time
    const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
    if (timeMatch) {
      time = timeMatch[1].toUpperCase();
    } else {
      // Look for general time indicators
      if (text.includes('morning')) time = '8:00 AM';
      else if (text.includes('afternoon')) time = '2:00 PM';
      else if (text.includes('evening')) time = '6:00 PM';
      else if (text.includes('night')) time = '10:00 PM';
    }

    // Extract dosage
    const dosageMatch = text.match(/(\d+\s*(?:mg|tablet|pill|capsule|ml))/i);
    if (dosageMatch) {
      dosage = dosageMatch[1];
    }

    return { medicine, time, dosage, frequency: 'daily' };
  }

  async generateHealthReport(medicationHistory, feedbackHistory) {
    if (!this.API_KEY) {
      return this.generateHealthReportLocal(medicationHistory, feedbackHistory);
    }

    try {
      const medicationSummary = medicationHistory?.slice(-10).map(med => 
        `${med.medicationId}: taken at ${med.actualTime}`
      ).join(', ') || 'No recent medication history';

      const feedbackSummary = feedbackHistory?.slice(-5).map(feedback => 
        `${feedback.medicationId}: ${feedback.feedback}`
      ).join(', ') || 'No recent feedback';

      const prompt = `As a healthcare AI assistant, analyze this patient's medication data and provide a comprehensive health report:

      Recent Medications: ${medicationSummary}
      Recent Feedback: ${feedbackSummary}

      Please provide:
      1. Overall adherence assessment (2-3 sentences)
      2. Medication effectiveness insights
      3. 5 specific dietary recommendations
      4. General wellness tips
      5. Any concerns or recommendations

      Keep the tone encouraging and professional. Format as a clear, structured report.`;

      const response = await this.callGemini(prompt);
      
      return {
        report: response,
        dietarySuggestions: [
          "Stay hydrated with 8-10 glasses of water daily",
          "Include omega-3 rich foods like fish and walnuts",
          "Eat medications with food if they cause stomach upset",
          "Maintain regular meal times to support medication effectiveness",
          "Include probiotics to support digestive health"
        ]
      };
    } catch (error) {
      console.error('Gemini health report error:', error);
      return this.generateHealthReportLocal(medicationHistory, feedbackHistory);
    }
  }

  generateHealthReportLocal(medicationHistory, feedbackHistory) {
    const adherenceRate = medicationHistory.length > 0 ? 
      Math.round((medicationHistory.filter(m => m.status === 'taken').length / medicationHistory.length) * 100) : 0;

    const report = `Health Report Summary:

    Your medication adherence rate is ${adherenceRate}%. ${
      adherenceRate >= 80 ? 'Great job maintaining consistent medication habits!' : 
      adherenceRate >= 60 ? 'You\'re doing well, but there\'s room for improvement.' :
      'Consider setting more frequent reminders to improve adherence.'
    }

    Based on your recent activity, you're tracking your medications regularly. ${
      feedbackHistory.length > 0 ? 'Your feedback shows you\'re monitoring how medications affect you, which is excellent for your health.' :
      'Consider providing feedback after taking medications to track their effects.'
    }

    Keep up the good work with your medication routine. Consistency is key to achieving the best health outcomes.`;

    return {
      report,
      dietarySuggestions: [
        "Stay hydrated with 8-10 glasses of water daily",
        "Include omega-3 rich foods like fish and walnuts", 
        "Eat medications with food if they cause stomach upset",
        "Maintain regular meal times to support medication effectiveness",
        "Include probiotics to support digestive health"
      ]
    };
  }

  async processMedicationFeedback(medicationId, feedbackText) {
    if (!this.API_KEY) {
      return this.processFeedbackLocal(feedbackText);
    }

    try {
      const prompt = `Analyze this patient's medication feedback and provide a supportive response:

      Feedback: "${feedbackText}"

      Provide:
      1. Sentiment analysis (positive/neutral/concerning)
      2. Brief supportive response (1-2 sentences)
      3. Any recommendations or when to contact healthcare provider

      Keep response caring and professional.`;

      const response = await this.callGemini(prompt);
      
      return {
        analysis: response,
        sentiment: this.analyzeSentiment(feedbackText),
        recorded: true
      };
    } catch (error) {
      console.error('Gemini feedback error:', error);
      return this.processFeedbackLocal(feedbackText);
    }
  }

  processFeedbackLocal(feedbackText) {
    const sentiment = this.analyzeSentiment(feedbackText);
    let response = "Thank you for sharing your feedback! ";
    
    if (sentiment === 'positive') {
      response += "It's great to hear you're feeling well after taking your medication.";
    } else if (sentiment === 'concerning') {
      response += "I notice you mentioned some discomfort. Please consult your healthcare provider if symptoms persist.";
    } else {
      response += "Your feedback has been recorded and will help track your medication response.";
    }

    return {
      analysis: response,
      sentiment: sentiment,
      recorded: true
    };
  }

  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();
    const positiveWords = ['good', 'great', 'better', 'fine', 'well', 'excellent', 'amazing'];
    const negativeWords = ['bad', 'worse', 'terrible', 'awful', 'sick', 'nauseous', 'dizzy', 'pain'];
    
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'concerning';
    return 'neutral';
  }

  async callGemini(prompt) {
    const response = await fetch(`${this.BASE_URL}/models/gemini-pro:generateContent?key=${this.API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1000,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }

  parseGeminiResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing if JSON extraction fails
      return {
        medicine: 'Medicine',
        time: '12:00 PM',
        dosage: null,
        frequency: 'daily'
      };
    } catch (error) {
      console.error('Error parsing Gemini response:', error);
      return {
        medicine: 'Medicine',
        time: '12:00 PM',
        dosage: null,
        frequency: 'daily'
      };
    }
  }
}

export default new GeminiService();
