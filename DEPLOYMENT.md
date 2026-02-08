# Frogwatch+ Deployment Guide

This guide covers deploying Frogwatch+ to Google Play Store and Apple App Store.

## Prerequisites

1. **EAS CLI**: Install Expo Application Services CLI
   ```bash
   npm install -g eas-cli
   eas login
   ```

2. **App Store Accounts**:
   - Apple Developer Account ($99/year) - https://developer.apple.com
   - Google Play Developer Account ($25 one-time) - https://play.google.com/console

3. **Environment Variables**: Copy `.env.example` to `.env` and fill in values

## Initial Setup

### 1. Configure EAS Project

```bash
# Link your project to EAS
eas init

# This will:
# - Create/link an EAS project
# - Update app.json with your projectId
```

### 2. Update Configuration Files

**app.json** - Update these placeholders:
- `expo.extra.eas.projectId`: Your EAS project ID
- `expo.updates.url`: Your EAS updates URL
- `expo.owner`: Your Expo account username

**eas.json** - Update for App Store submission:
- `submit.production.ios.appleId`: Your Apple ID email
- `submit.production.ios.ascAppId`: App Store Connect App ID
- `submit.production.ios.appleTeamId`: Your Apple Team ID
- `submit.production.android.serviceAccountKeyPath`: Path to Google service account JSON

### 3. Set Up Environment Variables with EAS Secrets

```bash
# Set Firebase credentials as EAS secrets
eas secret:create --name EXPO_PUBLIC_FIREBASE_API_KEY --value "your-api-key"
eas secret:create --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "your-domain"
eas secret:create --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "your-project-id"
eas secret:create --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "your-bucket"
eas secret:create --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "your-sender-id"
eas secret:create --name EXPO_PUBLIC_FIREBASE_APP_ID --value "your-app-id"
eas secret:create --name EXPO_PUBLIC_API_BASE_URL --value "https://your-api.run.app"
```

## Building for Production

### Android Build (AAB for Play Store)

```bash
# Build Android App Bundle
eas build --platform android --profile production

# Or build APK for testing
eas build --platform android --profile preview
```

### iOS Build

```bash
# Build for App Store
eas build --platform ios --profile production

# Build for TestFlight testing
eas build --platform ios --profile preview
```

### Build Both Platforms

```bash
eas build --platform all --profile production
```

## Submitting to Stores

### Google Play Store

1. **First-time setup**:
   - Create app in Google Play Console
   - Set up app signing (let Google manage or upload your keystore)
   - Complete store listing (description, screenshots, etc.)

2. **Create Service Account**:
   - Go to Google Cloud Console > IAM & Admin > Service Accounts
   - Create service account with "Service Account User" role
   - Download JSON key file
   - In Play Console, grant access to this service account

3. **Submit**:
   ```bash
   eas submit --platform android --profile production
   ```

### Apple App Store

1. **First-time setup**:
   - Create app in App Store Connect
   - Set up certificates and provisioning profiles (EAS handles this automatically)
   - Complete app information

2. **Submit**:
   ```bash
   eas submit --platform ios --profile production
   ```

## Required Store Assets

### App Store (iOS)

- **Screenshots**: 6.5" (1284x2778), 5.5" (1242x2208)
- **App Icon**: 1024x1024 PNG (no alpha channel)
- **Privacy Policy URL**: Required
- **App Description**: Up to 4000 characters
- **Keywords**: Up to 100 characters
- **Support URL**: Required

### Google Play Store (Android)

- **Screenshots**: At least 2, up to 8 per device type
- **Feature Graphic**: 1024x500 PNG or JPEG
- **App Icon**: 512x512 PNG
- **Privacy Policy URL**: Required
- **Short Description**: Up to 80 characters
- **Full Description**: Up to 4000 characters

## Privacy Policy Requirements

Your privacy policy must disclose:
- Data collected (location, audio recordings, user profiles)
- How data is used (frog species identification, scientific research)
- Third-party services (Firebase, Google Cloud)
- Data retention policies
- User rights (data deletion, access)

## Version Management

```bash
# Increment version for new release
# In app.json, update:
# - "version" for display version (e.g., "1.1.0")
# - iOS "buildNumber" and Android "versionCode" auto-increment with EAS

# EAS handles version auto-increment when you use:
# eas.json -> build.production.autoIncrement: true
```

## Over-the-Air Updates

For minor bug fixes (no native code changes):

```bash
# Publish an update
eas update --branch production --message "Bug fix description"
```

## Monitoring & Analytics

### Recommended Setup

1. **Firebase Crashlytics** - Crash reporting
2. **Firebase Analytics** - User analytics
3. **Sentry** - Error tracking (optional, see services/logger.ts)

### Enable in app.json

```json
{
  "expo": {
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/crashlytics"
    ]
  }
}
```

## Troubleshooting

### Build Failures

```bash
# Clear EAS cache and rebuild
eas build --clear-cache --platform [android|ios]
```

### Credentials Issues

```bash
# Regenerate credentials
eas credentials --platform [android|ios]
```

### Common Issues

1. **"Bundle identifier already in use"**: Another app uses this ID. Change `bundleIdentifier` in app.json.

2. **"Provisioning profile not found"**: Run `eas credentials` to set up iOS credentials.

3. **"Keystore mismatch"**: You're using a different keystore than previous builds. Use `eas credentials` to manage.

## Security Checklist Before Release

- [ ] Firebase API keys are NOT in source control (use EAS secrets)
- [ ] Dev credentials removed from code
- [ ] Console.log statements are stripped in production
- [ ] Role self-assignment is disabled in registration
- [ ] Privacy policy is published and linked
- [ ] Terms of service are published
- [ ] Firebase security rules are properly configured
- [ ] Backend API has proper authentication

## Support

For issues with:
- **EAS/Expo**: https://docs.expo.dev
- **Firebase**: https://firebase.google.com/docs
- **App Store**: https://developer.apple.com/support
- **Play Store**: https://support.google.com/googleplay/android-developer
