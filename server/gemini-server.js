require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

const upload = multer({ dest: path.join(__dirname, 'uploads/') });
const app = express();

app.use(cors());
app.use(express.json());

// API Keys - prioritize Gemini over Hugging Face
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HF_API_KEY = process.env.HF_API_KEY;

if (!GEMINI_API_KEY && !HF_API_KEY) {
  console.warn('Warning: No API keys set. All AI features will be in demo mode.');
} else {
  console.log('API Configuration:', {
    gemini: GEMINI_API_KEY ? '✅ Available' : '❌ Not set',
    huggingFace: HF_API_KEY ? '✅ Available' : '❌ Not set'
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    apis: {
      gemini: GEMINI_API_KEY ? 'available' : 'not configured',
      huggingFace: HF_API_KEY ? 'available' : 'not configured'
    },
    mode: GEMINI_API_KEY || HF_API_KEY ? 'ai' : 'demo'
  });
});

// Enhanced voice command processing
app.post('/process-voice-command', async (req, res) => {
  const { text, context, conversationId } = req.body;
  console.log('Processing voice command:', text);

  if (!text) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  try {
    // Parse reminder information
    const reminderData = await parseReminderFromText(text);
    
    // Check if we have all required information
    const missingFields = [];
    if (!reminderData.medicine || reminderData.medicine === 'Medicine') {
      missingFields.push('medicine');
    }
    if (!reminderData.time || reminderData.time === '12:00 PM') {
      missingFields.push('time');
    }

    if (missingFields.length > 0) {
      // Generate follow-up question
      const question = await generateFollowUpQuestion(reminderData, missingFields);
      return res.json({
        type: 'question',
        question: question,
        partialData: reminderData,
        missingFields: missingFields,
        conversationContext: {
          id: conversationId || generateConversationId(),
          state: 'collecting_reminder_info',
          partialData: reminderData
        }
      });
    }

    // Complete reminder data
    return res.json({
      type: 'complete_reminder',
      reminder: reminderData,
      response: `Perfect! I've set up a reminder for ${reminderData.medicine} at ${reminderData.time}${reminderData.dosage ? ` with dosage: ${reminderData.dosage}` : ''}.`,
      conversationContext: null
    });

  } catch (error) {
    console.error('Voice command processing error:', error);
    res.status(500).json({
      error: 'Voice command processing failed',
      message: error.message
    });
  }
});

// Generate health report with Gemini API
app.post('/generate-health-report', async (req, res) => {
  try {
    const { medicationHistory, feedbackHistory } = req.body;
    console.log('Generating health report...');

    if (!GEMINI_API_KEY && !HF_API_KEY) {
      return res.json({
        report: `[DEMO MODE] Health Report: Based on your medication history, you're maintaining good adherence. Your feedback shows positive responses to medications. Continue following your prescribed schedule.`,
        dietarySuggestions: [
          "Stay hydrated with 8-10 glasses of water daily",
          "Include omega-3 rich foods like fish and walnuts",
          "Take medications with food if they cause stomach upset",
          "Maintain regular meal times to support medication effectiveness",
          "Include probiotics to support digestive health"
        ]
      });
    }

    const medicationSummary = medicationHistory?.slice(-10).map(med => 
      `${med.medicationId}: taken at ${med.actualTime || 'scheduled time'}`
    ).join(', ') || 'No recent medication history';

    const feedbackSummary = feedbackHistory?.slice(-5).map(feedback => 
      `${feedback.medicationId}: ${feedback.feedback}`
    ).join(', ') || 'No recent feedback';

    let report;
    let dietarySuggestions = [
      "Stay hydrated with 8-10 glasses of water daily",
      "Include omega-3 rich foods like fish and walnuts",
      "Take medications with food if they cause stomach upset",
      "Maintain regular meal times to support medication effectiveness",
      "Include probiotics to support digestive health"
    ];

    if (GEMINI_API_KEY) {
      report = await generateGeminiHealthReport(medicationSummary, feedbackSummary);
    } else if (HF_API_KEY) {
      report = await generateHuggingFaceHealthReport(medicationSummary, feedbackSummary);
    }

    console.log('Health report generated successfully');
    res.json({ 
      report: report,
      dietarySuggestions: dietarySuggestions
    });

  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Health report generation error:', errorMessage);
    res.status(500).json({
      error: 'Health report generation failed',
      message: errorMessage
    });
  }
});

// Process medication feedback
app.post('/process-medication-feedback', async (req, res) => {
  try {
    const { medicationId, feedbackText, timestamp } = req.body;
    console.log('Processing medication feedback:', feedbackText);

    if (!GEMINI_API_KEY && !HF_API_KEY) {
      return res.json({
        analysis: "Thank you for your feedback! Your response has been recorded and will help us understand how medications affect you.",
        sentiment: analyzeSentimentLocal(feedbackText),
        suggestions: ["Continue taking your medication as prescribed", "Contact your doctor if you have concerns"]
      });
    }

    let analysis;
    if (GEMINI_API_KEY) {
      analysis = await processGeminiFeedback(feedbackText);
    } else if (HF_API_KEY) {
      analysis = await processHuggingFaceFeedback(feedbackText);
    }
    
    console.log('Medication feedback processed successfully');
    res.json({
      analysis: analysis,
      recorded: true,
      timestamp: timestamp
    });

  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Medication feedback processing error:', errorMessage);
    res.status(500).json({
      error: 'Medication feedback processing failed',
      message: errorMessage
    });
  }
});

// Audio transcription endpoint (simplified for demo)
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  console.log('Received transcription request');
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const audioFilePath = req.file.path;
  console.log('Processing file:', audioFilePath);

  // For demo purposes, return a sample transcription
  // In production, you'd use Google Speech-to-Text, Azure Speech, or similar
  const sampleTranscriptions = [
    'Remind me to take Aspirin at 8 PM',
    'Set up a reminder for my Paracetamol at 10 AM',
    'I need to take Vitamin D every morning at 9 AM',
    'Remind me to take my blood pressure medication at 7 PM'
  ];
  
  const transcription = sampleTranscriptions[Math.floor(Math.random() * sampleTranscriptions.length)];
  
  // Clean up the uploaded file
  if (fs.existsSync(audioFilePath)) {
    fs.unlinkSync(audioFilePath);
  }
  
  console.log('Demo transcription:', transcription);
  res.json({ transcription });
});

// Helper functions
async function parseReminderFromText(text) {
  if (GEMINI_API_KEY) {
    return await parseReminderWithGemini(text);
  } else if (HF_API_KEY) {
    return await parseReminderWithHuggingFace(text);
  } else {
    return parseReminderLocal(text);
  }
}

async function parseReminderWithGemini(text) {
  try {
    const prompt = `Parse this medication reminder request and extract the information:
    
    Text: "${text}"
    
    Extract and return in JSON format:
    - medicine: name of the medication
    - time: time in HH:MM AM/PM format  
    - dosage: amount with units (if mentioned)
    - frequency: how often (default "daily")
    
    Example: {"medicine": "Aspirin", "time": "8:00 PM", "dosage": "500mg", "frequency": "daily"}`;

    const response = await callGeminiAPI(prompt);
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('No valid JSON found in response');
  } catch (error) {
    console.error('Gemini parsing error:', error);
    return parseReminderLocal(text);
  }
}

async function parseReminderWithHuggingFace(text) {
  try {
    const prompt = `Extract medication reminder info from: "${text}"
    Respond with JSON: {"medicine": "name", "time": "HH:MM AM/PM", "dosage": "amount"}`;

    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      {
        inputs: prompt,
        parameters: { max_new_tokens: 80, temperature: 0.1 }
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const generatedText = response.data[0].generated_text.replace(prompt, '').trim();
    const jsonMatch = generatedText.match(/\{.*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('No valid JSON found in response');
  } catch (error) {
    console.error('Hugging Face parsing error:', error);
    return parseReminderLocal(text);
  }
}

function parseReminderLocal(text) {
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

async function generateGeminiHealthReport(medicationSummary, feedbackSummary) {
  const prompt = `As a healthcare AI assistant, analyze this patient's medication data:

Recent Medications: ${medicationSummary}
Recent Feedback: ${feedbackSummary}

Provide a comprehensive health report including:
1. Overall adherence assessment
2. Medication effectiveness insights  
3. Health recommendations
4. Any concerns or suggestions

Keep the tone encouraging and professional.`;

  return await callGeminiAPI(prompt);
}

async function generateHuggingFaceHealthReport(medicationSummary, feedbackSummary) {
  const prompt = `Analyze medication data and provide health report:
Data: ${medicationSummary}
Feedback: ${feedbackSummary}
Provide brief assessment and recommendations.`;

  const response = await axios.post(
    'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    {
      inputs: prompt,
      parameters: { max_new_tokens: 300, temperature: 0.3 }
    },
    {
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data[0].generated_text.replace(prompt, '').trim();
}

async function processGeminiFeedback(feedbackText) {
  const prompt = `Analyze this patient's medication feedback: "${feedbackText}"
  
  Provide a caring, professional response that:
  1. Acknowledges their feedback
  2. Provides appropriate guidance
  3. Suggests when to contact healthcare provider if needed
  
  Keep response supportive and brief.`;

  return await callGeminiAPI(prompt);
}

async function processHuggingFaceFeedback(feedbackText) {
  const prompt = `Analyze medication feedback: "${feedbackText}" 
  Provide supportive response and recommendations.`;

  const response = await axios.post(
    'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    {
      inputs: prompt,
      parameters: { max_new_tokens: 150, temperature: 0.2 }
    },
    {
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data[0].generated_text.replace(prompt, '').trim();
}

async function callGeminiAPI(prompt) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
      }
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  return response.data.candidates[0].content.parts[0].text;
}

function analyzeSentimentLocal(text) {
  const lowerText = text.toLowerCase();
  const positiveWords = ['good', 'great', 'better', 'fine', 'well', 'excellent'];
  const negativeWords = ['bad', 'worse', 'terrible', 'sick', 'nauseous', 'dizzy', 'pain'];
  
  const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
  const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'concerning';
  return 'neutral';
}

async function generateFollowUpQuestion(partialData, missingFields) {
  const questions = {
    medicine: "What medication would you like me to remind you about?",
    time: "What time should I remind you to take this medication?",
    dosage: `How much ${partialData.medicine || 'medication'} should you take?`
  };

  return questions[missingFields[0]] || "Could you provide more details about your medication reminder?";
}

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

const PORT = process.env.PORT || 3333;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Enhanced Server running on port ${PORT}`);
  console.log(`🔑 API Status: ${GEMINI_API_KEY ? 'Gemini' : HF_API_KEY ? 'Hugging Face' : 'Demo'} mode`);
  
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log('📱 Health check: http://localhost:3333/health');
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`🌐 LAN access: http://${net.address}:${PORT}/health`);
            }
        }
    }
  } catch (e) {
    console.log("Could not determine LAN address.");
  }
});
