// App icon getter based on the one in AppIcon component
export const getAppImage = (packageName: string) => {
    switch (packageName) {
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
        case 'com.augmentos.notify':
            return require('../assets/app-icons/phone-notifications.png');
        default:
            return require('../assets/app-icons/navigation.png');
    }
};
