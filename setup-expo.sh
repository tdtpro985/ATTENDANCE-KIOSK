#!/bin/bash

# =============================================================================
# Expo Development Build Setup Script
# Project: TDT-KIOSK (HRIS-KIOSK)
# Platforms: Android & iOS (Development Build)
# =============================================================================

set -e  # Exit immediately on error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${GREEN}[✔] $1${NC}"; }
warn()   { echo -e "${YELLOW}[⚠] $1${NC}"; }
error()  { echo -e "${RED}[✘] $1${NC}"; exit 1; }
header() { echo -e "\n${BLUE}========== $1 ==========${NC}\n"; }

# =============================================================================
# STEP 0: Verify we're in the right directory
# =============================================================================
header "STEP 0: Checking project directory"

if [ ! -f "package.json" ]; then
  error "No package.json found. Please run this script from your project root (e.g. /var/www/HRIS-KIOSK)"
fi

PROJECT_NAME=$(node -p "require('./package.json').name" 2>/dev/null || echo "unknown")
log "Found project: $PROJECT_NAME"

# =============================================================================
# STEP 1: Install Expo modules into existing project
# =============================================================================
header "STEP 1: Installing Expo modules"

npx install-expo-modules@latest || warn "install-expo-modules had warnings, continuing..."
log "Expo modules installed"

# =============================================================================
# STEP 2: Install expo-dev-client
# =============================================================================
header "STEP 2: Installing expo-dev-client"

npx expo install expo-dev-client
log "expo-dev-client installed"

# =============================================================================
# STEP 3: Install expo-build-properties (if not already installed)
# =============================================================================
header "STEP 3: Installing expo-build-properties"

npx expo install expo-build-properties
log "expo-build-properties installed"

# =============================================================================
# STEP 4: Install expo-asset (if not already installed)
# =============================================================================
header "STEP 4: Installing expo-asset"

npx expo install expo-asset
log "expo-asset installed"

# =============================================================================
# STEP 5: Write app.json
# =============================================================================
header "STEP 5: Writing app.json"

cat > app.json << 'EOF'
{
  "expo": {
    "name": "TDT-KIOSK",
    "slug": "TDT-KIOSK",
    "version": "1.0.0",
    "orientation": "default",
    "icon": "./assets/tdt-logo-new.png",
    "userInterfaceStyle": "light",
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSCameraUsageDescription": "This app needs access to your camera for face recognition."
      },
      "bundleIdentifier": "com.ams.attendanceapp"
    },
    "android": {
      "package": "com.ams.attendanceapp",
      "versionCode": 1,
      "predictiveBackGestureEnabled": false,
      "adaptiveIcon": {
        "foregroundImage": "./assets/tdt-logo-new.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO"
      ]
    },
    "plugins": [
      "expo-dev-client",
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 26
          }
        }
      ],
      [
        "react-native-vision-camera",
        {
          "cameraPermissionText": "This app needs access to your camera for face recognition.",
          "enableCodeScanner": true
        }
      ],
      "expo-asset",
      "./plugins/withOnnxManualLink.js"
    ],
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "6e6c30c9-45a5-4dfb-8f0d-f7d4c34dc999"
      }
    },
    "owner": "dimafelixdj"
  }
}
EOF

log "app.json written"

# =============================================================================
# STEP 6: Write eas.json
# =============================================================================
header "STEP 6: Writing eas.json"

cat > eas.json << 'EOF'
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": false
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "aab"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
EOF

log "eas.json written"

# =============================================================================
# STEP 7: Install EAS CLI globally
# =============================================================================
header "STEP 7: Installing EAS CLI"

if ! command -v eas &> /dev/null; then
  npm install -g eas-cli
  log "EAS CLI installed"
else
  log "EAS CLI already installed: $(eas --version)"
fi

# =============================================================================
# STEP 8: Convert icon to PNG if it's a JPG
# =============================================================================
header "STEP 8: Checking icon format"

if [ -f "./assets/tdt-logo-new.jpg" ] && [ ! -f "./assets/tdt-logo-new.png" ]; then
  warn "Icon is a .jpg file. Expo recommends PNG."
  if command -v convert &> /dev/null; then
    convert ./assets/tdt-logo-new.jpg ./assets/tdt-logo-new.png
    log "Converted tdt-logo-new.jpg → tdt-logo-new.png"
  else
    warn "ImageMagick not found. Please manually convert assets/tdt-logo-new.jpg to .png"
    warn "You can install it with: apt-get install imagemagick"
  fi
elif [ -f "./assets/tdt-logo-new.png" ]; then
  log "Icon PNG already exists"
else
  warn "Icon file not found at ./assets/tdt-logo-new.jpg or .png — make sure it exists before building"
fi

# =============================================================================
# STEP 9: Run npm install to sync everything
# =============================================================================
header "STEP 9: Final npm install"

npm install --legacy-peer-deps
log "Dependencies synced"

# =============================================================================
# STEP 10: EAS Login prompt
# =============================================================================
header "STEP 10: EAS Login"

echo ""
warn "You need to log in to your Expo account (dimafelixdj) to build."
echo -e "${BLUE}Run this command now:${NC}"
echo ""
echo "    eas login"
echo ""
echo -e "${BLUE}Then trigger your development build with:${NC}"
echo ""
echo "    eas build --profile development --platform android"
echo "    eas build --profile development --platform ios"
echo ""
echo -e "${BLUE}Or run locally (requires Android SDK):${NC}"
echo ""
echo "    npx expo run:android"
echo "    npx expo run:ios"
echo ""
echo -e "${BLUE}To start the dev server after installing the build on your device:${NC}"
echo ""
echo "    npx expo start --dev-client"
echo ""

# =============================================================================
# DONE
# =============================================================================
header "SETUP COMPLETE"
log "Expo development build setup finished for TDT-KIOSK!"
echo ""
