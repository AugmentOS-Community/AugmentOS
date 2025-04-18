// YourAppsList.tsx
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    Animated,
    Easing,
    Modal,
} from 'react-native';
import showAlert from '../utils/AlertUtils';
import MessageModal from './MessageModal';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import AppIcon from './AppIcon';
import coreCommunicator from '../bridge/CoreCommunicator';
import BackendServerComms from '../backend_comms/BackendServerComms';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';

interface YourAppsListProps {
    isDarkTheme: boolean;
    navigation: any;
}

const YourAppsList: React.FC<YourAppsListProps> = ({ isDarkTheme, navigation }) => {
    const { status } = useStatus();
    const [_isLoading, setIsLoading] = React.useState(false);
    const [showOnboardingTip, setShowOnboardingTip] = useState(false);
    const [onboardingModalVisible, setOnboardingModalVisible] = useState(false);
    const [onboardingCompleted, setOnboardingCompleted] = useState(true);
    const [inLiveCaptionsPhase, setInLiveCaptionsPhase] = useState(false);
    const [showSettingsHint, setShowSettingsHint] = useState(false);

    const [containerWidth, setContainerWidth] = React.useState(0);
    const arrowAnimation = React.useRef(new Animated.Value(0)).current;

    // Constants for grid item sizing
    const GRID_MARGIN = 6; // Total horizontal margin per item (left + right)
    const numColumns = 4; // Desired number of columns

    // Calculate the item width based on container width and margins
    const itemWidth = containerWidth > 0 ? (containerWidth - (GRID_MARGIN * numColumns)) / numColumns : 0;

    // Check onboarding status whenever the screen comes into focus
    useFocusEffect(
        React.useCallback(() => {
            const checkOnboardingStatus = async () => {
                const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
                setOnboardingCompleted(completed);

                if (!completed) {
                    // Always show the tip to tap Live Captions
                    setShowOnboardingTip(true);
                    setOnboardingModalVisible(true);
                    setShowSettingsHint(false); // Hide settings hint during onboarding
                } else {
                    setShowOnboardingTip(false);

                    // If onboarding is completed, check how many times settings have been accessed
                    const settingsAccessCount = await loadSetting(SETTINGS_KEYS.SETTINGS_ACCESS_COUNT, 0);
                    // Only show hint if they've accessed settings less than 1 times
                    setShowSettingsHint(settingsAccessCount < 1);
                }
            };

            checkOnboardingStatus();
        }, [])
    );

    // Set arrow to static position (no animation)
    useEffect(() => {
        // Just set to a fixed value instead of animating
        if (showOnboardingTip) {
            arrowAnimation.setValue(0.5); // Middle value for static appearance
        } else {
            arrowAnimation.setValue(0);
        }
    }, [showOnboardingTip]);

    // Check if onboarding is completed on initial load
    useEffect(() => {
        const checkOnboardingStatus = async () => {
            const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
            setOnboardingCompleted(completed);
            setShowOnboardingTip(!completed);
        };

        checkOnboardingStatus();
    }, []);

    // Mark onboarding as completed and ensure all UI elements are updated
    const completeOnboarding = () => {
        saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
        setOnboardingCompleted(true);
        setShowOnboardingTip(false);
        setInLiveCaptionsPhase(false); // Reset any live captions phase state

        // Make sure to post an update to ensure all components re-render
        // This is important to immediately hide any UI elements that depend on these states
        setTimeout(() => {
            // Force a re-render by setting state again
            setShowOnboardingTip(false);
            setShowSettingsHint(true);
        }, 100);
    };

    const startApp = async (packageName: string) => {
        console.log("STARTAPP: ECHECK ONBOARDING??")
        // If onboarding is not completed, only allow starting Live Captions
        if (!onboardingCompleted) {
            console.log("STARTAPP: ONBOARDING NOT COMPLETED")
            if (packageName !== 'com.augmentos.livecaptions' && packageName !== "cloud.augmentos.live-captions") {
                console.log("STARTAPP: ONBOARDING NOT COMPLETED: PKGNAME NOT CAPTIONS IT IS INSTEAD: " + packageName)
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
                console.log("STARTAPP: ONBOARDING NOT COMPLETED: PKGNAME === cAPTIONS!!!")
                // Mark onboarding as completed and immediately hide the onboarding tip
                // when they start Live Captions
                completeOnboarding();
                setShowOnboardingTip(false); // Immediately hide the tip
            }
        }

        setIsLoading(true);
        try {
            BackendServerComms.getInstance().startApp(packageName);

            // Display a special message for Live Captions when starting the app
            if (!onboardingCompleted && packageName === 'com.augmentos.livecaptions') {
                console.log("STARTAPP: ONBOARDING NOT COMPLETED: PKGNAME === cAPTIONS!!!")
                // If this is the Live Captions app, make sure we've hidden the tip
                setShowOnboardingTip(false);

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
            console.error('start app error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
    // const backgroundColor = isDarkTheme ? '#1E1E1E' : '#F5F5F5';

    // Optional: Filter out duplicate apps
    const uniqueApps = React.useMemo(() => {
        const seen = new Set();
        return status.apps.filter(app => {
            if (seen.has(app.packageName)) {
                return false;
            }
            seen.add(app.packageName);
            return true;
        });
    }, [status.apps]);

    const [isSensingEnabled, setIsSensingEnabled] = React.useState(
        status.core_info.sensing_enabled,
    );
    useEffect(() => {
        setIsSensingEnabled(status.core_info.sensing_enabled);
    }, [status.core_info.sensing_enabled]);



    // Remove all animations - we're keeping animation reference for compatibility

    return (
        <View
            style={[styles.appsContainer]}
            onLayout={(event) => {
                const { width } = event.nativeEvent.layout;
                setContainerWidth(width);
            }}
        >
            <View style={styles.titleContainer}>
                <Text
                    style={[
                        styles.sectionTitle,
                        { color: textColor },
                        styles.adjustableText,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                >
                    Your Apps
                </Text>
            </View>

            {/* Sensing Disabled Warning */}
            {!isSensingEnabled && (
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
                            // Navigate to the Settings page
                            navigation.navigate('PrivacySettingsScreen');
                        }}
                    >
                        <Text style={styles.settingsButtonText}>Settings</Text>
                    </TouchableOpacity>
                </View>
            )}


            {/* Settings hint - only shown after onboarding and if settings accessed count < 3 */}
            {showSettingsHint && (
                <View
                    style={[
                        styles.settingsHintContainer,
                        {
                            backgroundColor: isDarkTheme ? '#1A2733' : '#E3F2FD',
                            borderColor: isDarkTheme ? '#1E88E5' : '#BBDEFB'
                        }
                    ]}
                >
                    <View style={styles.hintContent}>
                        <Icon name="gesture-tap-hold" size={22} color="#2196F3" />
                        <Text style={[
                            styles.hintText,
                            { color: isDarkTheme ? '#FFFFFF' : '#0D47A1' }
                        ]}>
                            Long-press any app to access its settings
                        </Text>
                    </View>
                </View>
            )}

            <View style={styles.gridContainer}>
                {uniqueApps.map((app, index) => (
                    <View
                        key={app.packageName}
                        style={[
                            styles.itemContainer,
                            {
                                width: itemWidth,
                                margin: GRID_MARGIN / 2,
                            },
                        ]}
                    >
                        {showOnboardingTip && app.packageName === 'com.augmentos.livecaptions' && (
                            <View style={styles.arrowContainer}>
                                <View style={styles.arrowWrapper}>
                                    <View style={styles.arrowBubble}>
                                        <Text style={styles.arrowBubbleText}>
                                            Tap to start
                                        </Text>
                                        <Icon
                                            name="gesture-tap"
                                            size={20}
                                            color="#FFFFFF"
                                            style={styles.bubbleIcon}
                                        />
                                    </View>
                                    <View style={[
                                        styles.arrowIconContainer,
                                        isDarkTheme ? styles.arrowIconContainerDark : styles.arrowIconContainerLight
                                    ]}>
                                        <View style={styles.glowEffect} />
                                        <Icon
                                            name="arrow-down-bold"
                                            size={30}
                                            color="#FFFFFF"
                                            style={{
                                                textShadowColor: 'rgba(0, 0, 0, 0.3)',
                                                textShadowOffset: { width: 0, height: 1 },
                                                textShadowRadius: 3,
                                            }}
                                        />
                                    </View>
                                </View>
                            </View>
                        )}
                        <AppIcon
                            app={app}
                            isDarkTheme={isDarkTheme}
                            onClick={() => startApp(app.packageName)}
                        // size={itemWidth * 0.8} // Adjust size relative to itemWidth
                        />
                    </View>
                ))}
            </View>

            {/* Modal overlay to prevent interaction until onboarding is completed */}
            <MessageModal
                visible={onboardingModalVisible && uniqueApps.length > 0}
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
        marginTop: -10,
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
    adjustableText: {
        minHeight: 0,
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
    },
    itemContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 15,
    },
    tipText: {
        marginLeft: 5,
        fontSize: 14,
        fontWeight: '600',
    },
    onboardingTip: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 10,
        marginBottom: 15,
    },
    onboardingTipLight: {
        backgroundColor: '#E3F2FD',
        borderColor: '#BBDEFB',
        borderWidth: 1,
    },
    onboardingTipDark: {
        backgroundColor: '#1A2733',
        borderColor: '#1E88E5',
        borderWidth: 1,
    },
    onboardingTipText: {
        flex: 1,
        marginLeft: 10,
        fontSize: 14,
        lineHeight: 20,
    },
    onboardingTipTextLight: {
        color: '#0D47A1',
    },
    onboardingTipTextDark: {
        color: '#FFFFFF',
    },
    gotItButton: {
        backgroundColor: '#2196F3',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
        marginLeft: 10,
    },
    gotItButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    settingsHintContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 12,
    },
    hintContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    hintText: {
        marginLeft: 10,
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    arrowContainer: {
        position: 'absolute',
        top: -90,
        zIndex: 10,
        alignItems: 'center',
    },
    arrowWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowBubble: {
        backgroundColor: '#2196F3',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
        elevation: 10,
        borderWidth: 1,
        borderColor: '#1E88E5',
    },
    arrowBubbleText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 15,
        marginRight: 6,
        textShadowColor: 'rgba(0, 0, 0, 0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    bubbleIcon: {
        marginLeft: 2,
    },
    arrowIconContainer: {
        width: 45,
        height: 45,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.6,
        shadowRadius: 8,
        elevation: 12,
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 2,
        borderColor: '#1E88E5',
    },
    arrowIconContainerLight: {
        backgroundColor: '#2196F3', // Match the bubble color
    },
    arrowIconContainerDark: {
        backgroundColor: '#2196F3', // Keep consistent color in both themes
    },
    glowEffect: {
        position: 'absolute',
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#FFFFFF',
        top: -15,
        left: -15,
        opacity: 0, // Remove glow effect completely
    },
    sensingWarningContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        marginBottom: 12,
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
        backgroundColor: '#FF9800',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        marginLeft: 8,
    },
    settingsButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: 'bold',
    },
});

export default YourAppsList;
