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
