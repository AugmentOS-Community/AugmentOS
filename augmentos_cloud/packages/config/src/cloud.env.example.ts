// Config for cloud environment variables.
// We will use this as our source of truth for cloud environment variables, and secrets so we can define them in one place.
// And have a different file for prod and dev environments.

export interface SystemApp {
  port: number;
  packageName: string;
}

export const BASE_PORT = 8000;
export const CLOUD_PORT = 8002;
export const DEBUGGER_PORT = 6173;

export const systemApps = {
  captions: {
    port: BASE_PORT + 10,
    packageName: "com.augmentos.livecaptions",
    name: "Live Captions",
    description: "Live closed captions.",
  },
  flash: {
    port: BASE_PORT + 11,
    packageName: 'org.augmentos.flash',
    name: 'Flash ⚡️',
    description: "⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️",
  },
  dashboard: {
    port: BASE_PORT + 12,
    packageName: 'com.augmentos.dashboard',
    name: 'Dashboard',
    description: "Dashboard",
  },
  notify: {
    port: BASE_PORT + 14,
    packageName: 'com.augmentos.notify',
    name: 'Notify',
    description: "See your phone notifications on your smart glasses",
  },
  mira: {
    port: BASE_PORT + 15,
    packageName: 'com.augmentos.miraai',
    name: 'Mira AI',
    description: "The AugmentOS AI Assistant. Say 'Hey Mira...' followed by a question or command.",
  },
  merge: {
    port: BASE_PORT + 16,
    packageName: 'com.mentra.merge',
    name: 'Merge',
    description: "Proactive AI that helps you during conversations. Turn it on, have a conversation, and let Merge agents enhance your convo.",
  },
  liveTranslation: {
    port: BASE_PORT + 17,
    packageName: 'com.augmentos.livetranslation',
    name: 'Live Translation',
    description: "Live language translation."
  },
};

// SECRETS. DO NOT COMMIT.
// Azure
export const AZURE_SPEECH_REGION="centralus"
export const AZURE_SPEECH_KEY="xxx"

// JWT Secrets
export const SUPABASE_JWT_SECRET='xxx';
export const AUGMENTOS_AUTH_JWT_SECRET='xxx'
export const JOE_MAMA_USER_JWT='xxx';

// posthog env vars
export const POSTHOG_PROJECT_API_KEY = "phc_xxx";
export const POSTHOG_HOST = "https://app.posthog.com";
