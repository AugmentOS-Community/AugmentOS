import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Switch,
    TouchableOpacity,
    Platform,
    ScrollView,
    Animated,
    Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/FontAwesome';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import coreCommunicator from '../bridge/CoreCommunicator';
import { loadSetting, saveSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import NavigationBar from '../components/NavigationBar';
import { getGlassesImage } from '../logic/getGlassesImage';
import GlobalEventEmitter from '../logic/GlobalEventEmitter';

interface SelectGlassesModelScreenProps {
    isDarkTheme: boolean;
    toggleTheme: () => void;
    navigation: any;
}

const SelectGlassesModelScreen: React.FC<SelectGlassesModelScreenProps> = ({
    isDarkTheme,
    toggleTheme,
    navigation,
}) => {
    const { status } = useStatus();
    const [glassesModelNameToPair, setGlassesModelNameToPair] = useState<string | null>(null);
    const [isOnboarding, setIsOnboarding] = useState(false);
  
    const glassesOptions = [
        { modelName: 'Vuzix Z100', key: 'vuzix-z100' },
        { modelName: 'Mentra Mach1', key: 'mentra_mach1' },
        { modelName: 'Even Realities G1', key: 'evenrealities_g1' },
        { modelName: 'Audio Wearable', key: 'Audio Wearable' },
        { modelName: 'Simulated Glasses', key: 'Simulated Glasses' },
    ];

    // Check onboarding status when component mounts
    React.useEffect(() => {
        const checkOnboardingStatus = async () => {
            const onboardingCompleted = await loadSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
            setIsOnboarding(!onboardingCompleted);
        };
        
        checkOnboardingStatus();
    }, []);
    
    React.useEffect(() => { }, [status]);

    const triggerGlassesPairingGuide = async (glassesModelName: string) => {
        // No need for Bluetooth permissions anymore as we're using direct communication

        setGlassesModelNameToPair(glassesModelName);
        console.log("TRIGGERING SEARCH SCREEN FOR: " + glassesModelName);
        navigation.navigate('GlassesPairingGuidePreparationScreen', {
            glassesModelName: glassesModelName,
        });
    }

    // Theme colors
    const theme = {
        backgroundColor: isDarkTheme ? '#1c1c1c' : '#f9f9f9',
        headerBg: isDarkTheme ? '#333333' : '#fff',
        textColor: isDarkTheme ? '#FFFFFF' : '#333333',
        subTextColor: isDarkTheme ? '#999999' : '#666666',
        cardBg: isDarkTheme ? '#333333' : '#fff',
        borderColor: isDarkTheme ? '#444444' : '#e0e0e0',
        searchBg: isDarkTheme ? '#2c2c2c' : '#f5f5f5',
        categoryChipBg: isDarkTheme ? '#444444' : '#e9e9e9',
        categoryChipText: isDarkTheme ? '#FFFFFF' : '#555555',
        selectedChipBg: isDarkTheme ? '#666666' : '#333333',
        selectedChipText: isDarkTheme ? '#FFFFFF' : '#FFFFFF',
    };

    return (
        <View
            style={[
                styles.container,
                isDarkTheme ? styles.darkBackground : styles.lightBackground,
            ]}
        >
            {isOnboarding && (
                <View style={[
                    styles.onboardingBanner,
                    {backgroundColor: isDarkTheme ? '#1e88e5' : '#bbdefb'}
                ]}>
                    <Text style={{
                        color: isDarkTheme ? '#ffffff' : '#0d47a1',
                        fontWeight: 'bold',
                        textAlign: 'center',
                        fontSize: 16
                    }}>
                        Select "Simulated Glasses" to continue the onboarding
                    </Text>
                </View>
            )}
            <ScrollView style={styles.scrollViewContainer}>
                {/** RENDER EACH GLASSES OPTION */}
                {glassesOptions.map((glasses) => (
                    <TouchableOpacity
                        key={glasses.key}
                        style={[
                            styles.settingItem,
                            { 
                                backgroundColor: theme.cardBg, 
                                borderColor: (isOnboarding && glasses.modelName === 'Simulated Glasses') 
                                    ? '#2196F3' 
                                    : theme.borderColor 
                            },
                            (isOnboarding && glasses.modelName === 'Simulated Glasses') ? { borderWidth: 2 } : {}
                        ]}
                        onPress={() => {
                            triggerGlassesPairingGuide(glasses.modelName)
                        }}
                    >
                        <Image
                            source={getGlassesImage(glasses.modelName)}
                            style={styles.glassesImage}
                        />
                        <View style={styles.settingTextContainer}>
                            <Text
                                style={[
                                    styles.label,
                                    {
                                        color: (isOnboarding && glasses.modelName === 'Simulated Glasses') 
                                            ? '#2196F3' 
                                            : theme.textColor,
                                        fontWeight: (isOnboarding && glasses.modelName === 'Simulated Glasses') 
                                            ? '800' 
                                            : '600',
                                    },
                                ]}
                            >
                                {glasses.modelName}
                            </Text>
                            {isOnboarding && glasses.modelName === 'Simulated Glasses' && (
                                <Text style={{ color: '#2196F3', marginTop: 5, fontSize: 14 }}>
                                    Recommended for onboarding
                                </Text>
                            )}
                        </View>
                        {isOnboarding && glasses.modelName === 'Simulated Glasses' ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ color: '#2196F3', marginRight: 5, fontWeight: 'bold' }}>
                                    Select
                                </Text>
                                <Icon
                                    name="angle-right"
                                    size={24}
                                    color="#2196F3"
                                />
                            </View>
                        ) : (
                            <Icon
                                name="angle-right"
                                size={24}
                                color={theme.textColor}
                            />
                        )}
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    scrollViewContainer: {
        flex: 1,
    },
    container: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 10,
    },
    onboardingBanner: {
        paddingVertical: 12,
        paddingHorizontal: 15,
        marginBottom: 15,
        borderRadius: 8,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
    },
    titleContainer: {
        paddingVertical: 15,
        paddingHorizontal: 20,
        marginHorizontal: -20,
        marginTop: -20,
        marginBottom: 10,
    },
    titleContainerDark: {
        backgroundColor: '#333333',
    },
    titleContainerLight: {
        backgroundColor: '#ffffff',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        fontFamily: 'Montserrat-Bold',
        textAlign: 'left',
        color: '#FFFFFF',
        marginBottom: 5,
    },
    darkBackground: {
        backgroundColor: '#1c1c1c',
    },
    lightBackground: {
        backgroundColor: '#f0f0f0',
    },
    darkText: {
        color: 'black',
    },
    lightText: {
        color: 'white',
    },
    darkSubtext: {
        color: '#666666',
    },
    lightSubtext: {
        color: '#999999',
    },
    darkIcon: {
        color: '#333333',
    },
    lightIcon: {
        color: '#666666',
    },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    backButtonText: {
        marginLeft: 10,
        fontSize: 18,
        fontWeight: 'bold',
    },
    /**
     * BIG AND SEXY CARD
     */
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        // Increased padding to give it a "bigger" look
        paddingVertical: 25,
        paddingHorizontal: 15,

        // Larger margin to separate each card
        marginVertical: 8,

        // Rounded corners
        borderRadius: 10,
        borderWidth: 1,

        // Shadow for iOS
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },

        // Elevation for Android
        elevation: 3,
    },
    settingTextContainer: {
        flex: 1,
        paddingHorizontal: 10,
    },
    label: {
        fontSize: 18, // bigger text size
        fontWeight: '600',
        flexWrap: 'wrap',
    },
    value: {
        fontSize: 12,
        marginTop: 5,
        flexWrap: 'wrap',
    },
    headerContainer: {
        backgroundColor: '#fff',
        paddingVertical: 15,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    header: {
        fontSize: 24,
        fontWeight: '600',
        color: '#333',
    },
    /**
     * BIGGER, SEXIER IMAGES
     */
    glassesImage: {
        width: 80,    // bigger width
        height: 50,   // bigger height
        resizeMode: 'contain',
        marginRight: 10,
    },
});

export default SelectGlassesModelScreen;
