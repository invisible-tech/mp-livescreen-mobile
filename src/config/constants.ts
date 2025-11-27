import Config from 'react-native-config';

// API Configuration
export const API_CONFIG = {
  BASE_URL: Config.API_BASE_URL || 'https://vdi-dev.invsta.systems',
  API_KEY: Config.API_KEY || '',
  TIMEOUT: 30000,
  CHUNK_TIMEOUT: 60000,
};

// Recording Configuration
export const RECORDING_CONFIG = {
  VIDEO_QUALITY: '1080p' as const,
  FRAME_RATE: 60 as const,
  CHUNK_DURATION_MS: 5000, // 5 seconds
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  BUFFER_MAX_CHUNKS: 6, // 30 seconds buffer
};

// App Configuration
export const APP_CONFIG = {
  ENV: Config.APP_ENV || 'dev',
  APP_NAME: 'MP Live Screen',
  VERSION: '1.0.0',
  BUNDLE_ID: 'com.marketplace.livescreen',
};

// API Endpoints
export const API_ENDPOINTS = {
  RECORDINGS: {
    START: '/api/v1/recordings/start',
    CHUNK: (recordingId: string) => `/api/v1/recordings/${recordingId}/chunk`,
    END: (recordingId: string) => `/api/v1/recordings/${recordingId}/end`,
  },
};

// Storage Keys
export const STORAGE_KEYS = {
  THEME_MODE: '@mp_live_screen/theme_mode',
  VIDEO_QUALITY: '@mp_live_screen/video_quality',
  FRAME_RATE: '@mp_live_screen/frame_rate',
  RTMP_URL: '@mp_live_screen/rtmp_url',
};

// Platform specific
export const PLATFORM_CONFIG = {
  IOS: {
    MIN_VERSION: '17.0',
    BROADCAST_EXTENSION_BUNDLE_ID: 'com.marketplace.livescreen.broadcast',
  },
  ANDROID: {
    MIN_SDK: 33,
    TARGET_SDK: 34,
    FOREGROUND_SERVICE_NOTIFICATION_ID: 1001,
  },
};

