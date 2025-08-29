"""
Medicine model for the medicine reminder system
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, time, timedelta
from typing import Dict, List, Optional
import json

Base = declarative_base()

class Medicine(Base):
    __tablename__ = 'medicines'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # Medicine information
    name = Column(String(200), nullable=False)
    dosage = Column(String(100), nullable=False)  # e.g., "500mg", "2 tablets"
    form = Column(String(50), nullable=True)  # e.g., "tablet", "liquid", "injection"
    color = Column(String(50), nullable=True)
    shape = Column(String(50), nullable=True)
    manufacturer = Column(String(100), nullable=True)
    
    # Prescription information
    doctor_name = Column(String(100), nullable=True)
    prescription_date = Column(DateTime, nullable=True)
    prescription_number = Column(String(100), nullable=True)
    
    # Schedule information
    frequency = Column(String(50), nullable=False)  # e.g., "daily", "twice_daily", "weekly"
    times_per_day = Column(Integer, default=1)
    schedule_times = Column(Text, nullable=True)  # JSON array of times
    
    # Duration and quantity
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)
    total_quantity = Column(Integer, nullable=True)
    remaining_quantity = Column(Integer, nullable=True)
    
    # Instructions and notes
    instructions = Column(Text, nullable=True)
    food_instructions = Column(String(100), nullable=True)  # "with_food", "without_food", "no_restriction"
    special_instructions = Column(Text, nullable=True)
    side_effects = Column(Text, nullable=True)
    
    # Reminder settings
    reminder_enabled = Column(Boolean, default=True)
    reminder_advance_minutes = Column(Integer, default=0)  # Remind X minutes before
    snooze_duration = Column(Integer, default=5)  # Snooze for X minutes
    max_reminders = Column(Integer, default=3)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_critical = Column(Boolean, default=False)  # Critical medicine that requires strict adherence
    
    # AI-generated information
    ai_description = Column(Text, nullable=True)
    ai_benefits = Column(Text, nullable=True)
    ai_precautions = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    # adherence_logs = relationship("AdherenceLog", back_populates="medicine")
    
    def __init__(self, user_id: int, name: str, dosage: str, frequency: str, 
                 start_date: datetime, **kwargs):
        self.user_id = user_id
        self.name = name
        self.dosage = dosage
        self.frequency = frequency
        self.start_date = start_date
        
        # Set optional fields
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def __repr__(self):
        return f'<Medicine {self.name} - {self.dosage}>'
    
    def to_dict(self) -> Dict:
        """Convert medicine object to dictionary"""
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'dosage': self.dosage,
            'form': self.form,
            'color': self.color,
            'shape': self.shape,
            'manufacturer': self.manufacturer,
            'doctor_name': self.doctor_name,
            'prescription_date': self.prescription_date.isoformat() if self.prescription_date else None,
            'prescription_number': self.prescription_number,
            'frequency': self.frequency,
            'times_per_day': self.times_per_day,
            'schedule_times': self.get_schedule_times(),
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'total_quantity': self.total_quantity,
            'remaining_quantity': self.remaining_quantity,
            'instructions': self.instructions,
            'food_instructions': self.food_instructions,
            'special_instructions': self.special_instructions,
            'side_effects': self.side_effects,
            'reminder_enabled': self.reminder_enabled,
            'reminder_advance_minutes': self.reminder_advance_minutes,
            'snooze_duration': self.snooze_duration,
            'max_reminders': self.max_reminders,
            'is_active': self.is_active,
            'is_critical': self.is_critical,
            'ai_description': self.ai_description,
            'ai_benefits': self.ai_benefits,
            'ai_precautions': self.ai_precautions,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def get_schedule_times(self) -> List[str]:
        """Get schedule times as list"""
        if self.schedule_times:
            try:
                return json.loads(self.schedule_times)
            except json.JSONDecodeError:
                return []
        return []
    
    def set_schedule_times(self, times: List[str]):
        """Set schedule times from list"""
        self.schedule_times = json.dumps(times)
    
    def add_schedule_time(self, time_str: str):
        """Add a new schedule time"""
        current_times = self.get_schedule_times()
        if time_str not in current_times:
            current_times.append(time_str)
            self.set_schedule_times(current_times)
    
    def remove_schedule_time(self, time_str: str):
        """Remove a schedule time"""
        current_times = self.get_schedule_times()
        if time_str in current_times:
            current_times.remove(time_str)
            self.set_schedule_times(current_times)
    
    def is_due_today(self, current_date: datetime = None) -> bool:
        """Check if medicine is due today"""
        if not self.is_active or not current_date:
            return False
        
        current_date = current_date or datetime.now()
        
        # Check if medicine period has started
        if current_date.date() < self.start_date.date():
            return False
        
        # Check if medicine period has ended
        if self.end_date and current_date.date() > self.end_date.date():
            return False
        
        # Check frequency
        if self.frequency == 'daily':
            return True
        elif self.frequency == 'weekly':
            # Check if it's the same day of week as start date
            return current_date.weekday() == self.start_date.weekday()
        elif self.frequency == 'monthly':
            # Check if it's the same day of month as start date
            return current_date.day == self.start_date.day
        
        return False
    
    def get_next_dose_time(self, current_time: datetime = None) -> Optional[datetime]:
        """Get the next scheduled dose time"""
        if not self.is_active:
            return None
        
        current_time = current_time or datetime.now()
        schedule_times = self.get_schedule_times()
        
        if not schedule_times:
            return None
        
        # Find next time today or tomorrow
        for time_str in sorted(schedule_times):
            try:
                time_obj = datetime.strptime(time_str, "%H:%M").time()
                next_dose = datetime.combine(current_time.date(), time_obj)
                
                if next_dose > current_time:
                    return next_dose
            except ValueError:
                continue
        
        # If no time found for today, get first time tomorrow
        if schedule_times:
            try:
                first_time = datetime.strptime(sorted(schedule_times)[0], "%H:%M").time()
                tomorrow = current_time.date() + timedelta(days=1)
                return datetime.combine(tomorrow, first_time)
            except ValueError:
                pass
        
        return None
    
    def decrease_quantity(self, amount: int = 1):
        """Decrease remaining quantity"""
        if self.remaining_quantity is not None:
            self.remaining_quantity = max(0, self.remaining_quantity - amount)
    
    def is_running_low(self, threshold: int = 7) -> bool:
        """Check if medicine is running low"""
        if self.remaining_quantity is None:
            return False
        return self.remaining_quantity <= threshold
    
    def get_display_name(self) -> str:
        """Get formatted display name"""
        return f"{self.name} ({self.dosage})"
    
    def get_frequency_description(self) -> str:
        """Get human-readable frequency description"""
        frequency_map = {
            'daily': 'Every day',
            'twice_daily': 'Twice a day',
            'three_times_daily': 'Three times a day',
            'four_times_daily': 'Four times a day',
            'weekly': 'Once a week',
            'monthly': 'Once a month'
        }
        return frequency_map.get(self.frequency, self.frequency.replace('_', ' ').title())
