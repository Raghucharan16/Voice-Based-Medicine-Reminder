import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from . import models
import os
import subprocess
import platform

logger = logging.getLogger(__name__)

class LocalNotificationService:
    """Local notification service using system notifications only"""
    
    def __init__(self):
        self.system = platform.system()
        self.notifications_enabled = True
    
    def send_reminder_notification(self, user_id: int, medicine_name: str, dosage: str, db: Session) -> bool:
        """Send a local system notification for medicine reminder"""
        try:
            title = "Medicine Reminder"
            message = f"Time to take {medicine_name} ({dosage})"
            
            # Send system notification
            self._send_system_notification(title, message)
            
            # Log notification in database
            notification = models.CaregiverNotification(
                user_id=user_id,
                caregiver_id=None,  # No caregiver for local notifications
                notification_type="reminder",
                message=message,
                method="system",
                status="sent",
                sent_at=datetime.now()
            )
            
            db.add(notification)
            db.commit()
            
            logger.info(f"Local reminder notification sent for user {user_id}: {medicine_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending local notification: {str(e)}")
            return False
    
    def send_missed_dose_alert(self, user_id: int, medicine_name: str, caregivers: List[models.Caregiver], db: Session) -> bool:
        """Send missed dose alert (local notification only)"""
        try:
            title = "Missed Dose Alert"
            message = f"Missed dose: {medicine_name}. Please take when possible."
            
            # Send system notification
            self._send_system_notification(title, message)
            
            # Log notification for each caregiver (but don't actually send external notifications)
            for caregiver in caregivers:
                notification = models.CaregiverNotification(
                    user_id=user_id,
                    caregiver_id=caregiver.id,
                    notification_type="missed_dose",
                    message=f"Alert: {caregiver.user.username} missed dose of {medicine_name}",
                    method="local",
                    status="logged",  # Just logged, not actually sent
                    sent_at=datetime.now()
                )
                
                db.add(notification)
            
            db.commit()
            
            logger.info(f"Missed dose alert logged for user {user_id}: {medicine_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending missed dose alert: {str(e)}")
            return False
    
    def send_adherence_report(self, user_id: int, report_data: Dict[str, Any], caregivers: List[models.Caregiver], db: Session) -> bool:
        """Send adherence report notification (local only)"""
        try:
            adherence_score = report_data.get('adherence_score', 0)
            title = "Weekly Adherence Report"
            message = f"Your medication adherence this week: {adherence_score}%"
            
            # Send system notification
            self._send_system_notification(title, message)
            
            # Log for caregivers
            for caregiver in caregivers:
                notification = models.CaregiverNotification(
                    user_id=user_id,
                    caregiver_id=caregiver.id,
                    notification_type="adherence_report",
                    message=f"Weekly adherence report for {caregiver.user.username}: {adherence_score}%",
                    method="local",
                    status="logged",
                    sent_at=datetime.now()
                )
                
                db.add(notification)
            
            db.commit()
            
            logger.info(f"Adherence report notification sent for user {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error sending adherence report: {str(e)}")
            return False
    
    def _send_system_notification(self, title: str, message: str) -> bool:
        """Send system notification based on OS"""
        try:
            if self.system == "Windows":
                # Windows notification using PowerShell
                ps_script = f'''
                Add-Type -AssemblyName System.Windows.Forms
                $notification = New-Object System.Windows.Forms.NotifyIcon
                $notification.Icon = [System.Drawing.SystemIcons]::Information
                $notification.BalloonTipTitle = "{title}"
                $notification.BalloonTipText = "{message}"
                $notification.Visible = $true
                $notification.ShowBalloonTip(5000)
                Start-Sleep -Seconds 6
                $notification.Dispose()
                '''
                
                subprocess.run(["powershell", "-Command", ps_script], 
                             capture_output=True, text=True, timeout=10)
                
            elif self.system == "Darwin":  # macOS
                script = f'display notification "{message}" with title "{title}"'
                subprocess.run(["osascript", "-e", script], 
                             capture_output=True, text=True, timeout=10)
                
            elif self.system == "Linux":
                subprocess.run(["notify-send", title, message], 
                             capture_output=True, text=True, timeout=10)
            
            return True
            
        except Exception as e:
            logger.error(f"Error sending system notification: {str(e)}")
            return False
    
    def get_notification_history(self, user_id: int, db: Session, days: int = 7) -> List[Dict[str, Any]]:
        """Get notification history for user"""
        try:
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            notifications = db.query(models.CaregiverNotification).filter(
                models.CaregiverNotification.user_id == user_id,
                models.CaregiverNotification.sent_at >= start_date
            ).order_by(models.CaregiverNotification.sent_at.desc()).all()
            
            history = []
            for notification in notifications:
                history.append({
                    "id": notification.id,
                    "type": notification.notification_type,
                    "message": notification.message,
                    "method": notification.method,
                    "status": notification.status,
                    "sent_at": notification.sent_at.isoformat() if notification.sent_at else None,
                    "caregiver_name": notification.caregiver.name if notification.caregiver else "Self"
                })
            
            return history
            
        except Exception as e:
            logger.error(f"Error getting notification history: {str(e)}")
            return []
    
    def test_notification_system(self) -> Dict[str, Any]:
        """Test the local notification system"""
        try:
            title = "Medicine Reminder Test"
            message = "This is a test notification from your medicine reminder system."
            
            success = self._send_system_notification(title, message)
            
            return {
                "success": success,
                "system": self.system,
                "message": "Test notification sent successfully" if success else "Failed to send test notification"
            }
            
        except Exception as e:
            logger.error(f"Error testing notification system: {str(e)}")
            return {
                "success": False,
                "system": self.system,
                "message": f"Test failed: {str(e)}"
            }

# Create global instance
local_notification_service = LocalNotificationService()
