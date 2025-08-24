import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
import speech_recognition as sr
import pyttsx3
import time
import json
from typing import Dict, List, Any
import base64
import io

# Configure Streamlit page
st.set_page_config(
    page_title="Voice-Based Medicine Reminder",
    page_icon="💊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Backend API URL
API_BASE_URL = "http://localhost:8000"

# Initialize session state
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'token' not in st.session_state:
    st.session_state.token = None
if 'user_info' not in st.session_state:
    st.session_state.user_info = None
if 'voice_enabled' not in st.session_state:
    st.session_state.voice_enabled = False

class VoiceInterface:
    """Voice interface for speech recognition and text-to-speech"""
    
    def __init__(self):
        self.recognizer = sr.Recognizer()
        self.microphone = sr.Microphone()
        self.tts_engine = None
        try:
            self.tts_engine = pyttsx3.init()
            # Configure TTS settings
            voices = self.tts_engine.getProperty('voices')
            if voices:
                self.tts_engine.setProperty('voice', voices[0].id)
            self.tts_engine.setProperty('rate', 150)
        except Exception as e:
            st.error(f"TTS engine initialization failed: {str(e)}")
    
    def listen_for_command(self, timeout=5):
        """Listen for voice command"""
        try:
            with self.microphone as source:
                self.recognizer.adjust_for_ambient_noise(source)
            
            with self.microphone as source:
                audio = self.recognizer.listen(source, timeout=timeout)
            
            command = self.recognizer.recognize_google(audio)
            return command.lower()
        
        except sr.WaitTimeoutError:
            return "timeout"
        except sr.UnknownValueError:
            return "unclear"
        except sr.RequestError as e:
            st.error(f"Speech recognition error: {str(e)}")
            return "error"
    
    def speak(self, text):
        """Convert text to speech"""
        try:
            if self.tts_engine:
                self.tts_engine.say(text)
                self.tts_engine.runAndWait()
        except Exception as e:
            st.error(f"TTS error: {str(e)}")

# Create voice interface instance
voice_interface = VoiceInterface()

def make_api_request(endpoint: str, method: str = "GET", data: Dict = None, auth_required: bool = True) -> Dict:
    """Make API request to backend"""
    url = f"{API_BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    if auth_required and st.session_state.token:
        headers["Authorization"] = f"Bearer {st.session_state.token}"
    
    try:
        if method == "GET":
            response = requests.get(url, headers=headers)
        elif method == "POST":
            response = requests.post(url, headers=headers, json=data)
        elif method == "PUT":
            response = requests.put(url, headers=headers, json=data)
        elif method == "DELETE":
            response = requests.delete(url, headers=headers)
        
        if response.status_code == 200:
            return {"success": True, "data": response.json()}
        else:
            return {"success": False, "error": response.text}
    
    except Exception as e:
        return {"success": False, "error": str(e)}

def login_page():
    """Login page"""
    st.title("🔐 Login to Medicine Reminder")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        with st.form("login_form"):
            username = st.text_input("Username", value="testuser")
            password = st.text_input("Password", type="password", value="password123")
            
            if st.form_submit_button("Login", use_container_width=True):
                # Prepare login data
                login_data = {
                    "username": username,
                    "password": password
                }
                
                response = make_api_request("/auth/login", "POST", login_data, auth_required=False)
                
                if response["success"]:
                    data = response["data"]
                    st.session_state.authenticated = True
                    st.session_state.token = data["access_token"]
                    st.session_state.user_info = data.get("user", {})
                    st.success("Login successful!")
                    st.rerun()
                else:
                    st.error(f"Login failed: {response['error']}")
        
        if st.button("Register New Account", use_container_width=True):
            st.session_state.show_register = True
            st.rerun()

def register_page():
    """Registration page"""
    st.title("📝 Register New Account")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        with st.form("register_form"):
            username = st.text_input("Username")
            email = st.text_input("Email")
            password = st.text_input("Password", type="password")
            confirm_password = st.text_input("Confirm Password", type="password")
            full_name = st.text_input("Full Name")
            phone = st.text_input("Phone Number (Optional)")
            
            if st.form_submit_button("Register", use_container_width=True):
                if password != confirm_password:
                    st.error("Passwords do not match!")
                else:
                    register_data = {
                        "username": username,
                        "email": email,
                        "password": password,
                        "full_name": full_name,
                        "phone": phone
                    }
                    
                    response = make_api_request("/auth/register", "POST", register_data, auth_required=False)
                    
                    if response["success"]:
                        st.success("Registration successful! Please login.")
                        st.session_state.show_register = False
                        st.rerun()
                    else:
                        st.error(f"Registration failed: {response['error']}")
        
        if st.button("Back to Login", use_container_width=True):
            st.session_state.show_register = False
            st.rerun()

def dashboard_page():
    """Main dashboard"""
    st.title("📊 Medicine Reminder Dashboard")
    
    # Get user's medicines and recent intakes
    medicines_response = make_api_request("/medicines/")
    intakes_response = make_api_request("/intakes/recent")
    
    if medicines_response["success"] and intakes_response["success"]:
        medicines = medicines_response["data"]
        recent_intakes = intakes_response["data"]
        
        # Key metrics
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric("Total Medicines", len(medicines))
        
        with col2:
            active_medicines = len([m for m in medicines if m.get("is_active", True)])
            st.metric("Active Medicines", active_medicines)
        
        with col3:
            today_intakes = len([i for i in recent_intakes if i.get("taken_at", "").startswith(datetime.now().strftime("%Y-%m-%d"))])
            st.metric("Today's Intakes", today_intakes)
        
        with col4:
            # Calculate adherence score
            adherence_response = make_api_request("/reports/adherence-score")
            if adherence_response["success"]:
                adherence_score = adherence_response["data"].get("adherence_score", 0)
                st.metric("Adherence Score", f"{adherence_score}%")
            else:
                st.metric("Adherence Score", "N/A")
        
        # Recent activity
        st.subheader("📋 Recent Medicine Intakes")
        if recent_intakes:
            df = pd.DataFrame(recent_intakes)
            st.dataframe(df, use_container_width=True)
        else:
            st.info("No recent intakes recorded.")
        
        # Medicine schedule for today
        st.subheader("⏰ Today's Medicine Schedule")
        schedule_response = make_api_request("/reminders/today")
        if schedule_response["success"]:
            today_schedule = schedule_response["data"]
            if today_schedule:
                for item in today_schedule:
                    col1, col2, col3 = st.columns([2, 1, 1])
                    with col1:
                        st.write(f"💊 {item['medicine_name']} - {item['dosage']}")
                    with col2:
                        st.write(f"🕐 {item['time']}")
                    with col3:
                        status = item.get('status', 'pending')
                        if status == 'taken':
                            st.success("✅ Taken")
                        elif status == 'missed':
                            st.error("❌ Missed")
                        else:
                            st.warning("⏳ Pending")
            else:
                st.info("No medicines scheduled for today.")
    else:
        st.error("Failed to load dashboard data.")

def medicines_page():
    """Medicines management page"""
    st.title("💊 My Medicines")
    
    # Add new medicine
    with st.expander("➕ Add New Medicine"):
        with st.form("add_medicine"):
            col1, col2 = st.columns(2)
            
            with col1:
                name = st.text_input("Medicine Name")
                dosage = st.text_input("Dosage (e.g., 10mg)")
                frequency = st.selectbox("Frequency", 
                    ["Once daily", "Twice daily", "Three times daily", "Four times daily", "As needed"])
            
            with col2:
                instructions = st.text_area("Instructions")
                start_date = st.date_input("Start Date", datetime.now().date())
                end_date = st.date_input("End Date (Optional)")
            
            if st.form_submit_button("Add Medicine"):
                medicine_data = {
                    "name": name,
                    "dosage": dosage,
                    "frequency": frequency,
                    "instructions": instructions,
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None
                }
                
                response = make_api_request("/medicines/", "POST", medicine_data)
                if response["success"]:
                    st.success("Medicine added successfully!")
                    st.rerun()
                else:
                    st.error(f"Failed to add medicine: {response['error']}")
    
    # Display existing medicines
    medicines_response = make_api_request("/medicines/")
    if medicines_response["success"]:
        medicines = medicines_response["data"]
        
        if medicines:
            st.subheader("📋 Your Medicines")
            
            for medicine in medicines:
                with st.container():
                    col1, col2, col3, col4 = st.columns([3, 2, 1, 1])
                    
                    with col1:
                        st.write(f"**{medicine['name']}**")
                        st.write(f"Dosage: {medicine['dosage']}")
                    
                    with col2:
                        st.write(f"Frequency: {medicine['frequency']}")
                        if medicine.get('instructions'):
                            st.write(f"Instructions: {medicine['instructions']}")
                    
                    with col3:
                        status = "Active" if medicine.get('is_active', True) else "Inactive"
                        if status == "Active":
                            st.success(status)
                        else:
                            st.warning(status)
                    
                    with col4:
                        if st.button("Edit", key=f"edit_{medicine['id']}"):
                            st.session_state.edit_medicine_id = medicine['id']
                        
                        if st.button("Delete", key=f"delete_{medicine['id']}"):
                            response = make_api_request(f"/medicines/{medicine['id']}", "DELETE")
                            if response["success"]:
                                st.success("Medicine deleted!")
                                st.rerun()
                            else:
                                st.error("Failed to delete medicine.")
                    
                    st.divider()
        else:
            st.info("No medicines added yet. Add your first medicine above!")
    else:
        st.error("Failed to load medicines.")

def voice_interface_page():
    """Voice interface page"""
    st.title("🎤 Voice Interface")
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.write("### Voice Commands You Can Use:")
        st.markdown("""
        - **"I took my medicine"** - Log medicine intake
        - **"Skip medicine"** - Skip current dose
        - **"Remind me later"** - Postpone reminder
        - **"Show schedule"** - Display today's schedule
        - **"Help"** - Get voice command help
        """)
    
    with col2:
        if st.button("🎤 Start Voice Command", use_container_width=True, type="primary"):
            with st.spinner("Listening... Please speak your command"):
                command = voice_interface.listen_for_command()
                
                if command == "timeout":
                    st.warning("No voice detected. Please try again.")
                elif command == "unclear":
                    st.warning("Could not understand. Please speak clearly.")
                elif command == "error":
                    st.error("Voice recognition error.")
                else:
                    st.success(f"Command received: {command}")
                    
                    # Process voice command
                    response = make_api_request("/voice/command", "POST", {"command": command})
                    if response["success"]:
                        result = response["data"]
                        st.info(f"Response: {result.get('response', 'Command processed')}")
                        
                        # Text-to-speech response
                        if st.session_state.voice_enabled:
                            voice_interface.speak(result.get('response', 'Command processed'))
                    else:
                        st.error(f"Command processing failed: {response['error']}")
        
        # Voice settings
        st.session_state.voice_enabled = st.checkbox("Enable Voice Responses", value=st.session_state.voice_enabled)
        
        if st.button("🔧 Test Voice System", use_container_width=True):
            with st.spinner("Testing voice system..."):
                # Test speech recognition
                try:
                    test_command = voice_interface.listen_for_command(timeout=3)
                    if test_command not in ["timeout", "unclear", "error"]:
                        st.success("✅ Speech recognition working!")
                    else:
                        st.warning("⚠️ Speech recognition test failed")
                except Exception as e:
                    st.error(f"❌ Speech recognition error: {str(e)}")
                
                # Test text-to-speech
                try:
                    voice_interface.speak("Voice system test successful")
                    st.success("✅ Text-to-speech working!")
                except Exception as e:
                    st.error(f"❌ Text-to-speech error: {str(e)}")

def reminders_page():
    """Reminders and intake logging page"""
    st.title("⏰ Medicine Reminders")
    
    # Today's pending reminders
    st.subheader("📅 Today's Schedule")
    
    schedule_response = make_api_request("/reminders/today")
    if schedule_response["success"]:
        today_schedule = schedule_response["data"]
        
        if today_schedule:
            for reminder in today_schedule:
                with st.container():
                    col1, col2, col3 = st.columns([3, 1, 2])
                    
                    with col1:
                        st.write(f"**💊 {reminder['medicine_name']}**")
                        st.write(f"Dosage: {reminder['dosage']}")
                        st.write(f"Time: {reminder['time']}")
                    
                    with col2:
                        status = reminder.get('status', 'pending')
                        if status == 'taken':
                            st.success("✅ Taken")
                        elif status == 'missed':
                            st.error("❌ Missed")
                        else:
                            st.warning("⏳ Pending")
                    
                    with col3:
                        if status == 'pending':
                            if st.button("✅ Mark as Taken", key=f"taken_{reminder['id']}"):
                                intake_data = {
                                    "medicine_id": reminder['medicine_id'],
                                    "status": "taken",
                                    "taken_at": datetime.now().isoformat()
                                }
                                response = make_api_request("/intakes/", "POST", intake_data)
                                if response["success"]:
                                    st.success("Intake logged!")
                                    st.rerun()
                            
                            if st.button("❌ Mark as Missed", key=f"missed_{reminder['id']}"):
                                intake_data = {
                                    "medicine_id": reminder['medicine_id'],
                                    "status": "missed",
                                    "taken_at": datetime.now().isoformat()
                                }
                                response = make_api_request("/intakes/", "POST", intake_data)
                                if response["success"]:
                                    st.warning("Marked as missed.")
                                    st.rerun()
                    
                    st.divider()
        else:
            st.info("No medicines scheduled for today.")
    
    # Manual intake logging
    st.subheader("📝 Log Medicine Intake Manually")
    
    medicines_response = make_api_request("/medicines/")
    if medicines_response["success"]:
        medicines = medicines_response["data"]
        
        with st.form("manual_intake"):
            medicine_names = [m['name'] for m in medicines]
            selected_medicine = st.selectbox("Select Medicine", medicine_names)
            
            col1, col2 = st.columns(2)
            with col1:
                intake_date = st.date_input("Date", datetime.now().date())
                intake_time = st.time_input("Time", datetime.now().time())
            
            with col2:
                status = st.selectbox("Status", ["taken", "missed", "skipped"])
                notes = st.text_area("Notes (Optional)")
            
            if st.form_submit_button("Log Intake"):
                selected_med = next(m for m in medicines if m['name'] == selected_medicine)
                
                intake_datetime = datetime.combine(intake_date, intake_time)
                intake_data = {
                    "medicine_id": selected_med['id'],
                    "status": status,
                    "taken_at": intake_datetime.isoformat(),
                    "notes": notes
                }
                
                response = make_api_request("/intakes/", "POST", intake_data)
                if response["success"]:
                    st.success("Intake logged successfully!")
                else:
                    st.error(f"Failed to log intake: {response['error']}")

def reports_page():
    """Reports and analytics page with AI insights"""
    st.title("📈 Reports & AI Analytics")
    
    # AI Provider indicator
    col1, col2 = st.columns([3, 1])
    with col2:
        st.info("🤖 AI-Powered Insights")
    
    # Adherence score
    col1, col2 = st.columns(2)
    
    with col1:
        adherence_response = make_api_request("/reports/adherence-score")
        if adherence_response["success"]:
            adherence_score = adherence_response["data"].get("adherence_score", 0)
            
            # Create gauge chart
            fig = go.Figure(go.Indicator(
                mode = "gauge+number+delta",
                value = adherence_score,
                domain = {'x': [0, 1], 'y': [0, 1]},
                title = {'text': "Adherence Score (%)"},
                gauge = {
                    'axis': {'range': [None, 100]},
                    'bar': {'color': "darkblue"},
                    'steps': [
                        {'range': [0, 50], 'color': "lightgray"},
                        {'range': [50, 80], 'color': "yellow"},
                        {'range': [80, 100], 'color': "green"}],
                    'threshold': {
                        'line': {'color': "red", 'width': 4},
                        'thickness': 0.75,
                        'value': 90}}))
            
            st.plotly_chart(fig, use_container_width=True)
    
    with col2:
        # Enhanced AI insights
        st.subheader("🤖 AI Insights")
        insights_response = make_api_request("/reports/patterns")
        if insights_response["success"]:
            patterns = insights_response["data"]
            
            # Show AI provider
            ai_provider = patterns.get("ai_provider", "local")
            if ai_provider == "huggingface":
                st.success("🔥 Powered by Hugging Face AI")
            else:
                st.info("⚡ Using Local AI Analysis")
            
            # Show AI-generated insights
            if "ai_insights" in patterns:
                st.write("**AI Analysis:**")
                st.write(patterns["ai_insights"])
            
            # Show AI recommendations
            if "ai_recommendations" in patterns:
                st.write("**AI Recommendations:**")
                for rec in patterns["ai_recommendations"]:
                    st.write(f"• {rec}")
            elif "recommendations" in patterns:
                st.write("**Recommendations:**")
                for rec in patterns["recommendations"]:
                    st.write(f"• {rec}")
            
            # Show best compliance day
            if "most_compliant_day" in patterns:
                best_day = patterns["most_compliant_day"]
                st.info(f"Your best day: {best_day.get('day', 'N/A')} ({best_day.get('adherence', 0)}% adherence)")
        else:
            st.info("No AI insights available yet. Take more medicines to see patterns!")
    
    # Health Sentiment Analysis (if available)
    st.subheader("🩺 Health Sentiment Analysis")
    sentiment_response = make_api_request("/reports/health-sentiment")
    if sentiment_response["success"]:
        sentiment_data = sentiment_response["data"]
        
        ai_provider = sentiment_data.get("ai_provider", "local")
        if ai_provider == "huggingface":
            st.success("🤖 Advanced sentiment analysis with Hugging Face models")
            
            if "sentiment_analysis" in sentiment_data:
                sentiment_analysis = sentiment_data["sentiment_analysis"]
                
                # Show sentiment distribution
                if "sentiment_distribution" in sentiment_analysis:
                    st.write("**Sentiment Distribution:**")
                    sentiment_dist = sentiment_analysis["sentiment_distribution"]
                    
                    # Create pie chart for sentiment
                    labels = list(sentiment_dist.keys())
                    values = list(sentiment_dist.values())
                    
                    fig = px.pie(values=values, names=labels, title="Health Feedback Sentiment")
                    st.plotly_chart(fig, use_container_width=True)
                
                # Show dominant sentiment
                dominant = sentiment_analysis.get("dominant_sentiment", "NEUTRAL")
                if dominant == "POSITIVE":
                    st.success(f"😊 Dominant sentiment: {dominant}")
                elif dominant == "NEGATIVE":
                    st.error(f"😟 Dominant sentiment: {dominant}")
                else:
                    st.info(f"😐 Dominant sentiment: {dominant}")
            
            # Show health insights
            if "health_insights" in sentiment_data:
                st.write("**Health Insights:**")
                for insight in sentiment_data["health_insights"]:
                    st.write(f"• {insight}")
        else:
            st.info("Basic health analysis available. Add Hugging Face API key for advanced sentiment analysis.")
    
    # Weekly trends
    st.subheader("📊 Weekly Adherence Trends")
    trends_response = make_api_request("/reports/patterns")
    if trends_response["success"]:
        patterns = trends_response["data"]
        
        if "weekly_trends" in patterns and patterns["weekly_trends"]:
            trends_df = pd.DataFrame(patterns["weekly_trends"])
            
            fig = px.line(trends_df, x='week', y='adherence', 
                         title='Weekly Adherence Trends',
                         labels={'adherence': 'Adherence %', 'week': 'Week'})
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("Not enough data for weekly trends. Take medicines regularly to see trends!")
    
    # Medicine-wise adherence
    st.subheader("💊 Medicine-wise Adherence")
    if trends_response["success"]:
        patterns = trends_response["data"]
        
        if "medicine_adherence" in patterns and patterns["medicine_adherence"]:
            med_adherence = patterns["medicine_adherence"]
            
            medicines_df = pd.DataFrame([
                {"Medicine": med, "Adherence": adherence} 
                for med, adherence in med_adherence.items()
            ])
            
            fig = px.bar(medicines_df, x='Medicine', y='Adherence',
                        title='Adherence by Medicine',
                        labels={'Adherence': 'Adherence %'})
            st.plotly_chart(fig, use_container_width=True)
    
    # Configuration section
    st.subheader("⚙️ AI Configuration")
    with st.expander("Configure AI Settings"):
        st.write("**Current AI Provider:** Hugging Face + Local Fallback")
        st.write("**Models Used:**")
        st.write("- Text Generation: microsoft/DialoGPT-medium")
        st.write("- Sentiment Analysis: cardiffnlp/twitter-roberta-base-sentiment-latest")
        st.write("- Summarization: facebook/bart-large-cnn")
        
        st.info("💡 **Tip:** Add your Hugging Face API key to backend/.env for enhanced AI insights!")
        st.code('HUGGINGFACE_API_KEY=your-api-key-here', language='bash')

def health_feedback_page():
    """Health feedback page"""
    st.title("🩺 Health Feedback")
    
    # Add new feedback
    st.subheader("📝 Record Health Feedback")
    
    # Get recent intakes for feedback
    intakes_response = make_api_request("/intakes/recent")
    if intakes_response["success"]:
        recent_intakes = intakes_response["data"]
        
        if recent_intakes:
            with st.form("health_feedback"):
                # Select intake to provide feedback for
                intake_options = [f"{intake['medicine_name']} - {intake['taken_at'][:16]}" 
                                for intake in recent_intakes if intake['status'] == 'taken']
                
                if intake_options:
                    selected_intake = st.selectbox("Select Medicine Intake", intake_options)
                    
                    col1, col2 = st.columns(2)
                    
                    with col1:
                        mood_rating = st.slider("Mood Rating (1-5)", 1, 5, 3)
                        energy_level = st.slider("Energy Level (1-5)", 1, 5, 3)
                    
                    with col2:
                        side_effects = st.text_input("Side Effects (comma-separated)")
                        symptoms = st.text_input("Symptoms (comma-separated)")
                    
                    notes = st.text_area("Additional Notes")
                    
                    if st.form_submit_button("Submit Feedback"):
                        # Find the corresponding intake
                        selected_idx = intake_options.index(selected_intake)
                        intake_id = recent_intakes[selected_idx]['id']
                        
                        feedback_data = {
                            "intake_id": intake_id,
                            "mood_rating": mood_rating,
                            "energy_level": energy_level,
                            "side_effects": side_effects,
                            "symptoms": symptoms,
                            "notes": notes
                        }
                        
                        response = make_api_request("/feedback/", "POST", feedback_data)
                        if response["success"]:
                            st.success("Health feedback recorded!")
                        else:
                            st.error(f"Failed to record feedback: {response['error']}")
                else:
                    st.info("No recent medicine intakes available for feedback.")
        else:
            st.info("No recent intakes found. Take some medicines first to provide feedback.")
    
    # Display recent feedback
    st.subheader("📋 Recent Health Feedback")
    feedback_response = make_api_request("/feedback/")
    if feedback_response["success"]:
        feedback_list = feedback_response["data"]
        
        if feedback_list:
            for feedback in feedback_list[-5:]:  # Show last 5 feedback entries
                with st.container():
                    col1, col2, col3 = st.columns([2, 1, 1])
                    
                    with col1:
                        st.write(f"**Medicine:** {feedback.get('medicine_name', 'N/A')}")
                        st.write(f"**Date:** {feedback.get('created_at', '')[:16]}")
                        if feedback.get('notes'):
                            st.write(f"**Notes:** {feedback['notes']}")
                    
                    with col2:
                        st.write(f"**Mood:** {feedback.get('mood_rating', 'N/A')}/5")
                        st.write(f"**Energy:** {feedback.get('energy_level', 'N/A')}/5")
                    
                    with col3:
                        if feedback.get('side_effects'):
                            st.write(f"**Side Effects:** {feedback['side_effects']}")
                        if feedback.get('symptoms'):
                            st.write(f"**Symptoms:** {feedback['symptoms']}")
                    
                    st.divider()
        else:
            st.info("No health feedback recorded yet.")

def main():
    """Main application function"""
    
    # Check if user wants to register
    if hasattr(st.session_state, 'show_register') and st.session_state.show_register:
        register_page()
        return
    
    # Authentication check
    if not st.session_state.authenticated:
        login_page()
        return
    
    # Sidebar navigation
    with st.sidebar:
        st.title("🏠 Navigation")
        
        # User info
        if st.session_state.user_info:
            st.write(f"👤 Welcome, {st.session_state.user_info.get('username', 'User')}!")
        
        # Navigation menu
        page = st.selectbox("Choose a page:", [
            "📊 Dashboard",
            "💊 My Medicines", 
            "⏰ Reminders",
            "🎤 Voice Interface",
            "📈 Reports",
            "🩺 Health Feedback"
        ])
        
        st.divider()
        
        # Quick actions
        st.subheader("⚡ Quick Actions")
        if st.button("🔔 Test Notification", use_container_width=True):
            response = make_api_request("/notifications/test", "POST")
            if response["success"]:
                st.success("Test notification sent!")
            else:
                st.error("Failed to send test notification")
        
        if st.button("🔄 Refresh Data", use_container_width=True):
            st.cache_data.clear()
            st.success("Data refreshed!")
        
        st.divider()
        
        # Logout
        if st.button("🚪 Logout", use_container_width=True):
            st.session_state.authenticated = False
            st.session_state.token = None
            st.session_state.user_info = None
            st.rerun()
    
    # Main content area
    if page == "📊 Dashboard":
        dashboard_page()
    elif page == "💊 My Medicines":
        medicines_page()
    elif page == "⏰ Reminders":
        reminders_page()
    elif page == "🎤 Voice Interface":
        voice_interface_page()
    elif page == "📈 Reports":
        reports_page()
    elif page == "🩺 Health Feedback":
        health_feedback_page()

if __name__ == "__main__":
    main()
