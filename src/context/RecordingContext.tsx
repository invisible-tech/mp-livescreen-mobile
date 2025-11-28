/**
 * Recording Context
 * 
 * Tracks recording and upload status for UI display
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface UploadStatus {
  chunkIndex: number;
  status: 'pending' | 'uploading' | 'success' | 'failed';
  error?: string;
  timestamp: number;
}

export interface RecordingState {
  isRecording: boolean;
  recordingId: string | null;
  startTime: number | null;
  chunksUploaded: number;
  chunksFailed: number;
  lastUploadStatus: UploadStatus | null;
  uploadHistory: UploadStatus[];
}

interface RecordingContextValue {
  state: RecordingState;
  startRecording: (recordingId: string) => void;
  stopRecording: () => void;
  addUploadStatus: (status: UploadStatus) => void;
  clearHistory: () => void;
}

const initialState: RecordingState = {
  isRecording: false,
  recordingId: null,
  startTime: null,
  chunksUploaded: 0,
  chunksFailed: 0,
  lastUploadStatus: null,
  uploadHistory: [],
};

const RecordingContext = createContext<RecordingContextValue | undefined>(undefined);

interface RecordingProviderProps {
  children: React.ReactNode;
}

export const RecordingProvider: React.FC<RecordingProviderProps> = ({ children }) => {
  const [state, setState] = useState<RecordingState>(initialState);

  const startRecording = useCallback((recordingId: string) => {
    setState({
      isRecording: true,
      recordingId,
      startTime: Date.now(),
      chunksUploaded: 0,
      chunksFailed: 0,
      lastUploadStatus: null,
      uploadHistory: [],
    });
  }, []);

  const stopRecording = useCallback(() => {
    setState(prev => ({
      ...prev,
      isRecording: false,
    }));
  }, []);

  const addUploadStatus = useCallback((status: UploadStatus) => {
    setState(prev => ({
      ...prev,
      lastUploadStatus: status,
      chunksUploaded: status.status === 'success' ? prev.chunksUploaded + 1 : prev.chunksUploaded,
      chunksFailed: status.status === 'failed' ? prev.chunksFailed + 1 : prev.chunksFailed,
      uploadHistory: [...prev.uploadHistory.slice(-9), status], // Keep last 10
    }));
  }, []);

  const clearHistory = useCallback(() => {
    setState(initialState);
  }, []);

  const contextValue = useMemo(
    () => ({
      state,
      startRecording,
      stopRecording,
      addUploadStatus,
      clearHistory,
    }),
    [state, startRecording, stopRecording, addUploadStatus, clearHistory],
  );

  return (
    <RecordingContext.Provider value={contextValue}>
      {children}
    </RecordingContext.Provider>
  );
};

export const useRecording = (): RecordingContextValue => {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
};

export default RecordingContext;

