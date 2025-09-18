import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  TouchableOpacity,
  SafeAreaView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AIService from '../services/AIService';
import DataService from '../services/DataService';
import TTSService from '../services/TTSService';

const ReportsScreen = () => {
  const [healthReport, setHealthReport] = useState(null);
  const [adherenceStats, setAdherenceStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const stats = await DataService.getAdherenceStats(30); // Last 30 days
      setAdherenceStats(stats);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const generateHealthReport = async () => {
    setIsLoading(true);
    try {
      const medicationHistory = await DataService.getMedicationHistory();
      const feedbackHistory = await DataService.getFeedbackHistory();
      
      if (medicationHistory.length === 0) {
        Alert.alert(
          "No Data Available", 
          "You don't have enough medication history to generate a comprehensive report. Start tracking your medications to get personalized insights!"
        );
        setIsLoading(false);
        return;
      }

      const reportData = await AIService.generateHealthReport(medicationHistory, feedbackHistory);
      setHealthReport(reportData);
      
      // Speak a summary
      await TTSService.speak("Your AI health report is ready! It includes personalized insights and dietary recommendations based on your medication history.");
      
    } catch (error) {
      console.error('Report generation error:', error);
      Alert.alert('Error', 'Failed to generate health report. Please check your internet connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeak = async () => {
    if (isSpeaking) {
      TTSService.stop();
      setIsSpeaking(false);
    } else {
      if (healthReport) {
        setIsSpeaking(true);
        try {
          await TTSService.speak(healthReport.report);
        } catch (error) {
          console.error('TTS error:', error);
        } finally {
          setIsSpeaking(false);
        }
      }
    }
  };

  const StatCard = ({ title, value, icon, color, subtitle }) => (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={styles.statHeader}>
        <Ionicons name={icon} size={24} color={color} />
        <Text style={[styles.statValue, { color }]}>{value}</Text>
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );

  const DietarySuggestionCard = ({ suggestion, index }) => (
    <View style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <Text style={styles.suggestionNumber}>{index + 1}</Text>
        <Ionicons name="nutrition" size={20} color="#4CAF50" />
      </View>
      <Text style={styles.suggestionText}>{suggestion}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#2196F3', '#1976D2']} style={styles.header}>
        <Text style={styles.headerTitle}>📊 Health Reports</Text>
        <Text style={styles.headerSubtitle}>
          AI-powered insights and recommendations
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Adherence Statistics */}
        {adherenceStats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📈 30-Day Overview</Text>
            <View style={styles.statsGrid}>
              <StatCard
                title="Adherence Rate"
                value={`${adherenceStats.adherenceRate}%`}
                icon="checkmark-circle"
                color="#4CAF50"
                subtitle="On-time medications"
              />
              <StatCard
                title="Total Reminders"
                value={adherenceStats.totalReminders}
                icon="alarm"
                color="#FF9800"
                subtitle="Scheduled doses"
              />
              <StatCard
                title="Average Delay"
                value={`${adherenceStats.averageDelay}m`}
                icon="time"
                color="#2196F3"
                subtitle="Minutes late"
              />
              <StatCard
                title="Missed Doses"
                value={adherenceStats.missed}
                icon="close-circle"
                color="#F44336"
                subtitle="Requires attention"
              />
            </View>
          </View>
        )}

        {/* AI Report Generation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 AI Health Analysis</Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateHealthReport}
            disabled={isLoading}
          >
            <LinearGradient
              colors={isLoading ? ['#ccc', '#999'] : ['#9C27B0', '#7B1FA2']}
              style={styles.generateGradient}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="sparkles" size={24} color="white" />
              )}
              <Text style={styles.generateText}>
                {isLoading ? 'Analyzing Your Health...' : 'Generate AI Health Report'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          
          <Text style={styles.generateSubtitle}>
            Get personalized insights based on your medication history and feedback
          </Text>
        </View>

        {/* Health Report */}
        {healthReport && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Your Health Report</Text>
            
            <View style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <Ionicons name="document-text" size={24} color="#2196F3" />
                <Text style={styles.reportTitle}>AI Analysis</Text>
                <TouchableOpacity
                  onPress={handleSpeak}
                  style={styles.speakButton}
                >
                  <Ionicons 
                    name={isSpeaking ? "stop-circle" : "volume-high"} 
                    size={20} 
                    color="#9C27B0" 
                  />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.reportText}>{healthReport.report}</Text>
            </View>

            {/* Dietary Suggestions */}
            {healthReport.dietarySuggestions && healthReport.dietarySuggestions.length > 0 && (
              <View style={styles.dietarySection}>
                <View style={styles.dietaryHeader}>
                  <Ionicons name="restaurant" size={24} color="#4CAF50" />
                  <Text style={styles.dietaryTitle}>Dietary Recommendations</Text>
                </View>
                
                {healthReport.dietarySuggestions.map((suggestion, index) => (
                  <DietarySuggestionCard
                    key={index}
                    suggestion={suggestion}
                    index={index}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Tips Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💡 Health Tips</Text>
          <View style={styles.tipsCard}>
            <View style={styles.tipItem}>
              <Ionicons name="water" size={20} color="#2196F3" />
              <Text style={styles.tipText}>Stay hydrated - drink 8 glasses of water daily</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="walk" size={20} color="#4CAF50" />
              <Text style={styles.tipText}>Light exercise can improve medication effectiveness</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="time" size={20} color="#FF9800" />
              <Text style={styles.tipText}>Take medications at consistent times each day</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="chatbubble" size={20} color="#9C27B0" />
              <Text style={styles.tipText}>Share feedback to get better recommendations</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 20,
    paddingTop: 40,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
    marginTop: 5,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    marginBottom: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  statSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  generateButton: {
    borderRadius: 15,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginBottom: 10,
  },
  generateGradient: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  generateSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
  },
  reportCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    flex: 1,
    marginLeft: 12,
  },
  speakButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
  },
  reportText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#34495e',
  },
  dietarySection: {
    marginTop: 20,
  },
  dietaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  dietaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginLeft: 12,
  },
  suggestionCard: {
    backgroundColor: '#f8fff8',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginRight: 10,
    width: 20,
  },
  suggestionText: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
  },
  tipsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  tipText: {
    fontSize: 14,
    color: '#2c3e50',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
});

export default ReportsScreen;
