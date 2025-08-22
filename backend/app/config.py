# API Configuration
API_V1_STR = "/api/v1"
PROJECT_NAME = "Medicine Tracker API"
PROJECT_VERSION = "1.0.0"

# Database
DATABASE_URL = "sqlite:///./medicine_tracker.db"

# Security
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

# Voice settings
DEFAULT_TTS_ENGINE = "pyttsx3"
DEFAULT_VOICE_LANGUAGE = "en-US"
VOICE_TIMEOUT_SECONDS = 10

# Reminder settings
DEFAULT_SNOOZE_MINUTES = 15
MISSED_DOSE_CHECK_MINUTES = 15

# AI settings
AI_REPORT_DEFAULT_PERIOD_DAYS = 30
AI_MODEL = "gpt-3.5-turbo"

# Notification settings
EMAIL_ENABLED = True
SMS_ENABLED = True
VOICE_ENABLED = True
