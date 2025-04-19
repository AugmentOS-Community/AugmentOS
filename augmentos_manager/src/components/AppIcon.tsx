// AppIcon.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AppInfo } from '../AugmentOSStatusParser';
import LinearGradient from 'react-native-linear-gradient';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from './types';
import { getAppImage } from '../logic/getAppImage';
import { FallbackImageBackground } from './FallbackImageBackground';
import { saveSetting, loadSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';

interface AppIconProps {
    app: AppInfo;
    isForegroundApp?: boolean;
    onClick?: () => void;
    style?: object;
    isDarkTheme?: boolean;
    showLabel?: boolean;
}

const AppIcon: React.FC<AppIconProps> = ({
    app,
    isForegroundApp = false,
    onClick,
    style,
    isDarkTheme = false,
    showLabel = false,
}) => {
    const navigation = useNavigation<NavigationProps>();

    const openAppSettings = async () => {
        // Mark onboarding as completed when user long-presses an app icon
        try {
            await saveSetting(SETTINGS_KEYS.ONBOARDING_COMPLETED, true);
            console.log('Onboarding marked as completed');
            
            // Track the number of times settings have been accessed
            const currentCount = await loadSetting(SETTINGS_KEYS.SETTINGS_ACCESS_COUNT, 0);
            await saveSetting(SETTINGS_KEYS.SETTINGS_ACCESS_COUNT, currentCount + 1);
            console.log(`Settings access count: ${currentCount + 1}`);
        } catch (error) {
            console.error('Failed to save settings data:', error);
        }
        
        navigation.navigate('AppSettings', {
            packageName: app.packageName,
            appName: app.name
        });
    }

    return (
        <TouchableOpacity
            onPress={onClick}
            onLongPress={openAppSettings}
            delayLongPress={500} // Make long press easier to trigger
            activeOpacity={0.7}
            style={[styles.appWrapper, style]}
            accessibilityLabel={`Launch ${app.name}`}
            accessibilityRole="button"
        >
            <View style={[styles.appIconWrapper, style]}>
                <FallbackImageBackground
                    source={getAppImage(app)}
                    style={[styles.appIcon, style]}
                    imageStyle={styles.appIconRounded}
                />
            </View>

            {showLabel && (
                <Text
                    style={[
                        styles.appName,
                        isDarkTheme ? styles.appNameDark : styles.appNameLight,
                    ]}
                    numberOfLines={2}
                >
                    {app.name}
                </Text>
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    appWrapper: {
        alignItems: 'center',
    },
    appIconWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    appIcon: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    appIconRounded: {
        borderRadius: 8,
    },
    appName: {
        marginTop: 5,
        fontSize: 11,
        fontWeight: '600',
        fontFamily: 'Montserrat-Bold',
        lineHeight: 12,
        textAlign: 'center',
    },
    appNameLight: {
        color: '#000000',
    },
    appNameDark: {
        color: '#FFFFFF',
    },
    squareBadge: {
        position: 'absolute',
        top: -8,
        right: 3,
        width: 20,
        height: 20,
        borderRadius: 6,
        backgroundColor: '#FF438B',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
    },
});

export default React.memo(AppIcon);
