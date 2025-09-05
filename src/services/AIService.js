import axios from 'axios';
import * as FileSystem from 'expo-file-system';

import Constants from 'expo-constants';

// --- Dynamic IP Detection ---
// This function automatically finds the IP of the machine running the Metro server.
function getLocalIp() {
  const debuggerHost = Constants.manifest?.debuggerHost;
  if (debuggerHost) {
    return debuggerHost.split(':').shift();
  }
  // Fallback for safety, but the above should work in Expo Go.
  console.warn("Could not dynamically determine server IP. Falling back to hardcoded address.");
  return '192.168.1.18'; 
}

const SERVER_URL = `http://${getLocalIp()}:3333`;
console.log(`Connecting to server at: ${SERVER_URL}`);

class AIService {
  static async checkHealth() {
    try {
      const response = await fetch(`${SERVER_URL}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  static async transcribeAudio(audioUri) {
    try {
      if (!audioUri) {
        throw new Error('No audio file provided');
      }

      const fileInfo = await FileSystem.getInfoAsync(audioUri);
      if (!fileInfo.exists) {
        throw new Error('Audio file does not exist');
      }

      console.log('Uploading audio file:', audioUri);

      const formData = new FormData();
      formData.append('audio', {
        uri: audioUri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      });

      const response = await fetch(`${SERVER_URL}/transcribe`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorBody}`);
      }

      const result = await response.json();
      return result.transcription || 'No transcription available';

    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }

  static async parseReminderText(text) {
    try {
      const response = await axios.post(`${SERVER_URL}/parse-reminder`, { text });
      return response.data; // Should be { medicine: "...", time: "..." }
    } catch (error) {
      console.error('Reminder parsing error:', error);
      throw error;
    }
  }

  static async generateReport(medicineData) {
    try {
      const response = await axios.post(`${SERVER_URL}/report`, {
        entries: medicineData,
      });

      return response.data.report || 'No report generated';
    } catch (error) {
      console.error('Report generation error:', error);
      throw error;
    }
  }
}

export default AIService;
