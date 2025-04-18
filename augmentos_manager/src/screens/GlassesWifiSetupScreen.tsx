import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Button from '../components/Button';
import coreCommunicator from '../bridge/CoreCommunicator.ios';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';

type GlassesWifiSetupScreenProps = {
  isDarkTheme: boolean;
  toggleTheme: () => void;
};

const GlassesWifiSetupScreen: React.FC<GlassesWifiSetupScreenProps> = ({ isDarkTheme }) => {
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const route = useRoute();
  const { deviceModel } = route.params as { deviceModel: string };

  const handleSubmit = async () => {
    if (!ssid) {
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'WiFi network name (SSID) is required', 
        type: 'error' 
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Send WiFi credentials to Core
      await coreCommunicator.setGlassesWifiCredentials(ssid, password);
      
      // Show success message
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'WiFi credentials sent to glasses', 
        type: 'success' 
      });
      
      // Navigate back to home screen
      navigation.navigate('Home');
    } catch (error) {
      console.error('Error setting WiFi credentials:', error);
      GlobalEventEmitter.emit('SHOW_BANNER', { 
        message: 'Failed to send WiFi credentials', 
        type: 'error' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    GlobalEventEmitter.emit('SHOW_BANNER', { 
      message: 'WiFi setup skipped. You can set up WiFi later in settings.', 
      type: 'info' 
    });
    navigation.navigate('Home');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: isDarkTheme ? '#000' : '#fff' }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: isDarkTheme ? '#fff' : '#000' }]}>
          WiFi Setup Required
        </Text>
        
        <Text style={[styles.subtitle, { color: isDarkTheme ? '#ccc' : '#333' }]}>
          Your {deviceModel} glasses need WiFi credentials to connect to the internet.
        </Text>
        
        <View style={styles.form}>
          <Text style={[styles.label, { color: isDarkTheme ? '#fff' : '#000' }]}>WiFi Network Name (SSID)</Text>
          <TextInput
            style={[styles.input, { 
              color: isDarkTheme ? '#fff' : '#000',
              backgroundColor: isDarkTheme ? '#333' : '#f5f5f5',
              borderColor: isDarkTheme ? '#444' : '#ddd'
            }]}
            value={ssid}
            onChangeText={setSsid}
            placeholder="Enter WiFi network name"
            placeholderTextColor={isDarkTheme ? '#aaa' : '#999'}
            autoCapitalize="none"
          />
          
          <Text style={[styles.label, { color: isDarkTheme ? '#fff' : '#000' }]}>Password</Text>
          <TextInput
            style={[styles.input, { 
              color: isDarkTheme ? '#fff' : '#000',
              backgroundColor: isDarkTheme ? '#333' : '#f5f5f5',
              borderColor: isDarkTheme ? '#444' : '#ddd'
            }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter WiFi password"
            placeholderTextColor={isDarkTheme ? '#aaa' : '#999'}
            secureTextEntry
            autoCapitalize="none"
          />
          
          <View style={styles.buttonContainer}>
            {isLoading ? (
              <ActivityIndicator size="large" color={isDarkTheme ? '#fff' : '#000'} />
            ) : (
              <>
                <Button
                  title="Connect"
                  onPress={handleSubmit}
                  disabled={!ssid}
                />
                
                <Button
                  title="Skip for Now"
                  onPress={handleSkip}
                  type="secondary"
                  style={{ marginTop: 10 }}
                />
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    flexGrow: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: '500',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    padding: 10,
    fontSize: 16,
  },
  buttonContainer: {
    marginTop: 10,
  },
});

export default GlassesWifiSetupScreen;