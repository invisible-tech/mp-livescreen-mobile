import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface TaskParams {
  tenantId: string;
  campaignId: string;
  campaignName: string;
  stepId: string;
  taskId: string;
}

interface TaskContextValue {
  taskParams: TaskParams | null;
  setTaskParams: (params: TaskParams | null) => void;
  clearTaskParams: () => void;
  hasTask: boolean;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

interface TaskProviderProps {
  children: React.ReactNode;
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [taskParams, setTaskParamsState] = useState<TaskParams | null>(null);

  const setTaskParams = useCallback((params: TaskParams | null) => {
    setTaskParamsState(params);
    if (params) {
      console.log('[TaskContext] Task params set:', {
        campaignName: params.campaignName,
        taskId: params.taskId,
      });
    }
  }, []);

  const clearTaskParams = useCallback(() => {
    setTaskParamsState(null);
    console.log('[TaskContext] Task params cleared');
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

// Helper to parse deep link URL
export const parseDeepLink = (url: string): TaskParams | null => {
  try {
    console.log('[TaskContext] Parsing deep link:', url);
    
    // URL format: mplivescreen://capture?tenant_id=xxx&campaign_id=xxx&campaign_name=xxx&step_id=xxx&task_id=xxx
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

    console.log('[TaskContext] Parsed params:', { tenantId, campaignId, campaignName, stepId, taskId });

    if (!tenantId || !campaignId || !campaignName || !stepId || !taskId) {
      console.log('[TaskContext] Missing required params in deep link');
      return null;
    }

    const result = {
      tenantId,
      campaignId,
      campaignName: decodeURIComponent(campaignName),
      stepId,
      taskId,
    };
    
    console.log('[TaskContext] Successfully parsed:', result);
    return result;
  } catch (error) {
    console.error('[TaskContext] Failed to parse deep link:', error);
    return null;
  }
};

export default TaskContext;

