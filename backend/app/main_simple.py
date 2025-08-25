from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import logging

from app.database import get_db, User, Medicine, MedicineIntake
from app.schemas import UserCreate, User as UserSchema, MedicineCreate, Medicine as MedicineSchema
from app.schemas import MedicineIntakeCreate, MedicineIntake as MedicineIntakeSchema
from app.auth import verify_password, get_password_hash, create_access_token, get_current_user
from app.notifications import notification_service

# Initialize logger
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Simple Medicine Reminder",
    description="A college-level medicine reminder system using free resources",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
from app.database import engine, Base
Base.metadata.create_all(bind=engine)

@app.get("/")
def root():
    return {"message": "Welcome to Simple Medicine Reminder API"}

# Authentication endpoints
@app.post("/auth/register", response_model=UserSchema)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user exists
    db_user = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        phone_number=user.phone_number,
        age=user.age,
        medical_conditions=user.medical_conditions
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/auth/login")
def login(username: str, password: str, db: Session = Depends(get_db)):
    """Login user and return access token"""
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    access_token = create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "email": user.email
        }
    }

# Medicine endpoints
@app.post("/medicines", response_model=MedicineSchema)
def create_medicine(
    medicine: MedicineCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a new medicine"""
    user = db.query(User).filter(User.username == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db_medicine = Medicine(
        user_id=user.id,
        name=medicine.name,
        dosage=medicine.dosage,
        frequency=medicine.frequency,
        times=medicine.times,
        duration=medicine.duration,
        instructions=medicine.instructions,
        reminder_enabled=medicine.reminder_enabled
    )
    db.add(db_medicine)
    db.commit()
    db.refresh(db_medicine)
    
    # Show notification
    notification_service.show_system_notification(
        "Medicine Added",
        f"{medicine.name} has been added to your medicines"
    )
    
    return db_medicine

@app.get("/medicines", response_model=List[MedicineSchema])
def get_medicines(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all medicines for current user"""
    user = db.query(User).filter(User.username == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return db.query(Medicine).filter(Medicine.user_id == user.id).all()

@app.delete("/medicines/{medicine_id}")
def delete_medicine(
    medicine_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a medicine"""
    user = db.query(User).filter(User.username == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    medicine = db.query(Medicine).filter(
        Medicine.id == medicine_id,
        Medicine.user_id == user.id
    ).first()
    
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    db.delete(medicine)
    db.commit()
    
    return {"message": "Medicine deleted successfully"}

# Medicine intake endpoints
@app.post("/intakes", response_model=MedicineIntakeSchema)
def record_intake(
    intake: MedicineIntakeCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record medicine intake"""
    user = db.query(User).filter(User.username == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify medicine belongs to user
    medicine = db.query(Medicine).filter(
        Medicine.id == intake.medicine_id,
        Medicine.user_id == user.id
    ).first()
    
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    
    db_intake = MedicineIntake(
        user_id=user.id,
        medicine_id=intake.medicine_id,
        scheduled_time=intake.scheduled_time,
        taken_at=datetime.now() if intake.taken else None,
        taken=intake.taken,
        missed=intake.missed,
        notes=intake.notes
    )
    db.add(db_intake)
    db.commit()
    db.refresh(db_intake)
    
    # Show notification
    if intake.taken:
        notification_service.show_system_notification(
            "Medicine Taken",
            f"{medicine.name} marked as taken"
        )
    
    return db_intake

@app.get("/intakes/today")
def get_todays_intakes(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get today's medicine schedule"""
    user = db.query(User).filter(User.username == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    today = datetime.now().date()
    intakes = db.query(MedicineIntake).filter(
        MedicineIntake.user_id == user.id,
        MedicineIntake.scheduled_time >= datetime.combine(today, datetime.min.time()),
        MedicineIntake.scheduled_time < datetime.combine(today + timedelta(days=1), datetime.min.time())
    ).all()
    
    return intakes

@app.get("/stats/adherence")
def get_adherence_stats(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get adherence statistics"""
    user = db.query(User).filter(User.username == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    intakes = db.query(MedicineIntake).filter(
        MedicineIntake.user_id == user.id,
        MedicineIntake.scheduled_time >= start_date,
        MedicineIntake.scheduled_time <= end_date
    ).all()
    
    total = len(intakes)
    taken = len([i for i in intakes if i.taken])
    missed = len([i for i in intakes if i.missed])
    
    adherence_rate = (taken / total * 100) if total > 0 else 0
    
    return {
        "total_doses": total,
        "taken_doses": taken,
        "missed_doses": missed,
        "adherence_rate": round(adherence_rate, 2),
        "period_days": days
    }

@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
