import React from 'react';
import { Alert, AlertButton } from 'react-native';
import MessageModal from '../components/MessageModal';

// Type for button style options
type ButtonStyle = 'default' | 'cancel' | 'destructive';

// Button interface aligned with MessageModal
interface ModalButton {
  text: string;
  onPress?: () => void;
  style?: ButtonStyle;
}

// Global state to manage the modal
let modalRef: {
  showModal: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: { 
      isDarkTheme?: boolean; 
      iconName?: string;
      iconSize?: number;
      iconColor?: string;
    }
  ) => void;
} | null = null;

// Function to register the modal reference
export const setModalRef = (ref: typeof modalRef) => {
  modalRef = ref;
};

// Converts a React Native AlertButton to our ModalButton format
const convertToModalButton = (button: AlertButton, index: number, totalButtons: number): ModalButton => {
  let style: ButtonStyle = 'default';
  
  // Heuristics to determine button style based on text and position
  if (button.style === 'cancel' || button.style === 'destructive') {
    // Use RN's native styles if provided
    style = button.style;
  } else if (button.text && ['cancel', 'no', 'back'].includes(button.text.toLowerCase())) {
    style = 'cancel';
  } else if (button.text && ['delete', 'remove', 'destroy'].includes(button.text.toLowerCase())) {
    style = 'destructive';
  } else if (index === totalButtons - 1) {
    // Last button is usually confirm/primary
    style = 'default';
  }
  
  return {
    text: button.text || '',
    onPress: button.onPress,
    style,
  };
};

// Global component that will be rendered once at the app root
export const ModalProvider: React.FC<{ isDarkTheme?: boolean }> = ({ isDarkTheme = false }) => {
  const [visible, setVisible] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [buttons, setButtons] = React.useState<ModalButton[]>([]);
  const [options, setOptions] = React.useState<{
    isDarkTheme?: boolean;
    iconName?: string;
    iconSize?: number;
    iconColor?: string;
  }>({ isDarkTheme });

  React.useEffect(() => {
    // Register the modal functions for global access
    setModalRef({
      showModal: (title, message, alertButtons = [], opts = {}) => {
        setTitle(title);
        setMessage(message);
        
        // Convert all buttons to our ModalButton format with style hints
        const modalButtons = alertButtons.length > 0 
          ? alertButtons.map((btn, idx) => convertToModalButton(btn, idx, alertButtons.length))
          : [{ text: 'OK' }];
        
        setButtons(modalButtons);

        // Set options with fallback to component's props
        setOptions({
          isDarkTheme: opts.isDarkTheme !== undefined ? opts.isDarkTheme : isDarkTheme,
          iconName: opts.iconName,
          iconSize: opts.iconSize,
          iconColor: opts.iconColor,
        });

        setVisible(true);
      },
    });

    return () => {
      setModalRef(null);
    };
  }, [isDarkTheme]);

  const handleDismiss = () => {
    setVisible(false);
  };

  return (
    <MessageModal
      visible={visible}
      title={title}
      message={message}
      buttons={buttons}
      onDismiss={handleDismiss}
      isDarkTheme={options.isDarkTheme}
      iconName={options.iconName}
      iconSize={options.iconSize}
      iconColor={options.iconColor}
    />
  );
};

// Custom alert function that can be used as a drop-in replacement for Alert.alert
export const showAlert = (
  title: string,
  message: string,
  buttons: AlertButton[] = [{ text: 'OK' }],
  options?: { 
    cancelable?: boolean; 
    onDismiss?: () => void;
    useNativeAlert?: boolean;
    isDarkTheme?: boolean;
    iconName?: string;
    iconSize?: number;
    iconColor?: string;
  }
) => {
  // Fall back to native Alert if modalRef is not set or if explicitly requested
  if (!modalRef || options?.useNativeAlert) {
    return Alert.alert(title, message, buttons, {
      cancelable: options?.cancelable,
      onDismiss: options?.onDismiss,
    });
  }

  // Use custom modal implementation
  modalRef.showModal(title, message, buttons, {
    isDarkTheme: options?.isDarkTheme,
    iconName: options?.iconName,
    iconSize: options?.iconSize,
    iconColor: options?.iconColor,
  });
};

export default showAlert;