import requests
import json
from typing import Dict, List, Any
from sqlalchemy.orm import Session
from . import models
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler
import logging
import os

logger = logging.getLogger(__name__)

class HuggingFaceAIService:
    """AI service using Hugging Face open-source models"""
    
    def __init__(self):
        self.api_key = os.getenv("HUGGINGFACE_API_KEY", "").strip("'\"")
        self.base_url = "https://api-inference.huggingface.co/models"
        
        # BEST Models for Medicine Reminder Use Case
        # 1. Medical/Health-specific models for better domain understanding
        self.text_generation_model = "microsoft/DialoGPT-small"  # Lighter, faster for responses
        self.classification_model = "cardiffnlp/twitter-roberta-base-sentiment-latest"  # Best sentiment
        self.summarization_model = "facebook/bart-large-cnn"  # Good for medical summaries
        
        # Alternative medical-specific models (uncomment to try):
        # self.medical_model = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract"  # Medical text understanding
        # self.health_classification = "emilyalsentzer/Bio_ClinicalBERT"  # Clinical text analysis
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        } if self.api_key else {}
        
        self.scaler = StandardScaler()
        
        # Validate API key format
        if self.api_key and not self.api_key.startswith('hf_'):
            logger.warning("Hugging Face API key should start with 'hf_'")
        
        logger.info(f"HuggingFace AI Service initialized with key: {'✓' if self.api_key else '✗'}")
    
    def _make_hf_request(self, model_name: str, payload: Dict) -> Dict:
        """Make request to Hugging Face Inference API"""
        if not self.api_key:
            logger.warning("No Hugging Face API key provided, using fallback analysis")
            return {"error": "No API key"}
        
        try:
            url = f"{self.base_url}/{model_name}"
            response = requests.post(url, headers=self.headers, json=payload, timeout=30)
            
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                logger.error(f"HF API Error: {response.status_code} - {response.text}")
                return {"success": False, "error": response.text}
                
        except Exception as e:
            logger.error(f"HF API Request failed: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def calculate_adherence_score(self, user_id: int, db: Session, days: int = 30) -> float:
        """Calculate adherence score based on scheduled vs actual intakes"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Get all medicine schedules for user
        schedules = db.query(models.MedicineSchedule).join(models.Medicine).filter(
            models.Medicine.user_id == user_id,
            models.MedicineSchedule.created_at >= start_date
        ).all()
        
        if not schedules:
            return 0.0
        
        # Calculate expected intakes
        expected_intakes = len(schedules) * days
        
        # Get actual intakes
        actual_intakes = db.query(models.MedicineIntake).join(models.Medicine).filter(
            models.Medicine.user_id == user_id,
            models.MedicineIntake.taken_at >= start_date,
            models.MedicineIntake.status == "taken"
        ).count()
        
        if expected_intakes == 0:
            return 0.0
        
        adherence_score = min((actual_intakes / expected_intakes) * 100, 100.0)
        return round(adherence_score, 2)
    
    def analyze_patterns_with_ai(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Analyze medication patterns using Hugging Face AI models"""
        try:
            # Get basic pattern analysis first
            patterns = self._analyze_basic_patterns(user_id, db)
            
            if not patterns or "error" in patterns:
                return patterns
            
            # Generate AI insights using Hugging Face
            insights_text = self._generate_ai_insights(patterns)
            
            if insights_text:
                patterns["ai_insights"] = insights_text
                patterns["ai_recommendations"] = self._generate_ai_recommendations(patterns, insights_text)
            
            return patterns
            
        except Exception as e:
            logger.error(f"Error in AI pattern analysis: {str(e)}")
            return {"error": f"AI analysis failed: {str(e)}"}
    
    def _analyze_basic_patterns(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Basic pattern analysis using pandas and scikit-learn"""
        # Get intake data for analysis
        intakes = db.query(models.MedicineIntake).join(models.Medicine).filter(
            models.Medicine.user_id == user_id
        ).all()
        
        if not intakes:
            return {"error": "No intake data available for analysis"}
        
        # Convert to DataFrame for analysis
        data = []
        for intake in intakes:
            data.append({
                'medicine_id': intake.medicine_id,
                'taken_at': intake.taken_at,
                'status': intake.status,
                'hour': intake.taken_at.hour if intake.taken_at else 0,
                'day_of_week': intake.taken_at.weekday() if intake.taken_at else 0,
                'is_taken': 1 if intake.status == 'taken' else 0
            })
        
        df = pd.DataFrame(data)
        
        # Basic pattern analysis
        patterns = {
            'most_compliant_day': self._analyze_day_patterns(df),
            'best_time_slots': self._analyze_time_patterns(df),
            'medicine_adherence': self._analyze_medicine_adherence(df),
            'weekly_trends': self._analyze_weekly_trends(df),
            'overall_adherence': round(df['is_taken'].mean() * 100, 2),
            'total_intakes': len(df),
            'taken_count': df['is_taken'].sum(),
            'missed_count': len(df) - df['is_taken'].sum()
        }
        
        return patterns
    
    def _generate_ai_insights(self, patterns: Dict[str, Any]) -> str:
        """Generate AI insights using Hugging Face text generation"""
        try:
            # Prepare context for AI analysis
            context = self._prepare_context_for_ai(patterns)
            
            # Use summarization model to generate insights
            payload = {
                "inputs": f"Analyze this medication adherence data and provide insights: {context}",
                "parameters": {
                    "max_length": 150,
                    "min_length": 50,
                    "do_sample": True,
                    "temperature": 0.7
                }
            }
            
            response = self._make_hf_request(self.summarization_model, payload)
            
            if response.get("success") and response.get("data"):
                summary = response["data"]
                if isinstance(summary, list) and len(summary) > 0:
                    return summary[0].get("summary_text", "AI analysis completed")
                elif isinstance(summary, dict):
                    return summary.get("summary_text", "AI analysis completed")
            
            # Fallback to rule-based insights
            return self._generate_rule_based_insights(patterns)
            
        except Exception as e:
            logger.error(f"Error generating AI insights: {str(e)}")
            return self._generate_rule_based_insights(patterns)
    
    def _prepare_context_for_ai(self, patterns: Dict[str, Any]) -> str:
        """Prepare structured context for AI analysis"""
        context_parts = []
        
        # Overall adherence
        overall = patterns.get('overall_adherence', 0)
        context_parts.append(f"Overall adherence rate: {overall}%")
        
        # Best day analysis
        best_day = patterns.get('most_compliant_day', {})
        if best_day.get('day') != "No data":
            context_parts.append(f"Best compliance day: {best_day.get('day')} with {best_day.get('adherence', 0)}% adherence")
        
        # Time patterns
        time_slots = patterns.get('best_time_slots', {})
        if time_slots.get('best_hours'):
            context_parts.append(f"Best times for medication: {', '.join(time_slots['best_hours'])}")
        
        # Statistics
        total = patterns.get('total_intakes', 0)
        taken = patterns.get('taken_count', 0)
        missed = patterns.get('missed_count', 0)
        context_parts.append(f"Total scheduled: {total}, Taken: {taken}, Missed: {missed}")
        
        return ". ".join(context_parts)
    
    def _generate_rule_based_insights(self, patterns: Dict[str, Any]) -> str:
        """Generate insights using rule-based approach as fallback"""
        insights = []
        
        overall = patterns.get('overall_adherence', 0)
        
        if overall >= 90:
            insights.append("Excellent medication adherence! You're maintaining a very consistent routine.")
        elif overall >= 75:
            insights.append("Good adherence with room for improvement. Focus on consistency.")
        elif overall >= 50:
            insights.append("Moderate adherence. Consider setting more reminders or adjusting your routine.")
        else:
            insights.append("Low adherence detected. Please consult with your healthcare provider about barriers to medication compliance.")
        
        # Day-based insights
        best_day = patterns.get('most_compliant_day', {})
        if best_day.get('day') != "No data":
            insights.append(f"You're most consistent on {best_day.get('day')}s. Try to replicate this day's routine.")
        
        # Time-based insights
        time_slots = patterns.get('best_time_slots', {})
        if time_slots.get('best_hours'):
            insights.append(f"Your optimal medication times appear to be around {', '.join(time_slots['best_hours'][:2])}.")
        
        return " ".join(insights)
    
    def _generate_ai_recommendations(self, patterns: Dict[str, Any], insights: str) -> List[str]:
        """Generate personalized recommendations"""
        recommendations = []
        overall = patterns.get('overall_adherence', 0)
        
        if overall < 50:
            recommendations.append("📈 Set multiple daily reminders to improve consistency")
            recommendations.append("👨‍⚕️ Discuss adherence challenges with your healthcare provider")
        elif overall < 80:
            recommendations.append("🎯 Focus on maintaining your current routine while addressing missed doses")
            recommendations.append("📱 Consider using voice commands for easier logging")
        else:
            recommendations.append("🌟 Excellent work! Continue your current medication routine")
            recommendations.append("📊 Monitor your patterns to maintain this level of adherence")
        
        # Day-specific recommendations
        best_day = patterns.get('most_compliant_day', {})
        if best_day.get('adherence', 0) > overall + 10:
            recommendations.append(f"📅 Model your routine after {best_day.get('day')}s for better consistency")
        
        # Time-specific recommendations
        time_slots = patterns.get('best_time_slots', {})
        if time_slots.get('worst_hours'):
            recommendations.append(f"⏰ Consider adjusting medication times away from {time_slots['worst_hours'][0]}")
        
        return recommendations[:5]  # Limit to top 5 recommendations
    
    def analyze_health_sentiment(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Analyze health feedback sentiment using Hugging Face models"""
        try:
            # Get health feedback data
            feedback_data = db.query(models.HealthFeedback).join(models.MedicineIntake).join(models.Medicine).filter(
                models.Medicine.user_id == user_id
            ).order_by(models.HealthFeedback.created_at.desc()).limit(20).all()
            
            if not feedback_data:
                return {"message": "No health feedback data available for sentiment analysis"}
            
            # Prepare text for sentiment analysis
            feedback_texts = []
            for feedback in feedback_data:
                text_parts = []
                if feedback.notes:
                    text_parts.append(feedback.notes)
                if feedback.side_effects:
                    text_parts.append(f"Side effects: {feedback.side_effects}")
                if feedback.symptoms:
                    text_parts.append(f"Symptoms: {feedback.symptoms}")
                
                if text_parts:
                    feedback_texts.append(" ".join(text_parts))
            
            if not feedback_texts:
                return {"message": "No text feedback available for sentiment analysis"}
            
            # Analyze sentiment using Hugging Face
            sentiments = []
            for text in feedback_texts[:10]:  # Analyze last 10 feedback entries
                sentiment = self._analyze_text_sentiment(text)
                if sentiment:
                    sentiments.append(sentiment)
            
            # Calculate overall sentiment trends
            if sentiments:
                avg_sentiment = self._calculate_sentiment_trends(sentiments)
                insights = self._generate_health_insights(avg_sentiment, feedback_data)
                
                return {
                    "sentiment_analysis": avg_sentiment,
                    "health_insights": insights,
                    "total_feedback_entries": len(feedback_data),
                    "analyzed_entries": len(sentiments)
                }
            else:
                return {"message": "Unable to analyze sentiment from feedback"}
            
        except Exception as e:
            logger.error(f"Error in health sentiment analysis: {str(e)}")
            return {"error": f"Sentiment analysis failed: {str(e)}"}
    
    def _analyze_text_sentiment(self, text: str) -> Dict[str, Any]:
        """Analyze sentiment of a single text using Hugging Face"""
        try:
            payload = {"inputs": text}
            response = self._make_hf_request(self.classification_model, payload)
            
            if response.get("success") and response.get("data"):
                sentiment_data = response["data"]
                if isinstance(sentiment_data, list) and len(sentiment_data) > 0:
                    return sentiment_data[0]
                elif isinstance(sentiment_data, dict):
                    return sentiment_data
            
            return None
            
        except Exception as e:
            logger.error(f"Error analyzing text sentiment: {str(e)}")
            return None
    
    def _calculate_sentiment_trends(self, sentiments: List[Dict]) -> Dict[str, Any]:
        """Calculate overall sentiment trends"""
        if not sentiments:
            return {}
        
        # Count sentiment labels
        label_counts = {}
        total_score = 0
        
        for sentiment in sentiments:
            if isinstance(sentiment, list):
                for item in sentiment:
                    label = item.get('label', 'UNKNOWN')
                    score = item.get('score', 0)
                    label_counts[label] = label_counts.get(label, 0) + score
                    total_score += score
            elif isinstance(sentiment, dict):
                label = sentiment.get('label', 'UNKNOWN')
                score = sentiment.get('score', 0)
                label_counts[label] = label_counts.get(label, 0) + score
                total_score += score
        
        # Calculate percentages
        if total_score > 0:
            for label in label_counts:
                label_counts[label] = round((label_counts[label] / total_score) * 100, 2)
        
        return {
            "sentiment_distribution": label_counts,
            "dominant_sentiment": max(label_counts.items(), key=lambda x: x[1])[0] if label_counts else "NEUTRAL",
            "total_analyzed": len(sentiments)
        }
    
    def _generate_health_insights(self, sentiment_trends: Dict, feedback_data: List) -> List[str]:
        """Generate health insights based on sentiment analysis"""
        insights = []
        
        if not sentiment_trends or not feedback_data:
            return ["Not enough data for health insights"]
        
        dominant = sentiment_trends.get("dominant_sentiment", "NEUTRAL").upper()
        
        if dominant == "NEGATIVE":
            insights.append("😟 Recent feedback shows concerning patterns. Consider discussing with your healthcare provider.")
        elif dominant == "POSITIVE":
            insights.append("😊 Positive health trends detected! Your medication routine seems to be working well.")
        else:
            insights.append("😐 Neutral health feedback patterns. Continue monitoring your symptoms.")
        
        # Analyze mood and energy trends
        moods = [f.mood_rating for f in feedback_data if f.mood_rating]
        energy_levels = [f.energy_level for f in feedback_data if f.energy_level]
        
        if moods:
            avg_mood = sum(moods) / len(moods)
            if avg_mood < 3:
                insights.append("📉 Low mood ratings detected. Consider discussing mental health with your doctor.")
            elif avg_mood > 4:
                insights.append("📈 Good mood patterns! Your treatment plan seems effective.")
        
        if energy_levels:
            avg_energy = sum(energy_levels) / len(energy_levels)
            if avg_energy < 3:
                insights.append("⚡ Low energy levels noted. Review medication timing with your healthcare provider.")
            elif avg_energy > 4:
                insights.append("💪 Good energy levels maintained! Keep up your current routine.")
        
        return insights[:4]  # Limit to 4 insights
    
    # Include all the helper methods from the previous local AI service
    def _analyze_day_patterns(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Analyze adherence by day of week"""
        if df.empty:
            return {"day": "No data", "adherence": 0}
        
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        day_adherence = df.groupby('day_of_week')['is_taken'].mean() * 100
        
        if day_adherence.empty:
            return {"day": "No data", "adherence": 0}
        
        best_day_idx = day_adherence.idxmax()
        best_day = day_names[best_day_idx]
        
        return {
            "day": best_day,
            "adherence": round(day_adherence.max(), 2),
            "all_days": {day_names[i]: round(day_adherence.get(i, 0), 2) for i in range(7)}
        }
    
    def _analyze_time_patterns(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Analyze adherence by time of day"""
        if df.empty:
            return {"best_hours": [], "worst_hours": []}
        
        hour_adherence = df.groupby('hour')['is_taken'].mean() * 100
        
        if hour_adherence.empty:
            return {"best_hours": [], "worst_hours": []}
        
        # Get top 3 best and worst hours
        best_hours = hour_adherence.nlargest(3).index.tolist()
        worst_hours = hour_adherence.nsmallest(3).index.tolist()
        
        return {
            "best_hours": [f"{hour}:00" for hour in best_hours],
            "worst_hours": [f"{hour}:00" for hour in worst_hours],
            "hourly_adherence": {f"{hour}:00": round(adherence, 2) 
                               for hour, adherence in hour_adherence.items()}
        }
    
    def _analyze_medicine_adherence(self, df: pd.DataFrame) -> Dict[str, float]:
        """Analyze adherence by medicine"""
        if df.empty:
            return {}
        
        medicine_adherence = df.groupby('medicine_id')['is_taken'].mean() * 100
        return {f"Medicine_{med_id}": round(adherence, 2) 
                for med_id, adherence in medicine_adherence.items()}
    
    def _analyze_weekly_trends(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Analyze weekly adherence trends"""
        if df.empty or 'taken_at' not in df.columns:
            return []
        
        try:
            df['taken_at'] = pd.to_datetime(df['taken_at'])
            df['week'] = df['taken_at'].dt.isocalendar().week
            df['year'] = df['taken_at'].dt.year
            
            weekly_adherence = df.groupby(['year', 'week'])['is_taken'].mean() * 100
            
            trends = []
            for (year, week), adherence in weekly_adherence.items():
                trends.append({
                    "week": f"{year}-W{week}",
                    "adherence": round(adherence, 2)
                })
            
            return sorted(trends, key=lambda x: x['week'])[-8:]  # Last 8 weeks
            
        except Exception as e:
            logger.error(f"Error in weekly trends analysis: {str(e)}")
            return []

# Create global instance
huggingface_ai_service = HuggingFaceAIService()
