import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { API_CONFIG, API_ENDPOINTS } from '@/config';
import type {
  ApiResponse,
  StartRecordingRequest,
  StartRecordingResponse,
  EndRecordingRequest,
  EndRecordingResponse,
} from '@/types';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_CONFIG.API_KEY,
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      config => {
        // Log requests in development
        if (__DEV__) {
          console.warn(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        }
        return config;
      },
      error => {
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        if (__DEV__) {
          console.error('[API Error]', error.response?.status, error.message);
        }
        return Promise.reject(error);
      },
    );
  }

  private async request<T>(config: AxiosRequestConfig): Promise<ApiResponse<T>> {
    try {
      const response = await this.client.request<T>(config);
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      return {
        success: false,
        error: axiosError.response?.data?.message || axiosError.message || 'Unknown error',
      };
    }
  }

  // Recording API Methods
  async startRecording(data: StartRecordingRequest): Promise<ApiResponse<StartRecordingResponse>> {
    return this.request<StartRecordingResponse>({
      method: 'POST',
      url: API_ENDPOINTS.RECORDINGS.START,
      data,
    });
  }

  async uploadChunk(
    recordingId: string,
    formData: FormData,
    onProgress?: (progress: number) => void,
  ): Promise<ApiResponse<{ success: boolean; received: number }>> {
    return this.request<{ success: boolean; received: number }>({
      method: 'POST',
      url: API_ENDPOINTS.RECORDINGS.CHUNK(recordingId),
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
        'X-API-Key': API_CONFIG.API_KEY,
      },
      timeout: API_CONFIG.CHUNK_TIMEOUT,
      onUploadProgress: progressEvent => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
  }

  async endRecording(data: EndRecordingRequest): Promise<ApiResponse<EndRecordingResponse>> {
    return this.request<EndRecordingResponse>({
      method: 'POST',
      url: API_ENDPOINTS.RECORDINGS.END(data.recordingId),
      data: {
        totalChunks: data.totalChunks,
        totalDuration: data.totalDuration,
      },
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;

