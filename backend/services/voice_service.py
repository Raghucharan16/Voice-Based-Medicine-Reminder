"""
Voice processing service using HuggingFace Whisper and pyttsx3
"""

import os
import io
import wave
import tempfile
import threading
from typing import Optional, Dict, Any
import logging

# Disable heavy imports for now to prevent crashes
DEPENDENCIES_AVAILABLE = False
print(f"⚠️  Voice dependencies disabled to prevent import crashes")

class VoiceService:
    """Service for handling voice processing operations"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.whisper_model = None
        self.whisper_processor = None
        self.tts_engine = None
        self.recognizer = None
        self.microphone = None
        self.is_initialized = False
        
        if DEPENDENCIES_AVAILABLE:
            self._initialize_services()
    
    def _initialize_services(self):
        """Initialize all voice services"""
        try:
            # Initialize Whisper for speech-to-text
            self._initialize_whisper()
            
            # Initialize TTS engine
            self._initialize_tts()
            
            # Initialize speech recognition
            self._initialize_speech_recognition()
            
            self.is_initialized = True
            logging.info("✅ Voice services initialized successfully")
            
        except Exception as e:
            logging.error(f"❌ Failed to initialize voice services: {e}")
            self.is_initialized = False
    
    def _initialize_whisper(self):
        """Initialize Whisper model for speech-to-text"""
        try:
            model_name = self.config.get('whisper_model', 'openai/whisper-base')
            
            logging.info(f"🔄 Loading Whisper model: {model_name}")
            self.whisper_processor = WhisperProcessor.from_pretrained(model_name)
            self.whisper_model = WhisperForConditionalGeneration.from_pretrained(model_name)
            
            # Move to GPU if available
            if torch.cuda.is_available():
                self.whisper_model = self.whisper_model.cuda()
                logging.info("🚀 Whisper model moved to GPU")
            
            logging.info("✅ Whisper model loaded successfully")
            
        except Exception as e:
            logging.error(f"❌ Failed to initialize Whisper: {e}")
            raise
    
    def _initialize_tts(self):
        """Initialize text-to-speech engine"""
        try:
            self.tts_engine = pyttsx3.init()
            
            # Configure TTS settings
            rate = self.config.get('tts_voice_rate', 150)
            volume = self.config.get('tts_voice_volume', 0.9)
            
            self.tts_engine.setProperty('rate', rate)
            self.tts_engine.setProperty('volume', volume)
            
            # Try to set a more natural voice
            voices = self.tts_engine.getProperty('voices')
            if voices:
                # Prefer female voice for medicine reminders
                for voice in voices:
                    if 'female' in voice.name.lower() or 'zira' in voice.name.lower():
                        self.tts_engine.setProperty('voice', voice.id)
                        break
            
            logging.info("✅ TTS engine initialized successfully")
            
        except Exception as e:
            logging.error(f"❌ Failed to initialize TTS: {e}")
            raise
    
    def _initialize_speech_recognition(self):
        """Initialize speech recognition"""
        try:
            self.recognizer = sr.Recognizer()
            self.microphone = sr.Microphone()
            
            # Adjust for ambient noise
            with self.microphone as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=1)
            
            logging.info("✅ Speech recognition initialized successfully")
            
        except Exception as e:
            logging.error(f"❌ Failed to initialize speech recognition: {e}")
            # Don't raise here as this is not critical
    
    def transcribe_audio_file(self, audio_file_path: str, language: str = 'en') -> Dict[str, Any]:
        """
        Transcribe audio file using Whisper
        
        Args:
            audio_file_path: Path to audio file
            language: Language code for transcription
            
        Returns:
            Dictionary with transcription results
        """
        if not self.is_initialized or not self.whisper_model:
            return {
                'success': False,
                'error': 'Whisper model not initialized',
                'text': ''
            }
        
        try:
            # Load and preprocess audio
            audio, sample_rate = librosa.load(audio_file_path, sr=16000)
            
            # Process with Whisper
            input_features = self.whisper_processor(
                audio, 
                sampling_rate=16000, 
                return_tensors="pt"
            ).input_features
            
            # Move to GPU if available
            if torch.cuda.is_available():
                input_features = input_features.cuda()
            
            # Generate transcription
            with torch.no_grad():
                predicted_ids = self.whisper_model.generate(input_features)
            
            # Decode transcription
            transcription = self.whisper_processor.batch_decode(
                predicted_ids, 
                skip_special_tokens=True
            )[0]
            
            logging.info(f"📝 Transcribed: {transcription}")
            
            return {
                'success': True,
                'text': transcription.strip(),
                'confidence': 0.9,  # Whisper doesn't provide confidence scores
                'language': language
            }
            
        except Exception as e:
            logging.error(f"❌ Transcription failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'text': ''
            }
    
    def transcribe_audio_bytes(self, audio_bytes: bytes, format: str = 'wav') -> Dict[str, Any]:
        """
        Transcribe audio from bytes
        
        Args:
            audio_bytes: Audio data as bytes
            format: Audio format (wav, mp3, etc.)
            
        Returns:
            Dictionary with transcription results
        """
        try:
            # Save bytes to temporary file
            with tempfile.NamedTemporaryFile(suffix=f'.{format}', delete=False) as temp_file:
                temp_file.write(audio_bytes)
                temp_file_path = temp_file.name
            
            try:
                # Transcribe temporary file
                result = self.transcribe_audio_file(temp_file_path)
                return result
            finally:
                # Clean up temporary file
                if os.path.exists(temp_file_path):
                    os.unlink(temp_file_path)
                    
        except Exception as e:
            logging.error(f"❌ Failed to transcribe audio bytes: {e}")
            return {
                'success': False,
                'error': str(e),
                'text': ''
            }
    
    def speak_text(self, text: str, blocking: bool = True) -> Dict[str, Any]:
        """
        Convert text to speech
        
        Args:
            text: Text to speak
            blocking: Whether to wait for speech to complete
            
        Returns:
            Dictionary with operation result
        """
        if not self.is_initialized or not self.tts_engine:
            return {
                'success': False,
                'error': 'TTS engine not initialized'
            }
        
        try:
            if blocking:
                self.tts_engine.say(text)
                self.tts_engine.runAndWait()
            else:
                # Run in separate thread for non-blocking
                def speak_async():
                    self.tts_engine.say(text)
                    self.tts_engine.runAndWait()
                
                thread = threading.Thread(target=speak_async)
                thread.daemon = True
                thread.start()
            
            logging.info(f"🔊 Speaking: {text}")
            
            return {
                'success': True,
                'message': 'Text spoken successfully'
            }
            
        except Exception as e:
            logging.error(f"❌ TTS failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def listen_for_speech(self, timeout: int = 5, phrase_timeout: int = 1) -> Dict[str, Any]:
        """
        Listen for speech from microphone
        
        Args:
            timeout: Maximum time to wait for speech
            phrase_timeout: Time to wait after speech ends
            
        Returns:
            Dictionary with transcription results
        """
        if not self.recognizer or not self.microphone:
            return {
                'success': False,
                'error': 'Speech recognition not initialized',
                'text': ''
            }
        
        try:
            with self.microphone as source:
                logging.info("🎤 Listening for speech...")
                
                # Listen for audio
                audio = self.recognizer.listen(
                    source, 
                    timeout=timeout, 
                    phrase_time_limit=phrase_timeout
                )
                
                # Convert to text using Google's service (fallback)
                text = self.recognizer.recognize_google(audio)
                
                logging.info(f"👂 Heard: {text}")
                
                return {
                    'success': True,
                    'text': text,
                    'audio_data': audio.get_wav_data()
                }
                
        except sr.WaitTimeoutError:
            return {
                'success': False,
                'error': 'Listening timeout',
                'text': ''
            }
        except sr.UnknownValueError:
            return {
                'success': False,
                'error': 'Could not understand audio',
                'text': ''
            }
        except Exception as e:
            logging.error(f"❌ Speech recognition failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'text': ''
            }
    
    def create_reminder_announcement(self, medicine_name: str, dosage: str, 
                                   time: str, instructions: str = None) -> str:
        """
        Create a natural reminder announcement
        
        Args:
            medicine_name: Name of the medicine
            dosage: Dosage information
            time: Scheduled time
            instructions: Special instructions
            
        Returns:
            Formatted announcement text
        """
        announcement = f"It's time to take your {medicine_name}, {dosage}."
        
        if instructions:
            announcement += f" Remember to {instructions.lower()}."
        
        announcement += " Please confirm when you have taken your medicine."
        
        return announcement
    
    def process_voice_confirmation(self, text: str) -> Dict[str, Any]:
        """
        Process voice confirmation and extract intent
        
        Args:
            text: Transcribed text from user
            
        Returns:
            Dictionary with processed intent
        """
        text_lower = text.lower().strip()
        
        # Positive confirmations
        positive_keywords = [
            'yes', 'taken', 'done', 'finished', 'completed', 'ok', 'okay',
            'confirmed', 'took it', 'already took', 'just took', 'i took'
        ]
        
        # Negative responses
        negative_keywords = [
            'no', 'not yet', 'later', 'skip', 'missed', 'forgot',
            'cannot', 'cant', 'will not', 'wont'
        ]
        
        # Delay requests
        delay_keywords = [
            'snooze', 'remind me later', 'few minutes', 'wait',
            'busy', 'not now', '5 minutes', '10 minutes'
        ]
        
        # Determine intent
        if any(keyword in text_lower for keyword in positive_keywords):
            return {
                'intent': 'confirmed',
                'confidence': 0.9,
                'response': 'Medicine intake confirmed. Thank you!'
            }
        elif any(keyword in text_lower for keyword in negative_keywords):
            return {
                'intent': 'declined',
                'confidence': 0.8,
                'response': 'Medicine intake not taken. I will remind you again later.'
            }
        elif any(keyword in text_lower for keyword in delay_keywords):
            return {
                'intent': 'delay',
                'confidence': 0.8,
                'response': 'I will remind you again in 5 minutes.'
            }
        else:
            return {
                'intent': 'unclear',
                'confidence': 0.3,
                'response': 'I did not understand. Please say yes if you have taken your medicine, or no if you have not.'
            }
    
    def get_health_status(self) -> Dict[str, bool]:
        """Get status of voice services"""
        return {
            'dependencies_available': DEPENDENCIES_AVAILABLE,
            'whisper_initialized': self.whisper_model is not None,
            'tts_initialized': self.tts_engine is not None,
            'speech_recognition_initialized': self.recognizer is not None,
            'overall_status': self.is_initialized
        }

# Global voice service instance
voice_service = VoiceService()
