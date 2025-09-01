import * as Speech from 'expo-speech';

class TTSService {
  static async speak(text, options = {}) {
    try {
      const defaultOptions = {
        language: 'en-US',
        pitch: 1.0,
        rate: 0.8,
        volume: 1.0,
      };

      const speechOptions = { ...defaultOptions, ...options };

      return new Promise((resolve, reject) => {
        Speech.speak(text, {
          ...speechOptions,
          onDone: resolve,
          onError: reject,
        });
      });
    } catch (error) {
      console.error('TTS Error:', error);
      throw error;
    }
  }

  static stop() {
    Speech.stop();
  }
}

export default TTSService;
