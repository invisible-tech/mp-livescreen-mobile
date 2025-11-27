# MP Live Screen

A React Native app for real-time screen broadcasting and recording, similar to Zoom's screen sharing functionality.

## Features

- 📱 **System-wide Screen Capture** - Capture any app on your device (like Zoom)
- 🎬 **Real-time Streaming** - Stream video chunks to your backend in real-time
- 🎙️ **Microphone Audio** - Record microphone audio along with screen
- ⏱️ **Recording Timer** - Track recording duration
- 🌓 **Dark/Light Theme** - System theme support with manual toggle
- 📊 **Status Indicators** - Clear visual feedback for recording status

## Tech Stack

- **React Native** 0.82.1 (New Architecture)
- **TypeScript** (Strict mode)
- **React Navigation** 7.x
- **ReplayKit** (iOS Broadcast Extension)
- **MediaProjection** (Android)

## Project Structure

```
MPLiveScreen/
├── android/                      # Android native code
│   └── app/src/main/java/com/mplivescreen/
│       └── screencapture/        # Screen capture native module
├── ios/                          # iOS native code
│   ├── MPLiveScreen/             # Main app
│   └── BroadcastExtension/       # ReplayKit broadcast extension
├── src/
│   ├── api/                      # Network layer (Axios)
│   ├── assets/                   # Images, fonts
│   ├── components/               # Reusable UI components
│   │   ├── Button/
│   │   ├── Text/
│   │   ├── Timer/
│   │   ├── StatusIndicator/
│   │   ├── Container/
│   │   └── BroadcastPicker/
│   ├── config/                   # App configuration
│   ├── context/                  # React Context (Theme)
│   ├── hooks/                    # Custom hooks
│   ├── native/                   # Native module bridges
│   ├── navigation/               # React Navigation setup
│   ├── screens/                  # App screens
│   │   ├── Home/
│   │   ├── Settings/
│   │   └── Splash/
│   ├── theme/                    # Theme system
│   ├── types/                    # TypeScript types
│   └── utils/                    # Utility functions
└── package.json
```

## Prerequisites

- Node.js >= 20
- Xcode 15+ (for iOS)
- Android Studio with SDK 33+ (for Android)
- CocoaPods
- Apple Developer Account (for iOS broadcast extension testing)

## Setup

### 1. Clone and Install Dependencies

```bash
cd MPLiveScreen
npm install
```

### 2. iOS Setup

```bash
cd ios
pod install
cd ..
```

#### Configure Broadcast Extension in Xcode

1. Open `ios/MPLiveScreen.xcworkspace` in Xcode
2. Add a new target: File → New → Target → Broadcast Upload Extension
3. Name it `BroadcastExtension`
4. Set Bundle Identifier to `com.marketplace.live.screen.broadcast`
5. Add App Group capability to both main app and extension:
   - Group ID: `group.com.marketplace.live.screen`
6. Copy the Swift files from `ios/BroadcastExtension/` to your new target

### 3. Android Setup

No additional setup required. The native module is included in the project.

### 4. Environment Configuration

Copy the appropriate `.env` file:

```bash
# For development
cp .env.dev .env

# For staging
cp .env.staging .env

# For production
cp .env.prod .env
```

## Running the App

### iOS

```bash
# Development
npm run ios:dev

# Staging
npm run ios:staging

# Production
npm run ios:prod
```

### Android

```bash
# Development
npm run android:dev

# Staging
npm run android:staging

# Production
npm run android:prod
```

## API Endpoints

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for backend API specifications.

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `API_BASE_URL` | Backend API base URL | `https://vdi-dev.invsta.systems` |
| `API_KEY` | X-API-Key for authentication | `your-api-key` |
| `APP_ENV` | Environment name | `dev` / `staging` / `prod` |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run ios` | Run iOS app |
| `npm run android` | Run Android app |
| `npm run start` | Start Metro bundler |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run format` | Format code with Prettier |
| `npm run type-check` | Run TypeScript type check |
| `npm run clean` | Clean and reinstall dependencies |
| `npm run pods` | Install iOS CocoaPods |

## Known Limitations

### iOS
- **System Audio**: iOS restricts capturing audio from other apps due to privacy. The app captures microphone audio but not audio from other apps (like Gemini's voice responses).
- **Broadcast Extension Memory**: The extension has a 50MB memory limit. Video encoding must be efficient.

### Android
- **Android 10+**: System audio capture requires Android 10 or higher.
- **Foreground Service**: A persistent notification is shown during recording (required by Android).

## Architecture

### Screen Capture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        User Taps Start                       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────┐
│         iOS             │     │          Android            │
│  RPSystemBroadcastPicker│     │    MediaProjection API      │
│  → Broadcast Extension  │     │    → Foreground Service     │
└─────────────────────────┘     └─────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Capture Screen Frames                     │
│                   (1080p @ 60fps target)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Every 5 Seconds: Encode & Upload          │
│                   POST /api/v1/recordings/{id}/chunk        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend Server                         │
│              Receives chunks → Assembles MP4                │
└─────────────────────────────────────────────────────────────┘
```

## Contributing

1. Follow the existing code style (ESLint + Prettier)
2. Use TypeScript strict mode
3. Write meaningful commit messages
4. Test on both iOS and Android before submitting PR

## License

Proprietary - Invisible Technologies

---

Made with ❤️ by Invisible Technologies
