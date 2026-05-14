# HRIS Kiosk - Session Change Summary (2026-05-14)

This document summarizes the updates made to the HRIS Kiosk application during this session, focusing on orientation stability, scanning performance, and location features.

## 1. Orientation & Camera Stability
- **Global Unlock**: Modified `AndroidManifest.xml` and `App.tsx` to allow dynamic screen rotation (Portrait/Landscape).
- **Landscape Fix**: Corrected the front-camera orientation in landscape mode within `FaceScanView.tsx` by setting `orientationSource="device"`.

## 2. Liveness Check Feature
- **Toggle Added**: Introduced a "Liveness Check" switch in the Kiosk Settings.
- **Bypass Logic**: When disabled, the app skips the on-device ML face detection (blink check) and proceeds directly to Face++ verification.
- **Optimization**: Disabling liveness skips the 600ms delay between photos and the capture of the second "liveness" photo, making the process much faster.
- **Bug Fix**: Resolved a `ReferenceError` related to the liveness setting key.

## 3. Scanning Speed & Automation
- **Touchless Automation**: Added a background trigger that automatically captures the face once the countdown finishes, even if liveness detection is disabled.
- **Optimized Delays**: 
    - Reduced transition time from QR verification to Face Scan.
    - Set final success modals to automatically close after 2 seconds.
- **Mode-Specific Countdown**:
    - **Touchless Mode**: Maintains a 3-second countdown to allow for hands-free preparation.
    - **Touch Mode**: Skips the countdown entirely for immediate manual scanning.

## 4. UI & Modal Enhancements
- **Compact Modals**: Redesigned `ResultModal` to be smaller and more centered, providing a cleaner "popup" feel.
- **Simplified Messaging**: Updated success titles to a direct "Clock In Success" or "Clock Out Success."
- **Context-Aware Hints**: Modified modal descriptions to provide accurate instructions based on whether Touchless Mode is active or inactive.

## 5. Location Services
- **Startup Permission**: The app now requests location permissions immediately upon launch in `App.tsx`.
- **Auto-Sync**: The "Sync Location" feature in settings now automatically attempts to capture and save the kiosk's coordinates if they are missing.
- **Address Display**: Rearranged the location row to prioritize the human-readable address at the top, followed by GPS coordinates.

---
*Summary generated on 2026-05-14.*
