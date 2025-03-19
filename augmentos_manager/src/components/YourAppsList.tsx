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
import { useStatus } from '../providers/AugmentOSStatusProvider';
import AppIcon from './AppIcon';
import { BluetoothService } from '../BluetoothService';
import BackendServerComms from '../backend_comms/BackendServerComms';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';

interface YourAppsListProps {
    isDarkTheme: boolean;
}

const YourAppsList: React.FC<YourAppsListProps> = ({ isDarkTheme }) => {
    const { status } = useStatus();
    const [_isLoading, setIsLoading] = React.useState(false);
    const [showOnboardingTip, setShowOnboardingTip] = useState(false);
    const [onboardingCompleted, setOnboardingCompleted] = useState(true);
    const bluetoothService = BluetoothService.getInstance();

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
                setShowOnboardingTip(!completed);
            };
            
            checkOnboardingStatus();
        }, [])
    );

    // Start arrow animation
    useEffect(() => {
        if (showOnboardingTip) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(arrowAnimation, {
                        toValue: 1,
                        duration: 1200,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    Animated.timing(arrowAnimation, {
                        toValue: 0,
                        duration: 1200,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    })
                ])
            ).start();
        } else {
            arrowAnimation.setValue(0);
        }
    }, [showOnboardingTip, arrowAnimation]);

    // Check if onboarding is completed on initial load
    useEffect(() => {
        const checkOnboardingStatus = async () => {
            const completed = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
            setOnboardingCompleted(completed);
            setShowOnboardingTip(!completed);
        };
        
        checkOnboardingStatus();
    }, []);

    // Mark onboarding as completed
    const completeOnboarding = () => {
        saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
        setOnboardingCompleted(true);
        setShowOnboardingTip(false);
    };

    // Show a tip about how to access app settings
    const showAppSettingsTip = () => {
        Alert.alert(
            "App Settings Tip",
            "Long-press on any app icon to access its settings.",
            [
                { text: "Got it!", onPress: () => {} }
            ]
        );
    };

    const startApp = async (packageName: string) => {
        // If onboarding is not completed, show the tip instead of starting the app
        if (!onboardingCompleted) {
            showAppSettingsTip();
            return;
        }
        
        setIsLoading(true);
        try {
            // TODO: ios fix until prod gets updated
            // BackendServerComms.getInstance().startApp(packageName);
            await bluetoothService.startAppByPackageName(packageName);
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

    // Calculate arrow position based on animation value
    const arrowTranslateY = arrowAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 12]
    });

    // Add pulse animation for the arrow
    const arrowScale = arrowAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [1, 1.15, 1]
    });

    // Add opacity animation for the arrow
    const arrowOpacity = arrowAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.9, 1, 0.9]
    });

    // Add glow animation for the arrow
    const glowOpacity = arrowAnimation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.2, 0.6, 0.2]
    });

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
                
                {/* {showOnboardingTip && (
                    <TouchableOpacity 
                        style={styles.tipButton}
                        onPress={showAppSettingsTip}
                    >
                        <Icon name="information-outline" size={20} color={isDarkTheme ? "#FFFFFF" : "#2196F3"} />
                        <Text style={[
                            styles.tipText,
                            { color: isDarkTheme ? "#FFFFFF" : "#2196F3" }
                        ]}>
                            Tip
                        </Text>
                    </TouchableOpacity>
                )} */}
            </View>

            {/* {showOnboardingTip && (
                <View style={[
                    styles.onboardingTip,
                    isDarkTheme ? styles.onboardingTipDark : styles.onboardingTipLight
                ]}>
                    <Icon name="gesture-tap-hold" size={24} color={isDarkTheme ? "#FFFFFF" : "#2196F3"} />
                    <Text style={[
                        styles.onboardingTipText,
                        isDarkTheme ? styles.onboardingTipTextDark : styles.onboardingTipTextLight
                    ]}>
                        Long-press on any app icon to access its settings
                    </Text>
                    <TouchableOpacity 
                        style={styles.gotItButton}
                        onPress={showAppSettingsTip}
                    >
                        <Text style={styles.gotItButtonText}>Show me</Text>
                    </TouchableOpacity>
                </View>
            )} */}

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
                        {showOnboardingTip && index === 0 && (
                            <Animated.View 
                                style={[
                                    styles.arrowContainer,
                                    {
                                        transform: [
                                            { translateY: arrowTranslateY },
                                            { scale: arrowScale }
                                        ],
                                        opacity: arrowOpacity
                                    }
                                ]}
                            >
                                <View style={styles.arrowWrapper}>
                                    <View style={styles.arrowBubble}>
                                        <Text style={styles.arrowBubbleText}>Long press</Text>
                                        <Icon 
                                            name="gesture-tap-hold" 
                                            size={20} 
                                            color="#FFFFFF"
                                            style={styles.bubbleIcon}
                                        />
                                    </View>
                                    <View style={[
                                        styles.arrowIconContainer,
                                        isDarkTheme ? styles.arrowIconContainerDark : styles.arrowIconContainerLight
                                    ]}>
                                        <Animated.View style={[
                                            styles.glowEffect,
                                            { opacity: glowOpacity }
                                        ]} />
                                        <Icon 
                                            name="arrow-down-bold" 
                                            size={30} 
                                            color="#FFFFFF" 
                                        />
                                    </View>
                                </View>
                            </Animated.View>
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
            {!onboardingCompleted && uniqueApps.length > 0 && (
                <Modal
                    transparent={true}
                    visible={true}
                    animationType="fade"
                >
                    <View style={styles.modalOverlay}>
                        <View style={[
                            styles.modalContent,
                            isDarkTheme ? styles.modalContentDark : styles.modalContentLight
                        ]}>
                            <Icon name="gesture-tap-hold" size={40} color={isDarkTheme ? "#FFFFFF" : "#2196F3"} />
                            <Text style={[
                                styles.modalTitle,
                                isDarkTheme ? styles.lightText : styles.darkText
                            ]}>
                                Complete the Onboarding
                            </Text>
                            <Text style={[
                                styles.modalDescription,
                                isDarkTheme ? styles.lightSubtext : styles.darkSubtext
                            ]}>
                                To continue, please long-press on any app icon to access its settings.
                            </Text>
                            <TouchableOpacity 
                                style={styles.modalButton}
                                onPress={() => {
                                    // Just dismiss the modal, but don't mark onboarding as completed
                                    // User still needs to long-press an app icon
                                    setOnboardingCompleted(true);
                                }}
                            >
                                <Text style={styles.modalButtonText}>I understand</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
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
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    arrowBubbleText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
        marginRight: 6,
    },
    bubbleIcon: {
        marginLeft: 2,
    },
    arrowIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
        overflow: 'hidden',
        position: 'relative',
    },
    arrowIconContainerLight: {
        backgroundColor: '#2196F3',
    },
    arrowIconContainerDark: {
        backgroundColor: '#1976D2',
    },
    glowEffect: {
        position: 'absolute',
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: '#FFFFFF',
        top: -15,
        left: -15,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
    },
    modalContentLight: {
        backgroundColor: '#FFFFFF',
    },
    modalContentDark: {
        backgroundColor: '#1c1c1c',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
        textAlign: 'center',
    },
    modalDescription: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    modalButton: {
        backgroundColor: '#2196F3',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        width: '100%',
        alignItems: 'center',
    },
    modalButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    lightText: {
        color: '#FFFFFF',
    },
    darkText: {
        color: '#1a1a1a',
    },
    lightSubtext: {
        color: '#e0e0e0',
    },
    darkSubtext: {
        color: '#4a4a4a',
    },
});

export default YourAppsList;
