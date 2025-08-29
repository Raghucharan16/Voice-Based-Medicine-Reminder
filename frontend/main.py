"""
Streamlit frontend for Voice-Based Medicine Reminder System
"""

import streamlit as st
import requests
import json
from datetime import datetime, timedelta
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# Try to import audio recorder, fall back gracefully if not available
try:
    from streamlit_audiorecorder import audiorecorder
    AUDIO_RECORDER_AVAILABLE = True
except ImportError:
    AUDIO_RECORDER_AVAILABLE = False
    def audiorecorder(*args, **kwargs):
        st.warning("🎤 Audio recorder not available. Install with: pip install streamlit-audiorecorder")
        return None

# Page configuration
st.set_page_config(
    page_title="Voice Medicine Reminder",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for better accessibility
st.markdown("""
<style>
    .big-font {
        font-size: 24px !important;
        font-weight: bold;
    }
    .medium-font {
        font-size: 18px !important;
    }
    .high-contrast {
        background-color: #000000;
        color: #FFFFFF;
    }
    .medicine-card {
        padding: 20px;
        border-radius: 10px;
        border: 2px solid #ddd;
        margin: 10px 0;
        background-color: #f9f9f9;
    }
    .status-taken {
        color: #28a745;
        font-weight: bold;
    }
    .status-missed {
        color: #dc3545;
        font-weight: bold;
    }
    .status-pending {
        color: #ffc107;
        font-weight: bold;
    }
    .voice-button {
        background-color: #007bff;
        color: white;
        border-radius: 50px;
        padding: 10px 20px;
        border: none;
        font-size: 16px;
        cursor: pointer;
    }
</style>
""", unsafe_allow_html=True)

# Configuration
API_BASE_URL = "http://localhost:5000/api"

class VoiceMedicineApp:
    def __init__(self):
        self.init_session_state()
    
    def init_session_state(self):
        """Initialize session state variables"""
        if 'user_id' not in st.session_state:
            st.session_state.user_id = 1  # Default user for demo
        
        if 'current_page' not in st.session_state:
            st.session_state.current_page = 'Dashboard'
        
        if 'voice_enabled' not in st.session_state:
            st.session_state.voice_enabled = True
        
        if 'high_contrast' not in st.session_state:
            st.session_state.high_contrast = False
        
        if 'large_font' not in st.session_state:
            st.session_state.large_font = False
    
    def make_api_request(self, endpoint, method='GET', data=None, files=None):
        """Make API request to backend"""
        url = f"{API_BASE_URL}/{endpoint}"
        
        try:
            if method == 'GET':
                response = requests.get(url, params=data)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, data=data)
                else:
                    response = requests.post(url, json=data)
            elif method == 'PUT':
                response = requests.put(url, json=data)
            elif method == 'DELETE':
                response = requests.delete(url)
            
            return response.json()
        
        except requests.exceptions.ConnectionError:
            return {
                'success': False,
                'error': 'Cannot connect to backend server. Make sure the Flask app is running.'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def speak_text(self, text):
        """Convert text to speech"""
        if st.session_state.voice_enabled:
            response = self.make_api_request('voice/speak', 'POST', {'text': text})
            if not response.get('success'):
                st.error(f"TTS Error: {response.get('error', 'Unknown error')}")
    
    def transcribe_audio(self, audio_bytes):
        """Transcribe audio to text"""
        files = {'audio': ('recording.wav', audio_bytes, 'audio/wav')}
        response = self.make_api_request('voice/transcribe', 'POST', files=files)
        
        if response.get('success'):
            return response.get('data', {}).get('text', '')
        else:
            st.error(f"Transcription Error: {response.get('error', 'Unknown error')}")
            return ""
    
    def render_sidebar(self):
        """Render sidebar navigation"""
        st.sidebar.title("🏥 Medicine Reminder")
        
        # User settings
        st.sidebar.subheader("♿ Accessibility Settings")
        
        st.session_state.large_font = st.sidebar.checkbox(
            "Large Font", 
            value=st.session_state.large_font
        )
        
        st.session_state.high_contrast = st.sidebar.checkbox(
            "High Contrast", 
            value=st.session_state.high_contrast
        )
        
        st.session_state.voice_enabled = st.sidebar.checkbox(
            "Voice Enabled", 
            value=st.session_state.voice_enabled
        )
        
        st.sidebar.divider()
        
        # Navigation
        st.sidebar.subheader("📋 Navigation")
        pages = [
            ("🏠 Dashboard", "Dashboard"),
            ("💊 My Medicines", "Medicines"),
            ("🎤 Voice Logging", "Voice Logging"),
            ("📊 Reports", "Reports"),
            ("⚙️ Settings", "Settings")
        ]
        
        for page_display, page_key in pages:
            if st.sidebar.button(page_display, key=f"nav_{page_key}"):
                st.session_state.current_page = page_key
                st.rerun()
        
        # Health check
        st.sidebar.divider()
        if st.sidebar.button("🔧 Health Check"):
            self.show_health_check()
    
    def show_health_check(self):
        """Show system health check"""
        with st.sidebar:
            with st.spinner("Checking system health..."):
                response = self.make_api_request('health')
                
                if response.get('success'):
                    data = response.get('data', {})
                    voice_status = data.get('voice_service', {})
                    scheduler_status = data.get('scheduler_service', {})
                    
                    st.success("✅ Backend Connected")
                    
                    if voice_status.get('overall_status'):
                        st.success("✅ Voice Service")
                    else:
                        st.warning("⚠️ Voice Service Issues")
                    
                    if scheduler_status.get('running'):
                        st.success("✅ Scheduler Running")
                    else:
                        st.warning("⚠️ Scheduler Issues")
                else:
                    st.error("❌ Backend Disconnected")
    
    def render_dashboard(self):
        """Render main dashboard"""
        st.title("🏠 Medicine Dashboard")
        
        if st.session_state.large_font:
            st.markdown('<p class="big-font">Welcome to your Medicine Reminder Dashboard</p>', unsafe_allow_html=True)
        else:
            st.markdown("Welcome to your Medicine Reminder Dashboard")
        
        # Get today's medicines
        response = self.make_api_request('medicines', 'GET', {'user_id': st.session_state.user_id})
        
        if response.get('success'):
            medicines = response.get('data', [])
            
            # Show today's schedule
            col1, col2, col3 = st.columns(3)
            
            with col1:
                st.metric("📊 Total Medicines", len(medicines))
            
            with col2:
                active_medicines = [m for m in medicines if m.get('is_active')]
                st.metric("💊 Active Today", len(active_medicines))
            
            with col3:
                critical_medicines = [m for m in medicines if m.get('is_critical')]
                st.metric("⚠️ Critical", len(critical_medicines))
            
            # Today's schedule
            st.subheader("📅 Today's Medicine Schedule")
            
            for medicine in active_medicines:
                self.render_medicine_card(medicine)
        
        else:
            st.error(f"Failed to load medicines: {response.get('error')}")
    
    def render_medicine_card(self, medicine):
        """Render medicine card"""
        with st.container():
            st.markdown(f"""
            <div class="medicine-card">
                <h3>💊 {medicine['name']} ({medicine['dosage']})</h3>
                <p><strong>Schedule:</strong> {', '.join(medicine.get('schedule_times', []))}</p>
                <p><strong>Instructions:</strong> {medicine.get('instructions', 'No special instructions')}</p>
                <p><strong>Form:</strong> {medicine.get('form', 'N/A')} | 
                   <strong>Color:</strong> {medicine.get('color', 'N/A')}</p>
            </div>
            """, unsafe_allow_html=True)
            
            col1, col2, col3 = st.columns(3)
            
            with col1:
                if st.button(f"✅ Taken", key=f"taken_{medicine['id']}"):
                    self.log_medicine_intake(medicine['id'], 'taken')
            
            with col2:
                if st.button(f"❌ Missed", key=f"missed_{medicine['id']}"):
                    self.log_medicine_intake(medicine['id'], 'missed')
            
            with col3:
                if st.button(f"⏰ Snooze 5min", key=f"snooze_{medicine['id']}"):
                    st.info("Reminder snoozed for 5 minutes")
    
    def log_medicine_intake(self, medicine_id, status):
        """Log medicine intake"""
        data = {
            'user_id': st.session_state.user_id,
            'medicine_id': medicine_id,
            'status': status
        }
        
        response = self.make_api_request('adherence/log', 'POST', data)
        
        if response.get('success'):
            st.success(f"Medicine marked as {status}")
            if st.session_state.voice_enabled:
                self.speak_text(f"Medicine intake logged as {status}")
        else:
            st.error(f"Failed to log intake: {response.get('error')}")
    
    def render_medicines_page(self):
        """Render medicines management page"""
        st.title("💊 My Medicines")
        
        # Add new medicine section
        with st.expander("➕ Add New Medicine"):
            self.render_add_medicine_form()
        
        # Existing medicines
        st.subheader("📋 Current Medicines")
        
        response = self.make_api_request('medicines', 'GET', {'user_id': st.session_state.user_id})
        
        if response.get('success'):
            medicines = response.get('data', [])
            
            if medicines:
                for medicine in medicines:
                    with st.expander(f"💊 {medicine['name']} - {medicine['dosage']}"):
                        col1, col2 = st.columns(2)
                        
                        with col1:
                            st.write(f"**Form:** {medicine.get('form', 'N/A')}")
                            st.write(f"**Color:** {medicine.get('color', 'N/A')}")
                            st.write(f"**Frequency:** {medicine.get('frequency', 'N/A')}")
                            st.write(f"**Doctor:** {medicine.get('doctor_name', 'N/A')}")
                        
                        with col2:
                            st.write(f"**Schedule Times:** {', '.join(medicine.get('schedule_times', []))}")
                            st.write(f"**Instructions:** {medicine.get('instructions', 'No instructions')}")
                            st.write(f"**Food Instructions:** {medicine.get('food_instructions', 'No restriction')}")
                            st.write(f"**Critical:** {'Yes' if medicine.get('is_critical') else 'No'}")
            else:
                st.info("No medicines added yet. Add your first medicine above!")
        
        else:
            st.error(f"Failed to load medicines: {response.get('error')}")
    
    def render_add_medicine_form(self):
        """Render add medicine form"""
        with st.form("add_medicine_form"):
            col1, col2 = st.columns(2)
            
            with col1:
                name = st.text_input("Medicine Name *")
                dosage = st.text_input("Dosage *", placeholder="e.g., 500mg, 2 tablets")
                form = st.selectbox("Form", ["tablet", "capsule", "liquid", "injection", "cream", "other"])
                color = st.text_input("Color", placeholder="e.g., white, blue")
            
            with col2:
                frequency = st.selectbox("Frequency *", [
                    "daily", "twice_daily", "three_times_daily", 
                    "four_times_daily", "weekly", "monthly"
                ])
                
                # Schedule times input
                st.write("Schedule Times (one per line) *")
                schedule_times_text = st.text_area(
                    "times", 
                    placeholder="08:00\n14:00\n20:00",
                    label_visibility="collapsed"
                )
                
                doctor_name = st.text_input("Doctor Name")
                is_critical = st.checkbox("Critical Medicine")
            
            instructions = st.text_area("Instructions", placeholder="Special instructions for taking this medicine")
            food_instructions = st.selectbox("Food Instructions", ["no_restriction", "with_food", "without_food"])
            
            if st.form_submit_button("💊 Add Medicine"):
                if name and dosage and frequency and schedule_times_text:
                    # Parse schedule times
                    schedule_times = [
                        time.strip() for time in schedule_times_text.split('\n') 
                        if time.strip()
                    ]
                    
                    data = {
                        'user_id': st.session_state.user_id,
                        'name': name,
                        'dosage': dosage,
                        'frequency': frequency,
                        'schedule_times': schedule_times,
                        'form': form,
                        'color': color,
                        'doctor_name': doctor_name,
                        'instructions': instructions,
                        'food_instructions': food_instructions,
                        'is_critical': is_critical
                    }
                    
                    response = self.make_api_request('medicines', 'POST', data)
                    
                    if response.get('success'):
                        st.success("Medicine added successfully!")
                        if st.session_state.voice_enabled:
                            self.speak_text(f"Medicine {name} added successfully")
                        st.rerun()
                    else:
                        st.error(f"Failed to add medicine: {response.get('error')}")
                else:
                    st.error("Please fill in all required fields marked with *")
    
    def render_voice_logging_page(self):
        """Render voice logging page"""
        st.title("🎤 Voice Logging")
        
        st.markdown("""
        Use this page to log your medicine intake using voice commands.
        Say things like:
        - "I took my aspirin"
        - "I missed my morning vitamin"
        - "I'm feeling good after taking my medicine"
        """)
        
        # Audio recorder
        st.subheader("🎙️ Record Your Voice")
        
        if AUDIO_RECORDER_AVAILABLE:
            audio = audiorecorder("🎤 Start Recording", "🛑 Stop Recording")
            
            if len(audio) > 0:
                # Display audio player
                st.audio(audio.export().read())
                
                # Transcribe button
                if st.button("📝 Transcribe and Process"):
                    with st.spinner("Transcribing audio..."):
                        # Convert audio to bytes
                        audio_bytes = audio.export().read()
                        
                        # Transcribe
                        transcription = self.transcribe_audio(audio_bytes)
                        
                        if transcription:
                            st.write(f"**Transcription:** {transcription}")
                            
                            # Process voice confirmation
                            if st.button("✅ Process Voice Command"):
                                self.process_voice_command(transcription)
                        else:
                            st.error("Could not transcribe audio")
        else:
            st.info("🎤 Audio recording is not available. Please install streamlit-audiorecorder package to enable this feature.")
            st.code("pip install streamlit-audiorecorder")
            st.markdown("For now, you can use the text input below as an alternative.")
        
        # Manual text input as fallback
        st.subheader("⌨️ Text Input (Alternative)")
        text_input = st.text_area("Enter your message manually:")
        
        if st.button("📝 Process Text Command"):
            if text_input:
                self.process_voice_command(text_input)
            else:
                st.error("Please enter some text")
    
    def process_voice_command(self, text):
        """Process voice command for medicine logging"""
        st.write(f"Processing: '{text}'")
        
        # Simple keyword matching (in real app, use NLP)
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['took', 'taken', 'had', 'consumed']):
            st.success("✅ Medicine intake detected!")
            
            # In a real app, you'd extract which medicine and log it
            # For demo, we'll just show a success message
            if st.session_state.voice_enabled:
                self.speak_text("Medicine intake recorded successfully")
        
        elif any(word in text_lower for word in ['missed', 'forgot', 'skipped']):
            st.warning("❌ Missed dose detected!")
            
            if st.session_state.voice_enabled:
                self.speak_text("Missed dose recorded. Don't forget to take it when you can.")
        
        elif any(word in text_lower for word in ['feeling', 'side effect', 'reaction']):
            st.info("💬 Health feedback detected!")
            
            if st.session_state.voice_enabled:
                self.speak_text("Thank you for the health feedback")
        
        else:
            st.info("🤔 Command not recognized. Please try again.")
    
    def render_reports_page(self):
        """Render reports and analytics page"""
        st.title("📊 Medicine Reports & Analytics")
        
        # Get adherence data
        response = self.make_api_request('adherence/history', 'GET', {
            'user_id': st.session_state.user_id,
            'days': 30
        })
        
        if response.get('success'):
            adherence_data = response.get('data', [])
            
            if adherence_data:
                # Convert to DataFrame
                df = pd.DataFrame(adherence_data)
                df['scheduled_time'] = pd.to_datetime(df['scheduled_time'])
                
                # Adherence overview
                col1, col2, col3, col4 = st.columns(4)
                
                total_doses = len(df)
                taken_doses = len(df[df['taken'] == True])
                adherence_rate = (taken_doses / total_doses * 100) if total_doses > 0 else 0
                
                with col1:
                    st.metric("📊 Total Doses", total_doses)
                
                with col2:
                    st.metric("✅ Doses Taken", taken_doses)
                
                with col3:
                    st.metric("📈 Adherence Rate", f"{adherence_rate:.1f}%")
                
                with col4:
                    missed_doses = len(df[df['status'] == 'missed'])
                    st.metric("❌ Missed Doses", missed_doses)
                
                # Adherence trend chart
                st.subheader("📈 Adherence Trend (Last 30 Days)")
                
                # Group by date and calculate daily adherence
                daily_adherence = df.groupby(df['scheduled_time'].dt.date).agg({
                    'taken': ['count', 'sum']
                }).round(2)
                
                daily_adherence.columns = ['total', 'taken']
                daily_adherence['rate'] = (daily_adherence['taken'] / daily_adherence['total'] * 100).fillna(0)
                
                fig = px.line(
                    x=daily_adherence.index,
                    y=daily_adherence['rate'],
                    title="Daily Adherence Rate (%)",
                    labels={'x': 'Date', 'y': 'Adherence Rate (%)'}
                )
                
                st.plotly_chart(fig, use_container_width=True)
                
                # Status distribution
                st.subheader("📊 Dose Status Distribution")
                
                status_counts = df['status'].value_counts()
                fig_pie = px.pie(
                    values=status_counts.values,
                    names=status_counts.index,
                    title="Medicine Intake Status"
                )
                
                st.plotly_chart(fig_pie, use_container_width=True)
                
                # Recent activity
                st.subheader("📅 Recent Activity")
                
                recent_data = df.head(10)[['scheduled_time', 'status', 'delay_minutes', 'mood_rating']]
                st.dataframe(recent_data, use_container_width=True)
            
            else:
                st.info("No adherence data available yet. Start logging your medicine intake!")
        
        else:
            st.error(f"Failed to load reports: {response.get('error')}")
    
    def render_settings_page(self):
        """Render settings page"""
        st.title("⚙️ Settings")
        
        # Voice settings
        st.subheader("🔊 Voice Settings")
        
        col1, col2 = st.columns(2)
        
        with col1:
            voice_enabled = st.checkbox("Enable Voice Features", value=st.session_state.voice_enabled)
            if voice_enabled != st.session_state.voice_enabled:
                st.session_state.voice_enabled = voice_enabled
                st.rerun()
        
        with col2:
            if st.button("🔊 Test Voice"):
                self.speak_text("Voice test successful. Medicine reminder system is working properly.")
        
        # Test voice recording
        st.subheader("🎤 Test Voice Recording")
        
        if AUDIO_RECORDER_AVAILABLE:
            test_audio = audiorecorder("Start Test", "Stop Test", key="test_audio")
            
            if len(test_audio) > 0:
                st.audio(test_audio.export().read())
                
                if st.button("Test Transcription"):
                    with st.spinner("Testing transcription..."):
                        audio_bytes = test_audio.export().read()
                        transcription = self.transcribe_audio(audio_bytes)
                        
                        if transcription:
                            st.success(f"Transcription: {transcription}")
                        else:
                            st.error("Transcription failed")
        else:
            st.info("🎤 Audio recording features require the streamlit-audiorecorder package.")
            st.code("pip install streamlit-audiorecorder")
        
        # Accessibility settings
        st.subheader("♿ Accessibility Settings")
        
        large_font = st.checkbox("Large Font Mode", value=st.session_state.large_font)
        high_contrast = st.checkbox("High Contrast Mode", value=st.session_state.high_contrast)
        
        if large_font != st.session_state.large_font:
            st.session_state.large_font = large_font
            st.rerun()
        
        if high_contrast != st.session_state.high_contrast:
            st.session_state.high_contrast = high_contrast
            st.rerun()
        
        # System information
        st.subheader("ℹ️ System Information")
        
        if st.button("Check System Health"):
            response = self.make_api_request('health')
            
            if response.get('success'):
                data = response.get('data', {})
                st.json(data)
            else:
                st.error(f"Health check failed: {response.get('error')}")
    
    def run(self):
        """Main app runner"""
        self.render_sidebar()
        
        # Apply accessibility styles
        if st.session_state.high_contrast:
            st.markdown('<div class="high-contrast">', unsafe_allow_html=True)
        
        # Route to appropriate page
        if st.session_state.current_page == 'Dashboard':
            self.render_dashboard()
        elif st.session_state.current_page == 'Medicines':
            self.render_medicines_page()
        elif st.session_state.current_page == 'Voice Logging':
            self.render_voice_logging_page()
        elif st.session_state.current_page == 'Reports':
            self.render_reports_page()
        elif st.session_state.current_page == 'Settings':
            self.render_settings_page()
        
        if st.session_state.high_contrast:
            st.markdown('</div>', unsafe_allow_html=True)

if __name__ == "__main__":
    app = VoiceMedicineApp()
    app.run()
