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

const HF_API_KEY = process.env.HF_API_KEY;

if (!HF_API_KEY) {
  console.warn('Warning: HF_API_KEY not set. All AI features will be in demo mode.');
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
  
  // Medicine extraction
  const medicines = [
    'paracetamol', 'acetaminophen', 'tylenol',
    'aspirin', 'ibuprofen', 'advil', 'motrin',
    'insulin', 'metformin', 'blood pressure',
    'vitamin d', 'vitamin c', 'calcium',
    'antibiotics', 'medicine', 'medication',
    'pill', 'tablet', 'capsule'
  ];
  
  let medicine = null;
  for (const med of medicines) {
    if (lowercaseText.includes(med)) {
      medicine = med.charAt(0).toUpperCase() + med.slice(1);
      break;
    }
  }
  
  // Time extraction
  let time = null;
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,
    /(\d{1,2})\s*(am|pm)/i,
    /(\d{1,2})\s*o'?clock/i,
    /(morning|evening|night|afternoon)/i
  ];
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[3]) { // Has AM/PM
        time = `${match[1]}:${match[2] || '00'} ${match[3].toUpperCase()}`;
      } else if (match[2] && match[2].toLowerCase() === 'am' || match[2].toLowerCase() === 'pm') {
        time = `${match[1]}:00 ${match[2].toUpperCase()}`;
      } else if (match[1]) {
        const timeOfDay = match[1].toLowerCase();
        if (timeOfDay === 'morning') time = '8:00 AM';
        else if (timeOfDay === 'afternoon') time = '2:00 PM';
        else if (timeOfDay === 'evening') time = '6:00 PM';
        else if (timeOfDay === 'night') time = '10:00 PM';
        else time = `${match[1]}:00 ${parseInt(match[1]) < 12 ? 'AM' : 'PM'}`;
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
  
  // Frequency extraction
  let frequency = null;
  const frequencyPatterns = [
    /daily|every day|once a day/i,
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
      if (matchedText.includes('daily') || matchedText.includes('once a day') || matchedText.includes('every day')) {
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
  const targetLanguage = req.body.language || 'auto';
  
  console.log(`🔊 Processing audio file: ${path.basename(audioFilePath)}`);
  console.log(`🌐 Target language: ${targetLanguage}`);

  // Demo mode fallback
  if (!HF_API_KEY) {
    console.log('🎭 Demo mode: Returning mock transcription');
    fs.unlinkSync(audioFilePath);
    
    const mockResponses = {
      en: 'Remind me to take Paracetamol 500mg at 10 PM daily',
      te: 'రోజూ రాత్రి 10 గంటలకు పారాసిటమాల్ 500mg తీసుకోవాలని గుర్తు చేయండి'
    };
    
    return res.json({ 
      transcription: mockResponses[targetLanguage] || mockResponses.en,
      detectedLanguage: targetLanguage === 'auto' ? 'en' : targetLanguage,
      confidence: 0.95,
      processingTime: 1200,
      demo: true
    });
  }

  const startTime = Date.now();

  try {
    const audioData = fs.readFileSync(audioFilePath);
    console.log(`📊 Audio file size: ${(audioData.length / 1024).toFixed(2)} KB`);

    const whisperResponse = await axios.post(
      'https://api-inference.huggingface.co/models/openai/whisper-large-v3',
      audioData,
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'audio/x-m4a',
        },
        timeout: 90000,
      }
    );

    const transcription = whisperResponse.data.text?.trim();
    
    if (!transcription) {
      throw new Error('Empty transcription received from Whisper');
    }

    const detectedLanguage = targetLanguage === 'auto' ? detectLanguage(transcription) : targetLanguage;
    const processingTime = Date.now() - startTime;

    console.log(`✅ Transcription successful: "${transcription}"`);
    console.log(`🌐 Detected language: ${detectedLanguage}`);
    console.log(`⏱️ Processing time: ${processingTime}ms`);

    res.json({ 
      transcription,
      detectedLanguage,
      confidence: 0.9,
      processingTime,
      demo: false
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    
    console.error('❌ Enhanced transcription error:', errorMessage);
    console.error(`⏱️ Failed after: ${processingTime}ms`);
    
    res.status(500).json({ 
      error: 'Transcription failed', 
      message: errorMessage,
      code: 'TRANSCRIPTION_ERROR',
      processingTime
    });
  } finally {
    if (fs.existsSync(audioFilePath)) {
      fs.unlinkSync(audioFilePath);
      console.log('🗑️ Temporary audio file cleaned up');
    }
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

  // Enhanced demo/fallback mode
  const shouldUseFallback = !HF_API_KEY;
  
  if (shouldUseFallback) {
    console.log('🎭 Using enhanced fallback parsing...');
    
    const demoResult = parseReminderFallback(text);
    const analysisResult = analyzeReminderCompleteness(demoResult);
    console.log('🎭 Fallback analysis result:', analysisResult);
    
    return res.json({
      ...analysisResult,
      demo: true,
      processingTime: 800
    });
  }

  const startTime = Date.now();
  const prompt = createEnhancedPrompt(text, language, context);

  try {
    console.log('🚀 Sending request to Mistral AI...');
    
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      {
        inputs: prompt,
        parameters: { 
          max_new_tokens: 200, 
          temperature: 0.1,
          do_sample: false,
          return_full_text: false
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const generatedText = response.data[0]?.generated_text?.replace(prompt, '').trim();
    console.log('🤖 Raw AI response:', generatedText);

    if (!generatedText) {
      throw new Error('Empty response from AI model');
    }

    // Extract JSON from response
    const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError.message);
      throw new Error('Invalid JSON format from AI model');
    }

    const analysisResult = analyzeReminderCompleteness(parsedResult);
    const processingTime = Date.now() - startTime;

    // Store conversation context if needed
    if (conversationId && analysisResult.conversationContext) {
      activeConversations.set(conversationId, {
        ...analysisResult.conversationContext,
        lastUpdated: new Date(),
        language
      });
    }

    console.log('✅ Enhanced parsing successful:', analysisResult);
    console.log(`⏱️ Processing time: ${processingTime}ms`);

    res.json({
      ...analysisResult,
      demo: false,
      processingTime
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    
    console.error('❌ AI parsing failed:', errorMessage);
    console.log('🎯 Falling back to enhanced parsing...');
    
    // Fall back to enhanced rule-based parsing
    const fallbackResult = parseReminderFallback(text);
    const analysisResult = analyzeReminderCompleteness(fallbackResult);
    
    console.log('✅ Fallback parsing successful:', analysisResult);
    
    res.json({
      ...analysisResult,
      demo: true,
      processingTime,
      fallback: true,
      originalError: 'AI model unavailable'
    });
  }
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
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
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
