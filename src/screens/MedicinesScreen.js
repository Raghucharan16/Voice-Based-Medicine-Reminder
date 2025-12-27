import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DataService from '../services/DataService';
import NotificationService from '../services/NotificationService';

const MedicinesScreen = () => {
  const [medicines, setMedicines] = useState([]);
  
  useEffect(() => {
    loadMedicines();
    
    // Reload when screen comes into focus
    const interval = setInterval(loadMedicines, 2000); // Sync every 2 seconds
    return () => clearInterval(interval);
  }, []);
  
  const loadMedicines = async () => {
    try {
      const reminders = await DataService.getReminders();
      
      // Convert reminders to medicines format and remove duplicates
      const uniqueMedicines = [];
      const seenNames = new Set();
      
      reminders.forEach(reminder => {
        const key = `${reminder.medicine.toLowerCase()}-${reminder.time}`;
        if (!seenNames.has(key)) {
          seenNames.add(key);
          uniqueMedicines.push({
            id: reminder.id,
            name: reminder.medicine,
            dosage: reminder.dosage || 'As prescribed',
            frequency: reminder.frequency || 'daily',
            time: reminder.time,
            status: reminder.status || 'active',
            notes: reminder.notes || ''
          });
        }
      });
      
      setMedicines(uniqueMedicines);
    } catch (error) {
      console.error('Error loading medicines:', error);
    }
  };
  
  const [modalVisible, setModalVisible] = useState(false);
  const [newMedicine, setNewMedicine] = useState({
    name: '',
    dosage: '',
    frequency: '',
    time: '',
    notes: ''
  });

  const addMedicine = async () => {
    if (!newMedicine.name || !newMedicine.dosage) {
      Alert.alert('Error', 'Please fill in at least medicine name and dosage');
      return;
    }

    try {
      const reminder = {
        medicine: newMedicine.name,
        dosage: newMedicine.dosage,
        frequency: newMedicine.frequency || 'daily',
        time: newMedicine.time || '09:00 AM',
        notes: newMedicine.notes || '',
        status: 'active',
        createdAt: new Date().toISOString()
      };

      const savedReminder = await DataService.saveReminder(reminder);
      await NotificationService.scheduleMedicationReminder(savedReminder);
      
      setNewMedicine({ name: '', dosage: '', frequency: '', time: '', notes: '' });
      setModalVisible(false);
      await loadMedicines(); // Refresh list
      Alert.alert('Success', 'Medicine added successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to add medicine: ' + error.message);
    }
  };

  const toggleMedicineStatus = async (id) => {
    try {
      const medicine = medicines.find(m => m.id === id);
      const newStatus = medicine.status === 'active' ? 'paused' : 'active';
      
      await DataService.updateReminder(id, { status: newStatus });
      
      if (newStatus === 'active') {
        const reminder = await DataService.getReminders();
        const updated = reminder.find(r => r.id === id);
        await NotificationService.scheduleMedicationReminder(updated);
      }
      
      await loadMedicines();
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle status: ' + error.message);
    }
  };

  const deleteMedicine = (id) => {
    Alert.alert(
      'Delete Medicine',
      'Are you sure you want to remove this medicine?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await DataService.deleteReminder(id);
              await loadMedicines();
              Alert.alert('Success', 'Medicine deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete: ' + error.message);
            }
          }
        }
      ]
    );
  };

  const MedicineCard = ({ medicine }) => (
    <View style={styles.medicineCard}>
      <View style={styles.cardHeader}>
        <View style={styles.medicineInfo}>
          <Text style={styles.medicineName}>{medicine.name}</Text>
          <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
        </View>
        <View style={[
          styles.statusBadge, 
          medicine.status === 'active' ? styles.activeBadge : styles.pausedBadge
        ]}>
          <Text style={[
            styles.statusText,
            medicine.status === 'active' ? styles.activeText : styles.pausedText
          ]}>
            {medicine.status === 'active' ? 'Active' : 'Paused'}
          </Text>
        </View>
      </View>

      <View style={styles.medicineDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color="#666" />
          <Text style={styles.detailText}>{medicine.frequency} at {medicine.time}</Text>
        </View>
        {medicine.notes ? (
          <View style={styles.detailRow}>
            <Ionicons name="document-text-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{medicine.notes}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => toggleMedicineStatus(medicine.id)}
        >
          <Ionicons 
            name={medicine.status === 'active' ? 'pause' : 'play'} 
            size={16} 
            color="#2196F3" 
          />
          <Text style={styles.actionText}>
            {medicine.status === 'active' ? 'Pause' : 'Resume'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => deleteMedicine(medicine.id)}
        >
          <Ionicons name="trash-outline" size={16} color="#FF5252" />
          <Text style={[styles.actionText, { color: '#FF5252' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#4CAF50', '#45A049']} style={styles.header}>
        <Text style={styles.headerTitle}>My Medicines</Text>
        <Text style={styles.headerSubtitle}>
          {medicines.filter(m => m.status === 'active').length} active medicines
        </Text>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {medicines.map((medicine) => (
          <MedicineCard key={medicine.id} medicine={medicine} />
        ))}

        {medicines.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="medical-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No medicines added yet</Text>
            <Text style={styles.emptySubtext}>Tap the + button to add your first medicine</Text>
          </View>
        )}
      </ScrollView>

      {/* Add Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={24} color="white" />
      </TouchableOpacity>

      {/* Add Medicine Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Medicine</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Medicine Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newMedicine.name}
                  onChangeText={(text) => setNewMedicine({...newMedicine, name: text})}
                  placeholder="e.g. Aspirin"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Dosage *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newMedicine.dosage}
                  onChangeText={(text) => setNewMedicine({...newMedicine, dosage: text})}
                  placeholder="e.g. 100mg"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Frequency</Text>
                <TextInput
                  style={styles.textInput}
                  value={newMedicine.frequency}
                  onChangeText={(text) => setNewMedicine({...newMedicine, frequency: text})}
                  placeholder="e.g. Twice daily"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Time</Text>
                <TextInput
                  style={styles.textInput}
                  value={newMedicine.time}
                  onChangeText={(text) => setNewMedicine({...newMedicine, time: text})}
                  placeholder="e.g. 09:00 AM"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={newMedicine.notes}
                  onChangeText={(text) => setNewMedicine({...newMedicine, notes: text})}
                  placeholder="Additional instructions..."
                  multiline
                  numberOfLines={3}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.addMedicineButton]}
                onPress={addMedicine}
              >
                <Text style={styles.addButtonText}>Add Medicine</Text>
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
  medicineCard: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  medicineDosage: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadge: {
    backgroundColor: '#E8F5E8',
  },
  pausedBadge: {
    backgroundColor: '#FFE8E8',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeText: {
    color: '#4CAF50',
  },
  pausedText: {
    color: '#FF5252',
  },
  medicineDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    flex: 1,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 12,
  },
  actionText: {
    fontSize: 14,
    color: '#2196F3',
    marginLeft: 4,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  modalForm: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  addMedicineButton: {
    backgroundColor: '#4CAF50',
    marginLeft: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});

export default MedicinesScreen;
