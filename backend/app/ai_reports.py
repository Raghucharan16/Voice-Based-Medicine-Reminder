import os
import openai
import json
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.database import get_db, User, Medicine, MedicineIntake, HealthFeedback, AIReport
import matplotlib.pyplot as plt
import seaborn as sns
import base64
from io import BytesIO

class AIReportService:
    def __init__(self):
        openai.api_key = os.getenv("OPENAI_API_KEY")
        self.model = "gpt-3.5-turbo"
    
    async def generate_adherence_report(self, user_id: int, period_days: int = 30) -> Dict:
        """Generate AI-powered adherence analysis report"""
        db = next(get_db())
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return {"error": "User not found"}
            
            # Get date range
            end_date = datetime.now()
            start_date = end_date - timedelta(days=period_days)
            
            # Get medicines and intakes data
            medicines = db.query(Medicine).filter(
                Medicine.user_id == user_id,
                Medicine.is_active == True
            ).all()
            
            intakes = db.query(MedicineIntake).filter(
                MedicineIntake.user_id == user_id,
                MedicineIntake.created_at >= start_date,
                MedicineIntake.created_at <= end_date
            ).all()
            
            # Get health feedback
            feedback = db.query(HealthFeedback).filter(
                HealthFeedback.user_id == user_id,
                HealthFeedback.created_at >= start_date,
                HealthFeedback.created_at <= end_date
            ).all()
            
            # Calculate adherence metrics
            adherence_data = self._calculate_adherence_metrics(medicines, intakes, start_date, end_date)
            
            # Prepare data for AI analysis
            analysis_data = {
                "user_profile": {
                    "age": user.age,
                    "medical_conditions": user.medical_conditions,
                    "total_medicines": len(medicines)
                },
                "adherence_metrics": adherence_data,
                "health_feedback": [
                    {
                        "date": f.created_at.isoformat(),
                        "rating": f.rating,
                        "symptoms": f.symptoms,
                        "side_effects": f.side_effects,
                        "medicine_name": db.query(Medicine).filter(Medicine.id == f.medicine_id).first().name if f.medicine_id else None
                    }
                    for f in feedback
                ],
                "period": f"{start_date.date()} to {end_date.date()}"
            }
            
            # Generate AI insights
            ai_insights = await self._generate_ai_insights(analysis_data)
            
            # Create visualizations
            charts = self._create_adherence_charts(adherence_data)
            
            # Save report to database
            report = AIReport(
                user_id=user_id,
                report_type="adherence",
                period_start=start_date,
                period_end=end_date,
                data_analyzed=json.dumps(analysis_data),
                insights=ai_insights["insights"],
                recommendations=ai_insights["recommendations"],
                adherence_score=adherence_data["overall_adherence_rate"]
            )
            db.add(report)
            db.commit()
            
            return {
                "report_id": report.id,
                "period": analysis_data["period"],
                "adherence_score": adherence_data["overall_adherence_rate"],
                "insights": ai_insights["insights"],
                "recommendations": ai_insights["recommendations"],
                "detailed_metrics": adherence_data,
                "charts": charts,
                "health_trends": self._analyze_health_trends(feedback)
            }
            
        except Exception as e:
            print(f"Error generating adherence report: {e}")
            return {"error": str(e)}
        finally:
            db.close()
    
    def _calculate_adherence_metrics(self, medicines: List, intakes: List, start_date: datetime, end_date: datetime) -> Dict:
        """Calculate detailed adherence metrics"""
        total_scheduled = 0
        total_taken = 0
        medicine_metrics = {}
        
        for medicine in medicines:
            # Parse medicine schedule
            times = json.loads(medicine.times)
            daily_doses = len(times)
            
            # Calculate expected doses in period
            days_in_period = (end_date - max(start_date, medicine.start_date)).days + 1
            expected_doses = daily_doses * days_in_period
            
            # Count actual intakes for this medicine
            medicine_intakes = [i for i in intakes if i.medicine_id == medicine.id and i.status == "taken"]
            actual_doses = len(medicine_intakes)
            
            adherence_rate = (actual_doses / expected_doses * 100) if expected_doses > 0 else 0
            
            medicine_metrics[medicine.name] = {
                "expected_doses": expected_doses,
                "actual_doses": actual_doses,
                "adherence_rate": adherence_rate,
                "missed_doses": expected_doses - actual_doses,
                "dosage": medicine.dosage,
                "frequency": daily_doses
            }
            
            total_scheduled += expected_doses
            total_taken += actual_doses
        
        overall_adherence_rate = (total_taken / total_scheduled * 100) if total_scheduled > 0 else 0
        
        # Calculate timing accuracy
        timing_accuracy = self._calculate_timing_accuracy(intakes)
        
        # Identify patterns
        patterns = self._identify_adherence_patterns(intakes)
        
        return {
            "overall_adherence_rate": round(overall_adherence_rate, 2),
            "total_scheduled": total_scheduled,
            "total_taken": total_taken,
            "total_missed": total_scheduled - total_taken,
            "medicine_breakdown": medicine_metrics,
            "timing_accuracy": timing_accuracy,
            "patterns": patterns
        }
    
    def _calculate_timing_accuracy(self, intakes: List) -> Dict:
        """Calculate how accurately medicines are taken on time"""
        on_time_count = 0
        early_count = 0
        late_count = 0
        
        for intake in intakes:
            if intake.taken_at and intake.scheduled_time:
                diff_minutes = (intake.taken_at - intake.scheduled_time).total_seconds() / 60
                
                if -15 <= diff_minutes <= 15:  # Within 15 minutes
                    on_time_count += 1
                elif diff_minutes < -15:
                    early_count += 1
                else:
                    late_count += 1
        
        total = len(intakes)
        
        return {
            "on_time_percentage": (on_time_count / total * 100) if total > 0 else 0,
            "early_percentage": (early_count / total * 100) if total > 0 else 0,
            "late_percentage": (late_count / total * 100) if total > 0 else 0,
            "average_delay_minutes": sum(
                (i.taken_at - i.scheduled_time).total_seconds() / 60
                for i in intakes
                if i.taken_at and i.scheduled_time
            ) / len(intakes) if intakes else 0
        }
    
    def _identify_adherence_patterns(self, intakes: List) -> Dict:
        """Identify patterns in medication adherence"""
        if not intakes:
            return {}
        
        # Group by day of week
        dow_adherence = {}
        for i in range(7):
            dow_adherence[i] = {"taken": 0, "total": 0}
        
        # Group by time of day
        time_adherence = {"morning": 0, "afternoon": 0, "evening": 0, "night": 0}
        
        for intake in intakes:
            # Day of week pattern
            dow = intake.scheduled_time.weekday()
            dow_adherence[dow]["total"] += 1
            if intake.status == "taken":
                dow_adherence[dow]["taken"] += 1
            
            # Time of day pattern
            hour = intake.scheduled_time.hour
            if 6 <= hour < 12:
                time_period = "morning"
            elif 12 <= hour < 17:
                time_period = "afternoon"
            elif 17 <= hour < 22:
                time_period = "evening"
            else:
                time_period = "night"
            
            time_adherence[time_period] += 1 if intake.status == "taken" else 0
        
        return {
            "day_of_week": dow_adherence,
            "time_of_day": time_adherence
        }
    
    async def _generate_ai_insights(self, data: Dict) -> Dict:
        """Generate AI-powered insights using OpenAI"""
        try:
            prompt = f"""
            Analyze the following medication adherence data and provide insights and recommendations:
            
            Patient Profile:
            - Age: {data['user_profile']['age']}
            - Medical Conditions: {data['user_profile']['medical_conditions']}
            - Number of Medicines: {data['user_profile']['total_medicines']}
            
            Adherence Data:
            - Overall Adherence Rate: {data['adherence_metrics']['overall_adherence_rate']}%
            - Total Scheduled Doses: {data['adherence_metrics']['total_scheduled']}
            - Total Taken: {data['adherence_metrics']['total_taken']}
            - Total Missed: {data['adherence_metrics']['total_missed']}
            
            Medicine Breakdown:
            {json.dumps(data['adherence_metrics']['medicine_breakdown'], indent=2)}
            
            Health Feedback:
            {json.dumps(data['health_feedback'][-5:], indent=2)}  # Last 5 feedback entries
            
            Please provide:
            1. Key insights about the patient's adherence patterns
            2. Specific recommendations to improve adherence
            3. Any concerning patterns or trends
            4. Suggestions for caregiver involvement
            
            Format your response as JSON with 'insights' and 'recommendations' keys.
            """
            
            response = openai.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a medical adherence analyst AI. Provide professional, actionable insights based on medication adherence data."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1000,
                temperature=0.3
            )
            
            # Parse AI response
            ai_response = response.choices[0].message.content
            try:
                parsed_response = json.loads(ai_response)
                return parsed_response
            except json.JSONDecodeError:
                # Fallback if AI doesn't return proper JSON
                return {
                    "insights": ai_response[:500],
                    "recommendations": "Please consult with your healthcare provider for personalized recommendations."
                }
                
        except Exception as e:
            print(f"Error generating AI insights: {e}")
            return {
                "insights": "Unable to generate AI insights at this time.",
                "recommendations": "Please maintain consistent medication schedules and consult with your healthcare provider."
            }
    
    def _create_adherence_charts(self, adherence_data: Dict) -> Dict:
        """Create visualization charts for adherence data"""
        charts = {}
        
        try:
            # Adherence by medicine chart
            medicines = list(adherence_data["medicine_breakdown"].keys())
            adherence_rates = [adherence_data["medicine_breakdown"][med]["adherence_rate"] for med in medicines]
            
            plt.figure(figsize=(10, 6))
            plt.bar(medicines, adherence_rates, color='skyblue')
            plt.title('Adherence Rate by Medicine')
            plt.xlabel('Medicine')
            plt.ylabel('Adherence Rate (%)')
            plt.xticks(rotation=45, ha='right')
            plt.tight_layout()
            
            # Convert to base64
            buffer = BytesIO()
            plt.savefig(buffer, format='png')
            buffer.seek(0)
            charts["adherence_by_medicine"] = base64.b64encode(buffer.getvalue()).decode()
            plt.close()
            
            # Overall adherence pie chart
            plt.figure(figsize=(8, 8))
            labels = ['Taken', 'Missed']
            sizes = [adherence_data["total_taken"], adherence_data["total_missed"]]
            colors = ['lightgreen', 'lightcoral']
            plt.pie(sizes, labels=labels, colors=colors, autopct='%1.1f%%', startangle=90)
            plt.title('Overall Adherence Distribution')
            
            buffer = BytesIO()
            plt.savefig(buffer, format='png')
            buffer.seek(0)
            charts["overall_adherence"] = base64.b64encode(buffer.getvalue()).decode()
            plt.close()
            
        except Exception as e:
            print(f"Error creating charts: {e}")
        
        return charts
    
    def _analyze_health_trends(self, feedback: List) -> Dict:
        """Analyze health trends from feedback data"""
        if not feedback:
            return {}
        
        # Calculate average ratings over time
        ratings = [f.rating for f in feedback if f.rating]
        avg_rating = sum(ratings) / len(ratings) if ratings else 0
        
        # Identify common symptoms and side effects
        symptoms = [f.symptoms for f in feedback if f.symptoms]
        side_effects = [f.side_effects for f in feedback if f.side_effects]
        
        return {
            "average_health_rating": round(avg_rating, 2),
            "total_feedback_entries": len(feedback),
            "common_symptoms": list(set(symptoms)),
            "reported_side_effects": list(set(side_effects)),
            "trend": "improving" if len(ratings) > 1 and ratings[-1] > ratings[0] else "stable"
        }
    
    async def generate_weekly_summary(self, user_id: int) -> Dict:
        """Generate a weekly summary for caregivers"""
        report_data = await self.generate_adherence_report(user_id, period_days=7)
        
        if "error" in report_data:
            return report_data
        
        # Simplify for weekly summary
        summary = {
            "period": "Last 7 days",
            "adherence_rate": report_data["adherence_score"],
            "total_doses_scheduled": report_data["detailed_metrics"]["total_scheduled"],
            "total_doses_taken": report_data["detailed_metrics"]["total_taken"],
            "medicines": [
                {
                    "name": name,
                    "adherence": data["adherence_rate"],
                    "taken": data["actual_doses"],
                    "scheduled": data["expected_doses"]
                }
                for name, data in report_data["detailed_metrics"]["medicine_breakdown"].items()
            ],
            "health_summary": report_data["health_trends"],
            "key_insights": report_data["insights"][:200] + "..." if len(report_data["insights"]) > 200 else report_data["insights"]
        }
        
        return summary

# Global AI report service instance
ai_report_service = AIReportService()
