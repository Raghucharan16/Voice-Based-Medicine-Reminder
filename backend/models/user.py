"""
User model for the medicine reminder system
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
from datetime import datetime
from typing import Dict, Optional

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    phone_number = Column(String(20), nullable=True)
    date_of_birth = Column(DateTime, nullable=True)
    
    # Caregiver information
    caregiver_name = Column(String(100), nullable=True)
    caregiver_email = Column(String(100), nullable=True)
    caregiver_phone = Column(String(20), nullable=True)
    
    # User preferences
    voice_enabled = Column(Boolean, default=True)
    voice_language = Column(String(10), default='en-US')
    notification_preferences = Column(Text, nullable=True)  # JSON string
    timezone = Column(String(50), default='UTC')
    
    # Accessibility settings
    large_font = Column(Boolean, default=False)
    high_contrast = Column(Boolean, default=False)
    voice_speed = Column(Integer, default=150)  # Words per minute
    
    # Account status
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    last_login = Column(DateTime, nullable=True)
    
    def __init__(self, username: str, email: str, password_hash: str, 
                 first_name: str, last_name: str, **kwargs):
        self.username = username
        self.email = email
        self.password_hash = password_hash
        self.first_name = first_name
        self.last_name = last_name
        
        # Set optional fields
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def to_dict(self, include_sensitive: bool = False) -> Dict:
        """Convert user object to dictionary"""
        data = {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'phone_number': self.phone_number,
            'date_of_birth': self.date_of_birth.isoformat() if self.date_of_birth else None,
            'caregiver_name': self.caregiver_name,
            'caregiver_email': self.caregiver_email,
            'caregiver_phone': self.caregiver_phone,
            'voice_enabled': self.voice_enabled,
            'voice_language': self.voice_language,
            'timezone': self.timezone,
            'large_font': self.large_font,
            'high_contrast': self.high_contrast,
            'voice_speed': self.voice_speed,
            'is_active': self.is_active,
            'email_verified': self.email_verified,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }
        
        if include_sensitive:
            data['password_hash'] = self.password_hash
            
        return data
    
    @property
    def full_name(self) -> str:
        """Get user's full name"""
        return f"{self.first_name} {self.last_name}"
    
    def update_last_login(self):
        """Update last login timestamp"""
        self.last_login = datetime.now()
    
    def has_caregiver(self) -> bool:
        """Check if user has caregiver information"""
        return bool(self.caregiver_email or self.caregiver_phone)
    
    def get_notification_preferences(self) -> Dict:
        """Get notification preferences as dictionary"""
        if self.notification_preferences:
            import json
            try:
                return json.loads(self.notification_preferences)
            except json.JSONDecodeError:
                return {}
        return {
            'email_reminders': True,
            'sms_reminders': False,
            'voice_reminders': True,
            'caregiver_alerts': True,
            'reminder_sound': 'default'
        }
    
    def set_notification_preferences(self, preferences: Dict):
        """Set notification preferences from dictionary"""
        import json
        self.notification_preferences = json.dumps(preferences)
    
    def is_elderly_friendly_mode(self) -> bool:
        """Check if user has elderly-friendly settings enabled"""
        return self.large_font or self.high_contrast or self.voice_speed < 150
