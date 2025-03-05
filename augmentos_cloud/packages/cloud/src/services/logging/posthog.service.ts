// posthog.service.ts
import { PostHog } from 'posthog-node';
import { POSTHOG_PROJECT_API_KEY, POSTHOG_HOST } from '@augmentos/config';

// Initialize PostHog client if API key is provided
let posthogClient: PostHog | null = null;
if (POSTHOG_PROJECT_API_KEY) {
  posthogClient = new PostHog(POSTHOG_PROJECT_API_KEY, { host: POSTHOG_HOST });
} else {
  console.warn('PostHog API key not provided. Analytics will be disabled.');
}

// Interface for event properties for type safety.
interface EventProperties {
  [key: string]: any;
}

/**
 * Track an event in PostHog.
 * @param eventName - Name of the event to capture.
 * @param userId - User ID or distinct session ID (if available).
 * @param properties - Additional metadata to attach to the event.
 */
async function trackEvent(
  eventName: string,
  userId?: string,
  properties: EventProperties = {}
): Promise<void> {
  // Only proceed if PostHog is initialized
  if (!posthogClient) return;
  try {
    posthogClient.capture({
      distinctId: userId || properties.sessionId || 'anonymous',  // use provided user ID or fallback
      event: eventName,
      properties: {
        ...properties,
        timestamp: properties.timestamp || new Date().toISOString()
      }
    });
  } catch (err) {
    // Log any errors to avoid failing the main application flow
    console.error('PostHog tracking error:', err);
  }
}

export const PosthogService = {
  trackEvent
}