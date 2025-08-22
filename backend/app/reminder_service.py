from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timedelta
import json
import asyncio
from typing import List, Dict
from sqlalchemy.orm import Session
from app.database import get_db, Medicine, MedicineSchedule, User, Caregiver
from app.notifications import NotificationService
from app.voice_service import voice_manager

class ReminderService:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.notification_service = NotificationService()
        self.active_reminders = {}
        
    def start_scheduler(self):
        """Start the reminder scheduler"""
        self.scheduler.start()
        print("Reminder scheduler started")
    
    def stop_scheduler(self):
        """Stop the reminder scheduler"""
        self.scheduler.shutdown()
        print("Reminder scheduler stopped")
    
    async def schedule_medicine_reminders(self, medicine_id: int, user_id: int):
        """Schedule reminders for a specific medicine"""
        db = next(get_db())
        try:
            medicine = db.query(Medicine).filter(
                Medicine.id == medicine_id,
                Medicine.user_id == user_id,
                Medicine.is_active == True
            ).first()
            
            if not medicine:
                return False
            
            # Parse medicine times
            times = json.loads(medicine.times)
            
            # Create schedules for the next 30 days
            start_date = medicine.start_date
            end_date = medicine.end_date or (start_date + timedelta(days=30))
            
            current_date = start_date.date()
            
            while current_date <= end_date.date():
                for time_str in times:
                    # Parse time (format: "HH:MM")
                    hour, minute = map(int, time_str.split(':'))
                    scheduled_datetime = datetime.combine(current_date, datetime.min.time().replace(hour=hour, minute=minute))
                    
                    # Only schedule future reminders
                    if scheduled_datetime > datetime.now():
                        # Create schedule entry
                        schedule = MedicineSchedule(
                            medicine_id=medicine_id,
                            scheduled_time=scheduled_datetime,
                            status="pending"
                        )
                        db.add(schedule)
                        
                        # Schedule the reminder
                        job_id = f"reminder_{medicine_id}_{scheduled_datetime.isoformat()}"
                        self.scheduler.add_job(
                            self.send_medicine_reminder,
                            trigger=CronTrigger(
                                year=scheduled_datetime.year,
                                month=scheduled_datetime.month,
                                day=scheduled_datetime.day,
                                hour=scheduled_datetime.hour,
                                minute=scheduled_datetime.minute
                            ),
                            args=[medicine_id, user_id, schedule.id],
                            id=job_id,
                            replace_existing=True
                        )
                
                current_date += timedelta(days=1)
            
            db.commit()
            return True
            
        except Exception as e:
            print(f"Error scheduling medicine reminders: {e}")
            db.rollback()
            return False
        finally:
            db.close()
    
    async def send_medicine_reminder(self, medicine_id: int, user_id: int, schedule_id: int):
        """Send medicine reminder to user"""
        db = next(get_db())
        try:
            medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
            user = db.query(User).filter(User.id == user_id).first()
            schedule = db.query(MedicineSchedule).filter(MedicineSchedule.id == schedule_id).first()
            
            if not medicine or not user or not schedule:
                return
            
            # Generate reminder message
            reminder_text = voice_manager.get_medicine_reminders(medicine.name, medicine.dosage)
            
            # Send voice reminder (if user is active)
            voice_manager.speak_text(reminder_text)
            
            # Send notification to user's phone/email
            await self.notification_service.send_medicine_reminder(
                user_id=user_id,
                medicine_name=medicine.name,
                dosage=medicine.dosage,
                scheduled_time=schedule.scheduled_time
            )
            
            # Mark reminder as sent
            schedule.reminder_sent = True
            db.commit()
            
            # Schedule missed dose check (15 minutes later)
            missed_job_id = f"missed_check_{medicine_id}_{schedule.scheduled_time.isoformat()}"
            self.scheduler.add_job(
                self.check_missed_dose,
                trigger=CronTrigger(
                    year=schedule.scheduled_time.year,
                    month=schedule.scheduled_time.month,
                    day=schedule.scheduled_time.day,
                    hour=schedule.scheduled_time.hour,
                    minute=(schedule.scheduled_time.minute + 15) % 60
                ),
                args=[medicine_id, user_id, schedule_id],
                id=missed_job_id,
                replace_existing=True
            )
            
        except Exception as e:
            print(f"Error sending medicine reminder: {e}")
        finally:
            db.close()
    
    async def check_missed_dose(self, medicine_id: int, user_id: int, schedule_id: int):
        """Check if a dose was missed and notify caregivers"""
        db = next(get_db())
        try:
            schedule = db.query(MedicineSchedule).filter(MedicineSchedule.id == schedule_id).first()
            
            if schedule and schedule.status == "pending":
                # Mark as missed
                schedule.status = "missed"
                db.commit()
                
                # Notify caregivers
                await self.notification_service.notify_caregivers_missed_dose(
                    user_id=user_id,
                    medicine_id=medicine_id,
                    scheduled_time=schedule.scheduled_time
                )
                
        except Exception as e:
            print(f"Error checking missed dose: {e}")
        finally:
            db.close()
    
    async def snooze_reminder(self, medicine_id: int, user_id: int, minutes: int = 15):
        """Snooze a medicine reminder"""
        try:
            snooze_time = datetime.now() + timedelta(minutes=minutes)
            
            job_id = f"snooze_{medicine_id}_{snooze_time.isoformat()}"
            self.scheduler.add_job(
                self.send_medicine_reminder,
                trigger=CronTrigger(
                    year=snooze_time.year,
                    month=snooze_time.month,
                    day=snooze_time.day,
                    hour=snooze_time.hour,
                    minute=snooze_time.minute
                ),
                args=[medicine_id, user_id, None],  # No schedule_id for snoozed reminders
                id=job_id,
                replace_existing=True
            )
            
            return True
            
        except Exception as e:
            print(f"Error snoozing reminder: {e}")
            return False
    
    async def cancel_medicine_reminders(self, medicine_id: int):
        """Cancel all reminders for a specific medicine"""
        try:
            # Get all jobs for this medicine
            jobs_to_remove = []
            for job in self.scheduler.get_jobs():
                if f"reminder_{medicine_id}_" in job.id or f"missed_check_{medicine_id}_" in job.id:
                    jobs_to_remove.append(job.id)
            
            # Remove the jobs
            for job_id in jobs_to_remove:
                self.scheduler.remove_job(job_id)
            
            return True
            
        except Exception as e:
            print(f"Error canceling medicine reminders: {e}")
            return False
    
    async def get_upcoming_reminders(self, user_id: int, hours: int = 24) -> List[Dict]:
        """Get upcoming reminders for a user"""
        db = next(get_db())
        try:
            end_time = datetime.now() + timedelta(hours=hours)
            
            schedules = db.query(MedicineSchedule).join(Medicine).filter(
                Medicine.user_id == user_id,
                MedicineSchedule.scheduled_time >= datetime.now(),
                MedicineSchedule.scheduled_time <= end_time,
                MedicineSchedule.status == "pending"
            ).order_by(MedicineSchedule.scheduled_time).all()
            
            reminders = []
            for schedule in schedules:
                reminders.append({
                    "schedule_id": schedule.id,
                    "medicine_id": schedule.medicine_id,
                    "medicine_name": schedule.medicine.name,
                    "dosage": schedule.medicine.dosage,
                    "scheduled_time": schedule.scheduled_time,
                    "time_until": schedule.scheduled_time - datetime.now()
                })
            
            return reminders
            
        except Exception as e:
            print(f"Error getting upcoming reminders: {e}")
            return []
        finally:
            db.close()
    
    async def reschedule_all_user_reminders(self, user_id: int):
        """Reschedule all reminders for a user (useful after medicine changes)"""
        db = next(get_db())
        try:
            medicines = db.query(Medicine).filter(
                Medicine.user_id == user_id,
                Medicine.is_active == True
            ).all()
            
            for medicine in medicines:
                # Cancel existing reminders
                await self.cancel_medicine_reminders(medicine.id)
                
                # Schedule new reminders
                await self.schedule_medicine_reminders(medicine.id, user_id)
            
            return True
            
        except Exception as e:
            print(f"Error rescheduling user reminders: {e}")
            return False
        finally:
            db.close()

# Global reminder service instance
reminder_service = ReminderService()
