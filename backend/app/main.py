from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import os
import logging
from datetime import datetime, timedelta
import asyncio

from app.database import get_db, User, Medicine, MedicineIntake, HealthFeedback, Caregiver
from app.schemas import *
from app.auth import verify_password, get_password_hash, create_access_token, verify_token
from app.voice_service import voice_manager
from app.reminder_service import reminder_service
from app.notifications import notification_service
from app.huggingface_ai_service import huggingface_ai_service
from app.local_ai_reports import local_ai_service

# Initialize logger
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Medicine Reminder & Tracker",
    description="Voice-based medicine reminder and tracking system with AI insights",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated user"""
    token = credentials.credentials
    username = verify_token(token)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# WebSocket connection manager for real-time features
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Startup event
@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    # Start reminder scheduler
    reminder_service.start_scheduler()
    
    # Initialize voice manager
    voice_manager.start_listening()
    
    print("Medicine Tracker API started successfully!")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    reminder_service.stop_scheduler()
    voice_manager.stop_listening()

# Authentication routes
@app.post("/auth/register", response_model=User)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Username already registered")
    if db.query(User).filter(User.email == user_data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        phone_number=user_data.phone_number,
        age=user_data.age,
        medical_conditions=user_data.medical_conditions
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user

@app.post("/auth/login", response_model=Token)
async def login(username: str, password: str, db: Session = Depends(get_db)):
    """Login user and return access token"""
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# User routes
@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user

@app.put("/users/me", response_model=User)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    for field, value in user_update.dict(exclude_unset=True).items():
        setattr(current_user, field, value)
    
    db.commit()
    db.refresh(current_user)
    return current_user

# Medicine routes
@app.post("/medicines", response_model=Medicine)
async def create_medicine(
    medicine: MedicineCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new medicine"""
    try:
        print(f"Received medicine data: {medicine.dict()}")  # Debug print
        
        # Convert string dates to datetime objects
        start_date = datetime.strptime(medicine.start_date, "%Y-%m-%dT%H:%M:%S")
        end_date = datetime.strptime(medicine.end_date, "%Y-%m-%dT%H:%M:%S") if medicine.end_date else None
        
        print(f"Dates converted: start={start_date}, end={end_date}")  # Debug print
        
        db_medicine = Medicine(
            name=medicine.name,
            dosage=medicine.dosage,
            instructions=medicine.instructions,
            frequency_per_day=medicine.frequency_per_day,
            duration_days=medicine.duration_days,
            start_date=start_date,
            end_date=end_date,
            times=medicine.times,
            reminder_enabled=medicine.reminder_enabled,
            user_id=current_user.id
        )
        
        print("About to add to database")  # Debug print
        db.add(db_medicine)
        db.commit()
        db.refresh(db_medicine)
        
        print("About to schedule reminders")  # Debug print
        await reminder_service.schedule_medicine_reminders(db_medicine.id, current_user.id)
        
        print(f"Medicine created successfully: {db_medicine}")  # Debug print
        return db_medicine
        
    except ValueError as ve:
        error_msg = f"Date format error: {str(ve)}"
        print(error_msg)  # Debug print
        raise HTTPException(status_code=400, detail=error_msg)
    except Exception as e:
        error_msg = f"Error creating medicine: {str(e)}"
        print(error_msg)  # Debug print
        print(f"Exception type: {type(e)}")  # Debug print
        import traceback
        print(f"Traceback: {traceback.format_exc()}")  # Debug print
        raise HTTPException(status_code=500, detail=error_msg)
    
    return db_medicine

@app.get("/medicines", response_model=List[Medicine])
async def get_medicines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all medicines for current user"""
    return db.query(Medicine).filter(Medicine.user_id == current_user.id, Medicine.is_active == True).all()

@app.put("/medicines/{medicine_id}", response_model=Medicine)
async def update_medicine(
    medicine_id: int,
    medicine_update: MedicineUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a medicine"""
    medicine = db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.user_id == current_user.id
    ).first()
    
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    for field, value in medicine_update.dict(exclude_unset=True).items():
        setattr(medicine, field, value)
    
    db.commit()
    db.refresh(medicine)
    
    # Reschedule reminders if active
    if medicine.is_active and medicine.reminder_enabled:
        await reminder_service.cancel_medicine_reminders(medicine_id)
        await reminder_service.schedule_medicine_reminders(medicine_id, current_user.id)
    
    return medicine

@app.delete("/medicines/{medicine_id}")
async def delete_medicine(
    medicine_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete (deactivate) a medicine"""
    medicine = db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.user_id == current_user.id
    ).first()
    
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    medicine.is_active = False
    db.commit()
    
    # Cancel reminders
    await reminder_service.cancel_medicine_reminders(medicine_id)
    
    return {"message": "Medicine deleted successfully"}

# Medicine intake routes
@app.post("/intakes", response_model=MedicineIntake)
async def log_medicine_intake(
    intake: MedicineIntakeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log medicine intake"""
    db_intake = MedicineIntake(
        **intake.dict(),
        user_id=current_user.id,
        taken_at=datetime.now() if intake.status == "taken" else None
    )
    db.add(db_intake)
    db.commit()
    db.refresh(db_intake)
    
    return db_intake

@app.get("/intakes", response_model=List[MedicineIntake])
async def get_medicine_intakes(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get medicine intakes for the last N days"""
    start_date = datetime.now() - timedelta(days=days)
    return db.query(MedicineIntake).filter(
        MedicineIntake.user_id == current_user.id,
        MedicineIntake.created_at >= start_date
    ).order_by(MedicineIntake.created_at.desc()).all()

# Voice interaction routes
@app.post("/voice/command", response_model=VoiceResponse)
async def process_voice_command(
    command: VoiceCommand,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Process voice command"""
    result = voice_manager.process_voice_command(command.command)
    
    response_text = "Command processed"
    action_taken = None
    
    if result["action"] == "log_intake":
        if result["type"] == "medicine_taken":
            response_text = "Great! I've logged that you took your medicine."
            action_taken = "intake_logged"
        elif result["type"] == "medicine_skipped":
            response_text = "I've noted that you skipped your medicine. Is everything okay?"
            action_taken = "intake_skipped"
    
    elif result["action"] == "snooze_reminder":
        await reminder_service.snooze_reminder(None, current_user.id, 15)
        response_text = "I'll remind you again in 15 minutes."
        action_taken = "reminder_snoozed"
    
    elif result["action"] == "show_help":
        response_text = voice_manager.get_voice_help()
        action_taken = "help_shown"
    
    elif result["action"] == "log_feedback":
        response_text = "Thank you for sharing how you're feeling. This information helps track your health."
        action_taken = "feedback_logged"
    
    else:
        response_text = "I didn't understand that command. Say 'help' to see available commands."
    
    # Generate voice response
    voice_manager.speak_text(response_text)
    
    return VoiceResponse(
        text=response_text,
        action_taken=action_taken
    )

@app.get("/voice/listen")
async def start_voice_listening():
    """Start listening for voice commands"""
    if voice_manager.start_listening():
        return {"message": "Voice listening started"}
    else:
        raise HTTPException(status_code=500, detail="Failed to start voice listening")

@app.post("/voice/speak")
async def speak_text(text: str):
    """Convert text to speech"""
    success = voice_manager.speak_text(text)
    if success:
        return {"message": "Text spoken successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to speak text")

# Health feedback routes
@app.post("/feedback", response_model=HealthFeedback)
async def create_health_feedback(
    feedback: HealthFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create health feedback"""
    db_feedback = HealthFeedback(**feedback.dict(), user_id=current_user.id)
    db.add(db_feedback)
    db.commit()
    db.refresh(db_feedback)
    
    # Check for side effects and alert caregivers
    if feedback.side_effects:
        medicine = db.query(Medicine).filter(Medicine.id == feedback.medicine_id).first()
        if medicine:
            notification_service.send_reminder_notification(
                current_user.id,
                f"Side effect alert: {medicine.name}",
                f"Side effects: {feedback.side_effects}",
                datetime.now(),
                db
            )
    
    return db_feedback

@app.get("/feedback", response_model=List[HealthFeedback])
async def get_health_feedback(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get health feedback for the last N days"""
    start_date = datetime.now() - timedelta(days=days)
    return db.query(HealthFeedback).filter(
        HealthFeedback.user_id == current_user.id,
        HealthFeedback.created_at >= start_date
    ).order_by(HealthFeedback.created_at.desc()).all()

# Caregiver routes
@app.post("/caregivers", response_model=Caregiver)
async def add_caregiver(
    caregiver: CaregiverCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a caregiver"""
    db_caregiver = Caregiver(**caregiver.dict())
    db.add(db_caregiver)
    db.commit()
    db.refresh(db_caregiver)
    
    # Associate with current user
    current_user.caregivers.append(db_caregiver)
    db.commit()
    
    return db_caregiver

@app.get("/caregivers", response_model=List[Caregiver])
async def get_caregivers(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all caregivers for current user"""
    return current_user.caregivers

# AI Reports routes
@app.post("/reports/adherence")
async def generate_adherence_report(
    report_request: AIReportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate AI-powered adherence report using Hugging Face models"""
    # Try Hugging Face AI first, fallback to local AI
    try:
        ai_patterns = huggingface_ai_service.analyze_patterns_with_ai(current_user.id, db)
        adherence_score = huggingface_ai_service.calculate_adherence_score(
            current_user.id, db, report_request.period_days
        )
        
        return {
            "adherence_score": adherence_score,
            "patterns": ai_patterns,
            "period_days": report_request.period_days,
            "ai_provider": "huggingface"
        }
    except Exception as e:
        # Fallback to local AI
        logger.warning(f"HuggingFace AI failed, using local AI: {str(e)}")
        patterns = local_ai_service.analyze_patterns(current_user.id, db)
        adherence_score = local_ai_service.calculate_adherence_score(
            current_user.id, db, report_request.period_days
        )
        
        return {
            "adherence_score": adherence_score,
            "patterns": patterns,
            "period_days": report_request.period_days,
            "ai_provider": "local"
        }

@app.get("/reports/weekly-summary")
async def get_weekly_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get weekly summary with AI insights"""
    try:
        # Try Hugging Face AI for enhanced insights
        patterns = huggingface_ai_service.analyze_patterns_with_ai(current_user.id, db)
        health_insights = huggingface_ai_service.analyze_health_sentiment(current_user.id, db)
        
        return {
            "patterns": patterns,
            "health_insights": health_insights,
            "generated_at": datetime.now().isoformat(),
            "ai_provider": "huggingface"
        }
    except Exception as e:
        # Fallback to local AI
        logger.warning(f"HuggingFace AI failed, using local AI: {str(e)}")
        patterns = local_ai_service.analyze_patterns(current_user.id, db)
        health_insights = local_ai_service.generate_health_insights(current_user.id, db)
        
        return {
            "patterns": patterns,
            "health_insights": health_insights,
            "generated_at": datetime.now().isoformat(),
            "ai_provider": "local"
        }

# Additional routes for Streamlit integration

@app.get("/reports/adherence-score")
async def get_adherence_score(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current adherence score"""
    score = local_ai_service.calculate_adherence_score(current_user.id, db)
    return {"adherence_score": score}

@app.get("/reports/patterns")
async def get_patterns(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get behavior patterns analysis with AI enhancement"""
    try:
        # Try Hugging Face AI first for enhanced insights
        patterns = huggingface_ai_service.analyze_patterns_with_ai(current_user.id, db)
        return {**patterns, "ai_provider": "huggingface"}
    except Exception as e:
        # Fallback to local AI
        logger.warning(f"HuggingFace AI failed, using local AI: {str(e)}")
        patterns = local_ai_service.analyze_patterns(current_user.id, db)
        return {**patterns, "ai_provider": "local"}

@app.get("/reports/health-sentiment")
async def get_health_sentiment(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get health sentiment analysis using Hugging Face models"""
    try:
        sentiment_analysis = huggingface_ai_service.analyze_health_sentiment(current_user.id, db)
        return {**sentiment_analysis, "ai_provider": "huggingface"}
    except Exception as e:
        # Fallback to local analysis
        logger.warning(f"HuggingFace sentiment analysis failed: {str(e)}")
        health_insights = local_ai_service.generate_health_insights(current_user.id, db)
        return {**health_insights, "ai_provider": "local"}

@app.get("/reminders/today")
async def get_today_reminders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get today's medicine schedule"""
    today = datetime.now().date()
    
    # Get user's medicines and their schedules
    medicines = db.query(Medicine).filter(
        Medicine.user_id == current_user.id,
        Medicine.is_active == True
    ).all()
    
    reminders = []
    for medicine in medicines:
        # For simplicity, create basic schedule based on frequency
        frequency_map = {
            "Once daily": ["08:00"],
            "Twice daily": ["08:00", "20:00"],
            "Three times daily": ["08:00", "14:00", "20:00"],
            "Four times daily": ["08:00", "12:00", "16:00", "20:00"]
        }
        
        times = frequency_map.get(medicine.frequency, ["08:00"])
        
        for time_str in times:
            # Check if already taken today
            today_start = datetime.combine(today, datetime.min.time())
            today_end = datetime.combine(today, datetime.max.time())
            
            intake = db.query(MedicineIntake).filter(
                MedicineIntake.medicine_id == medicine.id,
                MedicineIntake.taken_at >= today_start,
                MedicineIntake.taken_at <= today_end,
                MedicineIntake.created_at >= today_start
            ).first()
            
            status = "taken" if intake and intake.status == "taken" else "pending"
            
            reminders.append({
                "id": f"{medicine.id}_{time_str}",
                "medicine_id": medicine.id,
                "medicine_name": medicine.name,
                "dosage": medicine.dosage,
                "time": time_str,
                "status": status
            })
    
    return reminders

@app.get("/intakes/recent")
async def get_recent_intakes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get recent medicine intakes"""
    week_ago = datetime.now() - timedelta(days=7)
    
    intakes = db.query(MedicineIntake).join(Medicine).filter(
        Medicine.user_id == current_user.id,
        MedicineIntake.created_at >= week_ago
    ).order_by(MedicineIntake.created_at.desc()).limit(20).all()
    
    result = []
    for intake in intakes:
        result.append({
            "id": intake.id,
            "medicine_id": intake.medicine_id,
            "medicine_name": intake.medicine.name,
            "dosage": intake.medicine.dosage,
            "status": intake.status,
            "taken_at": intake.taken_at.isoformat() if intake.taken_at else None,
            "created_at": intake.created_at.isoformat(),
            "notes": intake.notes
        })
    
    return result

@app.post("/notifications/test")
async def test_notification(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Test notification system"""
    # Test system notifications
    notification_service.show_system_notification("Test Notification", "This is a test message from the Medicine Reminder system")
    return {"status": "success", "message": "Test notification sent"}

@app.get("/feedback/")
async def get_health_feedback(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's health feedback"""
    feedback_list = db.query(HealthFeedback).join(MedicineIntake).join(Medicine).filter(
        Medicine.user_id == current_user.id
    ).order_by(HealthFeedback.created_at.desc()).limit(20).all()
    
    result = []
    for feedback in feedback_list:
        result.append({
            "id": feedback.id,
            "intake_id": feedback.intake_id,
            "medicine_name": feedback.intake.medicine.name,
            "mood_rating": feedback.mood_rating,
            "energy_level": feedback.energy_level,
            "side_effects": feedback.side_effects,
            "symptoms": feedback.symptoms,
            "notes": feedback.notes,
            "created_at": feedback.created_at.isoformat()
        })
    
    return result
@app.get("/dashboard", response_model=DashboardData)
async def get_dashboard_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get dashboard data"""
    # Get today's medicines
    today_medicines = db.query(Medicine).filter(
        Medicine.user_id == current_user.id,
        Medicine.is_active == True
    ).all()
    
    # Get recent intakes (last 7 days)
    week_ago = datetime.now() - timedelta(days=7)
    recent_intakes = db.query(MedicineIntake).filter(
        MedicineIntake.user_id == current_user.id,
        MedicineIntake.created_at >= week_ago
    ).order_by(MedicineIntake.created_at.desc()).limit(10).all()
    
    # Calculate adherence rate
    total_scheduled = len(today_medicines) * 7  # Rough estimate
    total_taken = len([i for i in recent_intakes if i.status == "taken"])
    adherence_rate = (total_taken / total_scheduled * 100) if total_scheduled > 0 else 0
    
    # Get upcoming reminders
    upcoming_reminders = await reminder_service.get_upcoming_reminders(current_user.id, 24)
    
    # Get recent feedback
    recent_feedback = db.query(HealthFeedback).filter(
        HealthFeedback.user_id == current_user.id
    ).order_by(HealthFeedback.created_at.desc()).limit(5).all()
    
    return DashboardData(
        user=current_user,
        today_medicines=today_medicines,
        recent_intakes=recent_intakes,
        adherence_rate=round(adherence_rate, 2),
        upcoming_reminders=upcoming_reminders,
        recent_feedback=recent_feedback
    )

# WebSocket endpoint for real-time updates
@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Process real-time voice commands or updates
            await manager.send_personal_message(f"Echo: {data}", websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "voice": voice_manager.is_listening,
            "scheduler": reminder_service.scheduler.running,
            "database": True
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
