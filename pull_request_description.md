# Pull Request Description

## Title
`fix & perf: optimize attendance flow, fix location hang, improve error modals, and update docs`

---

## Overview
This PR addresses UI freeze issues during scanning, refines the error modal feedback loop for business logic failures (like forgetting to clock out yesterday), updates the backend response text, corrects compilation issues, and updates project documentation.

---

## Detailed Changes

### 1. Kiosk Attendance Scan Flow & Performance
- **Fixed UI Hangs**: Removed the blocking live location pre-fetch fallback in `useAttendance.ts`. Kiosk transaction requests now rely on the pre-fetched cached location, preventing screen freezes when location services are slow or disabled.
- **Improved Error Handling**: Modified `useAttendance.ts` to explicitly catch `4xx` network response status codes (e.g. `400 Bad Request`). Business logic rejections from the server are now displayed immediately to the user via a red error modal rather than silently falling back to the offline queue.

### 2. Backend DTR Updates
- **Clarity in Messages**: Updated the `INTERN-MANAGEMENT-SYSTEM` API (`api/record_intern_attendance.php`) to return:
  > `"You forgot to clock out yesterday. Please communicate with HR to fix it."`
  instead of prompting the user to click Clock In today when attempting to clock out with a missing yesterday session.

### 3. Syntax & Type Fixes
- **useAttendance Syntax & Compilation**: Restored the missing closing brace `}` for the `if (!isActuallyOffline)` block. Fixed TypeScript compilation errors by replacing the invalid `'error'` state with `'idle'` and removing the undefined `playErrorSound()` call.

### 4. Documentation Revamp
- **Landscape constraint**: Noted that the Kiosk currently operates in landscape mode only.
- **Setup & Runner Guides**: Restructured the kiosk `README.md` to include automated setup commands for Node, PHP, Python venv, running scripts, and dual-model configurations.
