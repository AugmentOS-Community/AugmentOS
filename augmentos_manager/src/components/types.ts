import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Intro: undefined;
  Home: undefined;
  Register: undefined;
  Login: undefined;
  SettingsPage: undefined;
  AppStore: undefined;
  PairPuckScreen: undefined; // Add this line
  SplashScreen: undefined;
  VerifyEmailScreen: undefined;
  AppDetails: { app: AppStoreItem };
  ProfileSettings: undefined;
  GlassesMirror: undefined;
  Reviews: { appId: string; appName: string }; // Add appName here
  SimulatedPuckSettings: undefined;
  SimulatedPuckOnboard: undefined;
  ConnectingToPuck: undefined;
  PhoneNotificationSettings: undefined;
  PrivacySettingsScreen: undefined;
  GrantPermissionsScreen: undefined;
  SelectGlassesModelScreen: undefined;
  SelectGlassesBluetoothScreen: { glassesModelName: string };
  GlassesPairingGuideScreen: { glassesModelName: string };
  AppSettings: { packageName: string, appName: string };
};



export type AppStoreItem = {
  category: string;
  name: string;
  packageName: string;
  version: string;
  description: string;
  iconImageUrl: string;
  identifierCode: string;
  downloadUrl: string;
  rating: number;
  downloads: number;
  requirements: string[];
  screenshots?: string[]; // Add this line to include screenshots
  reviews?: {
      avatar: string; id: string; user: string; rating: number; comment: string
}[]; // Add reviews field


};

export type NavigationProps = NativeStackNavigationProp<RootStackParamList>;

