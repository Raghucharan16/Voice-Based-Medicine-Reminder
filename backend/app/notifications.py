import os
import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
import platform
from sqlalchemy.orm import Session
from app.database import get_db, User, Caregiver, CaregiverNotification, Medicine

class NotificationService:
    def __init__(self):
        print("🔔 Notification Service: Using local system notifications only")
        self.system = platform.system()
        
    def show_system_notification(self, title: str, message: str):
        """Show system notification using OS-specific methods"""
        try:
            if self.system == "Windows":
                try:
                    import win10toast
                    toaster = win10toast.ToastNotifier()
                    toaster.show_toast(title, message, duration=10)
                except ImportError:
                    print(f"📱 {title}: {message}")
            elif self.system == "Darwin":  # macOS
                os.system(f'''osascript -e 'display notification "{message}" with title "{title}"' ''')
            elif self.system == "Linux":
                os.system(f'notify-send "{title}" "{message}"')
            else:
                print(f"📱 {title}: {message}")
        except Exception as e:
            print(f"❌ System notification failed: {e}")
            print(f"📱 {title}: {message}")
    
    def send_reminder_notification(self, user_id: int, medicine_name: str, 
                                   dosage: str, reminder_time: datetime,
                                   db: Session) -> bool:
        """Send reminder notification to user"""
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return False
            
            title = "💊 Medicine Reminder"
            message = f"Time to take {medicine_name} ({dosage})"
            
            # Show system notification
            self.show_system_notification(title, message)
            
            # Log the notification
            print(f"🔔 Reminder sent to {user.name}: {message}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error sending reminder: {str(e)}")
            return False
    
    def send_medication_reminder(self, medicine_name: str, dosage: str, 
                                user_id: int, db: Session) -> bool:
        """Send medication reminder notification"""
        return self.send_reminder_notification(
            user_id=user_id,
            medicine_name=medicine_name,
            dosage=dosage,
            reminder_time=datetime.now(),
            db=db
        )
    
    def send_missed_dose_alert(self, medicine_name: str, user_id: int, 
                              caregiver_id: int, db: Session) -> bool:
        """Send missed dose alert"""
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return False
                
            title = "⚠️ Missed Dose Alert"
            message = f"Missed dose: {medicine_name} for {user.name}"
            
            self.show_system_notification(title, message)
            print(f"⚠️ Missed dose alert: {message}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error sending missed dose alert: {str(e)}")
            return False
    
    def send_adherence_report(self, user_id: int, adherence_percentage: float,
                             caregiver_id: int, db: Session) -> bool:
        """Send adherence report"""
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return False
                
            title = "📊 Weekly Adherence Report"
            message = f"{user.name}'s adherence: {adherence_percentage:.1f}%"
            
            self.show_system_notification(title, message)
            print(f"📊 Adherence report: {message}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error sending adherence report: {str(e)}")
            return False
    
    async def send_medicine_reminder(self, user_id: int, medicine_name: str, dosage: str, scheduled_time: datetime):
        """Async version of medicine reminder"""
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            return self.send_medication_reminder(medicine_name, dosage, user_id, db)
        finally:
            db.close()
    
    async def notify_caregivers_missed_dose(self, user_id: int, medicine_id: int, scheduled_time: datetime):
        """Notify caregivers of missed dose"""
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
            if medicine:
                self.send_missed_dose_alert(medicine.name, user_id, 0, db)
        finally:
            db.close()
    
    async def send_side_effect_alert(self, user_id: int, medicine_name: str, side_effects: str):
        """Send side effect alert"""
        title = "⚠️ Side Effect Alert"
        message = f"Side effects reported for {medicine_name}: {side_effects}"
        self.show_system_notification(title, message)
        print(f"⚠️ Side effect alert: {message}")

# Create instance
notification_service = NotificationService()
