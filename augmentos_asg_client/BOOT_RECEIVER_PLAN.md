# ASG Client Boot Receiver Implementation Plan

## Overview
This document outlines the implementation plan for adding autostart-on-boot capability to the ASG Client application. Due to Android restrictions on starting foreground services from broadcast receivers, we'll use a multi-step approach.

## Core Components

1. **Boot Receiver**
   - BroadcastReceiver that triggers on device boot
   - Located in the augmentos_asg_client package
   - Launches a transparent activity

2. **Transparent Activity**
   - Minimal activity with no UI
   - Sole purpose is to start the foreground service
   - Self-terminates after service launch

3. **AsgClientService**
   - Existing foreground service
   - Handles main application functionality

## Implementation Steps

### 1. Remove Boot Receiver from augmentos_core
- Remove any existing boot receiver implementation
- Remove related manifest entries

### 2. Implement Boot Receiver in augmentos_asg_client
- Create `AsgClientBootReceiver.java` class
- Register in AndroidManifest.xml with required permission:
  ```xml
  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
  ```
- Configure intent filters:
  ```xml
  <receiver android:name=".AsgClientBootReceiver" android:exported="true">
      <intent-filter>
          <action android:name="android.intent.action.BOOT_COMPLETED" />
          <action android:name="android.intent.action.QUICKBOOT_POWERON" />
      </intent-filter>
  </receiver>
  ```

### 3. Create Transparent Activity
- Implement `BootstrapActivity.java`
- Configure in AndroidManifest.xml with transparent theme
- Not shown in launcher/recents
- Will start service and self-terminate

### 4. Boot Process Flow
```
Device Boot → Boot Receiver → Start Transparent Activity → Start AsgClientService → Activity finishes
```

### 5. Modify AsgClientService (if needed)
- Review and ensure it properly runs as foreground service
- Add any necessary startup optimizations

## Additional Considerations
- Handle different Android API versions appropriately
- Test on multiple devices/Android versions
- Consider performance implications at boot time
- Implement error handling for each step
- Add logging for troubleshooting

## Testing Plan
- Test boot behavior on actual device
- Test with various power states
- Validate service stays running after activity termination