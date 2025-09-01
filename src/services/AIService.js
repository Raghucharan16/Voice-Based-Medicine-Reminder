import axios from 'axios';
import * as FileSystem from 'expo-file-system';

// IMPORTANT: Replace this with your PC's actual LAN IP address.
// You can find it by running `ipconfig` in the command prompt.
const SERVER_URL = 'http://192.168.1.23:3333';

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
