"""
Utility helper functions for the medicine reminder system
"""

import os
import hashlib
import secrets
import string
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import json
import logging

def generate_secure_token(length: int = 32) -> str:
    """Generate a secure random token"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def hash_password(password: str) -> str:
    """Hash a password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash"""
    return hash_password(password) == hashed

def format_time_for_display(time_obj) -> str:
    """Format time object for user-friendly display"""
    if isinstance(time_obj, str):
        return time_obj
    return time_obj.strftime("%I:%M %p")

def parse_time_string(time_str: str) -> datetime.time:
    """Parse time string into time object"""
    try:
        return datetime.strptime(time_str, "%H:%M").time()
    except ValueError:
        try:
            return datetime.strptime(time_str, "%I:%M %p").time()
        except ValueError:
            raise ValueError(f"Invalid time format: {time_str}")

def get_next_reminder_time(schedule_time: str, current_time: datetime = None) -> datetime:
    """Calculate next reminder time based on schedule"""
    if current_time is None:
        current_time = datetime.now()
    
    # Parse the schedule time
    time_obj = parse_time_string(schedule_time)
    
    # Create next reminder datetime
    next_reminder = datetime.combine(current_time.date(), time_obj)
    
    # If time has passed today, schedule for tomorrow
    if next_reminder <= current_time:
        next_reminder += timedelta(days=1)
    
    return next_reminder

def is_time_for_reminder(schedule_time: str, current_time: datetime = None, tolerance_minutes: int = 5) -> bool:
    """Check if it's time for a reminder within tolerance"""
    if current_time is None:
        current_time = datetime.now()
    
    time_obj = parse_time_string(schedule_time)
    scheduled_datetime = datetime.combine(current_time.date(), time_obj)
    
    time_diff = abs((current_time - scheduled_datetime).total_seconds() / 60)
    return time_diff <= tolerance_minutes

def sanitize_filename(filename: str) -> str:
    """Sanitize filename for safe storage"""
    # Remove or replace unsafe characters
    unsafe_chars = '<>:"/\\|?*'
    for char in unsafe_chars:
        filename = filename.replace(char, '_')
    
    # Limit length
    if len(filename) > 100:
        name, ext = os.path.splitext(filename)
        filename = name[:95] + ext
    
    return filename

def validate_email(email: str) -> bool:
    """Basic email validation"""
    import re
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None

def validate_phone(phone: str) -> bool:
    """Basic phone number validation"""
    import re
    # Remove all non-digit characters
    digits_only = re.sub(r'\D', '', phone)
    # Check if it's a valid length (10-15 digits)
    return 10 <= len(digits_only) <= 15

def format_phone_number(phone: str) -> str:
    """Format phone number for storage"""
    import re
    # Remove all non-digit characters
    digits_only = re.sub(r'\D', '', phone)
    
    # Add country code if not present (assuming US)
    if len(digits_only) == 10:
        digits_only = '1' + digits_only
    
    return '+' + digits_only

def calculate_adherence_percentage(taken: int, total: int) -> float:
    """Calculate adherence percentage"""
    if total == 0:
        return 0.0
    return round((taken / total) * 100, 2)

def get_adherence_status(percentage: float) -> str:
    """Get adherence status based on percentage"""
    if percentage >= 90:
        return "Excellent"
    elif percentage >= 80:
        return "Good"
    elif percentage >= 70:
        return "Fair"
    elif percentage >= 50:
        return "Poor"
    else:
        return "Very Poor"

def create_response(success: bool, message: str, data: Any = None, error: str = None) -> Dict:
    """Create standardized API response"""
    response = {
        "success": success,
        "message": message,
        "timestamp": datetime.now().isoformat()
    }
    
    if data is not None:
        response["data"] = data
    
    if error is not None:
        response["error"] = error
    
    return response

def log_api_call(endpoint: str, method: str, user_id: Optional[int] = None, 
                 status_code: int = 200, response_time: float = 0.0):
    """Log API call for monitoring"""
    log_data = {
        "endpoint": endpoint,
        "method": method,
        "user_id": user_id,
        "status_code": status_code,
        "response_time": response_time,
        "timestamp": datetime.now().isoformat()
    }
    
    logging.info(f"API Call: {json.dumps(log_data)}")

def safe_int_conversion(value: Any, default: int = 0) -> int:
    """Safely convert value to integer"""
    try:
        return int(value)
    except (ValueError, TypeError):
        return default

def safe_float_conversion(value: Any, default: float = 0.0) -> float:
    """Safely convert value to float"""
    try:
        return float(value)
    except (ValueError, TypeError):
        return default

def get_file_extension(filename: str) -> str:
    """Get file extension from filename"""
    return os.path.splitext(filename)[1].lower()

def is_allowed_audio_file(filename: str, allowed_extensions: set) -> bool:
    """Check if file has allowed audio extension"""
    return get_file_extension(filename)[1:] in allowed_extensions

def create_upload_folder(upload_path: str) -> bool:
    """Create upload folder if it doesn't exist"""
    try:
        os.makedirs(upload_path, exist_ok=True)
        return True
    except Exception as e:
        logging.error(f"Failed to create upload folder: {e}")
        return False

def get_time_difference_in_words(time1: datetime, time2: datetime) -> str:
    """Get human-readable time difference"""
    diff = abs((time2 - time1).total_seconds())
    
    if diff < 60:
        return f"{int(diff)} seconds"
    elif diff < 3600:
        return f"{int(diff // 60)} minutes"
    elif diff < 86400:
        return f"{int(diff // 3600)} hours"
    else:
        return f"{int(diff // 86400)} days"

def chunk_list(lst: List, chunk_size: int) -> List[List]:
    """Split list into chunks of specified size"""
    return [lst[i:i + chunk_size] for i in range(0, len(lst), chunk_size)]

class DateTimeEncoder(json.JSONEncoder):
    """JSON encoder for datetime objects"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)
