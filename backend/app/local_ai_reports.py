from sqlalchemy.orm import Session
from . import models
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from typing import Dict, List, Any
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
import logging

logger = logging.getLogger(__name__)

class LocalAIReportsService:
    """Open-source AI reports service using scikit-learn and pandas"""
    
    def __init__(self):
        self.scaler = StandardScaler()
    
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
    
    def analyze_patterns(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Analyze medication patterns using local ML"""
        try:
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
                'recommendations': self._generate_recommendations(df)
            }
            
            return patterns
            
        except Exception as e:
            logger.error(f"Error in pattern analysis: {str(e)}")
            return {"error": f"Analysis failed: {str(e)}"}
    
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
    
    def _generate_recommendations(self, df: pd.DataFrame) -> List[str]:
        """Generate personalized recommendations based on patterns"""
        recommendations = []
        
        if df.empty:
            return ["Add more medicine intake data for personalized recommendations"]
        
        # Calculate overall adherence
        overall_adherence = df['is_taken'].mean() * 100
        
        if overall_adherence < 50:
            recommendations.append("📈 Your adherence is below 50%. Consider setting more frequent reminders.")
        elif overall_adherence < 80:
            recommendations.append("🎯 Good progress! Try to maintain consistency to reach 80%+ adherence.")
        else:
            recommendations.append("🌟 Excellent adherence! Keep up the great work!")
        
        # Day-based recommendations
        day_adherence = df.groupby('day_of_week')['is_taken'].mean() * 100
        if not day_adherence.empty:
            worst_day = day_adherence.idxmin()
            day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
            if day_adherence.min() < 70:
                recommendations.append(f"📅 Focus on {day_names[worst_day]}s - your adherence is lower on this day.")
        
        # Time-based recommendations
        hour_adherence = df.groupby('hour')['is_taken'].mean() * 100
        if not hour_adherence.empty and hour_adherence.min() < 60:
            worst_hour = hour_adherence.idxmin()
            recommendations.append(f"⏰ Consider adjusting medicine times around {worst_hour}:00.")
        
        # Recent trend analysis
        if len(df) > 7:
            recent_adherence = df.tail(7)['is_taken'].mean() * 100
            older_adherence = df.head(7)['is_taken'].mean() * 100
            
            if recent_adherence > older_adherence + 10:
                recommendations.append("📈 Great improvement in recent days! Keep it up!")
            elif recent_adherence < older_adherence - 10:
                recommendations.append("📉 Recent adherence has declined. Consider reviewing your routine.")
        
        return recommendations[:5]  # Limit to 5 recommendations
    
    def generate_health_insights(self, user_id: int, db: Session) -> Dict[str, Any]:
        """Generate health insights from feedback data"""
        try:
            # Get health feedback data
            feedback_data = db.query(models.HealthFeedback).join(models.MedicineIntake).join(models.Medicine).filter(
                models.Medicine.user_id == user_id
            ).all()
            
            if not feedback_data:
                return {"message": "No health feedback data available for insights"}
            
            # Analyze side effects
            side_effects = {}
            symptom_trends = {}
            
            for feedback in feedback_data:
                # Count side effects
                if feedback.side_effects:
                    for effect in feedback.side_effects.split(','):
                        effect = effect.strip()
                        side_effects[effect] = side_effects.get(effect, 0) + 1
                
                # Track symptoms
                if feedback.symptoms:
                    for symptom in feedback.symptoms.split(','):
                        symptom = symptom.strip()
                        symptom_trends[symptom] = symptom_trends.get(symptom, 0) + 1
            
            insights = {
                "total_feedback_entries": len(feedback_data),
                "common_side_effects": sorted(side_effects.items(), key=lambda x: x[1], reverse=True)[:5],
                "frequent_symptoms": sorted(symptom_trends.items(), key=lambda x: x[1], reverse=True)[:5],
                "health_recommendations": self._generate_health_recommendations(feedback_data)
            }
            
            return insights
            
        except Exception as e:
            logger.error(f"Error generating health insights: {str(e)}")
            return {"error": f"Failed to generate health insights: {str(e)}"}
    
    def _generate_health_recommendations(self, feedback_data: List[models.HealthFeedback]) -> List[str]:
        """Generate health-based recommendations"""
        recommendations = []
        
        if not feedback_data:
            return ["Record more health feedback for personalized health insights"]
        
        # Analyze mood patterns
        moods = [f.mood_rating for f in feedback_data if f.mood_rating]
        if moods:
            avg_mood = sum(moods) / len(moods)
            if avg_mood < 3:
                recommendations.append("😟 Your mood ratings are consistently low. Consider discussing with your doctor.")
            elif avg_mood > 4:
                recommendations.append("😊 Great mood patterns! Your medication seems to be working well.")
        
        # Analyze energy levels
        energy_levels = [f.energy_level for f in feedback_data if f.energy_level]
        if energy_levels:
            avg_energy = sum(energy_levels) / len(energy_levels)
            if avg_energy < 3:
                recommendations.append("⚡ Low energy levels detected. Consider timing of medication doses.")
        
        # Check for concerning side effects
        all_side_effects = []
        for f in feedback_data:
            if f.side_effects:
                all_side_effects.extend([effect.strip().lower() for effect in f.side_effects.split(',')])
        
        concerning_effects = ['severe', 'pain', 'dizzy', 'nausea', 'allergic']
        for effect in concerning_effects:
            if any(effect in side_effect for side_effect in all_side_effects):
                recommendations.append(f"⚠️ Monitor {effect}-related side effects. Consult your doctor if persistent.")
                break
        
        return recommendations[:4]  # Limit to 4 health recommendations

# Create global instance
local_ai_service = LocalAIReportsService()
