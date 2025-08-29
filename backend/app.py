"""
Flask backend application for Voice-Based Medicine Reminder
"""

import os
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Import configuration
from utils.config import config_map
from utils.helpers import create_response, log_api_call

# Import services
try:
    from services.voice_service_simple import voice_service
    VOICE_SERVICE_AVAILABLE = True
except Exception as e:
    print(f"⚠️  Voice service not available: {e}")
    voice_service = None
    VOICE_SERVICE_AVAILABLE = False
    
from services.scheduler_service import scheduler_service

# Import database and models
from database.init_db import init_database, get_db_session, User, Medicine, AdherenceLog

def create_app(config_name='development'):
    """Application factory"""
    app = Flask(__name__)
    
    # Load configuration
    config_class = config_map.get(config_name, config_map['default'])
    app.config.from_object(config_class)
    
    # Initialize extensions
    CORS(app, origins=app.config['CORS_ORIGINS'])
    
    # Setup logging
    logging.basicConfig(
        level=getattr(logging, app.config['LOG_LEVEL']),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Initialize database
    with app.app_context():
        init_database()
    
    # Start scheduler
    try:
        scheduler_service.start()
        
        # Register reminder callback
        def handle_medicine_reminder(medicine_id, user_id, time_str, reminder_type='regular'):
            """Handle medicine reminder callback from scheduler"""
            with app.app_context():
                try:
                    session = get_db_session()
                    
                    # Get medicine and user information
                    medicine = session.query(Medicine).filter_by(id=medicine_id).first()
                    user = session.query(User).filter_by(id=user_id).first()
                    
                    if medicine and user:
                        # Create adherence log entry
                        adherence_log = AdherenceLog(
                            user_id=user_id,
                            medicine_id=medicine_id,
                            scheduled_time=datetime.now(),
                            status='pending'
                        )
                        session.add(adherence_log)
                        session.commit()
                        
                        # Send voice reminder if enabled
                        if user.voice_enabled and VOICE_SERVICE_AVAILABLE and voice_service.is_initialized:
                            announcement = voice_service.create_reminder_announcement(
                                medicine.name,
                                medicine.dosage,
                                time_str,
                                medicine.instructions
                            )
                            voice_service.speak_text(announcement, blocking=False)
                        
                        logging.info(f"📢 Reminded user {user_id} about medicine {medicine_id}")
                    
                    session.close()
                    
                except Exception as e:
                    logging.error(f"❌ Error handling reminder: {e}")
        
        scheduler_service.register_reminder_callback('main_reminder', handle_medicine_reminder)
        
    except Exception as e:
        logging.error(f"❌ Failed to start scheduler: {e}")
    
    # Register API routes
    register_routes(app)
    
    return app

def register_routes(app):
    """Register all API routes"""
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """Health check endpoint"""
        voice_status = voice_service.get_health_status() if VOICE_SERVICE_AVAILABLE else {"status": "unavailable", "message": "Voice dependencies not installed"}
        scheduler_status = scheduler_service.get_status()
        
        return jsonify(create_response(
            success=True,
            message="Application is healthy",
            data={
                'timestamp': datetime.now().isoformat(),
                'voice_service': voice_status,
                'scheduler_service': scheduler_status
            }
        ))
    
    # Voice API endpoints
    @app.route('/api/voice/transcribe', methods=['POST'])
    def transcribe_audio():
        """Transcribe audio file to text"""
        try:
            if not VOICE_SERVICE_AVAILABLE:
                return jsonify(create_response(
                    success=False,
                    error="Voice service not available - dependencies not installed"
                )), 503
                
            if 'audio' not in request.files:
                return jsonify(create_response(
                    success=False,
                    error="No audio file provided"
                )), 400
            
            audio_file = request.files['audio']
            if audio_file.filename == '':
                return jsonify(create_response(
                    success=False,
                    error="No file selected"
                )), 400
            
            # Save temporary file
            filename = secure_filename(audio_file.filename)
            temp_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            audio_file.save(temp_path)
            
            try:
                # Transcribe audio
                result = voice_service.transcribe_audio_file(temp_path)
                
                return jsonify(create_response(
                    success=result['success'],
                    message="Audio transcribed successfully" if result['success'] else "Transcription failed",
                    data=result
                ))
                
            finally:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
        
        except Exception as e:
            logging.error(f"❌ Transcription error: {e}")
            return jsonify(create_response(
                success=False,
                error=str(e)
            )), 500
    
    @app.route('/api/voice/speak', methods=['POST'])
    def text_to_speech():
        """Convert text to speech"""
        try:
            if not VOICE_SERVICE_AVAILABLE:
                return jsonify(create_response(
                    success=False,
                    error="Voice service not available - dependencies not installed"
                )), 503
                
            data = request.get_json()
            text = data.get('text', '')
            blocking = data.get('blocking', False)
            
            if not text:
                return jsonify(create_response(
                    success=False,
                    error="No text provided"
                )), 400
            
            result = voice_service.speak_text(text, blocking)
            
            return jsonify(create_response(
                success=result['success'],
                message="Text spoken successfully" if result['success'] else "TTS failed",
                data=result
            ))
        
        except Exception as e:
            logging.error(f"❌ TTS error: {e}")
            return jsonify(create_response(
                success=False,
                error=str(e)
            )), 500
    
    @app.route('/api/voice/listen', methods=['POST'])
    def listen_for_speech():
        """Listen for speech from microphone"""
        try:
            if not VOICE_SERVICE_AVAILABLE:
                return jsonify(create_response(
                    success=False,
                    error="Voice service not available - dependencies not installed"
                )), 503
                
            data = request.get_json() or {}
            timeout = data.get('timeout', 5)
            
            result = voice_service.listen_for_speech(timeout)
            
            return jsonify(create_response(
                success=result['success'],
                message="Speech captured successfully" if result['success'] else "Speech capture failed",
                data=result
            ))
        
        except Exception as e:
            logging.error(f"❌ Speech capture error: {e}")
            return jsonify(create_response(
                success=False,
                error=str(e)
            )), 500
    
    # Medicine API endpoints
    @app.route('/api/medicines', methods=['GET'])
    def get_medicines():
        """Get all medicines for a user"""
        try:
            user_id = request.args.get('user_id', type=int)
            if not user_id:
                return jsonify(create_response(
                    success=False,
                    error="User ID required"
                )), 400
            
            session = get_db_session()
            medicines = session.query(Medicine).filter_by(
                user_id=user_id, 
                is_active=True
            ).all()
            
            medicines_data = [medicine.to_dict() for medicine in medicines]
            session.close()
            
            return jsonify(create_response(
                success=True,
                message="Medicines retrieved successfully",
                data=medicines_data
            ))
        
        except Exception as e:
            logging.error(f"❌ Error getting medicines: {e}")
            return jsonify(create_response(
                success=False,
                error=str(e)
            )), 500
    
    @app.route('/api/medicines', methods=['POST'])
    def add_medicine():
        """Add new medicine"""
        try:
            data = request.get_json()
            
            required_fields = ['user_id', 'name', 'dosage', 'frequency', 'schedule_times']
            for field in required_fields:
                if field not in data:
                    return jsonify(create_response(
                        success=False,
                        error=f"Missing required field: {field}"
                    )), 400
            
            session = get_db_session()
            
            # Create medicine
            medicine = Medicine(
                user_id=data['user_id'],
                name=data['name'],
                dosage=data['dosage'],
                frequency=data['frequency'],
                start_date=datetime.now()
            )
            
            # Set optional fields
            optional_fields = [
                'form', 'color', 'instructions', 'food_instructions',
                'doctor_name', 'is_critical', 'total_quantity'
            ]
            for field in optional_fields:
                if field in data:
                    setattr(medicine, field, data[field])
            
            # Set schedule times
            medicine.set_schedule_times(data['schedule_times'])
            
            session.add(medicine)
            session.commit()
            
            # Schedule reminders
            scheduler_service.schedule_medicine_reminder(
                medicine_id=medicine.id,
                user_id=medicine.user_id,
                schedule_times=data['schedule_times']
            )
            
            medicine_data = medicine.to_dict()
            session.close()
            
            return jsonify(create_response(
                success=True,
                message="Medicine added successfully",
                data=medicine_data
            )), 201
        
        except Exception as e:
            logging.error(f"❌ Error adding medicine: {e}")
            return jsonify(create_response(
                success=False,
                error=str(e)
            )), 500
    
    @app.route('/api/adherence/log', methods=['POST'])
    def log_adherence():
        """Log medicine intake"""
        try:
            data = request.get_json()
            
            required_fields = ['user_id', 'medicine_id', 'status']
            for field in required_fields:
                if field not in data:
                    return jsonify(create_response(
                        success=False,
                        error=f"Missing required field: {field}"
                    )), 400
            
            session = get_db_session()
            
            # Find or create adherence log
            adherence_log = session.query(AdherenceLog).filter_by(
                user_id=data['user_id'],
                medicine_id=data['medicine_id'],
                scheduled_time=datetime.now().replace(second=0, microsecond=0)
            ).first()
            
            if not adherence_log:
                adherence_log = AdherenceLog(
                    user_id=data['user_id'],
                    medicine_id=data['medicine_id'],
                    scheduled_time=datetime.now(),
                    status=data['status']
                )
                session.add(adherence_log)
            
            # Update status
            if data['status'] == 'taken':
                adherence_log.status = 'taken'
                adherence_log.taken = True
                adherence_log.actual_time = datetime.now()
                if 'voice_transcript' in data:
                    adherence_log.voice_transcript = data['voice_transcript']
            elif data['status'] == 'missed':
                adherence_log.status = 'missed'
                adherence_log.taken = False
            elif data['status'] == 'skipped':
                adherence_log.status = 'skipped'
                adherence_log.taken = False
                if 'reason' in data:
                    adherence_log.additional_notes = data['reason']
            
            # Add health feedback if provided
            if 'health_feedback' in data:
                feedback = data['health_feedback']
                if 'mood' in feedback:
                    adherence_log.mood_rating = feedback['mood']
                if 'energy' in feedback:
                    adherence_log.energy_level = feedback['energy']
                if 'pain' in feedback:
                    adherence_log.pain_level = feedback['pain']
                if 'side_effects' in feedback:
                    adherence_log.side_effects_reported = feedback['side_effects']
                if 'notes' in feedback:
                    adherence_log.additional_notes = feedback['notes']
            
            session.commit()
            
            # Convert adherence log to dictionary
            adherence_data = {
                'id': adherence_log.id,
                'user_id': adherence_log.user_id,
                'medicine_id': adherence_log.medicine_id,
                'status': adherence_log.status,
                'taken': adherence_log.taken,
                'scheduled_time': adherence_log.scheduled_time.isoformat() if adherence_log.scheduled_time else None,
                'actual_time': adherence_log.actual_time.isoformat() if adherence_log.actual_time else None,
                'created_at': adherence_log.created_at.isoformat() if adherence_log.created_at else None
            }
            session.close()
            
            return jsonify(create_response(
                success=True,
                message="Adherence logged successfully",
                data=adherence_data
            ))
        
        except Exception as e:
            logging.error(f"❌ Error logging adherence: {e}")
            if 'session' in locals():
                session.rollback()
                session.close()
            return jsonify(create_response(
                success=False,
                message="Failed to log adherence",
                error=str(e)
            )), 500
    
    @app.route('/api/adherence/history', methods=['GET'])
    def get_adherence_history():
        """Get adherence history for user"""
        try:
            user_id = request.args.get('user_id', type=int)
            days = request.args.get('days', 30, type=int)
            
            if not user_id:
                return jsonify(create_response(
                    success=False,
                    error="User ID required"
                )), 400
            
            session = get_db_session()
            
            # Calculate date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)
            
            # Get adherence logs
            adherence_logs = session.query(AdherenceLog).filter(
                AdherenceLog.user_id == user_id,
                AdherenceLog.scheduled_time >= start_date,
                AdherenceLog.scheduled_time <= end_date
            ).order_by(AdherenceLog.scheduled_time.desc()).all()
            
            adherence_data = [log.to_dict() for log in adherence_logs]
            session.close()
            
            return jsonify(create_response(
                success=True,
                message="Adherence history retrieved successfully",
                data=adherence_data
            ))
        
        except Exception as e:
            logging.error(f"❌ Error getting adherence history: {e}")
            return jsonify(create_response(
                success=False,
                error=str(e)
            )), 500

    @app.errorhandler(404)
    def not_found(error):
        return jsonify(create_response(
            success=False,
            error="Endpoint not found"
        )), 404

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify(create_response(
            success=False,
            error="Internal server error"
        )), 500

if __name__ == '__main__':
    # Create upload directory
    os.makedirs('uploads', exist_ok=True)
    
    # Create and run app
    app = create_app()
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=False  # Disabled debug to prevent issues with voice service imports
    )
