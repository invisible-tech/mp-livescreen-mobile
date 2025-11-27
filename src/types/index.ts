// Navigation Types
export type RootStackParamList = {
  MainTabs: undefined;
};

export type MainTabsParamList = {
  Home: undefined;
  Settings: undefined;
};

// Recording Types
export enum RecordingStatus {
  IDLE = 'idle',
  PREPARING = 'preparing',
  RECORDING = 'recording',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export interface RecordingState {
  status: RecordingStatus;
  recordingId: string | null;
  startTime: number | null;
  duration: number;
  error: string | null;
}

export interface ChunkUploadResult {
  success: boolean;
  chunkIndex: number;
  error?: string;
}

export interface RecordingSession {
  recordingId: string;
  uploadUrl?: string;
}

export interface RecordingEndResult {
  success: boolean;
  finalVideoUrl?: string;
  error?: string;
}

// API Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StartRecordingRequest {
  deviceId: string;
  platform: 'ios' | 'android';
  quality: '720p' | '1080p';
  frameRate: 30 | 60;
}

export interface StartRecordingResponse {
  recordingId: string;
  uploadUrl?: string;
}

export interface ChunkUploadRequest {
  recordingId: string;
  chunk: Blob | FormData;
  chunkIndex: number;
  timestamp: number;
  duration: number;
}

export interface EndRecordingRequest {
  recordingId: string;
  totalChunks: number;
  totalDuration: number;
}

export interface EndRecordingResponse {
  success: boolean;
  finalVideoUrl?: string;
}

// Theme Types
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  secondary: string;
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  error: string;
  recording: string;
  white: string;
  black: string;
  transparent: string;
}

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ThemeTypography {
  fontFamily: {
    regular: string;
    medium: string;
    semiBold: string;
    bold: string;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
    xxxl: number;
  };
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
  };
}

export interface ThemeBorderRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
}

export interface Theme {
  colors: ThemeColors;
  spacing: ThemeSpacing;
  typography: ThemeTypography;
  borderRadius: ThemeBorderRadius;
  isDark: boolean;
}

// Settings Types
export interface AppSettings {
  themeMode: ThemeMode;
  videoQuality: '720p' | '1080p';
  frameRate: 30 | 60;
  rtmpUrl?: string;
}

// Native Module Types
export interface ScreenCaptureModule {
  startBroadcast: () => Promise<void>;
  stopBroadcast: () => Promise<void>;
  isRecording: () => Promise<boolean>;
}

export interface ScreenCaptureEvent {
  type: 'started' | 'stopped' | 'error' | 'chunk';
  data?: unknown;
  error?: string;
}

