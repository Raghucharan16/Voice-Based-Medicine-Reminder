import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

const VoiceRecorder = {
  async recordAndSave() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission required');

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();

      // record for up to 10 seconds for demo
      await new Promise(r => setTimeout(r, 4000));
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      // persist to app document dir
      const dest = FileSystem.documentDirectory + 'lastRecording.wav';
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    } catch (e) {
      console.warn('record error', e);
      return null;
    }
  }
};

export default VoiceRecorder;
