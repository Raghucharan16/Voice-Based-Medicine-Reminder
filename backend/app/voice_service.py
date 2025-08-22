import speech_recognition as sr
import pyttsx3
import os
import tempfile
from gtts import gTTS
import pygame
import io
import threading
import queue
import time
from typing import Optional

class VoiceManager:
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone()
        self.tts_engine = pyttsx3.init()
        self.voice_queue = queue.Queue()
        self.is_listening = False
        
        # Configure TTS engine
        self.tts_engine.setProperty('rate', 150)
        voices = self.tts_engine.getProperty('voices')
        if voices:
            self.tts_engine.setProperty('voice', voices[0].id)
        
        # Initialize pygame mixer for audio playback
        pygame.mixer.init()
    
    def start_listening(self) -> bool:
        """Start continuous listening for voice commands"""
        try:
            with self.microphone as source:
                self.recognizer.adjust_for_ambient_noise(source, duration=1)
            self.is_listening = True
            return True
        except Exception as e:
            print(f"Error starting voice recognition: {e}")
            return False
    
    def stop_listening(self):
        """Stop continuous listening"""
        self.is_listening = False
    
    def listen_for_command(self, timeout: int = 5) -> Optional[str]:
        """Listen for a single voice command"""
        try:
            with self.microphone as source:
                print("Listening for command...")
                audio = self.recognizer.listen(source, timeout=timeout, phrase_time_limit=10)
                
            # Recognize speech using Google Speech Recognition
            text = self.recognizer.recognize_google(audio)
            print(f"Recognized: {text}")
            return text.lower()
            
        except sr.WaitTimeoutError:
            print("Listening timeout")
            return None
        except sr.UnknownValueError:
            print("Could not understand audio")
            return None
        except sr.RequestError as e:
            print(f"Error with speech recognition service: {e}")
            return None
    
    def speak_text(self, text: str, use_gtts: bool = False) -> bool:
        """Convert text to speech and play it"""
        try:
            if use_gtts:
                return self._speak_with_gtts(text)
            else:
                return self._speak_with_pyttsx3(text)
        except Exception as e:
            print(f"Error in text-to-speech: {e}")
            return False
    
    def _speak_with_pyttsx3(self, text: str) -> bool:
        """Use pyttsx3 for text-to-speech"""
        try:
            self.tts_engine.say(text)
            self.tts_engine.runAndWait()
            return True
        except Exception as e:
            print(f"Error with pyttsx3: {e}")
            return False
    
    def _speak_with_gtts(self, text: str) -> bool:
        """Use Google TTS for text-to-speech"""
        try:
            # Create a temporary file for audio
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
                tts = gTTS(text=text, lang='en', slow=False)
                tts.save(tmp_file.name)
                
                # Play the audio file
                pygame.mixer.music.load(tmp_file.name)
                pygame.mixer.music.play()
                
                # Wait for playback to finish
                while pygame.mixer.music.get_busy():
                    time.sleep(0.1)
                
                # Clean up temporary file
                os.unlink(tmp_file.name)
                return True
                
        except Exception as e:
            print(f"Error with gTTS: {e}")
            return False
    
    def process_voice_command(self, command: str) -> dict:
        """Process voice command and return structured response"""
        command = command.lower().strip()
        
        # Command patterns for medicine management
        if "take" in command and ("medicine" in command or "medication" in command or "pill" in command):
            return {
                "action": "log_intake",
                "type": "medicine_taken",
                "command": command,
                "confidence": 0.9
            }
        
        elif "skip" in command and ("medicine" in command or "medication" in command or "pill" in command):
            return {
                "action": "log_intake",
                "type": "medicine_skipped",
                "command": command,
                "confidence": 0.8
            }
        
        elif "remind" in command and "later" in command:
            return {
                "action": "snooze_reminder",
                "command": command,
                "confidence": 0.8
            }
        
        elif "add" in command and ("medicine" in command or "medication" in command):
            return {
                "action": "add_medicine",
                "command": command,
                "confidence": 0.7
            }
        
        elif "schedule" in command:
            return {
                "action": "view_schedule",
                "command": command,
                "confidence": 0.8
            }
        
        elif "report" in command or "status" in command:
            return {
                "action": "generate_report",
                "command": command,
                "confidence": 0.7
            }
        
        elif "help" in command:
            return {
                "action": "show_help",
                "command": command,
                "confidence": 0.9
            }
        
        elif any(feeling in command for feeling in ["good", "bad", "sick", "nauseous", "dizzy", "tired"]):
            return {
                "action": "log_feedback",
                "type": "health_status",
                "command": command,
                "confidence": 0.8
            }
        
        else:
            return {
                "action": "unknown",
                "command": command,
                "confidence": 0.1
            }
    
    def get_voice_feedback_prompts(self) -> list:
        """Return voice prompts for collecting health feedback"""
        return [
            "How are you feeling after taking your medicine?",
            "On a scale of 1 to 5, how would you rate your current health?",
            "Are you experiencing any side effects?",
            "Do you have any symptoms you'd like to report?",
            "Is there anything else you'd like to note about your health today?"
        ]
    
    def get_medicine_reminders(self, medicine_name: str, dosage: str) -> str:
        """Generate voice reminder text for medicine"""
        return f"It's time to take your {medicine_name}. The dosage is {dosage}. Please confirm when you've taken it."
    
    def get_voice_help(self) -> str:
        """Return help text for voice commands"""
        return """
        Here are the voice commands you can use:
        - Say 'I took my medicine' to log that you've taken your medication
        - Say 'Skip medicine' to skip a dose
        - Say 'Remind me later' to snooze a reminder
        - Say 'Add medicine' to add a new medication
        - Say 'Show schedule' to view your medication schedule
        - Say 'Generate report' to create a health report
        - Say 'Help' to hear this message again
        - Share how you're feeling to log health feedback
        """

# Global voice manager instance
voice_manager = VoiceManager()
