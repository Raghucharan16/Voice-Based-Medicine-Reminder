from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, Float, Text, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./medicine_tracker.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Association table for user-caregiver relationship
user_caregiver = Table(
    'user_caregiver',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('caregiver_id', Integer, ForeignKey('caregivers.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    phone_number = Column(String)
    age = Column(Integer)
    medical_conditions = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    
    # Relationships
    medicines = relationship("Medicine", back_populates="user")
    intakes = relationship("MedicineIntake", back_populates="user")
    health_feedback = relationship("HealthFeedback", back_populates="user")
    caregivers = relationship("Caregiver", secondary=user_caregiver, back_populates="users")

class Caregiver(Base):
    __tablename__ = "caregivers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String)
    phone_number = Column(String)
    relationship_to_user = Column(String)  # e.g., "family", "doctor", "nurse"
    notification_preferences = Column(String)  # JSON string: {"email": true, "sms": true}
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    users = relationship("User", secondary=user_caregiver, back_populates="caregivers")
    notifications_sent = relationship("CaregiverNotification", back_populates="caregiver")

class Medicine(Base):
    __tablename__ = "medicines"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, index=True)
    dosage = Column(String)
    instructions = Column(Text)
    frequency_per_day = Column(Integer)
    duration_days = Column(Integer)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    times = Column(Text)  # JSON string: ["08:00", "14:00", "20:00"]
    reminder_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    
    # Relationships
    user = relationship("User", back_populates="medicines")
    intakes = relationship("MedicineIntake", back_populates="medicine")
    schedules = relationship("MedicineSchedule", back_populates="medicine")

class MedicineSchedule(Base):
    __tablename__ = "medicine_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer, ForeignKey("medicines.id"))
    scheduled_time = Column(DateTime)
    status = Column(String, default="pending")  # pending, taken, missed, skipped
    reminder_sent = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    medicine = relationship("Medicine", back_populates="schedules")
    intake = relationship("MedicineIntake", back_populates="schedule", uselist=False)

class MedicineIntake(Base):
    __tablename__ = "medicine_intakes"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    medicine_id = Column(Integer, ForeignKey("medicines.id"))
    schedule_id = Column(Integer, ForeignKey("medicine_schedules.id"))
    taken_at = Column(DateTime)
    scheduled_time = Column(DateTime)
    status = Column(String)  # taken, missed, skipped
    method = Column(String)  # voice, manual, auto
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="intakes")
    medicine = relationship("Medicine", back_populates="intakes")
    schedule = relationship("MedicineSchedule", back_populates="intake")

class HealthFeedback(Base):
    __tablename__ = "health_feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    medicine_id = Column(Integer, ForeignKey("medicines.id"))
    intake_id = Column(Integer, ForeignKey("medicine_intakes.id"))
    rating = Column(Integer)  # 1-5 scale
    symptoms = Column(Text)
    side_effects = Column(Text)
    voice_notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="health_feedback")

class CaregiverNotification(Base):
    __tablename__ = "caregiver_notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    caregiver_id = Column(Integer, ForeignKey("caregivers.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    medicine_id = Column(Integer, ForeignKey("medicines.id"))
    notification_type = Column(String)  # missed_dose, side_effect, adherence_report
    message = Column(Text)
    sent_via = Column(String)  # email, sms, both
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, default="sent")  # sent, delivered, failed
    
    # Relationships
    caregiver = relationship("Caregiver", back_populates="notifications_sent")

class AIReport(Base):
    __tablename__ = "ai_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    report_type = Column(String)  # adherence, health_trends, recommendations
    period_start = Column(DateTime)
    period_end = Column(DateTime)
    data_analyzed = Column(Text)  # JSON string with analyzed data
    insights = Column(Text)
    recommendations = Column(Text)
    adherence_score = Column(Float)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create all tables
Base.metadata.create_all(bind=engine)
