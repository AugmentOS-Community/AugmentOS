// Config for cloud environment variables.
// We will use this as our source of truth for cloud environment variables, and secrets so we can define them in one place.
// And have a different file for prod and dev environments.

export interface SystemApp {
  // port: number;
  host: string; // Docker service name / host. This is used to connect to the service. i.e. http://${host} or ws://${host}
  packageName: string;
  name: string; // Making name required since it's accessed in the code
}

// export const BASE_PORT = 8000;
const BASE_PORT = process.env.BASE_PORT ? parseInt(process.env.BASE_PORT) : 8000;

export const systemApps = {
  captions: {
    // port: BASE_PORT + 10,
    host: "live-captions",
    packageName: "com.augmentos.livecaptions",
    name: "Live Captions",
    description: "Live closed captions.",
  },
  flash: {
    // port: BASE_PORT + 11,
    host: "flash",
    packageName: 'org.augmentos.flash',
    name: 'Flash ⚡️',
    description: "⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️",
  },
  dashboard: {
    // port: BASE_PORT + 12,
    host: "dashboard-manager",
    packageName: 'com.augmentos.dashboard',
    name: 'Dashboard',
    description: "Dashboard",
  },
  notify: {
    // port: BASE_PORT + 14,
    host: "notify",
    packageName: 'com.augmentos.notify',
    name: 'Notify',
    description: "See your phone notifications on your smart glasses",
  },
  mira: {
    // port: BASE_PORT + 15,
    host: "mira",
    packageName: 'com.augmentos.miraai',
    name: 'Mira AI',
    description: "The AugmentOS AI Assistant. Say 'Hey Mira...' followed by a question or command.",
  },
  merge: {
    host: `merge`,
    packageName: 'com.mentra.merge',
    name: 'Merge',
    description: "Proactive AI that helps you during conversations. Turn it on, have a conversation, and let Merge agents enhance your convo.",
  },
  liveTranslation: {
    // port: BASE_PORT + 17,
    host: "live-translation",
    packageName: 'com.augmentos.live-translation',
    name: 'Live Translation',
    description: "Live language translation."
  },
};

// Environment Variables
// export const NODE_ENV = process.env.NODE_ENV || "development";
// export const CLOUD_VERSION = process.env.CLOUD_VERSION || "1.0.0";

// SECRETS fetched from environment variables
// MongoDB
// export const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017/augmentos";

// Sentry
// export const SENTRY_DSN = process.env.SENTRY_DSN || "";


// Azure OpenAI Configuration
// export const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY || "";
// export const AZURE_OPENAI_API_INSTANCE_NAME = process.env.AZURE_OPENAI_API_INSTANCE_NAME || "";
// export const AZURE_OPENAI_API_DEPLOYMENT_NAME = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || "";
// export const AZURE_OPENAI_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2023-05-15";

// Anthropic Configuration
// export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// OpenAI Configuration
// export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// Search API
// export const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY || "";

// JWT Secrets
// export const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
// export const AUGMENTOS_AUTH_JWT_SECRET = process.env.AUGMENTOS_AUTH_JWT_SECRET || "";
// export const JOE_MAMA_USER_JWT = process.env.JOE_MAMA_USER_JWT || "";

// PostHog
// export const POSTHOG_PROJECT_API_KEY = process.env.POSTHOG_PROJECT_API_KEY || "";
// export const POSTHOG_HOST = process.env.POSTHOG_HOST || "https://app.posthog.com";