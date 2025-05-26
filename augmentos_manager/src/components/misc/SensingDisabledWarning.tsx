// SensingDisabledWarning.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from './types';
import { router } from 'expo-router';

interface SensingDisabledWarningProps {
    isSensingEnabled: boolean;
}

const SensingDisabledWarning: React.FC<SensingDisabledWarningProps> = ({ isSensingEnabled }) => {
    const navigation = useNavigation<NavigationProps>();

    if (isSensingEnabled) {
        return null;
    }

    return (
        <View style={[
            styles.sensingWarningContainer, 
            { backgroundColor: '#FFF3E0', borderColor: '#FFB74D' }
        ]}>
            <View style={styles.warningContent}>
                <Icon name="microphone-off" size={22} color="#FF9800" />
                <Text style={styles.warningText}>
                    Sensing is disabled. Microphone and sensors won't work in apps.
                </Text>
            </View>
            <TouchableOpacity 
                style={styles.settingsButton}
                onPress={() => {
                    router.push('/settings/privacy');
                }}
            >
                <Text style={styles.settingsButtonTextBlue}>Settings</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    sensingWarningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 12, // Match ConnectedDeviceInfo
        borderWidth: 1, // Restore border for the warning
        marginBottom: 0,
        marginHorizontal: 0,
        marginTop: 16, // Added spacing above the warning
        width: '100%',
    },
    warningContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    warningText: {
        marginLeft: 10,
        fontSize: 14,
        fontWeight: '500',
        color: '#E65100',
        flex: 1,
    },
    settingsButton: {
        padding: 5,
    },
    settingsButtonTextBlue: {
        color: '#007AFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default SensingDisabledWarning;