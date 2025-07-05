const palette = {
  neutral100: "#FFFFFF",
  neutral200: "#F4F2F1",
  neutral300: "#D7CEC9",
  neutral400: "#B6ACA6",
  neutral500: "#978F8A",
  neutral600: "#564E4A",
  neutral700: "#3C3836",
  neutral800: "#191015",
  neutral900: "#000000",
  /*
  primary100: "#FEFAF8", // Much closer to white with subtle warm hint
  primary200: "#E8C1B4",
  primary300: "#DDA28E",
  primary400: "#D28468",
  primary500: "#C76542",
  primary600: "#A54F31",
*/

  primary100: "#DCDDE9",
  primary200: "#E0E0E0",
  primary300: "#9196B9",
  primary400: "#626894",
  primary500: "#41476E",
  primary600: "#21476E",

  secondary100: "#DCDDE9",
  secondary200: "#BCC0D6",
  secondary300: "#9196B9",
  secondary400: "#626894",
  secondary500: "#41476E",

  accent100: "#FFEED4",
  accent200: "#FFE1B2",
  accent300: "#FDD495",
  accent400: "#FBC878",
  accent500: "#FFBB50",

  angry100: "#F2D6CD",
  angry500: "#C03403",

  // Warning/danger colors
  red500: "#f00", // Bright red for warnings

  // Orange colors
  orange500: "#FF9500", // Warning orange

  // Red error colors
  errorRed: "#FF3B30", // Error red

  // Gallery background colors
  darkGalleryBg: "#121212", // Very dark background for gallery
  lightGalleryBg: "#f0f0f0", // Light background for gallery

  // Common blue colors found in hardcoded values
  blue100: "#E3F2FD",
  blue200: "#BBDEFB",
  blue300: "#90CAF9",
  blue400: "#42A5F5",
  blue500: "#2196F3", // Material Design Blue - most common hardcoded blue
  blue600: "#1976D2", // Darker blue variant
  blue700: "#1565C0",
  blue800: "#0D47A1",

  // iOS system blue
  iosBlue: "#007AFF",

  // Common gray colors found in hardcoded values
  gray100: "#F5F5F5",
  gray200: "#EEEEEE",
  gray300: "#E0E0E0",
  gray350: "#CECECE",
  gray400: "#BDBDBD",
  gray500: "#9E9E9E",
  gray600: "#757575",
  gray700: "#616161",
  gray800: "#424242",
  gray900: "#212121",

  // Additional grays from hardcoded values
  lightGray: "#CCCCCC",
  mediumGray: "#999999",
  darkGray: "#666666",
  charcoal: "#333333",

  // Success colors
  success100: "#22C55E",
  success500: "#4CAF50",

  // Warning colors
  warning100: "#FFF3E0",
  warning500: "#FF9500",

  // Facebook brand color
  facebookBlue: "#4267B2",

  // Common overlay colors
  overlay90: "rgba(0, 0, 0, 0.9)",
  overlay70: "rgba(0, 0, 0, 0.7)",
  overlay60: "rgba(0, 0, 0, 0.6)",
  overlay40: "rgba(0, 0, 0, 0.4)",
  overlay30: "rgba(0, 0, 0, 0.3)",
  overlay10: "rgba(0, 0, 0, 0.1)",
  whiteOverlay90: "rgba(255, 255, 255, 0.9)",
  whiteOverlay85: "rgba(255, 255, 255, 0.85)",
  whiteOverlay70: "rgba(255, 255, 255, 0.7)",

  overlay20: "rgba(25, 16, 21, 0.2)",
  overlay50: "rgba(25, 16, 21, 0.5)",

  // iOS specific colors
  iosSwitchTrack: "#D1D1D6", // iOS switch track color (off state)
  iosBackground: "#f9f9f9", // Light gray background color

  // Tab bar gradient colors (light theme - subtle blue-tinted white, no gradient)
  tabBarGradientStart: "#F8FAFF", // Blue-tinted white for light theme
  tabBarGradientEnd: "#F8FAFF", // Blue-tinted white for light theme

  altTabBarGradientStart: "#F5E6D3",
  altTabBarGradientEnd: "#FEFCFA",

  // Button gradient colors
  buttonGradientStart: "#4340D3", // Purple-blue for button gradient start
  buttonGradientEnd: "#06114D", // Dark blue for button gradient end

  // Warning background colors
  warningBackground: "rgba(254, 152, 235, 0.2)", // Light pink/magenta warning background with 20% opacity
  warningPink: "#FE98EB", // Solid pink/magenta for destructive actions

  // Input border colors
  inputBorderHighlight: "#4A90E2", // Medium blue border for input fields (light theme)

  // Button colors for pill-shaped buttons (light theme)
  buttonPillPrimary: "#3230A4", // Deep purple-blue for primary pill buttons
  buttonPillSecondary: "transparent", // Transparent background for secondary pill buttons
  buttonPillSecondaryBorder: "#4240D1", // Purple border for secondary pill buttons
  buttonPillIcon: "#E0E0E0", // Medium gray for icon pill buttons (was secondary)
  buttonPillPrimaryText: "#FFFFFF", // White text for primary buttons
  buttonPillSecondaryText: "#030514", // Dark text for secondary buttons
  buttonPillIconText: "#333333", // Dark text for icon buttons
} as const

export const colors = {
  /**
   * The palette is available to use, but prefer using the name.
   * This is only included for rare, one-off cases. Try to use
   * semantic names as much as possible.
   */
  palette,
  /**
   * A helper for making something see-thru.
   */
  transparent: "rgba(0, 0, 0, 0)",
  /**
   * The default text color in many components.
   */
  text: palette.neutral900, // Darker text for better contrast in light theme
  /**
   * Secondary text information.
   */
  textDim: palette.neutral700,

  // basically WoB or BoW for light theme
  textAlt: palette.neutral200,
  /**
   * The default color of the screen background.
   */
  background: "#F9F9F9",
  /**
   * The default border color.
   */
  border: "#E4E8EE",
  /**
   * The main tinting color.
   */
  tint: palette.primary500,
  /**
   * The inactive tinting color.
   */
  tintInactive: palette.neutral300,
  /**
   * A subtle color used for lines.
   */
  separator: palette.neutral300,
  /**
   * Error messages.
   */
  error: palette.angry500,
  /**
   * Error Background.
   */
  errorBackground: palette.angry100,

  backgroundGradient1: palette.neutral600,
  backgroundGradient2: palette.primary100,

  // Login screen gradient
  loginGradientStart: palette.blue100, // Light blue for login background
  loginGradientEnd: palette.neutral100, // White

  // Semantic color mappings for common UI elements
  buttonPrimary: palette.buttonPillPrimary,
  buttonSecondary: palette.blue500,
  buttonDisabled: palette.lightGray,
  buttonDanger: palette.angry500,

  // Modal and overlay colors
  modalOverlay: palette.overlay70,
  modalBackground: palette.neutral100,

  // Success and warning states
  success: palette.success500,
  warning: palette.warning500,

  // Switch/toggle colors
  switchTrackOff: "#E7E7FF", // Light purple for OFF track
  switchTrackOn: "#7674FB", // Purple for ON track
  switchThumb: palette.neutral100, // White thumb for better contrast
  switchThumbOn: palette.neutral100, // White thumb for ON state
  switchThumbOff: palette.neutral100, // White thumb for OFF state
  switchBorder: "#4240D1", // Purple border for both track and handle
  switchBorderWidth: 2, // Border width for switch in light theme

  // Gallery specific colors
  galleryBackground: palette.lightGalleryBg,

  // Status/alert colors
  warningOrange: palette.orange500,
  errorRed: palette.errorRed,

  // Loading and activity indicators
  loadingIndicator: palette.blue500,

  // Icon colors
  icon: palette.neutral800, // darker icons for light theme
  iconSecondary: palette.neutral700, // darker secondary icons for light theme

  // Button states
  buttonPressed: palette.gray200, // Light gray state for pressed buttons

  // Tab bar gradients
  tabBarBackground1: palette.tabBarGradientStart,
  tabBarBackground2: palette.tabBarGradientEnd,
  
  // Tab bar solid background (for native tabs)
  tabBarBackground: "#F8FAFF",

  altTabBarBackground1: palette.altTabBarGradientStart,
  altTabBarBackground2: palette.altTabBarGradientEnd,

  // Fullscreen and modal backgrounds
  fullscreenBackground: palette.neutral900, // Black for fullscreen camera
  fullscreenOverlay: palette.overlay60, // Semi-transparent overlay

  // Permission and action buttons
  permissionButton: palette.iosBlue, // iOS blue for permission requests
  shareButton: palette.blue500, // Blue for share actions
  deleteButton: palette.angry500, // Red for delete actions
  destructiveAction: "#A70088", // Purple-magenta for destructive actions in light theme

  // Badge and notification colors
  badgeBackground: palette.red500, // Red for notification badges

  // Gallery specific
  galleryLoadingIndicator: palette.blue500, // Blue for loading spinners

  // Status and notification colors
  statusSuccess: palette.success500, // Green for success messages
  statusWarning: palette.warning500, // Orange for warning messages
  statusInfo: palette.blue500, // Blue for info messages

  // Modal and picker backgrounds
  pickerBackground: palette.whiteOverlay70, // Semi-transparent white for pickers

  // Border variations
  borderLight: palette.overlay10, // Very light border

  // Button gradient colors
  buttonGradientStart: palette.buttonGradientStart,
  buttonGradientEnd: palette.buttonGradientEnd,

  // Warning background
  warningBackground: palette.warningBackground,
  warningBackgroundDestructive: "rgba(254, 152, 235, 0.4)", // Pink warning background with 40% opacity
  warningBorderDestructive: "rgba(254, 152, 235, 0.16)", // Faded pink border (40% of background opacity)

  // Input border highlight
  inputBorderHighlight: palette.inputBorderHighlight,

  // Pill button colors
  buttonPillPrimary: palette.buttonPillPrimary,
  buttonPillSecondary: palette.buttonPillSecondary,
  buttonPillSecondaryBorder: palette.buttonPillSecondaryBorder,
  buttonPillIcon: palette.buttonPillIcon,
  buttonPillPrimaryText: palette.buttonPillPrimaryText,
  buttonPillSecondaryText: palette.buttonPillSecondaryText,
  buttonPillIconText: palette.buttonPillIconText,

  // Checkmark color
  checkmark: palette.blue500, // Bright blue for checkmarks in light theme

  // Slider colors
  sliderThumb: palette.gray700, // Dark gray for better contrast on light background
  sliderTrackActive: palette.primary300, // Default track color for light theme
  sliderTrackInactive: palette.neutral300, // Default inactive track color for light theme

  // Tab bar icon and text colors
  tabBarIconActive: "#4240D1", // Active tab icon color
  tabBarTextActive: "#2B29B4", // Active tab text color
  tabBarIconInactive: "#565E8C", // Inactive tab icon color
  tabBarTextInactive: "#4F5474", // Inactive tab text color

  // Chevron color for app list items
  chevron: "#898FB2", // Light purple-gray for chevrons

  // Foreground tag colors
  foregroundTagBackground: "rgba(66, 64, 209, 0.1)", // #4240D1 at 10% opacity
  foregroundTagText: "#312FB4", // Dark purple text
  
  // Status icons on home screen
  statusIcon: "#565E8C", // Purple-gray for battery, brightness, bluetooth, wifi icons
  statusText: "#030514", // Dark text for status values (battery %, brightness %, etc)
  
  // Search icon color
  searchIcon: "#4240D1", // Purple for search icon in light theme
} as const
