import os
from datetime import timedelta
from decouple import config

class Config:
    """Base configuration class"""
    
    # Flask Configuration
    SECRET_KEY = config('SECRET_KEY', default='your-secret-key-change-this')
    DEBUG = config('DEBUG', default=True, cast=bool)
    
    # Database Configuration
    DATABASE_PATH = config('DATABASE_PATH', default='../data/medicine_reminder.db')
    SQLALCHEMY_DATABASE_URI = f'sqlite:///{DATABASE_PATH}'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # HuggingFace Configuration
    HUGGINGFACE_API_KEY = config('HUGGINGFACE_API_KEY', default='')
    WHISPER_MODEL = config('WHISPER_MODEL', default='openai/whisper-base')
    
    # Voice Configuration
    TTS_VOICE_RATE = config('TTS_VOICE_RATE', default=150, cast=int)
    TTS_VOICE_VOLUME = config('TTS_VOICE_VOLUME', default=0.9, cast=float)
    
    # Notification Configuration
    SMTP_SERVER = config('SMTP_SERVER', default='smtp.gmail.com')
    SMTP_PORT = config('SMTP_PORT', default=587, cast=int)
    EMAIL_ADDRESS = config('EMAIL_ADDRESS', default='')
    EMAIL_PASSWORD = config('EMAIL_PASSWORD', default='')
    
    # Twilio Configuration (for SMS)
    TWILIO_ACCOUNT_SID = config('TWILIO_ACCOUNT_SID', default='')
    TWILIO_AUTH_TOKEN = config('TWILIO_AUTH_TOKEN', default='')
    TWILIO_PHONE_NUMBER = config('TWILIO_PHONE_NUMBER', default='')
    
    # Scheduler Configuration
    SCHEDULER_API_ENABLED = True
    SCHEDULER_TIMEZONE = config('TIMEZONE', default='UTC')
    
    # Audio Configuration
    AUDIO_SAMPLE_RATE = config('AUDIO_SAMPLE_RATE', default=16000, cast=int)
    AUDIO_CHANNELS = config('AUDIO_CHANNELS', default=1, cast=int)
    AUDIO_FORMAT = config('AUDIO_FORMAT', default='wav')
    
    # Medicine Reminder Configuration
    DEFAULT_REMINDER_INTERVAL = config('DEFAULT_REMINDER_INTERVAL', default=5, cast=int)  # minutes
    MAX_MISSED_REMINDERS = config('MAX_MISSED_REMINDERS', default=3, cast=int)
    
    # AI Configuration
    AI_MODEL_NAME = config('AI_MODEL_NAME', default='microsoft/DialoGPT-medium')
    MAX_AI_RESPONSE_LENGTH = config('MAX_AI_RESPONSE_LENGTH', default=200, cast=int)
    
    # File Upload Configuration
    UPLOAD_FOLDER = config('UPLOAD_FOLDER', default='uploads/')
    MAX_CONTENT_LENGTH = config('MAX_CONTENT_LENGTH', default=16 * 1024 * 1024, cast=int)  # 16MB
    ALLOWED_AUDIO_EXTENSIONS = {'wav', 'mp3', 'ogg', 'flac', 'm4a'}
    
    # Logging Configuration
    LOG_LEVEL = config('LOG_LEVEL', default='INFO')
    LOG_FILE = config('LOG_FILE', default='medicine_reminder.log')
    
    # CORS Configuration
    CORS_ORIGINS = config('CORS_ORIGINS', default='http://localhost:8501').split(',')
    
    @staticmethod
    def init_app(app):
        """Initialize application with configuration"""
        pass

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DATABASE_PATH = ':memory:'  # Use in-memory database for testing

# Configuration mapping
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
