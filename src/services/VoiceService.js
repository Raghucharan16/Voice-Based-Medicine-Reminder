import { Audio } from 'expo-av';

class VoiceService {
  constructor() {
    this.recording = null;
    this.isRecording = false;
  }

  // For components that call startRecording()
  async startRecording() {
    try {
      // Cancel any existing recording first
      if (this.recording) {
        try {
          await this.recording.stopAndUnloadAsync();
        } catch (e) {
          console.log('Cleaned up previous recording');
        }
        this.recording = null;
      }

      console.log('📱 Requesting microphone permission...');
      const permission = await Audio.requestPermissionsAsync();
      
      if (!permission.granted) {
        throw new Error('Microphone permission denied');
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      console.log('🎤 Starting recording...');
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      this.recording = recording;
      this.isRecording = true;
      
      console.log('✅ Recording started');
      return recording; // Return recording object, not boolean

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      this.recording = null;
      this.isRecording = false;
      throw error;
    }
  }

  // For components that call startListening() - same as startRecording
  async startListening() {
    return this.startRecording();
  }

  async stopRecording() {
    try {
      if (!this.recording) {
        throw new Error('No active recording');
      }

      console.log('⏹️ Stopping recording...');
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      
      this.recording = null;
      this.isRecording = false;

      console.log('✅ Recording saved:', uri);
      return uri;

    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      this.recording = null;
      this.isRecording = false;
      throw error;
    }
  }

  async cancelRecording() {
    try {
      if (this.recording) {
        await this.recording.stopAndUnloadAsync();
        this.recording = null;
      }
      this.isRecording = false;
      console.log('🚫 Recording cancelled');
    } catch (error) {
      console.error('Failed to cancel recording:', error);
    }
  }

  getRecordingStatus() {
    return this.isRecording;
  }
}

export default new VoiceService();