---
sidebar_position: 3
---

# 🚧 Build From Scratch

*Last updated: March 31, 2025*

## 🚧 WIP 🚧
These Docs are still under construction 👷🚧, and the code is evolving fast. 
If you have any issues or get stuck, feel free to reach out at team@mentra.glass.

This guide will walk you through creating a simple "Hello, World" AugmentOS app that displays text on the AugmentOS smart glasses. This will introduce you to the basic structure of an app and how to use the SDK.

## Prerequisites

Make sure you have the following installed:

*   **Node.js:** (v18.0.0 or later)
*   **Bun:**  (for installation and running scripts)
*   **A code editor:** (VS Code recommended)

## Part 1: Set Up Your Project

### 1. Create Project Directory

Create a new directory for your app and initialize a Node.js project:

```bash
mkdir my-first-augmentos-app
cd my-first-augmentos-app
bun init -y
```

This will create a package.json file.

### 2. Install the SDK

Install the @augmentos/sdk package:

```bash
bun add @augmentos/sdk
```

### 3. Create Project Structure

Create a file named `index.ts` in the src directory:

```
my-first-augmentos-app/
└── src/
    └── index.ts
```

### 4. Write Your App Code

Add the following code to `index.ts`:

> Note: You'll need to update `PACKAGE_NAME` and `API_KEY` later when you register your app in the [Developer Console](https://console.AugmentOS.org).

```typescript
import { TpaServer, TpaSession } from '@augmentos/sdk';

// Replace with your app's details.  These should match what's
// registered in the (future) AugmentOS app store.
const PACKAGE_NAME = "com.example.myfirstaugmentosapp"; // CHANGE THIS!
const PORT = 3000;  // Choose a port for your app's server.
const API_KEY = 'your_api_key'; // Replace with your API key.

class MyAugmentOSApp extends TpaServer {
    protected async onSession(session: TpaSession, sessionId: string, userId: string): Promise<void> {
        console.log(`New session: ${sessionId} for user ${userId}`);

        // Display "Hello, World!" on the glasses.
        session.layouts.showTextWall("Hello, World!");
        
        // Log when the session is disconnected.
        session.events.onDisconnected(() => {
            console.log(`Session ${sessionId} disconnected.`);
        });
    }
}

// Create and start the app server
const server = new MyAugmentOSApp({
    packageName: PACKAGE_NAME,
    apiKey: API_KEY,
    port: PORT
});

server.start().catch(err => {
    console.error("Failed to start server:", err);
});
```

### 5. Configure TypeScript

Create a tsconfig.json file in the root of your app's project:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "baseUrl": ".",
    "paths": {}
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 6. Set Up Build Scripts

Add build and start scripts to your package.json:

```json
{
  "name": "my-first-augmentos-app",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@augmentos/sdk": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

## Part 2: Run Your App Locally

### 7. Build and Run the App

First, build your app:

```bash
bun run build
```

Then, start the app:

```bash
bun run start
```

Or, for development with automatic reloading:

```bash
bun run dev
```

## Part 3: Connect to AugmentOS

Your app's server is now running locally, but it needs to be connected to AugmentOS.

### 8. Install AugmentOS on Your Phone

Download and install the AugmentOS app from [AugmentOS.org/install](https://AugmentOS.org/install)

### 9. Set Up ngrok

To make your locally running app accessible from the internet:

1. [Install ngrok](https://ngrok.com/docs/getting-started/)
2. Create an ngrok account
3. [Set up a static address/URL in the ngrok dashboard](https://dashboard.ngrok.com/)

* Make sure you run the `ngrok config add-authtoken <your_authtoken>` line.
* Make sure you select `Static Domain`, then generate a static domain.

<center>
  <img width="75%" src="/img/ngrok_guide_1.png"></img>
</center>

### 10. Register Your App

![AugmentOS Console](https://github.com/user-attachments/assets/36192c2b-e1ba-423b-90de-47ff8cd91318)

1. Navigate to [console.AugmentOS.org](https://console.AugmentOS.org/)
2. Click "Sign In" and log in with the same account you're using for AugmentOS
3. Click "Create App"
4. Set a unique package name (e.g., `com.example.myfirstapp`)
5. For "Public URL", enter your ngrok static URL

### 11. Update Your App Configuration

Edit your `index.ts` to match the app you registered:

```typescript
const server = new MyAugmentOSApp({
    packageName: "com.example.myfirstapp", // Must match your packageName in console.AugmentOS.org
    apiKey: 'your_api_key', // Get this from console.AugmentOS.org
    port: 3000, // The port your server runs on
});
```

### 12. Make Your App Accessible

Start your app and then expose it to the internet with ngrok:

```bash
# In one terminal, run your app
bun run start

# In another terminal, expose it with ngrok
ngrok http --url=<YOUR_NGROK_URL_HERE> 3000
```

> Note: The port number (3000) must match the port in your app configuration.

> **IMPORTANT:** After making changes to your app code or restarting your server, you must restart your app inside the AugmentOS phone app.

## What's Next?

Congratulations! You've built your first AugmentOS app. To continue your journey:

### Learn More
- Explore [🚧 Core Concepts](core-concepts) to understand sessions, events, and the app lifecycle
- Dive into [Events](events) to handle user interactions and sensor data
- Master [Layouts](layouts) to create rich visual experiences on smart glasses

### Get Help
- Join our [Discord community](https://discord.gg/5ukNvkEAqT) for support
- Visit [AugmentOS.org](https://augmentos.org) for the latest updates
- Check out the [GitHub repository](https://github.com/AugmentOS-Community/AugmentOS) for examples
- For a more in-depth example with app settings support, see the [Live-Captions repository](https://github.com/AugmentOS-Community/LiveCaptionsOnSmartGlasses)