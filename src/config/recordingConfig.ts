/**
 * Recording Configuration
 * 
 * These settings control video recording behavior.
 * The iOS Broadcast Extension reads these from App Group.
 */

export const RECORDING_SETTINGS = {
  /**
   * Duration of each video chunk in seconds
   * Lower = more frequent uploads, smaller files
   * Higher = less frequent uploads, larger files
   * Recommended: 5-15 seconds
   */
  CHUNK_DURATION_SECONDS: 5,

  /**
   * Video encoding settings
   */
  VIDEO: {
    WIDTH: 1080,
    HEIGHT: 1920,
    BITRATE: 6000000, // 6 Mbps
    KEYFRAME_INTERVAL: 60,
  },

  /**
   * Audio encoding settings
   */
  AUDIO: {
    SAMPLE_RATE: 44100,
    CHANNELS: 2,
    BITRATE: 128000, // 128 kbps
  },

  /**
   * Upload settings
   */
  UPLOAD: {
    TIMEOUT_SECONDS: 60,
    MAX_RETRIES: 3,
  },
};

export default RECORDING_SETTINGS;

