import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TTSService from '../services/TTSService';

const SettingsScreen = () => {
  const [notifications, setNotifications] = useState(true);
  const [voiceConfirmation, setVoiceConfirmation] = useState(true);
  const [dailyReports, setDailyReports] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [showNameModal, setShowNameModal] = useState(false);
  const [userName, setUserName] = useState('User');
  const [tempUserName, setTempUserName] = useState('');

  const settings = [
    {
      category: 'Notifications',
      items: [
        {
          title: 'Push Notifications',
          subtitle: 'Enable medicine reminders',
          value: notifications,
          onToggle: setNotifications,
          icon: 'notifications',
        },
        {
          title: 'Sound Alerts',
          subtitle: 'Play sound for reminders',
          value: soundEnabled,
          onToggle: setSoundEnabled,
          icon: 'volume-high',
        },
        {
          title: 'Vibration',
          subtitle: 'Vibrate on reminders',
          value: vibrationEnabled,
          onToggle: setVibrationEnabled,
          icon: 'phone-portrait',
        },
      ],
    },
    {
      category: 'Voice Features',
      items: [
        {
          title: 'Voice Confirmation',
          subtitle: 'Confirm medicine intake by voice',
          value: voiceConfirmation,
          onToggle: setVoiceConfirmation,
          icon: 'mic',
        },
      ],
    },
    {
      category: 'Reports',
      items: [
        {
          title: 'Daily Reports',
          subtitle: 'Generate daily adherence reports',
          value: dailyReports,
          onToggle: setDailyReports,
          icon: 'document-text',
        },
      ],
    },
  ];

  const handleSaveUserName = async () => {
    if (tempUserName.trim()) {
      setUserName(tempUserName.trim());
      try {
        await AsyncStorage.setItem('userName', tempUserName.trim());
        Alert.alert('Success', 'Name updated successfully!');
      } catch (error) {
        Alert.alert('Error', 'Failed to save name');
      }
    }
    setShowNameModal(false);
    setTempUserName('');
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'Export your medicine and reminder data to share with healthcare providers.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: () => Alert.alert('Success', 'Data exported successfully!') },
      ]
    );
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your medicines, reminders, and reports. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => Alert.alert('Success', 'All data cleared successfully!'),
        },
      ]
    );
  };

  const handleAbout = () => {
    Alert.alert(
      'About',
      'Voice-Based Medicine Reminder\nVersion 1.0.0\n\nDeveloped for improving medication adherence using AI and voice technology.\n\n© 2025 College Project',
      [{ text: 'OK' }]
    );
  };

  const handleVoiceTest = () => {
    TTSService.speak('This is a test of the text-to-speech engine.');
  };

  const SettingItem = ({ title, subtitle, value, onToggle, icon, onPress }) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      disabled={!onPress && !onToggle}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={24} color="#666" />
      </View>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      {onToggle ? (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: '#ccc', true: '#9C27B0' }}
          thumbColor={value ? '#9C27B0' : '#f4f3f4'}
        />
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      )}
    </TouchableOpacity>
  );

  const ActionButton = ({ title, subtitle, icon, onPress, color = '#666' }) => (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={24} color={color} />
      </View>
      <View style={styles.actionInfo}>
        <Text style={[styles.actionTitle, { color }]}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#ccc" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#9C27B0', '#7B1FA2']} style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSubtitle}>
          Customize your app experience
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>👤 Profile</Text>
          <TouchableOpacity
            style={styles.profileCard}
            onPress={() => {
              setTempUserName(userName);
              setShowNameModal(true);
            }}
          >
            <View style={styles.profileAvatar}>
              <LinearGradient
                colors={['#9C27B0', '#7B1FA2']}
                style={styles.avatarGradient}
              >
                <Text style={styles.avatarText}>
                  {userName.charAt(0).toUpperCase()}
                </Text>
              </LinearGradient>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{userName}</Text>
              <Text style={styles.profileSubtext}>Tap to edit name</Text>
            </View>
            <Ionicons name="pencil" size={20} color="#9C27B0" />
          </TouchableOpacity>
        </View>

        {/* Settings Categories */}
        {settings.map((category, categoryIndex) => (
          <View key={categoryIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {category.category === 'Notifications' && '🔔 '}
              {category.category === 'Voice Features' && '🎤 '}
              {category.category === 'Reports' && '📊 '}
              {category.category}
            </Text>
            <View style={styles.settingsCard}>
              {category.items.map((item, itemIndex) => (
                <SettingItem
                  key={itemIndex}
                  {...item}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ Quick Actions</Text>
          <View style={styles.actionsCard}>
            <ActionButton
              title="Test Notifications"
              subtitle="Check if reminders are working"
              icon="notifications"
              color="#2196F3"
              onPress={() => Alert.alert('Test', 'Notification test sent!')}
            />
            <ActionButton
              title="Voice Test"
              subtitle="Test voice recording functionality"
              icon="mic"
              color="#4CAF50"
              onPress={handleVoiceTest}
            />
            <ActionButton
              title="Backup Data"
              subtitle="Save your data to cloud"
              icon="cloud-upload"
              color="#FF9800"
              onPress={() => Alert.alert('Backup', 'Data backed up successfully!')}
            />
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💾 Data Management</Text>
          <View style={styles.actionsCard}>
            <ActionButton
              title="Export Data"
              subtitle="Share data with healthcare providers"
              icon="download"
              color="#2196F3"
              onPress={handleExportData}
            />
            <ActionButton
              title="Clear All Data"
              subtitle="Remove all medicines and reminders"
              icon="trash"
              color="#FF5252"
              onPress={handleClearData}
            />
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ App Information</Text>
          <View style={styles.actionsCard}>
            <ActionButton
              title="Privacy Policy"
              subtitle="How we protect your data"
              icon="shield-checkmark"
              color="#9C27B0"
              onPress={() => Alert.alert('Privacy', 'Privacy policy would open here')}
            />
            <ActionButton
              title="Terms of Service"
              subtitle="App usage terms and conditions"
              icon="document-text"
              color="#9C27B0"
              onPress={() => Alert.alert('Terms', 'Terms of service would open here')}
            />
            <ActionButton
              title="About"
              subtitle="App version and information"
              icon="information-circle"
              color="#666"
              onPress={handleAbout}
            />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Made with ❤️ for better health
          </Text>
          <Text style={styles.versionText}>Version 1.0.0</Text>
        </View>
      </ScrollView>

      {/* Name Edit Modal */}
      <Modal
        visible={showNameModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowNameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              value={tempUserName}
              onChangeText={setTempUserName}
              placeholder="Enter your name"
              autoFocus={true}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowNameModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={handleSaveUserName}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  profileCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileAvatar: {
    marginRight: 16,
  },
  avatarGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  profileSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  settingsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingIcon: {
    marginRight: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  actionsCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 20,
    marginTop: 20,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  versionText: {
    fontSize: 12,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: '#f8f9fa',
    marginRight: 8,
  },
  modalSaveButton: {
    backgroundColor: '#9C27B0',
    marginLeft: 8,
  },
  modalCancelText: {
    color: '#666',
    fontWeight: '600',
  },
  modalSaveText: {
    color: 'white',
    fontWeight: '600',
  },
});

export default SettingsScreen;
