require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { parseReminderWithAI, generateHealthReport } = require('./ai-parser');

const upload = multer({ dest: path.join(__dirname, 'uploads/') });
const app = express();

// Enable CORS for all origins in development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const HF_API_KEY = process.env.HF_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASS = process.env.EMAIL_PASS || '';

if (!HF_API_KEY) {
  console.warn('⚠️ Warning: HF_API_KEY not set. AI features will use fallback.');
}

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn('⚠️ Warning: EMAIL_USER or EMAIL_PASS not set. Emails will be logged only (demo mode).');
}

// Configure nodemailer transporter
let emailTransporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    service: 'gmail', // Change to your email service
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS // Use App Password for Gmail
    }
  });
  console.log('✅ Email service configured');
} else {
  console.log('📧 Email service in DEMO mode (will log emails only)');
}

// Conversation storage (in production, use Redis or database)
const activeConversations = new Map();

// Helper Functions
function detectLanguage(text) {
  const teluguPattern = /[\u0C00-\u0C7F]/;
  const hindiPattern = /[\u0900-\u097F]/;
  
  if (teluguPattern.test(text)) {
    return 'te';
  } else if (hindiPattern.test(text)) {
    return 'hi';
  }
  return 'en';
}

function createEnhancedPrompt(text, language, context) {
  const systemPrompts = {
    en: `You are a medicine reminder assistant. Extract medicine information from user input and return ONLY a valid JSON object with no additional text.`,
    te: `మీరు మందుల రిమైండర్ అసిస్టెంట్. వినియోగదారు ఇన్‌పుట్ నుండి మందుల సమాచారాన్ని సేకరించి JSON ఆబ్జెక్ట్‌ను మాత్రమే రిటర్న్ చేయండి.`
  };

  const basePrompt = systemPrompts[language] || systemPrompts.en;
  
  let prompt = `${basePrompt}

STRICT REQUIREMENTS:
- Return ONLY valid JSON, no other text
- Use exact format shown below
- Set null for missing information
- Use 12-hour time format (HH:MM AM/PM)

Required JSON format:
{
  "medicine": "medicine name or null",
  "time": "time in HH:MM AM/PM format or null", 
  "dosage": "dosage amount with unit or null",
  "frequency": "daily/weekly/monthly/custom or null",
  "isComplete": false,
  "missingFields": ["field1", "field2"]
}

`;

  if (context && context.collectedData) {
    prompt += `Previous collected data: ${JSON.stringify(context.collectedData)}\n`;
  }

  prompt += `User input: "${text}"\n\nJSON response (no other text):`;
  
  return prompt;
}

function createQuestionPrompt(incompleteData, language) {
  const templates = {
    en: "Generate a short, friendly question to collect missing medicine information. Respond with ONLY the question text, no other words.",
    te: "తప్పిపోయిన మందుల సమాచారాన్ని సేకరించడానికి చిన్న, స్నేహపూర్వక ప్రశ్న రూపొందించండి. కేవలం ప్రశ్న వచనంతో మాత్రమే ప్రతిస్పందించండి."
  };

  const exampleQuestions = {
    en: {
      medicine: "What medicine do you need a reminder for?",
      time: "What time should I remind you to take it?",
      dosage: "What's the dosage amount?",
      frequency: "How often do you need to take this medicine?"
    },
    te: {
      medicine: "ఏ మందుకు రిమైండర్ కావాలి?",
      time: "ఎప్పుడు తీసుకోవాలని గుర్తు చేయాలి?",
      dosage: "ఎంత మోతాదు తీసుకోవాలి?",
      frequency: "ఎంత సేపటికో ఈ మందు తీసుకోవాలి?"
    }
  };

  const missingField = incompleteData.missingFields?.[0];
  if (missingField && exampleQuestions[language] && exampleQuestions[language][missingField]) {
    return exampleQuestions[language][missingField];
  }

  return `${templates[language] || templates.en}

Missing information: ${JSON.stringify(incompleteData.missingFields)}
Current data: ${JSON.stringify(incompleteData)}

Question:`;
}

function analyzeReminderCompleteness(data) {
  const requiredFields = ['medicine', 'time'];
  const optionalFields = ['dosage', 'frequency'];
  
  const missingRequired = requiredFields.filter(field => !data[field] || data[field] === null);
  const missingOptional = optionalFields.filter(field => !data[field] || data[field] === null);
  
  const isComplete = missingRequired.length === 0;
  
  // Set default frequency if not specified
  if (isComplete && !data.frequency) {
    data.frequency = 'daily';
  }
  
  return {
    medicine: data.medicine,
    time: data.time,
    dosage: data.dosage || 'As prescribed',
    frequency: data.frequency || (isComplete ? 'daily' : null),
    isComplete,
    missingFields: [...missingRequired, ...missingOptional.slice(0, 1)],
    conversationContext: {
      id: Date.now().toString(),
      stage: isComplete ? 'complete' : 'collecting_info',
      collectedData: {
        medicine: data.medicine,
        time: data.time,
        dosage: data.dosage,
        frequency: data.frequency
      }
    }
  };
}

// Enhanced fallback parsing for when AI models are not available
function parseReminderFallback(text) {
  const lowercaseText = text.toLowerCase();
  console.log(`🎯 Fallback parsing: "${text}"`);
  
  // Medicine extraction with smart name detection
  // CRITICAL: Extract FULL medicine names, not just generic terms
  
  // First, try to extract specific medicine names and compounds
  const specificMedicines = [
    'paracetamol', 'acetaminophen', 'tylenol',
    'aspirin', 'ibuprofen', 'advil', 'motrin',
    'insulin', 'metformin', 'blood pressure',
    'vitamin d', 'vitamin c', 'vitamin b', 'vitamin a', 'vitamin e',
    'calcium', 'iron', 'zinc', 'magnesium',
    'antibiotics', 'cough syrup', 'eye drops', 
    'juice', 'water', 'milk', 'tea', 'coffee'
  ];
  
  let medicine = null;
  
  // Check for specific medicines first
  for (const med of specificMedicines) {
    if (lowercaseText.includes(med)) {
      // Capitalize properly
      medicine = med.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      break;
    }
  }
  
  // If no specific medicine found, try to extract from context
  // Look for patterns like "take [something] at" or "remind me to take [something]"
  if (!medicine) {
    const takePatterns = [
      /take\s+(?:the\s+)?([a-z\s]+?)(?:\s+at|\s+tablet|\s+pill|\s+capsule|\s+mg|\s+ml)/i,
      /remind me to take\s+([a-z\s]+?)(?:\s+at|\s+tablet|\s+pill|\s+capsule|\s+mg|\s+ml)/i,
      /\b([a-z]+(?:\s+[a-z]+)?)\s+(?:tablet|pill|capsule|syrup|drops)/i
    ];
    
    for (const pattern of takePatterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim()) {
        const extracted = match[1].trim();
        // Only use if it's not a generic term
        const genericTerms = ['medicine', 'medication', 'pill', 'tablet', 'capsule', 'my', 'the', 'this', 'that'];
        if (!genericTerms.includes(extracted.toLowerCase())) {
          medicine = extracted.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
          break;
        }
      }
    }
  }
  
  // Time extraction with 24-hour format support
  let time = null;
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 2:30 PM
    /(\d{1,2})\s*(am|pm)/i,           // 2 PM
    /(\d{1,2})\s*o'?clock/i,          // 2 o'clock
    /(\d{1,2}):(\d{2})/,              // 14:00 (24-hour)
    /(morning|evening|night|afternoon)/i
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[3]) { // Has AM/PM
        const hour = parseInt(match[1]);
        const min = match[2] || '00';
        time = `${hour}:${min} ${match[3].toUpperCase()}`;
      } else if (match[2] && (match[2].toLowerCase() === 'am' || match[2].toLowerCase() === 'pm')) {
        time = `${match[1]}:00 ${match[2].toUpperCase()}`;
      } else if (pattern.toString().includes('(\\d{1,2}):(\\d{2})') && match[1] && match[2]) {
        // 24-hour format detected (e.g., 14:00)
        let hour = parseInt(match[1]);
        const min = match[2];
        const period = hour >= 12 ? 'PM' : 'AM';
        if (hour > 12) hour = hour - 12;
        if (hour === 0) hour = 12;
        time = `${hour}:${min} ${period}`;
        console.log(`⏰ Converted 24-hour time ${match[1]}:${match[2]} to 12-hour: ${time}`);
      } else if (match[1]) {
        const timeOfDay = match[1].toLowerCase();
        if (timeOfDay === 'morning') time = '8:00 AM';
        else if (timeOfDay === 'afternoon') time = '2:00 PM';
        else if (timeOfDay === 'evening') time = '6:00 PM';
        else if (timeOfDay === 'night') time = '10:00 PM';
        else {
          const hourNum = parseInt(match[1]);
          time = `${hourNum}:00 ${hourNum < 12 ? 'AM' : 'PM'}`;
        }
      }
      break;
    }
  }
  
  // Dosage extraction
  let dosage = null;
  const dosagePatterns = [
    /(\d+)\s*(mg|milligrams?)/i,
    /(\d+)\s*(tablets?|pills?|capsules?)/i,
    /(\d+\.?\d*)\s*(ml|milliliters?)/i,
    /(\d+)\s*units?/i
  ];
  
  for (const pattern of dosagePatterns) {
    const match = text.match(pattern);
    if (match) {
      dosage = `${match[1]}${match[2]}`;
      break;
    }
  }
  
  // Frequency extraction - check for one-time events FIRST
  let frequency = null;
  
  // Check for temporal words indicating one-time event
  if (/tomorrow|today|tonight|this evening|this morning/i.test(text)) {
    frequency = 'once';
  } else if (/once|one time|single dose/i.test(text)) {
    frequency = 'once';
  } else {
    // Check recurring patterns
    const frequencyPatterns = [
      /daily|every day/i,
      /twice a day|two times a day|bid/i,
      /three times a day|thrice a day|tid/i,
      /four times a day|qid/i,
      /weekly|once a week/i,
      /monthly|once a month/i,
      /every (\d+) hours?/i,
      /(\d+) times? a day/i
    ];
    
    for (const pattern of frequencyPatterns) {
      const match = text.match(pattern);
      if (match) {
        const matchedText = match[0].toLowerCase();
        if (matchedText.includes('daily') || matchedText.includes('every day')) {
          frequency = 'daily';
        } else if (matchedText.includes('twice') || matchedText.includes('two times')) {
          frequency = 'twice daily';
        } else if (matchedText.includes('three') || matchedText.includes('thrice')) {
          frequency = 'three times daily';
        } else if (matchedText.includes('four')) {
          frequency = 'four times daily';
        } else if (matchedText.includes('weekly')) {
          frequency = 'weekly';
        } else if (matchedText.includes('monthly')) {
          frequency = 'monthly';
        } else if (match[1]) {
          if (matchedText.includes('hours')) {
            frequency = `every ${match[1]} hours`;
          } else if (matchedText.includes('times')) {
            frequency = `${match[1]} times daily`;
          }
        }
        break;
      }
    }
  }
  
  // If no frequency found and no temporal words, check context
  if (!frequency) {
    // Only default to 'daily' if there are no one-time indicators
    if (!/tomorrow|today|tonight|once|one time/i.test(text)) {
      frequency = null; // Let the system ask for frequency
    } else {
      frequency = 'once';
    }
  }
  
  console.log(`🎯 Extracted: medicine=${medicine}, time=${time}, dosage=${dosage}, frequency=${frequency}`);
  
  return {
    medicine,
    time,
    dosage,
    frequency
  };
}

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: ['enhanced_transcription', 'multilingual', 'conversation_context']
  });
});

// Simple ping endpoint for connectivity testing
app.get('/ping', (req, res) => {
  console.log('🏓 Ping received from:', req.ip);
  res.json({ 
    pong: true,
    serverTime: new Date().toISOString(),
    clientIP: req.ip
  });
});

// Enhanced transcription endpoint with language support
app.post('/transcribe-enhanced', upload.single('audio'), async (req, res) => {
  console.log('📝 Enhanced transcription request received');
  
  if (!req.file) {
    return res.status(400).json({ 
      error: 'No audio file uploaded',
      code: 'MISSING_AUDIO_FILE' 
    });
  }

  const audioFilePath = req.file.path;
  const targetLanguage = req.body.language || 'en';
  
  console.log(`🔊 Processing audio file: ${path.basename(audioFilePath)}`);
  console.log(`🌐 Target language: ${targetLanguage}`);

  const startTime = Date.now();

  try {
    // Read audio file
    const audioData = fs.readFileSync(audioFilePath);
    console.log(`📊 Audio file size: ${(audioData.length / 1024).toFixed(2)} KB`);

    // Try AssemblyAI first (more reliable)
    if (process.env.ASSEMBLYAI_API_KEY && process.env.ASSEMBLYAI_API_KEY !== 'your_assemblyai_key_here') {
      console.log('� Using AssemblyAI for transcription...');
      
      try {
        // Upload to AssemblyAI
        const uploadResponse = await axios.post(
          'https://api.assemblyai.com/v2/upload',
          audioData,
          {
            headers: {
              'authorization': process.env.ASSEMBLYAI_API_KEY,
              'content-type': 'application/octet-stream',
            },
          }
        );

        const audioUrl = uploadResponse.data.upload_url;
        console.log('✅ Audio uploaded to AssemblyAI');

        // Request transcription
        const transcriptResponse = await axios.post(
          'https://api.assemblyai.com/v2/transcript',
          {
            audio_url: audioUrl,
            language_code: targetLanguage === 'en' ? 'en' : 'en_us',
          },
          {
            headers: {
              'authorization': process.env.ASSEMBLYAI_API_KEY,
              'content-type': 'application/json',
            },
          }
        );

        const transcriptId = transcriptResponse.data.id;
        console.log('⏳ Waiting for transcription...');

        // Poll for completion
        let transcript;
        while (true) {
          const pollingResponse = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            {
              headers: {
                'authorization': process.env.ASSEMBLYAI_API_KEY,
              },
            }
          );

          transcript = pollingResponse.data;

          if (transcript.status === 'completed') {
            break;
          } else if (transcript.status === 'error') {
            throw new Error('Transcription failed: ' + transcript.error);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const transcribedText = transcript.text;
        const processingTime = Date.now() - startTime;

        // Clean up
        fs.unlinkSync(audioFilePath);

        console.log(`✅ Transcription successful (${processingTime}ms): "${transcribedText}"`);

        return res.json({
          transcription: transcribedText,
          detectedLanguage: targetLanguage,
          confidence: transcript.confidence || 0.95,
          processingTime,
          service: 'assemblyai'
        });

      } catch (assemblyError) {
        console.error('❌ AssemblyAI failed:', assemblyError.message);
        // Fall through to Hugging Face
      }
    }

    // Fallback to Hugging Face Whisper
    if (HF_API_KEY && HF_API_KEY !== 'your_hf_key_here') {
      console.log('🎯 Using Hugging Face Whisper...');
      
      const whisperResponse = await axios.post(
        'https://router.huggingface.co/hf-inference/models/openai/whisper-small',
        audioData,
        {
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/octet-stream',
          },
          timeout: 60000,
        }
      );

      const transcription = whisperResponse.data.text?.trim();
      
      if (!transcription) {
        throw new Error('Empty transcription received');
      }

      const processingTime = Date.now() - startTime;
      fs.unlinkSync(audioFilePath);

      console.log(`✅ Transcription successful (${processingTime}ms): "${transcription}"`);

      return res.json({
        transcription,
        detectedLanguage: targetLanguage,
        confidence: 0.9,
        processingTime,
        service: 'huggingface'
      });
    }

    // No API keys - return demo mode
    console.log('⚠️ No API keys configured, using demo mode');
    fs.unlinkSync(audioFilePath);
    
    return res.json({ 
      transcription: 'Remind me to take Aspirin 500mg at 9 AM daily',
      detectedLanguage: 'en',
      confidence: 1.0,
      processingTime: 100,
      demo: true,
      message: 'Add ASSEMBLYAI_API_KEY to .env for real transcription'
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    
    // Clean up file
    try {
      fs.unlinkSync(audioFilePath);
    } catch (e) {}

    return res.status(500).json({
      error: 'Transcription failed',
      message: error.message,
      code: 'TRANSCRIPTION_ERROR'
    });
  }
});

// Enhanced reminder parsing with conversation context
app.post('/parse-reminder-enhanced', async (req, res) => {
  const { text, language = 'en', context = null, conversationId = null } = req.body;
  
  console.log('🧠 Enhanced parsing request:');
  console.log(`📝 Text: "${text}"`);
  console.log(`🌐 Language: ${language}`);
  console.log(`💬 Conversation ID: ${conversationId}`);

  if (!text || text.trim() === '') {
    return res.status(400).json({ 
      error: 'No text provided',
      code: 'MISSING_TEXT' 
    });
  }

  const startTime = Date.now();

  // Try AI parsing first
  if (HF_API_KEY) {
    try {
      console.log('🤖 Using AI parser...');
      const aiResult = await parseReminderWithAI(text);
      const processingTime = Date.now() - startTime;
      
      return res.json({
        ...aiResult,
        aiPowered: true,
        processingTime
      });
    } catch (aiError) {
      console.warn('⚠️ AI parsing failed, falling back to regex:', aiError.message);
    }
  }
  
  // Fallback to regex parsing
  console.log('🎭 Using fallback parsing...');
  const demoResult = parseReminderFallback(text);
  const fallbackAnalysis = analyzeReminderCompleteness(demoResult);
  console.log('🎭 Fallback analysis result:', fallbackAnalysis);
  
  return res.json({
    ...fallbackAnalysis,
    demo: !HF_API_KEY,
    processingTime: Date.now() - startTime
  });
});

// Generate follow-up questions endpoint
app.post('/generate-question', async (req, res) => {
  const { incompleteData, language = 'en', conversationId = null } = req.body;

  console.log('❓ Generating follow-up question:');
  console.log(`📊 Incomplete data:`, incompleteData);
  console.log(`🌐 Language: ${language}`);

  if (!incompleteData || !incompleteData.missingFields || incompleteData.missingFields.length === 0) {
    return res.status(400).json({ 
      error: 'No missing fields provided',
      code: 'NO_MISSING_FIELDS' 
    });
  }

  // Demo mode fallback with predefined questions
  if (!HF_API_KEY) {
    console.log('🎭 Demo mode: Question generation');
    
    const questions = {
      en: {
        medicine: "What medicine do you need a reminder for?",
        time: "What time should I remind you to take it?",
        dosage: "What's the dosage amount (e.g., 500mg, 2 tablets)?",
        frequency: "How often should you take this medicine? (daily, twice daily, weekly, etc.)"
      },
      te: {
        medicine: "ఏ మందుకు రిమైండర్ కావాలి?",
        time: "ఎప్పుడు తీసుకోవాలని గుర్తు చేయాలి?",
        dosage: "ఎంత మోతాదు తీసుకోవాలి? (ఉదా: 500mg, 2 మాత్రలు)",
        frequency: "ఎంత సేపటికో ఈ మందు తీసుకోవాలి? (రోజూ, రోజుకు రెండుసార్లు, వారానికి, మొదలైనవి)"
      }
    };

    const missingField = incompleteData.missingFields[0];
    const question = questions[language]?.[missingField] || questions.en[missingField] || "Could you provide more details?";

    return res.json({
      question,
      language,
      expectedField: missingField,
      conversationId,
      demo: true,
      processingTime: 200
    });
  }

  const startTime = Date.now();

  try {
    const question = createQuestionPrompt(incompleteData, language);
    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Question generated: "${question}"`);
    console.log(`⏱️ Processing time: ${processingTime}ms`);

    res.json({
      question,
      language,
      expectedField: incompleteData.missingFields[0],
      conversationId,
      demo: false,
      processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Question generation error:', error.message);
    
    res.status(500).json({ 
      error: 'Question generation failed',
      message: error.message,
      code: 'QUESTION_GENERATION_ERROR',
      processingTime
    });
  }
});

// Get conversation context endpoint
app.get('/conversation/:id', (req, res) => {
  const conversationId = req.params.id;
  const conversation = activeConversations.get(conversationId);
  
  if (!conversation) {
    return res.status(404).json({ 
      error: 'Conversation not found',
      code: 'CONVERSATION_NOT_FOUND' 
    });
  }
  
  res.json({
    conversationId,
    ...conversation,
    isActive: true
  });
});

// Clear conversation context endpoint
app.delete('/conversation/:id', (req, res) => {
  const conversationId = req.params.id;
  const existed = activeConversations.delete(conversationId);
  
  res.json({
    conversationId,
    cleared: existed,
    timestamp: new Date().toISOString()
  });
});

// Generate adherence report using AI
app.post('/report', async (req, res) => {
  try {
    const entries = req.body.entries || [];
    const language = req.body.language || 'en';
    
    console.log(`📊 Generating report for ${entries.length} entries in ${language}`);

    if (!HF_API_KEY) {
      const demoReports = {
        en: `Based on your ${entries.length} medication entries, your overall adherence rate is approximately 85%. You're doing well with consistency! Consider setting up additional reminders for evening medications to improve your schedule.`,
        te: `మీ ${entries.length} మందుల ఎంట్రీల ఆధారంగా, మీ మొత్తం అనుసరణ రేటు సుమారు 85%. మీరు స్థిరత్వంతో బాగా చేస్తున్నారు! మీ షెడ్యూల్‌ను మెరుగుపరచడానికి సాయంత్రం మందుల కోసం అదనపు రిమైండర్లను సెట్ చేయడాన్ని పరిగణించండి.`
      };
      
      return res.json({
        report: demoReports[language] || demoReports.en,
        demo: true,
        language,
        processingTime: 1500
      });
    }

    const promptTemplates = {
      en: `Analyze this medication adherence data and provide a brief, encouraging summary (under 150 words) for the patient. Include overall adherence percentage and one actionable recommendation.`,
      te: `ఈ మందుల అనుసరణ డేటాను విశ్లేషించి రోగికి సంక్షిప్త, ప్రోత్సాహకరమైన సారాంశం అందించండి (150 పదాలలోపు). మొత్తం అనుసరణ శాతం మరియు ఒక కార్యాచరణ సిఫార్సును చేర్చండి.`
    };

    const prompt = `${promptTemplates[language] || promptTemplates.en}

Data:
${JSON.stringify(entries, null, 2)}

Response in ${language}:`;

    const startTime = Date.now();

    const response = await axios.post(
      'https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.2',
      {
        inputs: prompt,
        parameters: { max_new_tokens: 200, temperature: 0.7 }
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const report = response.data[0].generated_text.replace(prompt, '').trim();
    const processingTime = Date.now() - startTime;

    console.log(`✅ Report generated successfully in ${processingTime}ms`);
    
    res.json({ 
      report,
      demo: false,
      language,
      processingTime
    });

  } catch (error) {
    const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error('❌ AI report generation failed:', errorMessage);
    console.log('🎯 Falling back to rule-based report generation...');
    
    // Calculate basic adherence metrics
    const totalEntries = entries.length;
    const takenEntries = entries.filter(entry => entry.taken).length;
    const adherenceRate = totalEntries > 0 ? Math.round((takenEntries / totalEntries) * 100) : 0;
    
    const fallbackReports = {
      en: `Based on your ${totalEntries} medication entries, your adherence rate is ${adherenceRate}%. ${
        adherenceRate >= 90 ? 'Excellent job maintaining your medication schedule!' :
        adherenceRate >= 70 ? 'Good consistency! Consider setting additional reminders to improve further.' :
        'Your adherence could be improved. Try setting more frequent reminders or alarms.'
      } Keep tracking your medications to maintain good health habits.`,
      te: `మీ ${totalEntries} మందుల ఎంట్రీల ఆధారంగా, మీ అనుసరణ రేటు ${adherenceRate}%. ${
        adherenceRate >= 90 ? 'మీ మందుల షెడ్యూల్‌ను కొనసాగించడంలో అద్భుతమైన పని!' :
        adherenceRate >= 70 ? 'మంచి స్థిరత్వం! మరింత మెరుగుపరచడానికి అదనపు రిమైండర్లను సెట్ చేయడాన్ని పరిగణించండి.' :
        'మీ అనుసరణను మెరుగుపరచవచ్చు. మరింత తరచుగా రిమైండర్లు లేదా అలారాలు సెట్ చేయడానికి ప్రయత్నించండి.'
      } మంచి ఆరోగ్య అలవాట్లను కొనసాగించడానికి మీ మందులను ట్రాక్ చేయడం కొనసాగించండి.`
    };
    
    res.json({
      report: fallbackReports[language] || fallbackReports.en,
      demo: true,
      language,
      processingTime: 500,
      fallback: true,
      adherenceRate,
      originalError: 'AI model unavailable'
    });
  }
});

// AI Health Report endpoint
app.post('/generate-ai-report', async (req, res) => {
  const { medicationHistory, feedbackHistory } = req.body;

  console.log('📊 AI Report generation request');
  console.log(`📝 Medications: ${medicationHistory?.length || 0} entries`);
  console.log(`📝 Feedback: ${feedbackHistory?.length || 0} entries`);

  if (!medicationHistory || medicationHistory.length === 0) {
    return res.status(400).json({ 
      error: 'No medication history provided',
      code: 'MISSING_DATA' 
    });
  }

  const startTime = Date.now();

  // Try AI report generation
  if (HF_API_KEY) {
    try {
      console.log('🤖 Generating AI-powered health report...');
      const aiReport = await generateHealthReport(medicationHistory, feedbackHistory || []);
      const processingTime = Date.now() - startTime;
      
      return res.json({
        ...aiReport,
        aiPowered: true,
        processingTime
      });
    } catch (aiError) {
      console.warn('⚠️ AI report generation failed, using fallback:', aiError.message);
    }
  }

  // Fallback report
  console.log('🎭 Using fallback report generation...');
  const adherenceRate = calculateAdherenceRate(medicationHistory);
  const insights = generateBasicInsights(medicationHistory, feedbackHistory || []);
  
  console.log(`📝 Generated report length: ${insights.length} characters`);
  console.log(`📊 Adherence rate: ${adherenceRate}%`);
  
  const report = insights; // insights already has the full report with title
  
  return res.json({
    report,
    generatedAt: new Date().toISOString(),
    medicationCount: medicationHistory.length,
    adherenceRate,
    demo: !HF_API_KEY,
    processingTime: Date.now() - startTime
  });
});

function calculateAdherenceRate(history) {
  const taken = history.filter(h => h.status === 'taken').length;
  return history.length > 0 ? Math.round((taken / history.length) * 100) : 0;
}

function generateBasicInsights(history, feedbackHistory = []) {
  const totalTaken = history.filter(h => h.status === 'taken').length;
  const totalMissed = history.filter(h => h.status === 'missed').length;
  const totalMeds = history.length;
  const adherenceRate = totalMeds > 0 ? Math.round((totalTaken / totalMeds) * 100) : 0;
  
  // Group by medicine
  const medicineGroups = {};
  history.forEach(med => {
    const name = med.medicine || 'Unknown';
    if (!medicineGroups[name]) {
      medicineGroups[name] = { taken: 0, missed: 0, dosage: med.dosage, frequency: med.frequency };
    }
    if (med.status === 'taken') medicineGroups[name].taken++;
    if (med.status === 'missed') medicineGroups[name].missed++;
  });

  const getAdherenceEmoji = (rate) => {
    if (rate >= 90) return '🌟';
    if (rate >= 70) return '👍';
    if (rate >= 50) return '⚠️';
    return '🚨';
  };

  // Generate comprehensive report
  let report = `# 📊 Health & Medication Report\n\n`;
  report += `**Generated:** ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}\n\n`;
  
  // Overview
  report += `## 💊 Medication Overview\n\n`;
  report += `- **Overall Adherence:** ${adherenceRate}% ${getAdherenceEmoji(adherenceRate)}\n`;
  report += `- **Doses Taken:** ${totalTaken} ✅\n`;
  report += `- **Doses Missed:** ${totalMissed} ❌\n`;
  report += `- **Total Scheduled:** ${totalMeds}\n`;
  report += `- **Feedback Entries:** ${feedbackHistory.length} 💬\n\n`;
  
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
  if (feedbackHistory.length > 0) {
    report += `## 💬 Recent Feedback\n\n`;
    const recentFeedback = feedbackHistory.slice(-5); // Last 5 feedback entries
    recentFeedback.forEach(f => {
      const medName = history.find(h => h.medicationId === f.medicationId)?.medicine || 'Unknown';
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
  report += `\n*📝 Note: This is a comprehensive health report. For AI-powered personalized insights, ensure your server is configured with a valid Hugging Face API key.*\n`;

  return report;
}

// ============================================================================
// EMAIL NOTIFICATION ENDPOINTS (Caregiver Alerts)
// ============================================================================

/**
 * Send email alert when medication is missed
 * Uses a simple email API (for demo purposes)
 */
app.post('/send-caregiver-alert', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      to,
      caregiverName,
      patientName,
      medicineName,
      dosage,
      scheduledTime,
      missedDate
    } = req.body;

    console.log('📧 Caregiver alert request for:', to);

    const alertData = {
      to,
      subject: `⚠️ Medication Missed - ${patientName}`,
      html: `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #dc3545; border-radius: 10px;">
  <h2 style="color: #dc3545;">⚠️ Medication Alert</h2>
  
  <p>Dear <strong>${caregiverName}</strong>,</p>
  
  <p>This is an automated alert from the Voice-Based Medicine Reminder system.</p>
  
  <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>Patient:</strong> ${patientName}</p>
    <p><strong>Missed Medication:</strong> ${medicineName}</p>
    <p><strong>Dosage:</strong> ${dosage || 'As prescribed'}</p>
    <p><strong>Scheduled Time:</strong> ${scheduledTime}</p>
    <p><strong>Date:</strong> ${missedDate}</p>
  </div>
  
  <p>Please check on ${patientName} to ensure they take their medication as soon as possible.</p>
  
  <hr style="margin: 20px 0; border: none; border-top: 1px solid #dee2e6;">
  <p style="font-size: 12px; color: #6c757d;">Voice-Based Medicine Reminder System<br>Automated Alert - Do Not Reply</p>
</div>
      `.trim(),
      text: `
Dear ${caregiverName},

This is an automated alert from the Voice-Based Medicine Reminder system.

Patient: ${patientName}
Missed Medication: ${medicineName}
Dosage: ${dosage || 'As prescribed'}
Scheduled Time: ${scheduledTime}
Date: ${missedDate}

Please check on ${patientName} to ensure they take their medication as soon as possible.

---
Voice-Based Medicine Reminder System
Automated Alert - Do Not Reply
      `.trim()
    };

    // Try to send email if configured
    if (emailTransporter) {
      try {
        console.log('📧 Sending email to:', to);
        
        const info = await emailTransporter.sendMail({
          from: `"Medicine Reminder" <${EMAIL_USER}>`,
          to: to,
          subject: alertData.subject,
          text: alertData.text,
          html: alertData.html
        });

        console.log('✅ Email sent successfully:', info.messageId);
        
        res.json({
          success: true,
          message: 'Caregiver alert sent successfully',
          emailId: info.messageId,
          processingTime: Date.now() - startTime
        });
      } catch (emailError) {
        console.error('❌ Email sending failed:', emailError);
        res.status(500).json({
          success: false,
          error: 'Failed to send email',
          details: emailError.message
        });
      }
    } else {
      // Demo mode - log only
      console.log('📋 Email content (DEMO MODE):');
      console.log('To:', to);
      console.log('Subject:', alertData.subject);
      console.log('Message:', alertData.text);
      
      res.json({
        success: true,
        message: 'Alert logged (demo mode - email not sent)',
        alert: alertData,
        demo: true,
        note: 'Configure EMAIL_USER and EMAIL_PASS in .env to enable real email sending',
        processingTime: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('❌ Caregiver alert error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send daily missed medications report
 */
app.post('/send-daily-report', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const {
      to,
      caregiverName,
      patientName,
      missedMedications,
      reportDate
    } = req.body;

    console.log('📧 Daily report request for:', to);

    const medicationsList = missedMedications
      .map((med, idx) => `${idx + 1}. ${med.medicine} (${med.dosage || 'As prescribed'}) at ${med.time}`)
      .join('\n');

    const reportData = {
      to,
      subject: `📊 Daily Medication Report - ${patientName}`,
      message: `
Dear ${caregiverName},

Here is the daily medication report for ${patientName}.

**Report Date**: ${reportDate}
**Total Missed Medications**: ${missedMedications.length}

**Missed Medications**:
${medicationsList}

Please follow up with ${patientName} regarding these missed doses.

---
Voice-Based Medicine Reminder System
Daily Report - Do Not Reply
      `.trim()
    };

    console.log('✉️ Daily report prepared:', reportData);

    // If email transport is configured, send the report
    if (emailTransporter) {
      try {
        const info = await emailTransporter.sendMail({
          from: `"Medicine Reminder" <${EMAIL_USER}>`,
          to: to,
          subject: reportData.subject,
          text: reportData.message,
          html: `<pre style="font-family: Arial, sans-serif;">${reportData.message.replace(/\n/g, '<br/>')}</pre>`
        });

        console.log('✅ Daily report email sent:', info.messageId);
        return res.json({
          success: true,
          message: 'Daily report sent',
          emailId: info.messageId,
          processingTime: Date.now() - startTime
        });
      } catch (emailError) {
        console.error('❌ Failed to send daily report email:', emailError);
        return res.status(500).json({ success: false, error: emailError.message });
      }
    }

    // Demo fallback
    res.json({
      success: true,
      message: 'Daily report prepared (demo mode)',
      report: reportData,
      demo: true,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('❌ Daily report error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * Generic send-email endpoint used by client services
 */
app.post('/send-email', async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    console.log('📧 /send-email request for:', to);

    if (emailTransporter) {
      try {
        const info = await emailTransporter.sendMail({
          from: `"Medicine Reminder" <${EMAIL_USER}>`,
          to,
          subject,
          text,
          html
        });
        console.log('✅ Email sent via /send-email:', info.messageId);
        return res.json({ success: true, emailId: info.messageId });
      } catch (err) {
        console.error('❌ /send-email failed:', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Demo mode: log and return success
    console.log('📋 /send-email DEMO MODE - email content:', { to, subject, text });
    return res.json({ success: true, demo: true, message: 'Email logged (demo mode)' });
  } catch (error) {
    console.error('❌ /send-email error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Test email configuration
 */
app.post('/test-email', async (req, res) => {
  try {
    const { to } = req.body;

    console.log('📧 Email test request for:', to);

    const testData = {
      to,
      subject: '✅ Email Test - Voice Medicine Reminder',
      message: 'This is a test email from the Voice-Based Medicine Reminder system. Email notifications are working correctly!'
    };

    res.json({
      success: true,
      message: 'Email test successful (demo mode)',
      test: testData,
      demo: true,
      note: 'Integrate with real email service for production use'
    });

  } catch (error) {
    console.error('❌ Email test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Server startup
const PORT = process.env.PORT || 3333;

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Enhanced AI Medicine Reminder Server Started');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  
  // Display available network interfaces
  try {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`🌐 LAN access: http://${net.address}:${PORT}/health`);
        }
      }
    }
  } catch (e) {
    console.log("📍 Could not determine LAN address");
  }
  
  console.log('🎯 Available endpoints:');
  console.log('   GET  /health - Server status');
  console.log('   POST /transcribe-enhanced - Audio transcription');
  console.log('   POST /parse-reminder-enhanced - Parse medicine reminders');
  console.log('   POST /generate-question - Generate follow-up questions');
  console.log('   POST /report - Generate adherence reports');
  console.log('   GET  /conversation/:id - Get conversation context');
  console.log('   DELETE /conversation/:id - Clear conversation');
  
  if (!HF_API_KEY) {
    console.log('⚠️  Running in DEMO MODE - Set HF_API_KEY for full AI features');
  } else {
    console.log('🤖 AI features enabled with Hugging Face integration');
  }
});
