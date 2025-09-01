import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

class VoiceService {
  static recording = null;

  static async requestPermissions() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Microphone permission required');
      }
      return true;
    } catch (error) {
      console.error('Permission error:', error);
      throw error;
    }
  }

  static async startRecording() {
    try {
      // Request permissions first
      await this.requestPermissions();

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create recording instance
      this.recording = new Audio.Recording();
      
      const recordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      };

      await this.recording.prepareToRecordAsync(recordingOptions);
      await this.recording.startAsync();

      // Record for 5 seconds
      setTimeout(async () => {
        await this.stopRecording();
      }, 5000);

      return new Promise((resolve) => {
        this.recordingResolve = resolve;
      });

    } catch (error) {
      console.error('Recording error:', error);
      throw error;
    }
  }

  static async stopRecording() {
    try {
      if (!this.recording) {
        return null;
      }

      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      // Copy to a persistent location
      const fileName = `recording_${Date.now()}.m4a`;
      const newUri = FileSystem.documentDirectory + fileName;
      
      if (uri) {
        await FileSystem.copyAsync({
          from: uri,
          to: newUri,
        });
        
        if (this.recordingResolve) {
          this.recordingResolve(newUri);
        }
        
        return newUri;
      }
      
      return null;
    } catch (error) {
      console.error('Stop recording error:', error);
      throw error;
    }
  }
}

export default VoiceService;
