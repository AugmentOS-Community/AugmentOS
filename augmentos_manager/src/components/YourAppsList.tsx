// YourAppsList.tsx
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from 'react-native';
import showAlert from '../utils/AlertUtils';
import MessageModal from './MessageModal';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import BackendServerComms from '../backend_comms/BackendServerComms';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AppIcon from './AppIcon';
import { NavigationProps } from './types';

interface YourAppsListProps {
    isDarkTheme: boolean;
}

const YourAppsList: React.FC<YourAppsListProps> = ({ isDarkTheme }) => {
    const { status, updateAppStatus, startAppOperation, endAppOperation, isAppOperationPending } = useStatus();
    const [_isLoading, setIsLoading] = React.useState(false);
    const [onboardingModalVisible, setOnboardingModalVisible] = useState(false);
    const [onboardingCompleted, setOnboardingCompleted] = useState(true);
    const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
    const navigation = useNavigation<NavigationProps>();

    // Check onboarding status whenever the screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            const checkOnboardingStatus = async () => {
                const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
                setOnboardingCompleted(completed);
                
                if (!completed) {
                    setOnboardingModalVisible(true);
                }
            };
            
            checkOnboardingStatus();
        }, [])
    );

    const startApp = async (packageName: string) => {
        if (!onboardingCompleted) {
            if (packageName !== 'com.augmentos.livecaptions') {
                showAlert(
                    "Complete Onboarding",
                    "Please tap the Live Captions app to complete the onboarding process.",
                    [{ text: "OK" }],
                    { 
                        isDarkTheme,
                        iconName: "information-outline"
                    }
                );
                return;
            } else {
                completeOnboarding();
            }
        }
        
        if (isAppOperationPending(packageName)) {
            console.log(`Cannot start app ${packageName}: operation already in progress`);
            return;
        }
        
        if (!startAppOperation(packageName, 'start')) {
            console.log(`Cannot start app ${packageName}: operation rejected`);
            return;
        }
        
        // Update UI immediately
        updateAppStatus(packageName, true, true);
        
        // Start the operation in the background
        setIsLoading(true);
        try {
            await BackendServerComms.getInstance().startApp(packageName);
            
            if (!onboardingCompleted && packageName === 'com.augmentos.livecaptions') {
                setTimeout(() => {
                    showAlert(
                        "Try Live Captions!",
                        "Start talking now to see your speech transcribed on your glasses in real-time!",
                        [{ text: "OK" }],
                        { 
                            isDarkTheme,
                            iconName: "microphone" 
                        }
                    );
                }, 500);
            }
        } catch (error) {
            // Only revert the status if the operation failed
            updateAppStatus(packageName, false, false);
            console.error('start app error:', error);
        } finally {
            setIsLoading(false);
            endAppOperation(packageName);
        }
    };

    const openAppSettings = (app: any) => {
        navigation.navigate('AppSettings', {
            packageName: app.packageName,
            appName: app.name
        });
    };

    const completeOnboarding = () => {
        saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
        setOnboardingCompleted(true);
    };

    // Filter out duplicate apps and running apps
    const availableApps = status.apps.filter(app => {
        if (app.is_running) {
            return false;
        }
        // Check if this is the first occurrence of this package name
        const firstIndex = status.apps.findIndex(a => a.packageName === app.packageName);
        return firstIndex === status.apps.indexOf(app);
    });

    return (
        <View style={styles.appsContainer}>
            <View style={styles.titleContainer}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                    Inactive Apps ({availableApps.length})
                </Text>
            </View>
            
            <ScrollView 
                style={styles.listContainer}
                showsVerticalScrollIndicator={false}
            >
                {availableApps.map((app, index) => (
                    <TouchableOpacity
                        key={app.packageName}
                        onPress={() => startApp(app.packageName)}
                        onLongPress={() => openAppSettings(app)}
                        delayLongPress={500}
                        style={styles.appItem}
                        disabled={isAppOperationPending(app.packageName)}
                    >
                        <View style={styles.appContent}>
                            <AppIcon
                                app={app}
                                isDarkTheme={isDarkTheme}
                                onClick={() => startApp(app.packageName)}
                                style={styles.appIconStyle}
                            />
                            <View style={styles.appTextContainer}>
                                <Text style={[styles.appName, {color: textColor}]}>
                                    {app.name || 'Convoscope'}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                onPress={() => openAppSettings(app)}
                                style={styles.settingsButton}
                                disabled={isAppOperationPending(app.packageName)}
                            >
                                <Icon name="cog-outline" size={24} color={textColor} />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <MessageModal
                visible={onboardingModalVisible && availableApps.length > 0}
                title="Start Live Captions"
                message="To continue, start the Live Captions app."
                buttons={[
                    { text: "Okay", onPress: () => setOnboardingModalVisible(false) }
                ]}
                isDarkTheme={isDarkTheme}
                iconName="gesture-tap"
                iconSize={40}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    appsContainer: {
        marginTop: -8,
        marginBottom: 0,
        width: '100%',
        paddingHorizontal: 0,
        paddingVertical: 10,
    },
    titleContainer: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginLeft: 0,
        paddingLeft: 0,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        fontFamily: 'Montserrat-Bold',
        lineHeight: 22,
        letterSpacing: 0.38,
        marginBottom: 10,
    },
    listContainer: {
        gap: 4,
    },
    appItem: {
        backgroundColor: '#E8E8E8',
        borderRadius: 12,
        padding: 10,
        marginBottom: 9,
    },
    appContent: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 44,
    },
    appTextContainer: {
        flex: 1,
        marginLeft: 8,
    },
    appName: {
        fontSize: 16,
        fontWeight: '500',
    },
    settingsButton: {
        padding: 4,
    },
    appIconStyle: {
        width: 48,
        height: 48,
    },
});

export default YourAppsList;
