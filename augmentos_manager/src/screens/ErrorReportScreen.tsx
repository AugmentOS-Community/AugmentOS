import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  GestureResponderEvent
} from 'react-native';
import LogService from '../logic/LogService';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import Button from '../components/Button';

interface ErrorReportingScreenProps {
  navigation: any;
}

const ErrorReportingScreen: React.FC<ErrorReportingScreenProps> = ({ navigation }) => {
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { status } = useStatus();

  const sendErrorReport = async () => {
    if (description.trim().length === 0) {
      Alert.alert('Error', 'Please enter a description of the issue');
      return;
    }

    setIsSending(true);

    try {
      // Get the log service instance
      const logService = LogService.getInstance();

      // Use the token from state or pass a placeholder if not available
      const coreToken = status.core_info.core_token || 'placeholder-token';

      // Send the error report
      await logService.sendErrorReport(description, coreToken);

      Alert.alert(
        'Success',
        'Error report submitted successfully. Thank you for helping improve the app!',
        [{
          text: 'OK',
          onPress: () => {
            setDescription('');
            navigation.goBack(); // Return to previous screen after successful report
          }
        }]
      );
    } catch (error) {
      console.error("Error sending report:", error);
      Alert.alert(
        'Error',
        'Could not send error report. Please try again later.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContent}>
        <Text style={styles.title}>Report an Error</Text>

        <Text style={styles.label}>Describe the issue you encountered:</Text>
        <TextInput
          style={styles.input}
          multiline
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
          placeholder="What happened? What were you trying to do when the error occurred?"
          placeholderTextColor="#999"
        />

        <Text style={styles.note}>
          This will send your description along with recent app logs to our support team.
          No personal information is collected other than what you provide above.
        </Text>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <Button onPress={sendErrorReport} disabled={isSending}>
           {isSending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send Report</Text>
            )}
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'space-between',
  },
  scrollContent: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontFamily: 'Montserrat-Bold',
    fontSize: 26,
    marginBottom: 24,
    color: '#333',
    textAlign: 'center',
  },
  label: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 18,
    marginBottom: 12,
    color: '#444',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    minHeight: 160,
    textAlignVertical: 'top',
    marginBottom: 20,
    color: '#333',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  note: {
    fontFamily: 'Montserrat-Regular',
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  buttonContainer: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonText: {
    fontFamily: 'Montserrat-Bold',
    color: '#fff',
    fontSize: 18,
  },
});

export default ErrorReportingScreen;