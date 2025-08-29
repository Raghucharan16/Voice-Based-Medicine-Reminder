"""
Voice processing service - Simplified version
"""

import logging
from typing import Dict, Any

class VoiceService:
    """Simplified voice service for testing"""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.is_initialized = False
        self.logger = logging.getLogger(__name__)
        self.logger.info("Voice service initialized in disabled mode")
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get health status of voice service"""
        return {
            "status": "disabled",
            "dependencies_available": False,
            "message": "Voice service disabled to prevent crashes"
        }
    
    def transcribe_audio_file(self, audio_file_path: str) -> Dict[str, Any]:
        """Transcribe audio file to text"""
        return {
            "success": False,
            "text": "",
            "error": "Voice service disabled"
        }
    
    def speak_text(self, text: str, blocking: bool = True) -> Dict[str, Any]:
        """Convert text to speech"""
        self.logger.info(f"Would speak: {text}")
        return {
            "success": False,
            "message": "Voice service disabled"
        }
    
    def listen_for_speech(self, timeout: int = 5) -> Dict[str, Any]:
        """Listen for speech from microphone"""
        return {
            "success": False,
            "text": "",
            "error": "Voice service disabled"
        }
    
    def create_reminder_announcement(self, medicine_name: str, dosage: str, time: str, instructions: str = None) -> str:
        """Create reminder announcement text"""
        announcement = f"Time to take your medicine: {medicine_name}, {dosage}"
        if instructions:
            announcement += f". Instructions: {instructions}"
        return announcement

# Create global instance
voice_service = VoiceService()
