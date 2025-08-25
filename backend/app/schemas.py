from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, time

# User Schemas
class UserBase(BaseModel):
    username: str
    email: str
    full_name: str
    phone_number: Optional[str] = None
    age: Optional[int] = None
    medical_conditions: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    age: Optional[int] = None
    medical_conditions: Optional[str] = None

class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Caregiver Schemas
class CaregiverBase(BaseModel):
    name: str
    email: str
    phone_number: Optional[str] = None
    relationship_to_user: str
    notification_preferences: Optional[str] = None

class CaregiverCreate(CaregiverBase):
    pass

class Caregiver(CaregiverBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Medicine Schemas
class MedicineBase(BaseModel):
    name: str
    dosage: str
    frequency_per_day: int
    times: str  # JSON string
    duration_days: int = 7
    start_date: str  # ISO format string
    end_date: Optional[str] = None  # ISO format string
    instructions: Optional[str] = None
    reminder_enabled: bool = True

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class MedicineCreate(MedicineBase):
    pass

class MedicineUpdate(BaseModel):
    name: Optional[str] = None
    dosage: Optional[str] = None
    instructions: Optional[str] = None
    frequency_per_day: Optional[int] = None
    duration_days: Optional[int] = None
    times: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    is_active: Optional[bool] = None

class Medicine(MedicineBase):
    id: int
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Medicine Intake Schemas
class MedicineIntakeBase(BaseModel):
    medicine_id: int
    scheduled_time: datetime
    taken: bool = False
    missed: bool = False
    notes: Optional[str] = None

class MedicineIntakeCreate(MedicineIntakeBase):
    pass

class MedicineIntake(MedicineIntakeBase):
    id: int
    user_id: int
    medicine_id: int
    taken_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# Health Feedback Schemas
class HealthFeedbackBase(BaseModel):
    rating: int
    symptoms: Optional[str] = None
    side_effects: Optional[str] = None
    voice_notes: Optional[str] = None

class HealthFeedbackCreate(HealthFeedbackBase):
    medicine_id: int
    intake_id: Optional[int] = None

class HealthFeedback(HealthFeedbackBase):
    id: int
    user_id: int
    medicine_id: int
    intake_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# Voice Command Schemas
class VoiceCommand(BaseModel):
    command: str
    confidence: Optional[float] = None

class VoiceResponse(BaseModel):
    text: str
    audio_file: Optional[str] = None
    action_taken: Optional[str] = None

# Authentication Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# AI Report Schemas
class AIReportRequest(BaseModel):
    report_type: str
    period_days: int = 30

class AIReport(BaseModel):
    id: int
    user_id: int
    report_type: str
    period_start: datetime
    period_end: datetime
    insights: str
    recommendations: str
    adherence_score: Optional[float] = None
    generated_at: datetime
    
    class Config:
        from_attributes = True

# Dashboard Schemas
class DashboardData(BaseModel):
    user: User
    today_medicines: List[Medicine]
    recent_intakes: List[MedicineIntake]
    adherence_rate: float
    upcoming_reminders: List[dict]
    recent_feedback: List[HealthFeedback]
