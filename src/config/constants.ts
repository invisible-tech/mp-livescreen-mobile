import Config from 'react-native-config';

// Server Environment Types
export type ServerEnvironment = 'production' | 'staging' | 'dev' | 'crdev' | 'ali' | 'abdul';

// Server Environment Configuration
export const SERVER_ENVIRONMENTS: Record<ServerEnvironment, { apiBaseUrl: string; marketplaceUrl: string; label: string }> = {
  production: {
    apiBaseUrl: 'https://vdi.inv.tech',
    marketplaceUrl: 'https://marketplace.inv.tech',
    label: 'Production',
  },
  staging: {
    apiBaseUrl: 'https://vdi-voice-demo.invsta.systems',
    marketplaceUrl: 'https://marketplace.invsta.systems',
    label: 'Staging',
  },
  dev: {
    apiBaseUrl: 'https://vdi-dev.invsta.systems',
    marketplaceUrl: 'https://marketplace.qa.invsta.systems',
    label: 'Dev',
  },
  crdev: {
    apiBaseUrl: 'https://google-live-api-92706583345.us-central1.run.app',
    marketplaceUrl: 'https://marketplace.qa.invsta.systems',
    label: 'CR Dev',
  },
  ali: {
    apiBaseUrl: 'https://vdi-dev-ali.invsta.systems',
    marketplaceUrl: 'https://marketplace.qa.invsta.systems',
    label: 'Ali (Dev)',
  },
  abdul: {
    apiBaseUrl: 'https://vdi-dev-abdul.invsta.systems',
    marketplaceUrl: 'https://marketplace.qa.invsta.systems',
    label: 'Dev - Abdul',
  },
};

// Default server environment
export const DEFAULT_SERVER_ENV: ServerEnvironment = 'dev';

// API Configuration
export const API_CONFIG = {
  BASE_URL: Config.API_BASE_URL || SERVER_ENVIRONMENTS[DEFAULT_SERVER_ENV].apiBaseUrl,
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
  APP_NAME: 'MP LiveCapture',
  VERSION: '0.9.0',
  BUNDLE_ID: 'com.marketplace.live.screen',
};

// Upload Status Polling Configuration
export const UPLOAD_STATUS_CONFIG = {
  POLLING_INTERVAL_MS: 3000, // Poll every 3 seconds
  MAX_POLLING_DURATION_MS: 120000, // Max 2 minutes polling
};

// API Endpoints
export const API_ENDPOINTS = {
  UPLOAD_MOBILE_CONTENT: '/api/upload-mobile-content',
  MERGED_FILE_STATUS: (taskId: string) => `/api/merged-mobile-file-status/${taskId}`,
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
  SERVER_ENV: '@mp_live_screen/server_env',
};

// Platform specific
export const PLATFORM_CONFIG = {
  IOS: {
    MIN_VERSION: '17.0',
    BROADCAST_EXTENSION_BUNDLE_ID: 'com.marketplace.live.screen.broadcast',
  },
  ANDROID: {
    MIN_SDK: 33,
    TARGET_SDK: 34,
    FOREGROUND_SERVICE_NOTIFICATION_ID: 1001,
  },
};

