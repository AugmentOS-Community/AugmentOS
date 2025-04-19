import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { AugmentOSParser, AugmentOSMainStatus } from '../AugmentOSStatusParser.tsx';
import { INTENSE_LOGGING, MOCK_CONNECTION } from '../consts.tsx';
import GlobalEventEmitter from "../logic/GlobalEventEmitter.tsx";
import BackendServerComms from '../backend_comms/BackendServerComms';
import { useAuth } from '../AuthContext';
import coreCommunicator from '../bridge/CoreCommunicator';

// Track pending app operations
interface PendingOperation {
    packageName: string;
    operation: 'start' | 'stop';
    timestamp: number;
}

interface AugmentOSStatusContextType {
    status: AugmentOSMainStatus;
    initializeCoreConnection: () => void;
    refreshStatus: (data: any) => void;
    screenMirrorItems: { id: string; name: string }[]
    getCoreToken: () => string | null;
    updateAppStatus: (packageName: string, isRunning: boolean, isForeground?: boolean) => void;
    isAppOperationPending: (packageName: string) => boolean;
    startAppOperation: (packageName: string, operation: 'start' | 'stop') => boolean;
    endAppOperation: (packageName: string) => void;
}

const AugmentOSStatusContext = createContext<AugmentOSStatusContextType | undefined>(undefined);

export const StatusProvider = ({ children }: { children: ReactNode }) => {
    const [status, setStatus] = useState(AugmentOSParser.parseStatus({}));
    const [isInitialized, setIsInitialized] = useState(false);
    const [screenMirrorItems, setScreenMirrorItems] = useState<{ id: string; name: string }[]>([]);
    // Track pending app operations to prevent race conditions
    const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
    
    // Minimum time between operations on the same app (milliseconds)
    const MIN_OPERATION_INTERVAL = 800;

    // Check if an app has a pending operation
    const isAppOperationPending = useCallback((packageName: string) => {
        return pendingOperations.some(op => op.packageName === packageName);
    }, [pendingOperations]);

    // Start an app operation (returns false if operation can't be started)
    const startAppOperation = useCallback((packageName: string, operation: 'start' | 'stop') => {
        // Check if there's already an operation in progress for this app
        const existingOp = pendingOperations.find(op => op.packageName === packageName);
        const now = Date.now();
        
        // If there's an existing operation and it's too recent, don't allow a new one
        if (existingOp && (now - existingOp.timestamp < MIN_OPERATION_INTERVAL)) {
            console.log(`Operation ${operation} rejected: Previous operation ${existingOp.operation} still pending`);
            return false;
        }
        
        // Add the new operation
        setPendingOperations(prev => [
            ...prev.filter(op => op.packageName !== packageName), // Remove any existing operation for this app
            { packageName, operation, timestamp: now }
        ]);
        
        return true;
    }, [pendingOperations, MIN_OPERATION_INTERVAL]);

    // End an app operation
    const endAppOperation = useCallback((packageName: string) => {
        setPendingOperations(prev => prev.filter(op => op.packageName !== packageName));
    }, []);

    const refreshStatus = useCallback((data: any) => {
        if (!(data && 'status' in data)) {return;}

        const parsedStatus = AugmentOSParser.parseStatus(data);
        if (INTENSE_LOGGING)
            console.log('Parsed status:', parsedStatus);
        
        setStatus(parsedStatus);
    }, []);

    // Add user as a dependency to trigger re-initialization after login
    const { user } = useAuth();

    useEffect(() => {
        // Force a complete reset of status during sign-out/sign-in transition
        if (!user) {
            console.log('User signed out, resetting status');
            setStatus(AugmentOSParser.defaultStatus);
            return;
        }

        if (!isInitialized) return;

        // Log the status provider re-initialization for debugging
        console.log('STATUS PROVIDER: Initializing event listeners for user:', user?.email);

        const handleStatusUpdateReceived = (data: any) => {
            if (INTENSE_LOGGING)
                console.log('Handling received data.. refreshing status..');
            refreshStatus(data);
        };

        const handleDeviceDisconnected = () => {
            console.log('Core disconnected');
            setStatus(AugmentOSParser.defaultStatus);
        };

        if (!MOCK_CONNECTION) {
            // First, ensure we're not double-registering by removing any existing listeners
            coreCommunicator.removeAllListeners('statusUpdateReceived');
            coreCommunicator.removeAllListeners('dataReceived');
            GlobalEventEmitter.removeAllListeners('STATUS_PARSE_ERROR');
            
            // Register fresh listeners
            coreCommunicator.on('statusUpdateReceived', handleStatusUpdateReceived);
            GlobalEventEmitter.on('STATUS_PARSE_ERROR', handleDeviceDisconnected);
            
            console.log('STATUS PROVIDER: Event listeners registered successfully');
            
            // Force a status request to update UI immediately
            setTimeout(() => {
                coreCommunicator.sendRequestStatus();
            }, 1000);
        }

        return () => {
            if (!MOCK_CONNECTION) {
                coreCommunicator.removeListener('statusUpdateReceived', handleStatusUpdateReceived);
                GlobalEventEmitter.removeListener('STATUS_PARSE_ERROR', handleDeviceDisconnected);
                console.log('STATUS PROVIDER: Event listeners cleaned up');
            }
        };
    }, [refreshStatus, isInitialized, user]); // Added user dependency

    // Initialize the Core communication
    const initializeCoreConnection = React.useCallback(() => {
        console.log("Initializing Core communication");
        coreCommunicator.initialize();
        setIsInitialized(true);
    }, []);
    
    // Helper to get coreToken (directly returns from BackendServerComms)
    const getCoreToken = useCallback(() => {
        return BackendServerComms.getInstance().getCoreToken();
    }, []);

    // Add a method to update app status locally
    const updateAppStatus = useCallback((packageName: string, isRunning: boolean, isForeground: boolean = true) => {
        setStatus(prevStatus => {
            // Create a new copy of the apps array with the updated app
            const updatedApps = prevStatus.apps.map(app => {
                if (app.packageName === packageName) {
                    return { ...app, is_running: isRunning, is_foreground: isForeground };
                }
                // If setting a new foreground app, make sure other apps aren't foreground
                if (isForeground && isRunning && app.is_foreground) {
                    return { ...app, is_foreground: false };
                }
                return app;
            });
            
            // Return a new status object with the updated apps
            return { ...prevStatus, apps: updatedApps };
        });
    }, []);

    return (
        <AugmentOSStatusContext.Provider value={{ 
            initializeCoreConnection,
            screenMirrorItems, 
            status, 
            refreshStatus,
            getCoreToken,
            updateAppStatus,
            isAppOperationPending,
            startAppOperation,
            endAppOperation
        }}>
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