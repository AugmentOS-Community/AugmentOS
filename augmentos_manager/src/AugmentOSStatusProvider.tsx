import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { AugmentOSParser, AugmentOSMainStatus } from './AugmentOSStatusParser';
import { BluetoothService } from './BluetoothService';
import { MOCK_CONNECTION } from './consts';

interface AugmentOSStatusContextType {
    status: AugmentOSMainStatus;
    isSearchingForPuck: boolean;
    isConnectingToPuck: boolean;
    startBluetoothAndCore: () => void;
    refreshStatus: (data: any) => void;
    screenMirrorItems: { id: string; name: string }[]
}

const AugmentOSStatusContext = createContext<AugmentOSStatusContextType | undefined>(undefined);

export const StatusProvider = ({ children }: { children: ReactNode }) => {
    const [status, setStatus] = useState(AugmentOSParser.parseStatus({}));
    const [isInitialized, setIsInitialized] = useState(false)
    const [isSearchingForPuck, setIsSearching] = useState(false);
    const [isConnectingToPuck, setIsConnecting] = useState(false);
    const [screenMirrorItems, setScreenMirrorItems] = useState<{ id: string; name: string }[]>([]);
    const bluetoothService = BluetoothService.getInstance(false); // do not initialize yet

    const refreshStatus = useCallback((data: any) => {
        if (!(data && 'status' in data)) {return;}

        const parsedStatus = AugmentOSParser.parseStatus(data);
        console.log('Parsed status:', parsedStatus);
        setStatus(parsedStatus);
    }, []);

    useEffect(() => {
        if (!isInitialized) return;

        const handleStatusUpdateReceived = (data: any) => {
            console.log('Handling received data.. refreshing status..');
            refreshStatus(data);
        };

        const handleDeviceDisconnected = () => {
            console.log('Device disconnected');
            setStatus(AugmentOSParser.defaultStatus);
        };

        const handleScanStarted = () => setIsSearching(true);
        const handleScanStopped = () => setIsSearching(false);
        const handleConnectingStatusChanged = ({ isConnecting: connecting }: { isConnecting: boolean }) => setIsConnecting(connecting);

        if (!MOCK_CONNECTION) {
            bluetoothService.on('statusUpdateReceived', handleStatusUpdateReceived);
            bluetoothService.on('scanStarted', handleScanStarted);
            bluetoothService.on('scanStopped', handleScanStopped);
            bluetoothService.on('deviceDisconnected', handleDeviceDisconnected);
            bluetoothService.on('connectingStatusChanged', handleConnectingStatusChanged);
        }

        return () => {
            if (!MOCK_CONNECTION) {
                bluetoothService.removeListener('statusUpdateReceived', handleStatusUpdateReceived);
                bluetoothService.removeListener('scanStarted', handleScanStarted);
                bluetoothService.removeListener('scanStopped', handleScanStopped);
                bluetoothService.removeListener('deviceDisconnected', handleDeviceDisconnected);
                bluetoothService.removeListener('connectingStatusChanged', handleConnectingStatusChanged);
            }
        };
    }, [bluetoothService, refreshStatus, isInitialized]);

    // 3) Provide a helper function that sets isInitialized,
    //    calls bluetoothService.initialize(), etc.
    const startBluetoothAndCore = React.useCallback(() => {
        console.log("\n\n\nWE CALLED STARTBTANDCORE\n\n\n");
        bluetoothService.initialize();
        setIsInitialized(true);
    }, [bluetoothService]);

    return (
        <AugmentOSStatusContext.Provider value={{ startBluetoothAndCore, isConnectingToPuck, screenMirrorItems, status, isSearchingForPuck, refreshStatus }}>
            {children}
        </AugmentOSStatusContext.Provider>
    );
};

export const useStatus = () => {
    const context = useContext(AugmentOSStatusContext);
    if (!context) {
        throw new Error('useStatus must be used within a StatusProvider');
    }
    return context;
};
