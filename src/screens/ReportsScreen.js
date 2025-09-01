import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AIService from '../services/AIService';

const ReportsScreen = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastReport, setLastReport] = useState('');

  // Sample adherence data
  const adherenceData = [
    { date: '2025-09-01', medicine: 'Aspirin', taken: true, time: '09:15 AM' },
    { date: '2025-09-01', medicine: 'Vitamin D', taken: true, time: '08:05 AM' },
    { date: '2025-09-01', medicine: 'Metformin', taken: false, time: '07:00 AM' },
    { date: '2025-08-31', medicine: 'Aspirin', taken: true, time: '09:10 AM' },
    { date: '2025-08-31', medicine: 'Vitamin D', taken: true, time: '08:00 AM' },
    { date: '2025-08-31', medicine: 'Metformin', taken: true, time: '07:05 AM' },
    { date: '2025-08-30', medicine: 'Aspirin', taken: true, time: '09:20 AM' },
    { date: '2025-08-30', medicine: 'Vitamin D', taken: false, time: '08:00 AM' },
    { date: '2025-08-30', medicine: 'Metformin', taken: true, time: '07:00 AM' },
  ];

  const generateReport = async () => {
    try {
      setIsGenerating(true);
      const report = await AIService.generateReport(adherenceData);
      setLastReport(report);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate report: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const calculateStats = () => {
    const total = adherenceData.length;
    const taken = adherenceData.filter(item => item.taken).length;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;
    
    const medicineStats = {};
    adherenceData.forEach(item => {
      if (!medicineStats[item.medicine]) {
        medicineStats[item.medicine] = { total: 0, taken: 0 };
      }
      medicineStats[item.medicine].total++;
      if (item.taken) medicineStats[item.medicine].taken++;
    });

    return { total, taken, adherenceRate, medicineStats };
  };

  const stats = calculateStats();

  const StatCard = ({ title, value, subtitle, icon, color }) => (
    <View style={styles.statCard}>
      <LinearGradient colors={[color, color + '80']} style={styles.statGradient}>
        <Ionicons name={icon} size={24} color="white" />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
        {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
      </LinearGradient>
    </View>
  );

  const MedicineStatCard = ({ medicine, stats }) => {
    const rate = stats.total > 0 ? Math.round((stats.taken / stats.total) * 100) : 0;
    return (
      <View style={styles.medicineStatCard}>
        <View style={styles.medicineHeader}>
          <Text style={styles.medicineName}>{medicine}</Text>
          <Text style={[
            styles.adherenceRate,
            { color: rate >= 80 ? '#4CAF50' : rate >= 60 ? '#FF9800' : '#FF5252' }
          ]}>
            {rate}%
          </Text>
        </View>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${rate}%`,
                backgroundColor: rate >= 80 ? '#4CAF50' : rate >= 60 ? '#FF9800' : '#FF5252'
              }
            ]} 
          />
        </View>
        <Text style={styles.medicineSubtext}>
          {stats.taken} of {stats.total} doses taken
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#9C27B0', '#7B1FA2']} style={styles.header}>
        <Text style={styles.headerTitle}>Health Reports</Text>
        <Text style={styles.headerSubtitle}>
          AI-powered insights and analytics
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Overall Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Overview (Last 7 Days)</Text>
          <View style={styles.statsGrid}>
            <StatCard
              title="Total Doses"
              value={stats.total}
              icon="medical"
              color="#2196F3"
            />
            <StatCard
              title="Taken"
              value={stats.taken}
              icon="checkmark-circle"
              color="#4CAF50"
            />
            <StatCard
              title="Adherence"
              value={`${stats.adherenceRate}%`}
              subtitle={stats.adherenceRate >= 80 ? 'Excellent' : stats.adherenceRate >= 60 ? 'Good' : 'Needs Improvement'}
              icon="analytics"
              color={stats.adherenceRate >= 80 ? '#4CAF50' : stats.adherenceRate >= 60 ? '#FF9800' : '#FF5252'}
            />
          </View>
        </View>

        {/* Medicine-wise Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💊 Medicine-wise Adherence</Text>
          {Object.entries(stats.medicineStats).map(([medicine, medicineStats]) => (
            <MedicineStatCard 
              key={medicine} 
              medicine={medicine} 
              stats={medicineStats} 
            />
          ))}
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🕐 Recent Activity</Text>
          <View style={styles.activityCard}>
            {adherenceData.slice(0, 5).map((item, index) => (
              <View key={index} style={styles.activityItem}>
                <View style={styles.activityIcon}>
                  <Ionicons 
                    name={item.taken ? "checkmark-circle" : "close-circle"} 
                    size={20} 
                    color={item.taken ? "#4CAF50" : "#FF5252"} 
                  />
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityMedicine}>{item.medicine}</Text>
                  <Text style={styles.activityTime}>
                    {item.date} at {item.time}
                  </Text>
                </View>
                <Text style={[
                  styles.activityStatus,
                  { color: item.taken ? '#4CAF50' : '#FF5252' }
                ]}>
                  {item.taken ? 'Taken' : 'Missed'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Report Generation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🤖 AI Insights</Text>
          <TouchableOpacity
            style={styles.generateButton}
            onPress={generateReport}
            disabled={isGenerating}
          >
            <LinearGradient
              colors={isGenerating ? ['#ccc', '#aaa'] : ['#9C27B0', '#7B1FA2']}
              style={styles.generateButtonGradient}
            >
              {isGenerating ? (
                <>
                  <ActivityIndicator size="small" color="white" />
                  <Text style={styles.generateButtonText}>Generating...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="white" />
                  <Text style={styles.generateButtonText}>Generate AI Report</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {lastReport ? (
            <View style={styles.reportCard}>
              <View style={styles.reportHeader}>
                <Ionicons name="document-text" size={20} color="#9C27B0" />
                <Text style={styles.reportTitle}>AI Analysis</Text>
              </View>
              <Text style={styles.reportText}>{lastReport}</Text>
            </View>
          ) : null}
        </View>

        {/* Health Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💡 Health Tips</Text>
          <View style={styles.tipsCard}>
            <View style={styles.tipItem}>
              <Ionicons name="bulb" size={16} color="#FF9800" />
              <Text style={styles.tipText}>
                Set consistent reminder times to build a routine
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="bulb" size={16} color="#FF9800" />
              <Text style={styles.tipText}>
                Use voice logging to track doses easily
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="bulb" size={16} color="#FF9800" />
              <Text style={styles.tipText}>
                Review reports weekly to identify patterns
              </Text>
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
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  statGradient: {
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  statSubtitle: {
    color: 'white',
    fontSize: 10,
    opacity: 0.9,
    marginTop: 2,
  },
  medicineStatCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  medicineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  adherenceRate: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  medicineSubtext: {
    fontSize: 12,
    color: '#666',
  },
  activityCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityIcon: {
    marginRight: 12,
  },
  activityInfo: {
    flex: 1,
  },
  activityMedicine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  activityTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  activityStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  generateButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  generateButtonGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  generateButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  reportCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginLeft: 8,
  },
  reportText: {
    fontSize: 14,
    color: '#34495e',
    lineHeight: 20,
  },
  tipsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
    lineHeight: 18,
  },
});

export default ReportsScreen;
