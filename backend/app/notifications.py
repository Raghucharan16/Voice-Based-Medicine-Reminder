import os
import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from twilio.rest import Client
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from sqlalchemy.orm import Session
from app.database import get_db, User, Caregiver, CaregiverNotification, Medicine

class NotificationService:
    def __init__(self):
        # Twilio setup for SMS
        self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID")
        self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN")
        self.twilio_phone_number = os.getenv("TWILIO_PHONE_NUMBER")
        
        if self.twilio_account_sid and self.twilio_auth_token:
            self.twilio_client = Client(self.twilio_account_sid, self.twilio_auth_token)
        else:
            self.twilio_client = None
            print("Twilio credentials not found. SMS notifications disabled.")
        
        # SendGrid setup for Email
        self.sendgrid_api_key = os.getenv("SENDGRID_API_KEY")
        self.from_email = os.getenv("FROM_EMAIL", "noreply@medicinetracker.com")
        
        if self.sendgrid_api_key:
            self.sendgrid_client = SendGridAPIClient(api_key=self.sendgrid_api_key)
        else:
            self.sendgrid_client = None
            print("SendGrid API key not found. Email notifications disabled.")
    
    async def send_sms(self, to_phone: str, message: str) -> bool:
        """Send SMS notification using Twilio"""
        if not self.twilio_client:
            print("SMS service not configured")
            return False
        
        try:
            message = self.twilio_client.messages.create(
                body=message,
                from_=self.twilio_phone_number,
                to=to_phone
            )
            print(f"SMS sent successfully: {message.sid}")
            return True
        except Exception as e:
            print(f"Error sending SMS: {e}")
            return False
    
    async def send_email(self, to_email: str, subject: str, content: str) -> bool:
        """Send email notification using SendGrid"""
        if not self.sendgrid_client:
            print("Email service not configured")
            return False
        
        try:
            message = Mail(
                from_email=self.from_email,
                to_emails=to_email,
                subject=subject,
                html_content=content
            )
            
            response = self.sendgrid_client.send(message)
            print(f"Email sent successfully: {response.status_code}")
            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False
    
    async def send_medicine_reminder(self, user_id: int, medicine_name: str, dosage: str, scheduled_time: datetime):
        """Send medicine reminder to user"""
        db = next(get_db())
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return False
            
            message = f"🔔 Medicine Reminder: It's time to take your {medicine_name} ({dosage}). Scheduled for {scheduled_time.strftime('%I:%M %p')}."
            
            # Send SMS if phone number available
            if user.phone_number and self.twilio_client:
                await self.send_sms(user.phone_number, message)
            
            # You can add email notification here if needed
            return True
            
        except Exception as e:
            print(f"Error sending medicine reminder: {e}")
            return False
        finally:
            db.close()
    
    async def notify_caregivers_missed_dose(self, user_id: int, medicine_id: int, scheduled_time: datetime):
        """Notify caregivers when a dose is missed"""
        db = next(get_db())
        try:
            user = db.query(User).filter(User.id == user_id).first()
            medicine = db.query(Medicine).filter(Medicine.id == medicine_id).first()
            
            if not user or not medicine:
                return False
            
            caregivers = user.caregivers
            
            for caregiver in caregivers:
                # Check notification preferences
                preferences = json.loads(caregiver.notification_preferences or '{"email": true, "sms": false}')
                
                message = f"⚠️ MISSED DOSE ALERT: {user.full_name} missed their {medicine.name} ({medicine.dosage}) scheduled for {scheduled_time.strftime('%I:%M %p on %B %d, %Y')}."
                
                # Send SMS notification
                if preferences.get("sms", False) and caregiver.phone_number:
                    await self.send_sms(caregiver.phone_number, message)
                
                # Send Email notification
                if preferences.get("email", True) and caregiver.email:
                    email_subject = f"Missed Dose Alert - {user.full_name}"
                    email_content = f"""
                    <h2>Missed Dose Alert</h2>
                    <p><strong>Patient:</strong> {user.full_name}</p>
                    <p><strong>Medicine:</strong> {medicine.name}</p>
                    <p><strong>Dosage:</strong> {medicine.dosage}</p>
                    <p><strong>Scheduled Time:</strong> {scheduled_time.strftime('%I:%M %p on %B %d, %Y')}</p>
                    <p><strong>Status:</strong> Missed</p>
                    <br>
                    <p>Please check on the patient and remind them to take their medication if appropriate.</p>
                    <p><em>This is an automated notification from the Medicine Tracker system.</em></p>
                    """
                    await self.send_email(caregiver.email, email_subject, email_content)
                
                # Log the notification
                notification = CaregiverNotification(
                    caregiver_id=caregiver.id,
                    user_id=user_id,
                    medicine_id=medicine_id,
                    notification_type="missed_dose",
                    message=message,
                    sent_via="email,sms" if preferences.get("sms") and preferences.get("email") else ("sms" if preferences.get("sms") else "email"),
                    status="sent"
                )
                db.add(notification)
            
            db.commit()
            return True
            
        except Exception as e:
            print(f"Error notifying caregivers: {e}")
            db.rollback()
            return False
        finally:
            db.close()
    
    async def send_adherence_report(self, user_id: int, caregiver_id: int, report_data: Dict):
        """Send adherence report to caregiver"""
        db = next(get_db())
        try:
            user = db.query(User).filter(User.id == user_id).first()
            caregiver = db.query(Caregiver).filter(Caregiver.id == caregiver_id).first()
            
            if not user or not caregiver:
                return False
            
            # Generate email content
            email_subject = f"Weekly Adherence Report - {user.full_name}"
            email_content = f"""
            <h2>Weekly Medication Adherence Report</h2>
            <p><strong>Patient:</strong> {user.full_name}</p>
            <p><strong>Report Period:</strong> {report_data.get('period_start')} to {report_data.get('period_end')}</p>
            <p><strong>Overall Adherence Rate:</strong> {report_data.get('adherence_rate', 0):.1f}%</p>
            
            <h3>Medicine Summary:</h3>
            <table border="1" style="border-collapse: collapse; width: 100%;">
                <tr>
                    <th>Medicine</th>
                    <th>Doses Taken</th>
                    <th>Doses Scheduled</th>
                    <th>Adherence %</th>
                </tr>
            """
            
            for medicine_data in report_data.get('medicines', []):
                email_content += f"""
                <tr>
                    <td>{medicine_data.get('name')}</td>
                    <td>{medicine_data.get('taken')}</td>
                    <td>{medicine_data.get('scheduled')}</td>
                    <td>{medicine_data.get('adherence', 0):.1f}%</td>
                </tr>
                """
            
            email_content += """
            </table>
            <br>
            <p><strong>Recent Health Feedback:</strong></p>
            <ul>
            """
            
            for feedback in report_data.get('recent_feedback', []):
                email_content += f"<li>{feedback.get('date')}: {feedback.get('notes', 'No notes')}</li>"
            
            email_content += """
            </ul>
            <p><em>This is an automated weekly report from the Medicine Tracker system.</em></p>
            """
            
            # Send email
            await self.send_email(caregiver.email, email_subject, email_content)
            
            # Log the notification
            notification = CaregiverNotification(
                caregiver_id=caregiver_id,
                user_id=user_id,
                notification_type="adherence_report",
                message="Weekly adherence report sent",
                sent_via="email",
                status="sent"
            )
            db.add(notification)
            db.commit()
            
            return True
            
        except Exception as e:
            print(f"Error sending adherence report: {e}")
            db.rollback()
            return False
        finally:
            db.close()
    
    async def send_side_effect_alert(self, user_id: int, medicine_name: str, side_effects: str):
        """Send side effect alert to caregivers"""
        db = next(get_db())
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return False
            
            caregivers = user.caregivers
            
            for caregiver in caregivers:
                preferences = json.loads(caregiver.notification_preferences or '{"email": true, "sms": false}')
                
                message = f"🚨 SIDE EFFECT ALERT: {user.full_name} reported side effects from {medicine_name}: {side_effects}"
                
                # Send SMS
                if preferences.get("sms", False) and caregiver.phone_number:
                    await self.send_sms(caregiver.phone_number, message)
                
                # Send Email
                if preferences.get("email", True) and caregiver.email:
                    email_subject = f"Side Effect Alert - {user.full_name}"
                    email_content = f"""
                    <h2>Side Effect Alert</h2>
                    <p><strong>Patient:</strong> {user.full_name}</p>
                    <p><strong>Medicine:</strong> {medicine_name}</p>
                    <p><strong>Reported Side Effects:</strong> {side_effects}</p>
                    <p><strong>Time:</strong> {datetime.now().strftime('%I:%M %p on %B %d, %Y')}</p>
                    <br>
                    <p>Please contact the patient to assess their condition and consider medical consultation if necessary.</p>
                    <p><em>This is an automated alert from the Medicine Tracker system.</em></p>
                    """
                    await self.send_email(caregiver.email, email_subject, email_content)
                
                # Log notification
                notification = CaregiverNotification(
                    caregiver_id=caregiver.id,
                    user_id=user_id,
                    notification_type="side_effect",
                    message=message,
                    sent_via="email,sms" if preferences.get("sms") and preferences.get("email") else ("sms" if preferences.get("sms") else "email"),
                    status="sent"
                )
                db.add(notification)
            
            db.commit()
            return True
            
        except Exception as e:
            print(f"Error sending side effect alert: {e}")
            db.rollback()
            return False
        finally:
            db.close()

# Global notification service instance
notification_service = NotificationService()
