const en = {
  screenSettings: {
    title: "Screen Settings",
  },
  pairing: {
    selectModel: "Select Model",
    pairingGuide: "Pairing Guide",
  },
  privacySettings: {
    title: "Privacy Settings",
  },
  mirror: {
    title: "Glasses Mirror",
  },
  home: {
    title: "Home",
  },
  glasses: {
    title: "Glasses",
  },
  store: {
    title: "Store",
  },
  settings: {
    title: "Settings",
  },
  login: {
    title: "AugmentOS",
    subtitle: "The future of smart glasses starts here",
    email: "Email",
    password: "Password",
    signIn: "Sign In",
    signUp: "Sign Up",
    forgotPassword: "Forgot Password?",
    continueWithGoogle: "Continue with Google",
    continueWithApple: "Continue with Apple",
    continueWithEmail: "Continue with Email",
    termsText: "By signing in, you agree to our terms of service and privacy policy.",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "********",
    createAccount: "Create Account",
    login: "Login",
  },
  warning: {
    nonProdBackend: "You are using a non-production backend.",
  },
  common: {
    ok: "OK!",
    cancel: "Cancel",
    back: "Back",
    or: "OR",
    logOut: "Log Out",
    error: "Error",
  },
  welcomeScreen: {
    postscript:
      "psst  — This probably isn't what your app looks like. (Unless your designer handed you these screens, and in that case, ship it!)",
    readyForLaunch: "Your app, almost ready for launch!",
    exciting: "(ohh, this is exciting!)",
    letsGo: "Let's go!",
  },
  errorScreen: {
    title: "Something went wrong!",
    friendlySubtitle:
      "This is the screen that your users will see in production when an error is thrown. You'll want to customize this message (located in `app/i18n/en.ts`) and probably the layout as well (`app/screens/ErrorScreen`). If you want to remove this entirely, check `app/app.tsx` for the <ErrorBoundary> component.",
    reset: "RESET APP",
    traceTitle: "Error from %{name} stack",
  },
  emptyStateComponent: {
    generic: {
      heading: "So empty... so sad",
      content: "No data found yet. Try clicking the button to refresh or reload the app.",
      button: "Let's try this again",
    },
  },

  errors: {
    invalidEmail: "Invalid email address.",
  },
}

export default en
export type Translations = typeof en
