/**
 * AI-Powered Reminder Parser using Hugging Face
 * Uses TWO models for optimal performance:
 * 1. SambaNova Llama-3.1-8B (fast, free) - Medicine extraction
 * 2. DeepSeek-V3 (powerful) - Comprehensive AI reports
 */

const { HfInference } = require('@huggingface/inference');

const HF_API_KEY = process.env.HF_API_KEY || process.env.HF_TOKEN;

// Model configuration
const PARSING_MODEL = {
  provider: 'sambanova',
  model: 'meta-llama/Llama-3.1-8B-Instruct'
};

const REPORT_MODEL = 'deepseek-ai/DeepSeek-V3';

// Initialize Hugging Face client
let hfClient = null;
if (HF_API_KEY) {
  hfClient = new HfInference(HF_API_KEY);
  console.log('✅ Hugging Face client initialized');
  console.log('   📋 Parsing: SambaNova Llama-3.1-8B (fast & reliable)');
  console.log('   📊 Reports: DeepSeek-V3 (comprehensive)');
} else {
  console.warn('⚠️ HF_API_KEY/HF_TOKEN not set - AI features will use fallback parsing');
}

/**
 * Check if AI service is available
 */
function isAIAvailable() {
  return hfClient !== null && HF_API_KEY !== undefined;
}

/**
 * Get API status information
 */
function getAPIStatus() {
  return {
    available: isAIAvailable(),
    parsingModel: `${PARSING_MODEL.provider}/${PARSING_MODEL.model}`,
    reportModel: REPORT_MODEL,
    apiKeySet: !!HF_API_KEY,
    provider: 'Hugging Face Inference API'
  };
}

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms (doubles each retry)
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMsg = error.message || String(error);
      
      // Don't retry on authentication errors
      if (errorMsg.includes('authentication') || errorMsg.includes('unauthorized') || errorMsg.includes('API key')) {
        console.error('❌ Authentication error, not retrying:', errorMsg);
        throw error;
      }
      
      if (isLastAttempt) {
        console.error(`❌ All ${maxRetries} retry attempts failed`);
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`⚠️ Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Parse reminder using AI with DeepSeek-V3
 */
async function parseReminderWithAI(text) {
  if (!hfClient) {
    throw new Error('HF client not initialized');
  }

  try {
    console.log('🤖 Using DeepSeek-V3 to parse:', text);

    const systemPrompt = `You are a medication reminder assistant. Extract medication details from user messages and return ONLY valid JSON.

CRITICAL RULES FOR MEDICINE NAME:
1. Extract the FULL medicine/supplement/item name (e.g., "Vitamin B", "Orange juice", "Aspirin 100mg")
2. Include brand names, vitamin names, supplement names, or any consumable item
3. "vitamin B tablet" → medicine="Vitamin B" (NOT just "tablet")
4. "orange juice" → medicine="Orange juice" (NOT generic "medicine")
5. "aspirin" → medicine="Aspirin"
6. The medicine field should NEVER be generic words like "tablet", "medicine", "pill", "capsule"
7. If user says "juice", "water", "tea" etc. → that IS the medicine name
8. Always capture the complete name before generic terms (tablet/capsule/syrup)

Output format:
{
  "medicine": "FULL name of medicine/supplement/item (REQUIRED)",
  "dosage": "amount (e.g., 500mg, 2 tablets, 1 glass) or null",
  "time": "12-hour format (e.g., 9:00 AM) or null",
  "frequency": "once|daily|twice daily|weekly|monthly or null",
  "date": "YYYY-MM-DD or null",
  "dayOfWeek": "Monday|Tuesday|etc or null",
  "isComplete": true or false,
  "missingFields": ["list of missing fields"]
}

Frequency Rules:
- "tomorrow" → frequency="once", calculate tomorrow's date
- "every Friday" → frequency="weekly", dayOfWeek="Friday"
- "once"/"one time" → frequency="once"
- "daily"/"every day" → frequency="daily"
- "twice" → frequency="twice daily"

Completeness Rules:
- isComplete=true ONLY if medicine AND time are present (dosage optional for drinks/supplements)
- isComplete=false if medicine name is generic (tablet/pill/medicine) or missing
- Today's date: ${new Date().toISOString().split('T')[0]}

Examples:
- "take vitamin B tablet at 9 AM daily" → medicine="Vitamin B", dosage="1 tablet", time="9:00 AM", frequency="daily"
- "remind me to drink juice at 7 AM" → medicine="Juice", dosage="1 glass", time="7:00 AM"
- "aspirin 100mg twice daily" → medicine="Aspirin", dosage="100mg", frequency="twice daily"

Return ONLY the JSON object, no explanation.`;

    // Try SambaNova Llama first (fast)
    try {
      console.log('🚀 Using SambaNova Llama-3.1-8B for parsing...');
      const chatCompletion = await retryWithBackoff(async () => {
        return await hfClient.chatCompletion({
          provider: PARSING_MODEL.provider,
          model: PARSING_MODEL.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
          ],
          max_tokens: 300,
          temperature: 0.3
        });
      }, 2, 1000);

      const aiResponse = chatCompletion.choices[0].message.content;
      console.log('🤖 SambaNova Llama response:', aiResponse);
      
      // Continue with parsing...
      return await parseAIResponse(aiResponse, text);
      
    } catch (sambaNovaError) {
      console.warn('⚠️ SambaNova failed, trying DeepSeek-V3...', sambaNovaError.message);
      
      // Fallback to DeepSeek-V3
      try {
        const chatCompletion = await retryWithBackoff(async () => {
          return await hfClient.chatCompletion({
            model: REPORT_MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text }
            ],
            max_tokens: 300,
            temperature: 0.3
          });
        }, 2, 1000);

        const aiResponse = chatCompletion.choices[0].message.content;
        console.log('🤖 DeepSeek-V3 response:', aiResponse);
        
        // Continue with parsing...
        return await parseAIResponse(aiResponse, text);
        
      } catch (deepSeekError) {
        console.error('❌ Both AI models failed:', deepSeekError.message);
        throw deepSeekError; // Will trigger fallback to regex
      }
    }
    
  } catch (error) {
    console.error('❌ AI parsing error:', error);
    throw error;
  }
}

// Helper function to parse AI response (avoid code duplication)
async function parseAIResponse(aiResponse, originalText) {
  // Extract JSON from response
  let jsonText = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('No JSON found in AI response');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  
  // Post-processing: Extract date and day from text if AI missed it
  const lowerText = originalText.toLowerCase();
  let calculatedDate = parsed.date || null;
  let dayOfWeek = parsed.dayOfWeek || null;
  let frequency = parsed.frequency || null;

  // Handle "tomorrow"
  if (lowerText.includes('tomorrow')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    calculatedDate = tomorrow.toISOString().split('T')[0];
    frequency = 'once';
  }

  // Handle "today"
  if (lowerText.includes('today')) {
    calculatedDate = new Date().toISOString().split('T')[0];
    frequency = 'once';
  }

  // Handle "every [day]" pattern for weekly reminders
  const everyDayPattern = /every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  const everyDayMatch = lowerText.match(everyDayPattern);
  if (everyDayMatch) {
    dayOfWeek = everyDayMatch[1].charAt(0).toUpperCase() + everyDayMatch[1].slice(1);
    frequency = 'weekly';
  }

  // Validate and normalize
  const result_data = {
    medicine: parsed.medicine || null,
    dosage: parsed.dosage || null,
    time: parsed.time || null,
    frequency: frequency,
    date: calculatedDate,
    dayOfWeek: dayOfWeek,
    isComplete: parsed.isComplete === true,
    missingFields: parsed.missingFields || []
  };

  // Ensure missingFields is accurate
  result_data.missingFields = [];
  if (!result_data.medicine) result_data.missingFields.push('medicine');
  if (!result_data.time) result_data.missingFields.push('time');
  if (!result_data.dosage) result_data.missingFields.push('dosage');
  
  result_data.isComplete = result_data.missingFields.length === 0;

  console.log('✅ AI parsed result:', result_data);
  return result_data;
}

/**
 * Generate AI health report
 */
async function generateHealthReport(medicationHistory, feedbackHistory = []) {
  try {
    console.log('📊 Generating health report with DeepSeek-V3...');
    console.log('📊 Medication data:', medicationHistory.length, 'records');
    console.log('📊 Feedback data:', feedbackHistory.length, 'records');

    // Prepare medication summary with detailed history
    const medicineGroups = {};
    medicationHistory.forEach(med => {
      const name = med.medicine || 'Unknown';
      if (!medicineGroups[name]) {
        medicineGroups[name] = { 
          taken: 0, 
          missed: 0, 
          dosage: med.dosage || 'As prescribed',
          frequency: med.frequency || 'Daily',
          recentEvents: []
        };
      }
      if (med.status === 'taken') medicineGroups[name].taken++;
      if (med.status === 'missed') medicineGroups[name].missed++;
      
      // Store recent events for context
      medicineGroups[name].recentEvents.push({
        status: med.status,
        scheduledTime: med.scheduledTime,
        actualTime: med.actualTime,
        delay: med.delay || 0
      });
    });

    const medicationSummary = Object.entries(medicineGroups).map(([name, data]) => {
      const total = data.taken + data.missed;
      const adherence = total > 0 ? Math.round((data.taken / total) * 100) : 0;
      const avgDelay = data.recentEvents
        .filter(e => e.status === 'taken')
        .reduce((sum, e) => sum + (e.delay || 0), 0) / (data.taken || 1);
      return `${name} (${data.dosage}, ${data.frequency}): ${adherence}% adherence (${data.taken} taken, ${data.missed} missed, avg delay: ${Math.round(avgDelay)} min)`;
    }).join('\n');

    // Prepare feedback summary
    const feedbackSummary = feedbackHistory.length > 0
      ? feedbackHistory.slice(-10).map(f => {
          const medName = medicationHistory.find(m => m.id === f.medicationId)?.medicine || 'Unknown';
          return `- ${medName}: "${f.feedback}" (${f.sentiment || 'neutral'}) at ${new Date(f.timestamp).toLocaleString()}`;
        }).join('\n')
      : 'No feedback recorded yet';

    const totalTaken = medicationHistory.filter(m => m.status === 'taken').length;
    const totalMissed = medicationHistory.filter(m => m.status === 'missed').length;
    const overallAdherence = medicationHistory.length > 0 
      ? Math.round((totalTaken / medicationHistory.length) * 100) 
      : 0;

    if (!hfClient) {
      throw new Error('HF client not initialized - missing API key');
    }

    const systemPrompt = `You are a professional healthcare assistant. Generate comprehensive health reports in markdown format with specific dietary and exercise recommendations. Use the complete medication history including timing, delays, misses, and patient feedback to provide personalized insights.`;

    const userPrompt = `Generate a detailed health report for this patient:

**Medication Profile:**
- Overall Adherence: ${overallAdherence}%
- Total Doses: ${medicationHistory.length} (${totalTaken} taken, ${totalMissed} missed)
- Report Date: ${new Date().toLocaleDateString()}

**Medications with Detailed History:**
${medicationSummary}

**Recent Patient Feedback:**
${feedbackSummary}

**Behavioral Insights:**
- Recent missed medications: ${totalMissed}
- Recent taken medications: ${totalTaken}
- Feedback entries: ${feedbackHistory.length}

Create a comprehensive markdown report with:
1. Medication Overview (overall status, trends, improvements/concerns)
2. Individual Medication Details (per-medicine adherence, timing patterns)
3. Health Insights (personalized based on adherence, feedback, and timing patterns)
4. Dietary Recommendations (7+ foods to include, 4+ to avoid, meal timing tips related to medications)
5. Exercise Suggestions (4+ activities with duration/frequency/intensity, considering medication schedule)
6. Important Reminders (6+ safety items based on their medications)
7. Action Items (5+ next steps to improve adherence and health)

Make it comprehensive (2500+ characters), professional, and actionable. Use emojis appropriately. Base recommendations on the actual medication history and feedback provided.`;

    // Use DeepSeek-V3 for comprehensive reports with retry logic
    console.log('🚀 Using DeepSeek-V3 for comprehensive report generation...');
    const chatCompletion = await retryWithBackoff(async () => {
      return await hfClient.chatCompletion({
        model: REPORT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });
    }, 3, 2000); // 3 retries, starting with 2 second delay

    const report = chatCompletion.choices[0].message.content.trim();
    
    console.log('✅ DeepSeek-V3 report generated, length:', report.length);
    return {
      report,
      generatedAt: new Date().toISOString(),
      medicationCount: medicationHistory.length,
      aiPowered: true
    };

  } catch (error) {
    console.error('❌ AI report generation failed:', error);
    throw error;
  }
}

module.exports = {
  parseReminderWithAI,
  generateHealthReport,
  isAIAvailable,
  getAPIStatus
};
