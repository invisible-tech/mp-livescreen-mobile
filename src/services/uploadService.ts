/**
 * Upload Service
 * Handles video chunk uploads to the backend
 */

import { API_CONFIG, API_ENDPOINTS } from '@/config';

export interface ChunkUploadParams {
  tenantId: string;
  campaignId: string;
  taskId: string;
  stepId: string;
  recordingId: string;
  chunkIndex: number;
  isFinal: boolean;
  appType?: 'gemini' | 'chatgpt';
  osType?: 'ios' | 'android';
  taskType?: 'audio-video' | 'audio';
}

export interface ChunkUploadResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Upload a video chunk to the backend
 * @param videoUri - Local file URI of the video chunk
 * @param params - Metadata for the chunk
 * @returns Upload result
 */
export const uploadVideoChunk = async (
  videoUri: string,
  params: ChunkUploadParams
): Promise<ChunkUploadResult> => {
  const {
    tenantId,
    campaignId,
    taskId,
    stepId,
    recordingId,
    chunkIndex,
    isFinal,
    appType,
    osType,
    taskType,
  } = params;

  const formData = new FormData();

  // Append the video file
  formData.append('file', {
    uri: videoUri,
    type: 'video/mp4',
    name: `chunk_${chunkIndex}.mp4`,
  } as any);

  // Append metadata
  formData.append('tenant_id', tenantId);
  formData.append('campaign_id', campaignId);
  formData.append('task_id', taskId);
  formData.append('step_id', stepId);
  formData.append('recording_id', recordingId);
  formData.append('chunk_index', String(chunkIndex));
  formData.append('is_final', String(isFinal));
  
  // Add app type and platform info
  if (appType) {
    formData.append('app_type', appType);
  }
  if (osType) {
    formData.append('os_type', osType);
  }
  // Add task type (default to 'audio-video' if not provided)
  formData.append('task_type', taskType || 'audio-video');

  const url = `${API_CONFIG.BASE_URL}${API_ENDPOINTS.UPLOAD_MOBILE_CONTENT}`;
  
  console.log(`[UploadService] Uploading chunk ${chunkIndex} to ${url}`);
  console.log(`[UploadService] Recording ID: ${recordingId}, Final: ${isFinal}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[UploadService] Upload failed with status ${response.status}: ${errorText}`);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    console.log(`[UploadService] Chunk ${chunkIndex} uploaded successfully:`, result);
    
    return {
      success: true,
      message: result.message || 'Upload successful',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[UploadService] Upload failed:`, error);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Generate a unique recording ID
 * @returns UUID string
 */
export const generateRecordingId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default {
  uploadVideoChunk,
  generateRecordingId,
};

