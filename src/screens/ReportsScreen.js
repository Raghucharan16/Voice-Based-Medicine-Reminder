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
  const [medicines, setMedicines] = useState([]);
  const [medicationHistory, setMedicationHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const reminders = await DataService.getReminders();
      const history = await DataService.getMedicationHistory();
      
      setMedicines(reminders);
      setMedicationHistory(history);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const generateHealthReport = async () => {
    setIsLoading(true);
    try {
      // Get all medication data
      const reminders = await DataService.getReminders();
      const history = await DataService.getMedicationHistory();
      const feedbackHistory = await DataService.getFeedbackHistory();
      
      console.log('🏥 Generating report with:');
      console.log('- Reminders:', reminders.length);
      console.log('- History:', history.length);
      console.log('- Feedback:', feedbackHistory.length);
      
      if (reminders.length === 0) {
        Alert.alert(
          "No Medications Found", 
          "Please add some medications first to generate a health report."
        );
        setIsLoading(false);
        return;
      }

      // Prepare comprehensive medication data for AI with complete history
      const medicationData = history.map(h => {
        const reminder = reminders.find(r => r.id === h.medicationId);
        return {
          id: h.id,
          medicationId: h.medicationId,
          medicine: reminder?.medicine || 'Unknown',
          dosage: reminder?.dosage || 'As prescribed',
          frequency: reminder?.frequency || 'Daily',
          time: reminder?.time || 'N/A',
          scheduledTime: h.scheduledTime,
          actualTime: h.actualTime,
          status: h.status,
          delay: h.delay || 0
        };
      });

      console.log('📤 Sending to AI:', medicationData.length, 'history records');
      console.log('📤 Feedback to AI:', feedbackHistory.length, 'feedback records');

      // Call AI service with comprehensive data including feedback
      const reportData = await AIService.generateHealthReport(medicationData, feedbackHistory);
      
      console.log('✅ AI Report received:', reportData.aiPowered ? 'AI-powered' : 'Fallback');
      console.log('📄 Report text length:', reportData.report?.length || 0);
      console.log('📄 Report preview:', reportData.report?.substring(0, 200) || 'NO REPORT');
      
      if (!reportData || !reportData.report) {
        Alert.alert('Error', 'Failed to generate report. Please try again.');
        setIsLoading(false);
        return;
      }
      
      setHealthReport(reportData);
      
      // Speak a summary
      if (reportData.aiPowered) {
        await TTSService.speak("Your AI health report is ready! It includes personalized insights, dietary recommendations, and exercise suggestions.");
      } else {
        await TTSService.speak("Your health report is ready.");
      }
      
    } catch (error) {
      console.error('❌ Report generation error:', error);
      Alert.alert('Error', 'Failed to generate health report: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateOverallAdherence = () => {
    if (medicationHistory.length === 0) return 0;
    const taken = medicationHistory.filter(h => h.status === 'taken').length;
    return Math.round((taken / medicationHistory.length) * 100);
  };

  const getAdherenceBreakdown = () => {
    const takenOnTime = medicationHistory.filter(h => 
      h.status === 'taken' && h.delay <= 15
    ).length;
    const takenLate = medicationHistory.filter(h => 
      h.status === 'taken' && h.delay > 15
    ).length;
    const lateTaken = medicationHistory.filter(h => h.status === 'late_taken').length;
    const missed = medicationHistory.filter(h => h.status === 'missed').length;
    
    // Total scheduled is sum of all outcomes
    const total = takenOnTime + takenLate + lateTaken + missed;
    const taken = takenOnTime + takenLate; // Total doses taken (on-time + late)

    return {
      total,
      taken,
      missed,
      lateTaken,
      takenOnTime,
      takenLate,
      adherenceRate: total > 0 ? Math.round(((taken + lateTaken) / total) * 100) : 0,
      onTimeRate: (taken + takenLate) > 0 ? Math.round((takenOnTime / (taken + takenLate)) * 100) : 0,
    };
  };

  const renderMarkdownReport = (reportText) => {
    if (!reportText) return null;

    // Split by lines and render with formatting
    const lines = reportText.split('\n');
    let inSuggestionsSection = false;
    const mainReportLines = [];
    const suggestionLines = [];
    
    // Separate suggestions from main report
    lines.forEach((line) => {
      // Detect suggestions section
      if (line.toLowerCase().includes('suggestion') || 
          line.toLowerCase().includes('recommendation') ||
          line.toLowerCase().includes('tips')) {
        inSuggestionsSection = true;
      }
      
      if (inSuggestionsSection) {
        suggestionLines.push(line);
      } else {
        mainReportLines.push(line);
      }
    });
    
    const formatLines = (lineArray) => {
      return lineArray.map((line, index) => {
        // Headers (# ## ###)
        if (line.startsWith('### ')) {
          return (
            <Text key={index} style={styles.heading3}>
              {line.replace('### ', '')}
            </Text>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <Text key={index} style={styles.heading2}>
              {line.replace('## ', '')}
            </Text>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <Text key={index} style={styles.heading1}>
              {line.replace('# ', '')}
            </Text>
          );
        }
        
        // Bold text (**text**)
        if (line.includes('**')) {
          const parts = line.split('**');
          return (
            <Text key={index} style={styles.paragraph}>
              {parts.map((part, i) => 
                i % 2 === 1 ? <Text key={i} style={styles.bold}>{part}</Text> : part
              )}
            </Text>
          );
        }
        
        // Bullet points (- or *)
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return (
            <Text key={index} style={styles.bulletPoint}>
              • {line.trim().substring(2)}
            </Text>
          );
        }
        
        // Numbered lists (1. 2. etc)
        if (/^\d+\.\s/.test(line.trim())) {
          return (
            <Text key={index} style={styles.numberedPoint}>
              {line.trim()}
            </Text>
          );
        }
        
        // Horizontal rule (---)
        if (line.trim() === '---') {
          return <View key={index} style={styles.divider} />;
        }
        
        // Empty lines
        if (line.trim() === '') {
          return <View key={index} style={{ height: 10 }} />;
        }
        
        // Regular text
        return (
          <Text key={index} style={styles.paragraph}>
            {line}
          </Text>
        );
      });
    };

    return {
      mainReport: formatLines(mainReportLines),
      suggestions: formatLines(suggestionLines),
      hasSuggestions: suggestionLines.length > 0
    };
  };

  const MedicineCard = ({ medicine }) => {
    const medHistory = medicationHistory.filter(h => h.medicationId === medicine.id);
    const taken = medHistory.filter(h => h.status === 'taken').length;
    const lateTaken = medHistory.filter(h => h.status === 'late_taken').length;
    const missed = medHistory.filter(h => h.status === 'missed').length;
    const total = taken + lateTaken + missed;
    const adherence = total > 0 ? Math.round(((taken + lateTaken) / total) * 100) : 0;

    return (
      <View style={styles.medicineCard}>
        <View style={styles.medicineHeader}>
          <Ionicons name="medical" size={20} color="#2196F3" />
          <Text style={styles.medicineName}>{medicine.medicine}</Text>
        </View>
        <Text style={styles.medicineDetail}>💊 {medicine.dosage || 'As prescribed'}</Text>
        <Text style={styles.medicineDetail}>🕐 {medicine.time}</Text>
        <Text style={styles.medicineDetail}>📅 {medicine.frequency}</Text>
        
        <View style={styles.adherenceBar}>
          <View style={styles.adherenceBarBg}>
            <View style={[styles.adherenceBarFill, { width: `${adherence}%` }]} />
          </View>
          <Text style={styles.adherenceText}>{adherence}% adherence</Text>
        </View>
        
        <View style={styles.medicineStats}>
          <Text style={styles.statItem}>✅ Taken: {taken}</Text>
          {lateTaken > 0 && <Text style={styles.statItem}>⏱️ Late Taken: {lateTaken}</Text>}
          <Text style={styles.statItem}>❌ Missed: {missed}</Text>
        </View>
      </View>
    );
  };

  const handleSpeak = async () => {
    if (healthReport) {
      try {
        await TTSService.speak(healthReport.report);
      } catch (error) {
        console.error('TTS error:', error);
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
      <LinearGradient colors={['#9C27B0', '#7B1FA2']} style={styles.header}>
        <Text style={styles.headerTitle}>📊 Health Reports</Text>
        <Text style={styles.headerSubtitle}>
          AI-powered insights and recommendations
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Overall Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Medication Adherence Report</Text>
          
          {(() => {
            const breakdown = getAdherenceBreakdown();
            return (
              <>
                <View style={styles.overallStatsCard}>
                  <View style={styles.statRow}>
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                        {breakdown.adherenceRate}%
                      </Text>
                      <Text style={styles.statLabel}>Overall Adherence</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={styles.statValue}>{breakdown.total}</Text>
                      <Text style={styles.statLabel}>Total Scheduled</Text>
                    </View>
                  </View>
                  <View style={styles.statRow}>
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                        {breakdown.taken}
                      </Text>
                      <Text style={styles.statLabel}>Doses Taken</Text>
                    </View>
                    <View style={styles.statBox}>
                      <Text style={[styles.statValue, { color: '#F44336' }]}>
                        {breakdown.missed}
                      </Text>
                      <Text style={styles.statLabel}>Doses Missed</Text>
                    </View>
                  </View>
                </View>

                {/* Detailed Adherence Breakdown */}
                <View style={styles.adherenceDetailCard}>
                  <Text style={styles.adherenceDetailTitle}>📊 Detailed Breakdown</Text>
                  
                  <View style={styles.adherenceDetailRow}>
                    <View style={styles.adherenceDetailItem}>
                      <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                      <View style={styles.adherenceDetailText}>
                        <Text style={styles.adherenceDetailValue}>{breakdown.takenOnTime}</Text>
                        <Text style={styles.adherenceDetailLabel}>Taken On Time</Text>
                        <Text style={styles.adherenceDetailSubtext}>(within 15 min)</Text>
                      </View>
                    </View>
                    
                    <View style={styles.adherenceDetailItem}>
                      <Ionicons name="time" size={24} color="#FF9800" />
                      <View style={styles.adherenceDetailText}>
                        <Text style={styles.adherenceDetailValue}>{breakdown.takenLate}</Text>
                        <Text style={styles.adherenceDetailLabel}>Taken Late</Text>
                        <Text style={styles.adherenceDetailSubtext}>(after 15 min)</Text>
                      </View>
                    </View>
                  </View>

                  {breakdown.lateTaken > 0 && (
                    <View style={styles.adherenceDetailRow}>
                      <View style={styles.adherenceDetailItem}>
                        <Ionicons name="alert-circle" size={24} color="#FF6F00" />
                        <View style={styles.adherenceDetailText}>
                          <Text style={styles.adherenceDetailValue}>{breakdown.lateTaken}</Text>
                          <Text style={styles.adherenceDetailLabel}>Late Taken</Text>
                          <Text style={styles.adherenceDetailSubtext}>(>15 min delayed)</Text>
                        </View>
                      </View>
                      
                      <View style={styles.adherenceDetailItem}>
                        <Ionicons name="close-circle" size={24} color="#F44336" />
                        <View style={styles.adherenceDetailText}>
                          <Text style={styles.adherenceDetailValue}>{breakdown.missed}</Text>
                          <Text style={styles.adherenceDetailLabel}>Missed</Text>
                          <Text style={styles.adherenceDetailSubtext}>(not taken)</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {breakdown.lateTaken === 0 && (
                    <View style={styles.adherenceDetailRow}>
                      <View style={styles.adherenceDetailItem}>
                        <Ionicons name="close-circle" size={24} color="#F44336" />
                        <View style={styles.adherenceDetailText}>
                          <Text style={styles.adherenceDetailValue}>{breakdown.missed}</Text>
                          <Text style={styles.adherenceDetailLabel}>Missed</Text>
                          <Text style={styles.adherenceDetailSubtext}>(not taken)</Text>
                        </View>
                      </View>
                    </View>
                  )}

                  {breakdown.taken > 0 && (
                    <View style={styles.onTimeRateContainer}>
                      <Text style={styles.onTimeRateText}>
                        ⏰ On-Time Rate: {breakdown.onTimeRate}%
                      </Text>
                      <View style={styles.onTimeRateBar}>
                        <View 
                          style={[
                            styles.onTimeRateFill, 
                            { width: `${breakdown.onTimeRate}%` }
                          ]} 
                        />
                      </View>
                    </View>
                  )}

                  {/* Adherence Interpretation */}
                  <View style={styles.adherenceInterpretation}>
                    {breakdown.adherenceRate >= 80 ? (
                      <Text style={styles.adherenceGood}>
                        ✅ Excellent adherence! Keep up the great work.
                      </Text>
                    ) : breakdown.adherenceRate >= 60 ? (
                      <Text style={styles.adherenceFair}>
                        ⚠️ Good progress, but there's room for improvement.
                      </Text>
                    ) : (
                      <Text style={styles.adherencePoor}>
                        ❌ Low adherence detected. Please try to take medications on schedule.
                      </Text>
                    )}
                  </View>
                </View>
              </>
            );
          })()}
        </View>

        {/* Active Medications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💊 Active Medications ({medicines.length})</Text>
          {medicines.length > 0 ? (
            medicines.map((med) => <MedicineCard key={med.id} medicine={med} />)
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="medical-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No medications tracked yet</Text>
              <Text style={styles.emptySubtext}>Add medications to generate insights</Text>
            </View>
          )}
        </View>

        {/* AI Report Generation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 AI Health Analysis</Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateHealthReport}
            disabled={isLoading || medicines.length === 0}
          >
            <LinearGradient
              colors={isLoading || medicines.length === 0 ? ['#ccc', '#999'] : ['#4CAF50', '#388E3C']}
              style={styles.generateGradient}
            >
              {isLoading ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.generateText}>Analyzing with AI...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={24} color="white" />
                  <Text style={styles.generateText}>Generate AI Health Report</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          
          <Text style={styles.generateSubtitle}>
            Get personalized diet, exercise, and health recommendations based on your medications
          </Text>
        </View>

        {/* AI Generated Report */}
        {healthReport && (
          <>
            {/* Main Report Section */}
            <View style={styles.section}>
              <View style={styles.reportHeader}>
                <Ionicons name="document-text" size={24} color="#9C27B0" />
                <Text style={styles.reportHeaderText}>AI Health Analysis</Text>
                {healthReport.aiPowered && (
                  <View style={styles.aiPoweredBadge}>
                    <Ionicons name="sparkles" size={12} color="#FFD700" />
                    <Text style={styles.aiPoweredText}>AI Powered</Text>
                  </View>
                )}
              </View>

              <View style={styles.reportCard}>
                <ScrollView 
                  style={styles.reportContent}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {healthReport.report ? (
                    renderMarkdownReport(healthReport.report).mainReport
                  ) : (
                    <Text style={styles.paragraph}>No report content available</Text>
                  )}
                </ScrollView>
              </View>

              <Text style={styles.reportTimestamp}>
                Generated: {new Date(healthReport.timestamp).toLocaleString()}
              </Text>
            </View>

            {/* Suggestions Section */}
            {renderMarkdownReport(healthReport.report).hasSuggestions && (
              <View style={styles.section}>
                <View style={styles.suggestionsHeader}>
                  <Ionicons name="bulb" size={24} color="#FF9800" />
                  <Text style={styles.suggestionsHeaderText}>
                    💡 Personalized Suggestions
                  </Text>
                </View>

                <View style={styles.suggestionsCard}>
                  <ScrollView 
                    style={styles.suggestionsContent}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                  >
                    {renderMarkdownReport(healthReport.report).suggestions}
                  </ScrollView>
                </View>

                <Text style={styles.suggestionsFooter}>
                  💡 These suggestions are AI-generated based on your medication history
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  // New styles for medication tracking
  overallStatsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#9C27B0',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  medicineCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  medicineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  medicineName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  medicineDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  adherenceBar: {
    marginTop: 12,
  },
  adherenceBarBg: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  adherenceBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  adherenceText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  medicineStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    fontSize: 13,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  aiPoweredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  aiPoweredText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  reportCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    minHeight: 300,
    maxHeight: 600,
  },
  reportContent: {
    flex: 1,
  },
  heading1: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  heading2: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#444',
    marginTop: 12,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 8,
  },
  bold: {
    fontWeight: 'bold',
    color: '#333',
  },
  bulletPoint: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 4,
    marginLeft: 8,
  },
  numberedPoint: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 4,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  reportTimestamp: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // New styles for adherence breakdown
  adherenceDetailCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  adherenceDetailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  adherenceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  adherenceDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  adherenceDetailText: {
    marginLeft: 12,
  },
  adherenceDetailValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  adherenceDetailLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  adherenceDetailSubtext: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  onTimeRateContainer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  onTimeRateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  onTimeRateBar: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  onTimeRateFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 5,
  },
  adherenceInterpretation: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  adherenceGood: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    textAlign: 'center',
  },
  adherenceFair: {
    fontSize: 14,
    color: '#F57C00',
    fontWeight: '600',
    textAlign: 'center',
  },
  adherencePoor: {
    fontSize: 14,
    color: '#C62828',
    fontWeight: '600',
    textAlign: 'center',
  },
  // Suggestions section styles
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionsHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  suggestionsCard: {
    backgroundColor: '#FFFBF0',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    minHeight: 200,
    maxHeight: 400,
  },
  suggestionsContent: {
    flex: 1,
  },
  suggestionsFooter: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default ReportsScreen;
