import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { NativeModules, Platform } from 'react-native';
import { API_CONFIG } from '@/config';

const { ScreenCaptureModule } = NativeModules;

export interface TaskParams {
  tenantId: string;
  campaignId: string;
  campaignName: string;
  stepId: string;
  taskId: string;
  taskType: 'audio-video' | 'audio';
  taskData: Record<string, any> | null;
}

interface TaskContextValue {
  taskParams: TaskParams | null;
  setTaskParams: (params: TaskParams | null, apiBaseUrl?: string) => void;
  clearTaskParams: () => void;
  hasTask: boolean;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

interface TaskProviderProps {
  children: React.ReactNode;
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [taskParams, setTaskParamsState] = useState<TaskParams | null>(null);

  const setTaskParams = useCallback(async (params: TaskParams | null, apiBaseUrl?: string) => {
    setTaskParamsState(params);
    
    if (params) {
      console.log('[TaskContext] Task params set:', {
        campaignName: params.campaignName,
        taskId: params.taskId,
      });
      
      // Save to App Group for Broadcast Extension access (iOS only)
      if (Platform.OS === 'ios' && ScreenCaptureModule?.setTaskParams) {
        try {
          const url = apiBaseUrl || API_CONFIG.BASE_URL;
          await ScreenCaptureModule.setTaskParams({
            ...params,
            apiBaseUrl: url,
            xApiKey: API_CONFIG.API_KEY,  // Pass API key for authentication
          });
          console.log('[TaskContext] Task params saved to App Group (apiBaseUrl:', url, ')');
        } catch (error) {
          console.error('[TaskContext] Failed to save task params to App Group:', error);
        }
      }
    }
  }, []);

  const clearTaskParams = useCallback(async () => {
    setTaskParamsState(null);
    console.log('[TaskContext] Task params cleared');
    
    // Clear from App Group (iOS only)
    if (Platform.OS === 'ios' && ScreenCaptureModule?.clearTaskParams) {
      try {
        await ScreenCaptureModule.clearTaskParams();
        console.log('[TaskContext] Task params cleared from App Group');
      } catch (error) {
        console.error('[TaskContext] Failed to clear task params from App Group:', error);
      }
    }
  }, []);

  const hasTask = useMemo(() => taskParams !== null, [taskParams]);

  const contextValue = useMemo(
    () => ({
      taskParams,
      setTaskParams,
      clearTaskParams,
      hasTask,
    }),
    [taskParams, setTaskParams, clearTaskParams, hasTask],
  );

  return <TaskContext.Provider value={contextValue}>{children}</TaskContext.Provider>;
};

export const useTask = (): TaskContextValue => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  return context;
};

// Helper to extract task_type from task_data
const extractTaskTypeFromTaskData = (taskData: Record<string, any> | null): 'audio-video' | 'audio' => {
  if (!taskData?.currentData) {
    return 'audio-video';
  }
  
  // Look for 'type' field in any step inside currentData
  // e.g., taskData.currentData.step_xxx.type
  const currentData = taskData.currentData;
  for (const stepKey of Object.keys(currentData)) {
    const stepData = currentData[stepKey];
    if (stepData?.type === 'audio' || stepData?.type === 'audio-video') {
      return stepData.type;
    }
  }
  
  return 'audio-video';
};

// Helper to parse deep link URL
export const parseDeepLink = (url: string): TaskParams | null => {
  try {
    console.log('[TaskContext] Parsing deep link:', url);
    
    // URL format: mplivescreen://capture?tenant_id=xxx&campaign_id=xxx&campaign_name=xxx&step_id=xxx&task_id=xxx&task_data=xxx
    // Extract query string manually since URL() doesn't work with custom schemes
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
      console.log('[TaskContext] No query string found in URL');
      return null;
    }
    
    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    
    const tenantId = params.get('tenant_id');
    const campaignId = params.get('campaign_id');
    const campaignName = params.get('campaign_name');
    const stepId = params.get('step_id');
    const taskId = params.get('task_id');
    const taskDataEncoded = params.get('task_data');

    // Parse task_data JSON if provided
    let taskData: Record<string, any> | null = null;
    if (taskDataEncoded) {
      try {
        taskData = JSON.parse(decodeURIComponent(taskDataEncoded));
        console.log('[TaskContext] Parsed task_data:', JSON.stringify(taskData).substring(0, 200) + '...');
      } catch (parseError) {
        console.warn('[TaskContext] Failed to parse task_data JSON:', parseError);
      }
    }

    // Extract task_type from task_data (or use default)
    const taskType = extractTaskTypeFromTaskData(taskData);

    console.log('[TaskContext] Parsed params:', { tenantId, campaignId, campaignName, stepId, taskId, taskType });

    // TEMP: All fallbacks for testing Search Live - REMOVE AFTER TESTING
    const result = {
      tenantId: tenantId || 'invi',
      campaignId: campaignId || 'camp_temp_test',
      campaignName: campaignName ? decodeURIComponent(campaignName) : 'Test Campaign',
      stepId: stepId || 'step_temp_test',
      taskId: taskId || 'task_inv_sajj4324jmbm',
      taskType,
      taskData,
    };
    
    console.log('[TaskContext] Successfully parsed:', result);
    return result;
  } catch (error) {
    console.error('[TaskContext] Failed to parse deep link:', error);
    return null;
  }
};

export default TaskContext;

