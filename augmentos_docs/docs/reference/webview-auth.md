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

### React/Vite Implementation Example

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
 * Returns a verified AugmentOS JWT (string), its user-id (sub), and frontend token.
 * Order of precedence:
 *   1. token in ?aos_signed_user_token=… query param
 *   2. token in localStorage
 * Throws if neither is valid.
 */
export async function getVerifiedAosToken(): Promise<{ token: string; userId: string; frontendToken: string }> {
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

  // Extract userId and frontendToken from the payload
  const userId = payload.sub as string;
  const frontendToken = payload.frontendToken as string;

  return { token, userId, frontendToken };
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
  const [frontendToken, setFrontendToken] = useState<string | null>(null);
  const [error,  setError]  = useState<string | null>(null);

  useEffect(() => {
    getVerifiedAosToken()
      .then(({ userId, frontendToken }) => {
        setUserId(userId);
        setFrontendToken(frontendToken);
      })
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
      <p className="mt-2 text-sm text-gray-600">Frontend token: {frontendToken}</p>
      <p className="mt-1 text-xs text-gray-500">
        This frontend token can be used to verify requests from your frontend to your backend.
      </p>
      {/* …your UI… */}
    </main>
  );
}
```

#### 4. Calling Your Backend with the Frontend Token

You can send the `frontendToken` to your backend as a standard `Authorization` header (recommended) to authenticate/identify the user. For example, using `fetch`:

```ts
// Assume you have already called getVerifiedAosToken()
const { frontendToken } = await getVerifiedAosToken();

const response = await fetch(
  'https://example-tpa-server.org/some-endpoint',
  {
    method: 'GET', // or 'POST', etc.
    headers: {
      'Authorization': `Bearer ${frontendToken}`,
      // Add other headers as needed
    },
    // Optionally, include credentials or other fetch options
  }
);

const data = await response.json();
console.log('Backend response:', data);
```

### Plain Static HTML and Javascript Implementation Example

Here's an example using plain HTML and JavaScript that can be served from any static web server:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AugmentOS Webview App</title>
    <script type="module">
        import * as jose from 'https://cdn.jsdelivr.net/npm/jose@5/+esm';

        const JWKS_URI = 'https://prod.augmentos.cloud/.well-known/jwks.json';
        const STORAGE_KEY = 'aos_signed_user_token';

        async function verifyAosToken() {
            const params = new URLSearchParams(window.location.search);
            const queryToken = params.get('aos_signed_user_token');

            // Use URL token if present, else fall back to localStorage
            const token = queryToken || localStorage.getItem(STORAGE_KEY);
            if (!token) throw new Error('No AugmentOS token found');

            // Verify the token
            const jwks = jose.createLocalJWKSet(new URL(JWKS_URI));
            const { payload } = await jose.jwtVerify(token, jwks, {
                issuer: 'https://prod.augmentos.cloud',
                audience: window.location.origin,
                clockTolerance: '2 min',
            });

            // Store valid token
            if (queryToken) localStorage.setItem(STORAGE_KEY, queryToken);

            return {
                userId: payload.sub,
                frontendToken: payload.frontendToken
            };
        }

        let currentFrontendToken = null;

        // Call backend with frontend token
        async function callBackend() {
            if (!currentFrontendToken) return;

            const response = await fetch('https://example-tpa-server.org/some-endpoint', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${currentFrontendToken}`,
                }
            });

            const data = await response.json();
            document.getElementById('backendResult').textContent = JSON.stringify(data, null, 2);
        }

        // Initialize on page load
        window.addEventListener('DOMContentLoaded', async () => {
            const messageEl = document.getElementById('message');
            const userInfoEl = document.getElementById('userInfo');

            try {
                const { userId, frontendToken } = await verifyAosToken();
                currentFrontendToken = frontendToken;

                messageEl.textContent = `Welcome, AugmentOS user ${userId}!`;
                userInfoEl.innerHTML = `
                    <p>Frontend token: <code>${frontendToken}</code></p>
                    <button onclick="callBackend()">Call Backend</button>
                    <pre id="backendResult"></pre>
                `;
            } catch (error) {
                messageEl.textContent = `Error: ${error.message}`;
                messageEl.style.color = 'red';
            }
        });
    </script>
</head>
<body>
    <h1>AugmentOS Webview App</h1>
    <div id="message">Loading...</div>
    <div id="userInfo"></div>
</body>
</html>
```

This example:
- Loads the jose library from CDN as an ES module
- Verifies the token from the URL or localStorage
- Displays the user ID and frontend token
- Shows an error if verification fails

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