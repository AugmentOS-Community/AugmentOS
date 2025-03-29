import { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Intro: undefined;
  Home: undefined;
  Register: undefined;
  Login: undefined;
  SettingsPage: undefined;
  AppStore: undefined;
  AppStoreNative: undefined;
  AppStoreWeb: undefined;
  PairPuckScreen: undefined;
  SplashScreen: undefined;
  VerifyEmailScreen: undefined;
  WelcomePage: undefined;
  Onboarding: undefined;
  Testing: undefined;
  AppDetails: { app: AppStoreItem };
  ProfileSettings: undefined;
  GlassesMirror: undefined;
  Reviews: { appId: string; appName: string };
  ConnectingToPuck: undefined;
  PhoneNotificationSettings: undefined;
  PrivacySettingsScreen: undefined;
  GrantPermissionsScreen: undefined;
  SelectGlassesModelScreen: undefined;
  DashboardSettingsScreen: { isDarkTheme: boolean; toggleTheme: () => void };
  DeveloperSettingsScreen: undefined;
  VersionUpdateScreen: {
    isDarkTheme: boolean;
    connectionError?: boolean;
    localVersion?: string;
    cloudVersion?: string;
  };
  SelectGlassesBluetoothScreen: { glassesModelName: string };
  GlassesPairingGuideScreen: { glassesModelName: string };
  GlassesPairingGuidePreparationScreen: { glassesModelName: string };
  AppSettings: { packageName: string, appName: string };
  ErrorReportScreen: undefined;
};



export type AppStoreItem = {
  category: string;
  name: string;
  packageName: string;
  version: string;
  description: string;
  iconImageUrl: string;
  showInAppStore: boolean;
  identifierCode: string;
  downloadUrl: string;
  rating: number;
  downloads: number;
  requirements: string[];
  screenshots?: string[];
  reviews?: {
      avatar: string; id: string; user: string; rating: number; comment: string
}[];


};

export type NavigationProps = NativeStackNavigationProp<RootStackParamList>;

