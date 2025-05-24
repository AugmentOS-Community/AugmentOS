import { ImageSourcePropType } from 'react-native';
import { AppInfo } from "../AugmentOSStatusParser";

// Default fallback icon
export const DEFAULT_ICON = require('../assets/app-icons/navigation.png');

export const getAppImage = (app: AppInfo): ImageSourcePropType => {
    // First, check for specific package name mappings
    switch (app.packageName) {
        case 'com.mentra.merge':
            return require('../assets/app-icons/mentra-merge.png');
        case 'com.mentra.link':
            return require('../assets/app-icons/mentra-link.png');
        case 'com.mentra.adhdaid':
            return require('../assets/app-icons/ADHD-aid.png');
        case 'com.augmentos.live-translation':
        case 'com.augmentos.livetranslation':
            return require('../assets/app-icons/translation.png');
        case 'com.example.placeholder':
        case 'com.augmentos.screenmirror':
            return require('../assets/app-icons/screen-mirror.png');
        case 'com.augmentos.livecaptions':
            return require('../assets/app-icons/captions.png');
        case 'com.augmentos.miraai':
            return require('../assets/app-icons/mira-ai.png');
        case 'com.google.android.apps.maps':
        case 'com.augmentos.navigation':
            return require('../assets/app-icons/navigation.png');
        case 'com.augmentos.teleprompter':
            return require('../assets/app-icons/teleprompter.png');
        case 'com.augmentos.notify':
            return require('../assets/app-icons/phone-notifications.png');
    }

    // If an icon URL exists, return it with fallback handling
    if (app.icon) {
        return {
            uri: app.icon,
            // Provide a default icon to use if the network image fails
            cache: 'force-cache', // Optionally cache the image
        };
    }

    // Final fallback to default icon
    return DEFAULT_ICON;
};
