"""
Adherence model for tracking medicine intake
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import Dict, Optional

Base = declarative_base()

class AdherenceLog(Base):
    __tablename__ = 'adherence_logs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    medicine_id = Column(Integer, ForeignKey('medicines.id'), nullable=False)
    
    # Scheduled vs actual intake
    scheduled_time = Column(DateTime, nullable=False)
    actual_time = Column(DateTime, nullable=True)
    
    # Status information
    status = Column(String(20), nullable=False)  # 'taken', 'missed', 'skipped', 'delayed'
    taken = Column(Boolean, default=False)
    delay_minutes = Column(Integer, default=0)  # How many minutes late
    
    # Dosage information
    scheduled_dosage = Column(String(100), nullable=True)
    actual_dosage = Column(String(100), nullable=True)
    
    # Voice and feedback
    voice_confirmation = Column(Boolean, default=False)
    voice_transcript = Column(Text, nullable=True)  # What the user said
    
    # Health feedback after taking medicine
    side_effects_reported = Column(Text, nullable=True)
    mood_rating = Column(Integer, nullable=True)  # 1-10 scale
    energy_level = Column(Integer, nullable=True)  # 1-10 scale
    pain_level = Column(Integer, nullable=True)  # 1-10 scale
    additional_notes = Column(Text, nullable=True)
    
    # Reminder information
    reminders_sent = Column(Integer, default=0)
    last_reminder_time = Column(DateTime, nullable=True)
    reminder_method = Column(String(50), nullable=True)  # 'voice', 'notification', 'email', 'sms'
    
    # Caregiver notifications
    caregiver_notified = Column(Boolean, default=False)
    caregiver_notification_time = Column(DateTime, nullable=True)
    
    # Location and context (optional)
    location = Column(String(200), nullable=True)
    activity_context = Column(String(200), nullable=True)  # What user was doing
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    # user = relationship("User", back_populates="adherence_logs")
    # medicine = relationship("Medicine", back_populates="adherence_logs")
    
    def __init__(self, user_id: int, medicine_id: int, scheduled_time: datetime, 
                 status: str = 'pending', **kwargs):
        self.user_id = user_id
        self.medicine_id = medicine_id
        self.scheduled_time = scheduled_time
        self.status = status
        
        # Set optional fields
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def __repr__(self):
        return f'<AdherenceLog {self.status} - Medicine {self.medicine_id} at {self.scheduled_time}>'
    
    def to_dict(self) -> Dict:
        """Convert adherence log to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'medicine_id': self.medicine_id,
            'scheduled_time': self.scheduled_time.isoformat() if self.scheduled_time else None,
            'actual_time': self.actual_time.isoformat() if self.actual_time else None,
            'status': self.status,
            'taken': self.taken,
            'delay_minutes': self.delay_minutes,
            'scheduled_dosage': self.scheduled_dosage,
            'actual_dosage': self.actual_dosage,
            'voice_confirmation': self.voice_confirmation,
            'voice_transcript': self.voice_transcript,
            'side_effects_reported': self.side_effects_reported,
            'mood_rating': self.mood_rating,
            'energy_level': self.energy_level,
            'pain_level': self.pain_level,
            'additional_notes': self.additional_notes,
            'reminders_sent': self.reminders_sent,
            'last_reminder_time': self.last_reminder_time.isoformat() if self.last_reminder_time else None,
            'reminder_method': self.reminder_method,
            'caregiver_notified': self.caregiver_notified,
            'caregiver_notification_time': self.caregiver_notification_time.isoformat() if self.caregiver_notification_time else None,
            'location': self.location,
            'activity_context': self.activity_context,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def mark_as_taken(self, actual_time: datetime = None, dosage: str = None, 
                      voice_transcript: str = None):
        """Mark medicine as taken"""
        self.status = 'taken'
        self.taken = True
        self.actual_time = actual_time or datetime.now()
        
        if dosage:
            self.actual_dosage = dosage
        
        if voice_transcript:
            self.voice_transcript = voice_transcript
            self.voice_confirmation = True
        
        # Calculate delay
        if self.actual_time and self.scheduled_time:
            delay_seconds = (self.actual_time - self.scheduled_time).total_seconds()
            self.delay_minutes = max(0, int(delay_seconds / 60))
    
    def mark_as_missed(self):
        """Mark medicine as missed"""
        self.status = 'missed'
        self.taken = False
        self.actual_time = None
    
    def mark_as_skipped(self, reason: str = None):
        """Mark medicine as intentionally skipped"""
        self.status = 'skipped'
        self.taken = False
        self.actual_time = None
        
        if reason:
            self.additional_notes = reason
    
    def add_health_feedback(self, mood: int = None, energy: int = None, 
                           pain: int = None, side_effects: str = None, 
                           notes: str = None):
        """Add health feedback after taking medicine"""
        if mood is not None:
            self.mood_rating = max(1, min(10, mood))
        
        if energy is not None:
            self.energy_level = max(1, min(10, energy))
        
        if pain is not None:
            self.pain_level = max(1, min(10, pain))
        
        if side_effects:
            self.side_effects_reported = side_effects
        
        if notes:
            if self.additional_notes:
                self.additional_notes += f"\n{notes}"
            else:
                self.additional_notes = notes
    
    def increment_reminders(self, method: str = 'notification'):
        """Increment reminder count"""
        self.reminders_sent += 1
        self.last_reminder_time = datetime.now()
        self.reminder_method = method
    
    def notify_caregiver(self):
        """Mark that caregiver has been notified"""
        self.caregiver_notified = True
        self.caregiver_notification_time = datetime.now()
    
    def is_overdue(self, tolerance_minutes: int = 15) -> bool:
        """Check if medicine intake is overdue"""
        if self.taken or self.status in ['skipped', 'missed']:
            return False
        
        current_time = datetime.now()
        time_diff = (current_time - self.scheduled_time).total_seconds() / 60
        return time_diff > tolerance_minutes
    
    def get_status_display(self) -> str:
        """Get human-readable status"""
        status_map = {
            'taken': 'Taken',
            'missed': 'Missed',
            'skipped': 'Skipped',
            'delayed': 'Taken (Late)',
            'pending': 'Pending'
        }
        
        if self.status == 'taken' and self.delay_minutes > 15:
            return 'Taken (Late)'
        
        return status_map.get(self.status, self.status.title())
    
    def get_delay_description(self) -> str:
        """Get human-readable delay description"""
        if not self.delay_minutes or self.delay_minutes == 0:
            return "On time"
        elif self.delay_minutes < 60:
            return f"{self.delay_minutes} minutes late"
        else:
            hours = self.delay_minutes // 60
            minutes = self.delay_minutes % 60
            if minutes == 0:
                return f"{hours} hour{'s' if hours > 1 else ''} late"
            else:
                return f"{hours}h {minutes}m late"
    
    def get_health_summary(self) -> Dict:
        """Get summary of health feedback"""
        return {
            'mood_rating': self.mood_rating,
            'energy_level': self.energy_level,
            'pain_level': self.pain_level,
            'side_effects': self.side_effects_reported,
            'notes': self.additional_notes
        }
