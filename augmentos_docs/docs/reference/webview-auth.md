---
sidebar_position: 8
title: Webview Authentication
---

# Webview Authentication

AugmentOS provides a secure and straightforward mechanism for third-party web applications loaded within the AugmentOS manager application's webview to identify the current user. This enables personalized experiences without requiring users to log in separately to your service.

## Overview

When a user opens your web application through the AugmentOS manager app, the system automatically appends a temporary authentication token to your URL. Your application can exchange this token for the user's ID, allowing you to provide a personalized experience.

## How to Include a Webview in Your App

To include a webview in your TPA, you need to specify a webview URL in your app's configuration. This can be done through the AugmentOS Developer Console.

### Setting Up Your Webview URL

1. Log in to the [AugmentOS Developer Console](https://console.augmentos.org/tpas/)
2. Navigate to your TPA's settings
3. Add your `Webview URL`
4. Save your changes

# Implementation Options

You can implement webview authentication in two ways:

1. **Using the AugmentOS SDK** (recommended): Automatic handling with minimal configuration
2. **Manual implementation**: Direct API integration if you're not using the SDK, or if your webview server is seperate from the server running the SDK

## Using the AugmentOS SDK

The AugmentOS SDK provides built-in middleware that automatically handles the token exchange process.

### Setup

1. Configure the `TpaServer` with authentication middleware:

```typescript
import { TpaServer, AuthenticatedRequest } from '@augmentos/sdk';

const server = new TpaServer({
  packageName: 'org.example.myapp',
  apiKey: 'your-api-key' // load from .env, never check it into source control
});

// The SDK automatically sets up the authentication middleware
```

2. Access the authenticated user ID in your route handlers:

```typescript
const app = server.getExpressApp();

app.get('/webview', (req: AuthenticatedRequest, res) => {
  const userId = req.authUserId;

  if (userId) {
    // User is authenticated, show personalized content
    res.send(`Welcome user ${userId}!`);
  } else {
    // User is not authenticated
    res.send('Please open this page from the AugmentOS app');
  }
});
```

## Manual Implementation (Browser-Only React with No Backend)

If you're building a webview app that runs entirely in the browser (e.g., React, Vue, etc.), you can securely verify the AugmentOS user token without any backend. This approach uses the [`jose`](https://github.com/panva/jose) library to verify the JWT against AugmentOS's public keys, stores the token in `localStorage`, and exposes the user ID to your app.

### Implementation Example

- First launch → URL contains `aos_signed_user_token` → verify → store in `localStorage`.
- Subsequent reloads (when AugmentOS doesn't re-attach the token) → helper falls back to the stored copy.
- If verification ever fails (`jwtVerify` throws), the stored token is ignored and the app shows an error until a fresh token arrives.

#### 1. Install the dependency

```bash
bun add jose      # or: npm i jose
```

---

#### 2. Token helper – `src/lib/aosAuth.ts`

```ts
import { jwtVerify, createLocalJWKSet } from 'jose';

const JWKS_URI = 'https://prod.augmentos.cloud/.well-known/jwks.json';
const jwks = createLocalJWKSet(new URL(JWKS_URI));

const STORAGE_KEY = 'aos_signed_user_token';

/**
 * Returns a verified AugmentOS JWT (string) and its user-id (sub).
 * Order of precedence:
 *   1. token in ?aos_signed_user_token=… query param
 *   2. token in localStorage
 * Throws if neither is valid.
 */
export async function getVerifiedAosToken(): Promise<{ token: string; userId: string }> {
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('aos_signed_user_token');

  // Use the URL token if present, else fall back to localStorage
  const token = queryToken ?? localStorage.getItem(STORAGE_KEY);
  if (!token) throw new Error('No AugmentOS token found.');

  const { payload } = await jwtVerify(token, jwks, {
    issuer  : 'https://prod.augmentos.cloud',
    audience: window.location.origin,
    clockTolerance: '2 min',
  });

  // Persist the freshest valid token
  if (queryToken) localStorage.setItem(STORAGE_KEY, queryToken);

  return { token, userId: payload.sub as string };
}

/** One-liner to sign the user out */
export function clearAosToken() {
  localStorage.removeItem(STORAGE_KEY);
}
```

---

#### 3. Use it in your React app (e.g., `src/App.tsx`)

```tsx
import { useEffect, useState } from 'react';
import { getVerifiedAosToken, clearAosToken } from './lib/aosAuth';

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    getVerifiedAosToken()
      .then(({ userId }) => setUserId(userId))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return (
    <div className="p-4 text-red-600">
      🔒 {error}
      <button onClick={clearAosToken} className="ml-2 underline">
        Reset token
      </button>
    </div>
  );

  if (!userId) return <div className="p-4">No AugmentOS user token found, show the logged-out view or verify the user through other means</div>;

  /* Token is valid */
  return (
    <main className="p-4">
      <h1 className="text-xl font-bold">Welcome, AugmentOS user {userId}!</h1>
      {/* …your UI… */}
    </main>
  );
}
```

### JWKS Public Key

The public JWKS endpoint for AugmentOS is:

```
https://prod.augmentos.cloud/.well-known/jwks.json
```

You do **not** need to fetch or manage keys manually—the `jose` library handles this for you.

However if you wish to include the public key directly, it is:

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA5iUkngqc3LhFDcPi94q1PWcjXY9oj6fzATqiRKDtR8M=
-----END PUBLIC KEY-----
```

### Security Considerations

Always validate the token against the public key!  If you don't validate the token, it may be possible for a malicious actor to send a forged token and access another user's account.

# Next Steps

After authenticating the user, you can:

1. Create or look up the user in your own database
2. Establish a standard web session (e.g., using cookies)
3. Provide personalized content based on the user's identity
4. Link user actions with their AugmentOS identity