"""
Database initialization and setup
"""

import os
import sqlite3
from sqlalchemy import create_engine, MetaData, Column, Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func
from datetime import datetime

# Create a common base for all models
Base = declarative_base()

# Database configuration
DATABASE_PATH = os.path.join(os.path.dirname(__file__), '../../data/medicine_reminder.db')
DATABASE_URL = f'sqlite:///{DATABASE_PATH}'

# Create engine and session
engine = create_engine(DATABASE_URL, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Define models directly here to avoid import issues
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
    notification_preferences = Column(Text, nullable=True)
    timezone = Column(String(50), default='UTC')
    
    # Accessibility settings
    large_font = Column(Boolean, default=False)
    high_contrast = Column(Boolean, default=False)
    voice_speed = Column(Integer, default=150)
    
    # Account status
    is_active = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    last_login = Column(DateTime, nullable=True)

class Medicine(Base):
    __tablename__ = 'medicines'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    
    # Medicine information
    name = Column(String(200), nullable=False)
    dosage = Column(String(100), nullable=False)
    form = Column(String(50), nullable=True)
    color = Column(String(50), nullable=True)
    shape = Column(String(50), nullable=True)
    manufacturer = Column(String(100), nullable=True)
    
    # Prescription information
    doctor_name = Column(String(100), nullable=True)
    prescription_date = Column(DateTime, nullable=True)
    prescription_number = Column(String(100), nullable=True)
    
    # Schedule information
    frequency = Column(String(50), nullable=False)
    times_per_day = Column(Integer, default=1)
    schedule_times = Column(Text, nullable=True)
    
    # Duration and quantity
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)
    total_quantity = Column(Integer, nullable=True)
    remaining_quantity = Column(Integer, nullable=True)
    
    # Instructions and notes
    instructions = Column(Text, nullable=True)
    food_instructions = Column(String(100), nullable=True)
    special_instructions = Column(Text, nullable=True)
    side_effects = Column(Text, nullable=True)
    
    # Reminder settings
    reminder_enabled = Column(Boolean, default=True)
    reminder_advance_minutes = Column(Integer, default=0)
    snooze_duration = Column(Integer, default=5)
    max_reminders = Column(Integer, default=3)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_critical = Column(Boolean, default=False)
    
    # AI-generated information
    ai_description = Column(Text, nullable=True)
    ai_benefits = Column(Text, nullable=True)
    ai_precautions = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class AdherenceLog(Base):
    __tablename__ = 'adherence_logs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    medicine_id = Column(Integer, ForeignKey('medicines.id'), nullable=False)
    
    # Scheduled vs actual intake
    scheduled_time = Column(DateTime, nullable=False)
    actual_time = Column(DateTime, nullable=True)
    
    # Status information
    status = Column(String(20), nullable=False)
    taken = Column(Boolean, default=False)
    delay_minutes = Column(Integer, default=0)
    
    # Dosage information
    scheduled_dosage = Column(String(100), nullable=True)
    actual_dosage = Column(String(100), nullable=True)
    
    # Voice and feedback
    voice_confirmation = Column(Boolean, default=False)
    voice_transcript = Column(Text, nullable=True)
    
    # Health feedback after taking medicine
    side_effects_reported = Column(Text, nullable=True)
    mood_rating = Column(Integer, nullable=True)
    energy_level = Column(Integer, nullable=True)
    pain_level = Column(Integer, nullable=True)
    additional_notes = Column(Text, nullable=True)
    
    # Reminder information
    reminders_sent = Column(Integer, default=0)
    last_reminder_time = Column(DateTime, nullable=True)
    reminder_method = Column(String(50), nullable=True)
    
    # Caregiver notifications
    caregiver_notified = Column(Boolean, default=False)
    caregiver_notification_time = Column(DateTime, nullable=True)
    
    # Location and context (optional)
    location = Column(String(200), nullable=True)
    activity_context = Column(String(200), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

def ensure_data_directory():
    """Ensure data directory exists"""
    data_dir = os.path.dirname(DATABASE_PATH)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)

def create_tables():
    """Create all database tables"""
    try:
        ensure_data_directory()
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        
        print("✅ Database tables created successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error creating database tables: {e}")
        return False

def get_db_session():
    """Get database session"""
    session = SessionLocal()
    try:
        return session
    except Exception as e:
        session.close()
        raise e

def init_database():
    """Initialize database with tables and sample data"""
    print("🔧 Initializing database...")
    
    # Create tables
    if not create_tables():
        return False
    
    # Create sample data
    if not create_sample_data():
        print("⚠️  Warning: Could not create sample data")
    
    print("✅ Database initialization completed!")
    return True

def create_sample_data():
    """Create sample data for testing"""
    try:
        session = get_db_session()
        
        # Check if sample user already exists
        existing_user = session.query(User).filter_by(username='demo_user').first()
        if existing_user:
            print("📝 Sample data already exists, skipping...")
            session.close()
            return True
        
        # Create sample user
        def hash_password(password):
            import hashlib
            return hashlib.sha256(password.encode()).hexdigest()
        
        sample_user = User(
            username='demo_user',
            email='demo@example.com',
            password_hash=hash_password('demo123'),
            first_name='Demo',
            last_name='User',
            phone_number='+1234567890',
            caregiver_name='Jane Doe',
            caregiver_email='caregiver@example.com',
            caregiver_phone='+0987654321',
            voice_enabled=True,
            large_font=True
        )
        
        session.add(sample_user)
        session.commit()
        
        # Create sample medicines
        sample_medicines = [
            Medicine(
                user_id=sample_user.id,
                name='Aspirin',
                dosage='81mg',
                frequency='daily',
                start_date=datetime.now(),
                form='tablet',
                color='white',
                instructions='Take with food',
                food_instructions='with_food',
                is_critical=True
            ),
            Medicine(
                user_id=sample_user.id,
                name='Vitamin D',
                dosage='1000 IU',
                frequency='daily',
                start_date=datetime.now(),
                form='capsule',
                color='yellow',
                instructions='Take in the morning',
                food_instructions='no_restriction'
            )
        ]
        
        for medicine in sample_medicines:
            import json
            if medicine.name == 'Aspirin':
                medicine.schedule_times = json.dumps(['08:00', '20:00'])
            else:
                medicine.schedule_times = json.dumps(['09:00'])
            session.add(medicine)
        
        session.commit()
        session.close()
        
        print("📝 Sample data created successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error creating sample data: {e}")
        if 'session' in locals():
            session.rollback()
            session.close()
        return False

def drop_all_tables():
    """Drop all tables (for development/testing)"""
    try:
        Base.metadata.drop_all(bind=engine)
        print("🗑️  All tables dropped successfully!")
        return True
    except Exception as e:
        print(f"❌ Error dropping tables: {e}")
        return False

def reset_database():
    """Reset database (drop and recreate)"""
    print("🔄 Resetting database...")
    drop_all_tables()
    return init_database()

def check_database_health():
    """Check database health and connectivity"""
    try:
        session = get_db_session()
        
        # Try to query each table
        user_count = session.query(User).count()
        medicine_count = session.query(Medicine).count()
        adherence_count = session.query(AdherenceLog).count()
        
        session.close()
        
        print(f"📊 Database Health Check:")
        print(f"   Users: {user_count}")
        print(f"   Medicines: {medicine_count}")
        print(f"   Adherence Logs: {adherence_count}")
        print(f"   Database Path: {DATABASE_PATH}")
        print("✅ Database is healthy!")
        
        return True
        
    except Exception as e:
        print(f"❌ Database health check failed: {e}")
        return False

def backup_database(backup_path: str = None):
    """Create database backup"""
    try:
        if not backup_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_path = f"{DATABASE_PATH}.backup_{timestamp}"
        
        # Simple file copy for SQLite
        import shutil
        shutil.copy2(DATABASE_PATH, backup_path)
        
        print(f"💾 Database backed up to: {backup_path}")
        return backup_path
        
    except Exception as e:
        print(f"❌ Database backup failed: {e}")
        return None

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == 'init':
            init_database()
        elif command == 'reset':
            reset_database()
        elif command == 'check':
            check_database_health()
        elif command == 'backup':
            backup_database()
        elif command == 'sample':
            create_sample_data()
        else:
            print("Available commands: init, reset, check, backup, sample")
    else:
        # Default action
        init_database()
