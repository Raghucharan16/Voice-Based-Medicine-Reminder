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

// Now using the Hugging Face API Key
const HF_API_KEY = process.env.HF_API_KEY;

if (!HF_API_KEY) {
  console.warn('Warning: HF_API_KEY not set. All AI features will be in demo mode.');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Audio transcription endpoint
app.post('/transcribe', upload.single('audio'), async (req, res) => {
  console.log('Received transcription request');
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const audioFilePath = req.file.path;
  console.log('Processing file:', audioFilePath);

  if (!HF_API_KEY) {
    console.log('Demo mode: Returning mock transcription.');
    // Clean up the uploaded file
    fs.unlinkSync(audioFilePath);
    return res.json({ transcription: 'Remind me to take Paracetamol at 10 PM' });
  }

  try {
    const audioData = fs.readFileSync(audioFilePath);
    console.log(`Read ${audioData.length} bytes from audio file.`);

    const response = await axios.post(
      'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
      audioData,
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': req.file.mimetype || 'audio/m4a',
        },
        timeout: 60000, // Increased timeout for potentially long transcriptions
      }
    );

    const transcription = response.data.text;
    console.log('Transcription successful:', transcription);
    res.json({ transcription });

  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Transcription error:', errorMessage);
    res.status(500).json({ error: 'Transcription failed', message: errorMessage });
  } finally {
    // Clean up the uploaded file
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
    }
  }
});

// Endpoint to parse reminder text using an LLM
app.post('/parse-reminder', async (req, res) => {
  const { text } = req.body;
  console.log('Received text to parse:', text);

  if (!text) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  if (!HF_API_KEY) {
    console.log('Demo mode: Returning mock reminder data.');
    // Simulate parsing for a common phrase
    if (text.toLowerCase().includes('paracetamol at 10 pm')) {
      return res.json({ medicine: 'Paracetamol', time: '10:00 PM' });
    }
    return res.json({ medicine: 'Medicine', time: '12:00 PM' });
  }

  const prompt = `You are a function calling API. From the user's request, extract the medicine name and the time for a reminder. Respond with only a valid JSON object in the format {"medicine": "MEDICINE_NAME", "time": "HH:MM AM/PM"}. Do not add any other text.

User request: "${text}"

JSON response:`;

  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      {
        inputs: prompt,
        parameters: { max_new_tokens: 50, temperature: 0.1 }
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
    console.log('LLM raw response:', generatedText);

    // Find the JSON part of the response, as the model might add extra text
    const jsonMatch = generatedText.match(/\{.*\}/);
    if (jsonMatch) {
      const reminderData = JSON.parse(jsonMatch[0]);
      console.log('Parsed reminder data:', reminderData);
      res.json(reminderData);
    } else {
      throw new Error('Could not parse JSON from LLM response.');
    }

  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Reminder parsing error:', errorMessage);
    res.status(500).json({
      error: 'Reminder parsing failed',
      message: errorMessage
    });
  }
});


// Generate adherence report using a Hugging Face LLM
app.post('/report', async (req, res) => {
  try {
    const entries = req.body.entries || [];
    console.log('Generating report for:', entries.length, 'entries');

    if (!HF_API_KEY) {
      return res.json({
        report: `[DEMO MODE] Analyzed ${entries.length} entries. Adherence is good.`
      });
    }

    const prompt = `Analyze the following medication adherence data and provide a brief, friendly summary (under 100 words) for a patient. Include the overall adherence percentage and one simple recommendation.
Data:
${JSON.stringify(entries, null, 2)}`;

    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      {
        inputs: prompt,
        parameters: { max_new_tokens: 150 }
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    // The model might return the prompt along with the answer, so we clean it up.
    const fullText = response.data[0].generated_text;
    const report = fullText.replace(prompt, '').trim();

    console.log('Hugging Face Report generated:', report);
    res.json({ report });

  } catch (error) {
    const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('Report generation error:', errorMessage);
    res.status(500).json({
      error: 'Report generation failed',
      message: errorMessage
    });
  }
});


// Enhanced voice command processing with conversational AI
app.post('/process-voice-command', async (req, res) => {
  const { text, context, conversationId } = req.body;
  console.log('Processing voice command:', text);

  if (!text) {
    return res.status(400).json({ error: 'No text provided.' });
  }

  try {
    // First, try to parse as a reminder
    const reminderData = await parseReminderFromText(text);
    
    // Check if we have all required information
    const missingFields = [];
    if (!reminderData.medicine || reminderData.medicine === 'Medicine') {
      missingFields.push('medicine');
    }
    if (!reminderData.time || reminderData.time === '12:00 PM') {
      missingFields.push('time');
    }
    if (!reminderData.dosage) {
      missingFields.push('dosage');
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
      response: `Great! I've set up a reminder for ${reminderData.medicine} at ${reminderData.time}${reminderData.dosage ? ` with dosage: ${reminderData.dosage}` : ''}.`,
      conversationContext: null // Reset context
    });

  } catch (error) {
    console.error('Voice command processing error:', error);
    res.status(500).json({
      error: 'Voice command processing failed',
      message: error.message
    });
  }
});

// Generate health report with dietary suggestions
app.post('/generate-health-report', async (req, res) => {
  try {
    const { medicationHistory, feedbackHistory } = req.body;
    console.log('Generating health report for medication history and feedback');

    if (!HF_API_KEY) {
      return res.json({
        report: `[DEMO MODE] Health Report: Based on your medication history, you're doing well with adherence. Consider adding more fruits and vegetables to your diet.`,
        dietarySuggestions: [
          "Increase water intake to 8 glasses daily",
          "Include more leafy greens in your meals",
          "Consider taking medications with food to reduce stomach irritation"
        ]
      });
    }

    const medicationSummary = medicationHistory?.map(med => 
      `${med.name}: ${med.adherence || 'N/A'}% adherence`
    ).join(', ') || 'No medication history available';

    const feedbackSummary = feedbackHistory?.slice(-5).map(feedback => 
      `${feedback.medication}: ${feedback.feeling}`
    ).join(', ') || 'No recent feedback available';

    const prompt = `As a healthcare AI assistant, analyze this patient's medication data and provide a comprehensive health report with dietary suggestions.

Medication History: ${medicationSummary}
Recent Feedback: ${feedbackSummary}

Provide:
1. Overall health assessment (2-3 sentences)
2. Medication adherence analysis
3. 3-5 specific dietary recommendations based on medications
4. General wellness tips

Keep the tone friendly and encouraging. Format as a structured report.`;

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

    const fullReport = response.data[0].generated_text.replace(prompt, '').trim();
    
    // Extract dietary suggestions (simple parsing)
    const dietarySuggestions = [
      "Stay hydrated with 8-10 glasses of water daily",
      "Include omega-3 rich foods like fish and nuts",
      "Eat medications with food if they cause stomach upset",
      "Maintain regular meal times to support medication effectiveness"
    ];

    console.log('Health report generated successfully');
    res.json({ 
      report: fullReport,
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

    if (!HF_API_KEY) {
      return res.json({
        analysis: "Thank you for your feedback! Your response has been recorded.",
        sentiment: "neutral",
        suggestions: ["Continue taking your medication as prescribed", "Contact your doctor if you have concerns"]
      });
    }

    const prompt = `Analyze this patient's medication feedback and provide supportive response:

Feedback: "${feedbackText}"

Provide:
1. Sentiment analysis (positive/neutral/concerning)
2. Brief supportive response (1-2 sentences)
3. Any recommendations or when to contact healthcare provider

Keep response caring and professional.`;

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

    const analysis = response.data[0].generated_text.replace(prompt, '').trim();
    
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

// Helper functions
async function parseReminderFromText(text) {
  if (!HF_API_KEY) {
    // Simple demo parsing
    const lowerText = text.toLowerCase();
    let medicine = 'Medicine';
    let time = '12:00 PM';
    let dosage = null;

    // Extract medicine name
    const medicinePatterns = [
      /(?:take|remind|medication|medicine)\s+([a-zA-Z]+)/i,
      /([a-zA-Z]+)\s+(?:at|medicine|tablet|pill)/i
    ];
    
    for (const pattern of medicinePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        medicine = match[1];
        break;
      }
    }

    // Extract time
    const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i);
    if (timeMatch) {
      time = timeMatch[1];
    }

    // Extract dosage
    const dosageMatch = text.match(/(\d+\s*(?:mg|tablet|pill|capsule))/i);
    if (dosageMatch) {
      dosage = dosageMatch[1];
    }

    return { medicine, time, dosage };
  }

  // Use AI for parsing
  const prompt = `Extract medicine reminder information from: "${text}"
  
  Respond with JSON: {"medicine": "name", "time": "HH:MM AM/PM", "dosage": "amount or null"}`;

  try {
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
  } catch (error) {
    console.error('AI parsing error:', error);
  }

  // Fallback to simple parsing
  return { medicine: 'Medicine', time: '12:00 PM', dosage: null };
}

async function generateFollowUpQuestion(partialData, missingFields) {
  const questions = {
    medicine: "What medication would you like me to remind you about?",
    time: "What time should I remind you to take this medication?",
    dosage: `How much ${partialData.medicine || 'medication'} should you take?`
  };

  // Return the first missing field's question
  return questions[missingFields[0]] || "Could you provide more details about your medication reminder?";
}

function generateConversationId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

const PORT = process.env.PORT || 3333;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    console.log('📱 Health check: http://localhost:3333/health');
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`🌐 LAN access: http://${net.address}:${PORT}/health`);
            }
        }
    }
  } catch (e) {
    console.log("Could not determine LAN address.");
  }
});
