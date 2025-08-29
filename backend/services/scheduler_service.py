"""
Scheduler service for managing medicine reminders
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

class SchedulerService:
    """Service for managing medicine reminder scheduling"""
    
    def __init__(self, database_url: str = None):
        self.scheduler = None
        self.database_url = database_url
        self.is_running = False
        self.reminder_callbacks = {}
        
        self._initialize_scheduler()
    
    def _initialize_scheduler(self):
        """Initialize the APScheduler"""
        try:
            # Configure job stores
            jobstores = {}
            if self.database_url:
                jobstores['default'] = SQLAlchemyJobStore(url=self.database_url)
            
            # Configure executors
            executors = {
                'default': ThreadPoolExecutor(20),
            }
            
            # Job defaults
            job_defaults = {
                'coalesce': False,
                'max_instances': 3
            }
            
            # Create scheduler
            self.scheduler = BackgroundScheduler(
                jobstores=jobstores,
                executors=executors,
                job_defaults=job_defaults,
                timezone='UTC'
            )
            
            logging.info("✅ Scheduler initialized successfully")
            
        except Exception as e:
            logging.error(f"❌ Failed to initialize scheduler: {e}")
            raise
    
    def start(self):
        """Start the scheduler"""
        try:
            if not self.scheduler.running:
                self.scheduler.start()
                self.is_running = True
                logging.info("🚀 Scheduler started successfully")
            else:
                logging.info("⚠️  Scheduler is already running")
                
        except Exception as e:
            logging.error(f"❌ Failed to start scheduler: {e}")
            raise
    
    def stop(self):
        """Stop the scheduler"""
        try:
            if self.scheduler.running:
                self.scheduler.shutdown()
                self.is_running = False
                logging.info("🛑 Scheduler stopped successfully")
            else:
                logging.info("⚠️  Scheduler is not running")
                
        except Exception as e:
            logging.error(f"❌ Failed to stop scheduler: {e}")
    
    def schedule_medicine_reminder(self, medicine_id: int, user_id: int, 
                                 schedule_times: List[str], 
                                 start_date: datetime = None,
                                 end_date: datetime = None) -> bool:
        """
        Schedule recurring medicine reminders
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            schedule_times: List of times in HH:MM format
            start_date: When to start the reminders
            end_date: When to stop the reminders (optional)
            
        Returns:
            True if scheduled successfully
        """
        try:
            start_date = start_date or datetime.now()
            
            for time_str in schedule_times:
                try:
                    # Parse time
                    hour, minute = map(int, time_str.split(':'))
                    
                    # Create cron trigger for daily reminder
                    trigger = CronTrigger(
                        hour=hour,
                        minute=minute,
                        start_date=start_date,
                        end_date=end_date
                    )
                    
                    # Create unique job ID
                    job_id = f"medicine_{medicine_id}_{user_id}_{time_str.replace(':', '')}"
                    
                    # Schedule the job
                    self.scheduler.add_job(
                        func=self._trigger_medicine_reminder,
                        trigger=trigger,
                        args=[medicine_id, user_id, time_str],
                        id=job_id,
                        name=f"Medicine Reminder - {medicine_id} at {time_str}",
                        replace_existing=True
                    )
                    
                    logging.info(f"📅 Scheduled reminder for medicine {medicine_id} at {time_str}")
                    
                except ValueError as e:
                    logging.error(f"❌ Invalid time format {time_str}: {e}")
                    continue
            
            return True
            
        except Exception as e:
            logging.error(f"❌ Failed to schedule medicine reminder: {e}")
            return False
    
    def schedule_single_reminder(self, medicine_id: int, user_id: int, 
                               reminder_time: datetime, 
                               reminder_type: str = 'regular') -> str:
        """
        Schedule a single reminder
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            reminder_time: When to send the reminder
            reminder_type: Type of reminder (regular, snooze, missed)
            
        Returns:
            Job ID if scheduled successfully, None otherwise
        """
        try:
            # Create unique job ID
            timestamp = int(reminder_time.timestamp())
            job_id = f"single_{reminder_type}_{medicine_id}_{user_id}_{timestamp}"
            
            # Create date trigger
            trigger = DateTrigger(run_date=reminder_time)
            
            # Schedule the job
            self.scheduler.add_job(
                func=self._trigger_medicine_reminder,
                trigger=trigger,
                args=[medicine_id, user_id, reminder_time.strftime('%H:%M'), reminder_type],
                id=job_id,
                name=f"Single Reminder - {medicine_id} at {reminder_time}",
                replace_existing=True
            )
            
            logging.info(f"⏰ Scheduled single reminder for medicine {medicine_id} at {reminder_time}")
            return job_id
            
        except Exception as e:
            logging.error(f"❌ Failed to schedule single reminder: {e}")
            return None
    
    def cancel_medicine_reminders(self, medicine_id: int, user_id: int) -> bool:
        """
        Cancel all reminders for a specific medicine
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            
        Returns:
            True if cancelled successfully
        """
        try:
            # Get all jobs
            jobs = self.scheduler.get_jobs()
            cancelled_count = 0
            
            for job in jobs:
                # Check if this job is for the specified medicine
                if (job.id.startswith(f"medicine_{medicine_id}_{user_id}") or
                    job.id.startswith(f"single_") and f"_{medicine_id}_{user_id}_" in job.id):
                    
                    self.scheduler.remove_job(job.id)
                    cancelled_count += 1
                    logging.info(f"🗑️  Cancelled reminder job: {job.id}")
            
            logging.info(f"✅ Cancelled {cancelled_count} reminders for medicine {medicine_id}")
            return True
            
        except Exception as e:
            logging.error(f"❌ Failed to cancel medicine reminders: {e}")
            return False
    
    def snooze_reminder(self, medicine_id: int, user_id: int, 
                       snooze_minutes: int = 5) -> str:
        """
        Snooze a reminder for specified minutes
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            snooze_minutes: Minutes to snooze
            
        Returns:
            Job ID of snoozed reminder
        """
        snooze_time = datetime.now() + timedelta(minutes=snooze_minutes)
        
        return self.schedule_single_reminder(
            medicine_id=medicine_id,
            user_id=user_id,
            reminder_time=snooze_time,
            reminder_type='snooze'
        )
    
    def schedule_missed_dose_alert(self, medicine_id: int, user_id: int, 
                                 delay_minutes: int = 15) -> str:
        """
        Schedule alert for missed dose
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            delay_minutes: Minutes after scheduled time to send alert
            
        Returns:
            Job ID of missed dose alert
        """
        alert_time = datetime.now() + timedelta(minutes=delay_minutes)
        
        return self.schedule_single_reminder(
            medicine_id=medicine_id,
            user_id=user_id,
            reminder_time=alert_time,
            reminder_type='missed'
        )
    
    def _trigger_medicine_reminder(self, medicine_id: int, user_id: int, 
                                 time_str: str, reminder_type: str = 'regular'):
        """
        Internal method to trigger medicine reminder
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            time_str: Time string for the reminder
            reminder_type: Type of reminder
        """
        try:
            logging.info(f"🔔 Triggering reminder for medicine {medicine_id}, user {user_id} at {time_str}")
            
            # Call registered callbacks
            for callback_name, callback_func in self.reminder_callbacks.items():
                try:
                    callback_func(medicine_id, user_id, time_str, reminder_type)
                except Exception as e:
                    logging.error(f"❌ Error in reminder callback {callback_name}: {e}")
            
        except Exception as e:
            logging.error(f"❌ Error triggering reminder: {e}")
    
    def register_reminder_callback(self, name: str, callback: Callable):
        """
        Register a callback function for reminder events
        
        Args:
            name: Name of the callback
            callback: Function to call when reminder triggers
        """
        self.reminder_callbacks[name] = callback
        logging.info(f"📝 Registered reminder callback: {name}")
    
    def unregister_reminder_callback(self, name: str):
        """
        Unregister a callback function
        
        Args:
            name: Name of the callback to remove
        """
        if name in self.reminder_callbacks:
            del self.reminder_callbacks[name]
            logging.info(f"🗑️  Unregistered reminder callback: {name}")
    
    def get_scheduled_reminders(self, user_id: int = None) -> List[Dict]:
        """
        Get list of scheduled reminders
        
        Args:
            user_id: Filter by user ID (optional)
            
        Returns:
            List of scheduled reminder information
        """
        try:
            jobs = self.scheduler.get_jobs()
            reminders = []
            
            for job in jobs:
                # Extract information from job
                job_info = {
                    'id': job.id,
                    'name': job.name,
                    'next_run_time': job.next_run_time.isoformat() if job.next_run_time else None,
                    'args': job.args,
                    'trigger': str(job.trigger)
                }
                
                # Filter by user if specified
                if user_id is None or (len(job.args) > 1 and job.args[1] == user_id):
                    reminders.append(job_info)
            
            return reminders
            
        except Exception as e:
            logging.error(f"❌ Failed to get scheduled reminders: {e}")
            return []
    
    def update_medicine_schedule(self, medicine_id: int, user_id: int, 
                               new_schedule_times: List[str]) -> bool:
        """
        Update the schedule for a medicine
        
        Args:
            medicine_id: ID of the medicine
            user_id: ID of the user
            new_schedule_times: New list of times
            
        Returns:
            True if updated successfully
        """
        try:
            # Cancel existing reminders
            self.cancel_medicine_reminders(medicine_id, user_id)
            
            # Schedule new reminders
            return self.schedule_medicine_reminder(
                medicine_id=medicine_id,
                user_id=user_id,
                schedule_times=new_schedule_times
            )
            
        except Exception as e:
            logging.error(f"❌ Failed to update medicine schedule: {e}")
            return False
    
    def get_status(self) -> Dict[str, any]:
        """Get scheduler status"""
        try:
            jobs = self.scheduler.get_jobs()
            return {
                'running': self.is_running,
                'total_jobs': len(jobs),
                'active_callbacks': len(self.reminder_callbacks),
                'next_run_time': min([job.next_run_time for job in jobs if job.next_run_time], 
                                   default=None)
            }
        except Exception as e:
            logging.error(f"❌ Failed to get scheduler status: {e}")
            return {
                'running': False,
                'total_jobs': 0,
                'active_callbacks': 0,
                'next_run_time': None,
                'error': str(e)
            }

# Global scheduler service instance
scheduler_service = SchedulerService()
