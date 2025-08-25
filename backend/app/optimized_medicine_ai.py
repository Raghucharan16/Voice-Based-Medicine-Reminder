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

class OptimizedMedicineAI:
    """Optimized AI service specifically for medicine reminder use case"""
    
    def __init__(self):
        self.api_key = os.getenv("HUGGINGFACE_API_KEY", "").strip("'\"")
        self.base_url = "https://api-inference.huggingface.co/models"
        
        # OPTIMIZED MODEL SELECTION FOR MEDICINE REMINDERS
        
        # 1. For health sentiment analysis (analyzing "I feel good/bad after medicine")
        self.sentiment_model = "cardiffnlp/twitter-roberta-base-sentiment-latest"
        
        # 2. For generating adherence insights (creating reports)
        self.text_generation_model = "microsoft/DialoGPT-small"  # Fast and efficient
        
        # 3. For summarizing health patterns (weekly/monthly summaries)
        self.summarization_model = "facebook/bart-large-cnn"
        
        # 4. For question answering about medications (optional)
        self.qa_model = "deepset/roberta-base-squad2"
        
        # 5. For medical text classification (side effects categorization)
        self.medical_classifier = "emilyalsentzer/Bio_ClinicalBERT"
        
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        } if self.api_key else {}
        
        # Quick API key validation
        if self.api_key:
            if not self.api_key.startswith('hf_'):
                logger.warning("⚠️ API key should start with 'hf_'")
            else:
                logger.info("✅ Hugging Face API key validated")
        else:
            logger.info("ℹ️ No HF API key - using local AI fallback")
    
    def analyze_medicine_adherence_with_ai(self, user_id: int, db: Session) -> Dict[str, Any]:
        """AI-powered medicine adherence analysis"""
        try:
            # Get user's medicine data
            adherence_data = self._get_adherence_data(user_id, db)
            
            if not adherence_data:
                return {"error": "No adherence data available"}
            
            # Generate AI insights using best model for the task
            ai_insights = self._generate_adherence_insights(adherence_data)
            
            # Analyze health sentiment from feedback
            sentiment_analysis = self._analyze_health_sentiment(user_id, db)
            
            # Create comprehensive report
            report = {
                "adherence_score": adherence_data["adherence_score"],
                "ai_insights": ai_insights,
                "sentiment_analysis": sentiment_analysis,
                "recommendations": self._generate_smart_recommendations(adherence_data, sentiment_analysis),
                "patterns": adherence_data["patterns"],
                "ai_provider": "huggingface_optimized"
            }
            
            return report
            
        except Exception as e:
            logger.error(f"AI analysis failed: {str(e)}")
            return {"error": f"AI analysis failed: {str(e)}"}
    
    def _get_adherence_data(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Get comprehensive adherence data for AI analysis"""
        
        # Get recent intakes (last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        intakes = db.query(models.MedicineIntake).join(models.Medicine).filter(
            models.Medicine.user_id == user_id,
            models.MedicineIntake.created_at >= thirty_days_ago
        ).all()
        
        if not intakes:
            return {}
        
        # Calculate adherence metrics
        total_intakes = len(intakes)
        taken_intakes = len([i for i in intakes if i.status == "taken"])
        adherence_score = (taken_intakes / total_intakes * 100) if total_intakes > 0 else 0
        
        # Analyze patterns
        patterns = self._analyze_intake_patterns(intakes)
        
        return {
            "total_intakes": total_intakes,
            "taken_intakes": taken_intakes,
            "missed_intakes": total_intakes - taken_intakes,
            "adherence_score": round(adherence_score, 2),
            "patterns": patterns,
            "recent_intakes": intakes[-10:]  # Last 10 for AI analysis
        }
    
    def _generate_adherence_insights(self, adherence_data: Dict) -> str:
        """Generate natural language insights about adherence using AI"""
        try:
            # Prepare context for AI
            context = f"""
            Patient medication adherence analysis:
            - Total scheduled doses: {adherence_data['total_intakes']}
            - Successfully taken: {adherence_data['taken_intakes']}
            - Missed doses: {adherence_data['missed_intakes']}
            - Adherence rate: {adherence_data['adherence_score']}%
            
            Please provide insights and recommendations for improving medication adherence.
            """
            
            # Use text generation model for insights
            payload = {
                "inputs": context,
                "parameters": {
                    "max_new_tokens": 100,
                    "temperature": 0.7,
                    "do_sample": True
                }
            }
            
            response = self._make_hf_request(self.text_generation_model, payload)
            
            if response.get("success"):
                result = response["data"]
                if isinstance(result, list) and len(result) > 0:
                    return result[0].get("generated_text", "").replace(context, "").strip()
                elif isinstance(result, dict):
                    return result.get("generated_text", "").replace(context, "").strip()
            
            # Fallback to rule-based insights
            return self._generate_rule_based_insights(adherence_data)
            
        except Exception as e:
            logger.error(f"AI insight generation failed: {str(e)}")
            return self._generate_rule_based_insights(adherence_data)
    
    def _analyze_health_sentiment(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Analyze sentiment from health feedback using specialized model"""
        try:
            # Get recent health feedback
            feedback_data = db.query(models.HealthFeedback).join(
                models.MedicineIntake
            ).join(models.Medicine).filter(
                models.Medicine.user_id == user_id
            ).order_by(models.HealthFeedback.created_at.desc()).limit(10).all()
            
            if not feedback_data:
                return {"message": "No health feedback available"}
            
            # Prepare feedback text for sentiment analysis
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
                return {"message": "No text feedback for analysis"}
            
            # Analyze sentiment using optimized model
            sentiments = []
            for text in feedback_texts[:5]:  # Analyze recent 5 entries
                sentiment = self._get_text_sentiment(text)
                if sentiment:
                    sentiments.append(sentiment)
            
            # Calculate sentiment trends
            if sentiments:
                return self._calculate_sentiment_summary(sentiments, feedback_data)
            else:
                return {"message": "Sentiment analysis unavailable"}
                
        except Exception as e:
            logger.error(f"Sentiment analysis failed: {str(e)}")
            return {"error": f"Sentiment analysis failed: {str(e)}"}
    
    def _get_text_sentiment(self, text: str) -> Dict[str, Any]:
        """Get sentiment for a single text using optimized model"""
        try:
            payload = {"inputs": text}
            response = self._make_hf_request(self.sentiment_model, payload)
            
            if response.get("success"):
                data = response["data"]
                if isinstance(data, list) and len(data) > 0:
                    return data[0][0] if isinstance(data[0], list) else data[0]
                return data
            return None
            
        except Exception as e:
            logger.error(f"Text sentiment analysis failed: {str(e)}")
            return None
    
    def _generate_smart_recommendations(self, adherence_data: Dict, sentiment_data: Dict) -> List[str]:
        """Generate intelligent recommendations based on AI analysis"""
        recommendations = []
        
        adherence_score = adherence_data.get("adherence_score", 0)
        
        # Adherence-based recommendations
        if adherence_score >= 90:
            recommendations.append("🌟 Excellent adherence! Keep up the great work!")
        elif adherence_score >= 75:
            recommendations.append("👍 Good adherence. Focus on consistency to reach 90%+")
        elif adherence_score >= 50:
            recommendations.append("📈 Moderate adherence. Consider setting more frequent reminders")
        else:
            recommendations.append("🚨 Low adherence detected. Please consult your healthcare provider")
        
        # Sentiment-based recommendations
        if sentiment_data and "sentiment_summary" in sentiment_data:
            dominant_sentiment = sentiment_data["sentiment_summary"].get("dominant", "")
            if dominant_sentiment == "NEGATIVE":
                recommendations.append("😟 Negative health patterns detected. Discuss with your doctor")
            elif dominant_sentiment == "POSITIVE":
                recommendations.append("😊 Positive health feedback! Your medication seems effective")
        
        # Pattern-based recommendations
        patterns = adherence_data.get("patterns", {})
        if patterns.get("worst_day"):
            recommendations.append(f"📅 Focus on {patterns['worst_day']} - your lowest adherence day")
        
        return recommendations[:4]  # Return top 4 recommendations
    
    def _make_hf_request(self, model_name: str, payload: Dict) -> Dict:
        """Optimized API request with better error handling"""
        if not self.api_key:
            return {"success": False, "error": "No API key"}
        
        try:
            url = f"{self.base_url}/{model_name}"
            response = requests.post(
                url, 
                headers=self.headers, 
                json=payload, 
                timeout=30
            )
            
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            elif response.status_code == 503:
                logger.warning(f"Model {model_name} is loading. Retrying...")
                # Model is loading, could retry after a few seconds
                return {"success": False, "error": "Model loading"}
            else:
                logger.error(f"HF API Error {response.status_code}: {response.text}")
                return {"success": False, "error": f"API Error: {response.status_code}"}
                
        except requests.exceptions.Timeout:
            logger.error("HF API request timed out")
            return {"success": False, "error": "Request timeout"}
        except Exception as e:
            logger.error(f"HF API request failed: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def _analyze_intake_patterns(self, intakes: List) -> Dict[str, Any]:
        """Analyze patterns in medicine intake data"""
        if not intakes:
            return {}
        
        # Convert to DataFrame for analysis
        data = []
        for intake in intakes:
            if intake.taken_at:
                data.append({
                    'hour': intake.taken_at.hour,
                    'day_of_week': intake.taken_at.weekday(),
                    'is_taken': 1 if intake.status == 'taken' else 0
                })
        
        if not data:
            return {}
        
        df = pd.DataFrame(data)
        
        # Find patterns
        day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        day_adherence = df.groupby('day_of_week')['is_taken'].mean()
        
        best_day = day_names[day_adherence.idxmax()] if not day_adherence.empty else None
        worst_day = day_names[day_adherence.idxmin()] if not day_adherence.empty else None
        
        hour_adherence = df.groupby('hour')['is_taken'].mean()
        best_hour = f"{hour_adherence.idxmax()}:00" if not hour_adherence.empty else None
        
        return {
            "best_day": best_day,
            "worst_day": worst_day,
            "best_hour": best_hour,
            "day_adherence": {day_names[i]: round(day_adherence.get(i, 0) * 100, 1) for i in range(7)}
        }
    
    def _calculate_sentiment_summary(self, sentiments: List, feedback_data: List) -> Dict[str, Any]:
        """Calculate comprehensive sentiment summary"""
        if not sentiments:
            return {}
        
        # Count sentiment labels
        sentiment_counts = {"POSITIVE": 0, "NEGATIVE": 0, "NEUTRAL": 0}
        
        for sentiment in sentiments:
            if isinstance(sentiment, dict):
                label = sentiment.get("label", "NEUTRAL").upper()
                if label in sentiment_counts:
                    sentiment_counts[label] += 1
        
        total = sum(sentiment_counts.values())
        if total == 0:
            return {}
        
        # Calculate percentages
        sentiment_percentages = {
            label: round((count / total) * 100, 1) 
            for label, count in sentiment_counts.items()
        }
        
        # Determine dominant sentiment
        dominant = max(sentiment_counts.items(), key=lambda x: x[1])[0]
        
        return {
            "sentiment_summary": {
                "counts": sentiment_counts,
                "percentages": sentiment_percentages,
                "dominant": dominant,
                "total_analyzed": len(sentiments)
            },
            "health_trend": self._interpret_sentiment_trend(dominant, sentiment_percentages)
        }
    
    def _interpret_sentiment_trend(self, dominant: str, percentages: Dict) -> str:
        """Interpret sentiment trend for health insights"""
        if dominant == "POSITIVE" and percentages["POSITIVE"] >= 60:
            return "Your health feedback shows positive trends. Medication appears effective."
        elif dominant == "NEGATIVE" and percentages["NEGATIVE"] >= 60:
            return "Concerning negative patterns in health feedback. Consider discussing with healthcare provider."
        else:
            return "Mixed health feedback patterns. Continue monitoring your symptoms."
    
    def _generate_rule_based_insights(self, adherence_data: Dict) -> str:
        """Fallback rule-based insights when AI is unavailable"""
        adherence_score = adherence_data.get("adherence_score", 0)
        
        if adherence_score >= 90:
            return "Excellent medication adherence! You're maintaining a very consistent routine that's likely contributing to better health outcomes."
        elif adherence_score >= 75:
            return "Good adherence with room for small improvements. Consider identifying and addressing the factors that lead to missed doses."
        elif adherence_score >= 50:
            return "Moderate adherence detected. This level may impact medication effectiveness. Consider setting additional reminders or discussing barriers with your healthcare provider."
        else:
            return "Low adherence is concerning and may significantly impact treatment effectiveness. Please discuss adherence challenges with your healthcare provider to develop strategies for improvement."

# Create optimized instance
optimized_medicine_ai = OptimizedMedicineAI()
