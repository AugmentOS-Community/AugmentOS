// AppIcon.tsx
import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ViewStyle } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NavigationProps } from './types';
import { saveSetting, loadSetting } from '../logic/SettingsHelper';
import { SETTINGS_KEYS } from '../consts';
import { AppInterface } from '../providers/AppStatusProvider';
import { router } from 'expo-router';
import { useAppTheme } from '@/utils/useAppTheme';
import { Text } from '@/components/ignite';

interface AppIconProps {
    app: AppInterface;
    isForegroundApp?: boolean;
    onClick?: () => void;
    style?: ViewStyle;
    showLabel?: boolean;
}

const AppIcon: React.FC<AppIconProps> = ({
    app,
    isForegroundApp = false,
    onClick,
    style,
    showLabel = false,
}) => {
    const navigation = useNavigation<NavigationProps>();
    const { theme } = useAppTheme();

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
        
        router.push({pathname: "/tpa/settings", params: {
            packageName: app.packageName,
            appName: app.name
        }})
    }

    return (
        <TouchableOpacity
            onPress={onClick}
            onLongPress={openAppSettings}
            delayLongPress={500} // Make long press easier to trigger
            activeOpacity={0.7}
            style={[styles.container, style]}
            accessibilityLabel={`Launch ${app.name}`}
            accessibilityRole="button"
        >
            <Image
                source={{ uri: app.logoURL }}
                style={styles.icon}
            />

            {showLabel && (
                <Text
                    text={app.name}
                    style={[
                        styles.appName,
                        theme.isDark ? styles.appNameDark : styles.appNameLight,
                    ]}
                    numberOfLines={2}
                />
            )}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        width: 50,
        height: 50,
        borderRadius: 25, // Half of width/height for perfect circle
        overflow: 'hidden',
    },
    icon: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
        borderRadius: 25, // Also make the image circular
    },
    appName: {
        marginTop: 5,
        fontSize: 11,
        fontWeight: '600',
        lineHeight: 12,
        textAlign: "left",
    },
    appNameLight: {
        color: '#000000',
    },
    appNameDark: {
    		color: "#ced2ed",
    },
    squareBadge: {
        position: 'absolute',
        top: -8,
        right: 3,
        width: 20,
        height: 20,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
    },
});

export default React.memo(AppIcon);
