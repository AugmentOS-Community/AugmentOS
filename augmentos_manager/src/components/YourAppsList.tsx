// YourAppsList.tsx
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
} from 'react-native';
import { useStatus } from '../providers/AugmentOSStatusProvider';
import AppIcon from './AppIcon';
import { BluetoothService } from '../BluetoothService';
import BackendServerComms from '../backend_comms/BackendServerComms';

interface YourAppsListProps {
    isDarkTheme: boolean;
}

const YourAppsList: React.FC<YourAppsListProps> = ({ isDarkTheme }) => {
    const { status } = useStatus();
    const [_isLoading, setIsLoading] = React.useState(false);
    const bluetoothService = BluetoothService.getInstance();

    const [containerWidth, setContainerWidth] = React.useState(0);

    // Constants for grid item sizing
    const GRID_MARGIN = 6; // Total horizontal margin per item (left + right)
    const numColumns = 4; // Desired number of columns

    // Calculate the item width based on container width and margins
    const itemWidth = containerWidth > 0 ? (containerWidth - (GRID_MARGIN * numColumns)) / numColumns : 0;

    const startApp = async (packageName: string) => {
        setIsLoading(true);
        try {
            BackendServerComms.getInstance().startApp(packageName);
        } catch (error) {
            console.error('start app error:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const textColor = isDarkTheme ? '#FFFFFF' : '#000000';
    const backgroundColor = isDarkTheme ? '#1E1E1E' : '#F5F5F5';

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

            <View style={styles.gridContainer}>
                {uniqueApps.map((app) => (
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
                        <AppIcon
                            app={app}
                            isDarkTheme={isDarkTheme}
                            onClick={() => startApp(app.packageName)}
                            // size={itemWidth * 0.8} // Adjust size relative to itemWidth
                        />
                    </View>
                ))}
            </View>
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
        alignItems: 'flex-start',
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
});

export default YourAppsList;
