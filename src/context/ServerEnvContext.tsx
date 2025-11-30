import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, SERVER_ENVIRONMENTS, DEFAULT_SERVER_ENV, type ServerEnvironment } from '@/config/constants';

interface ServerEnvContextValue {
  serverEnv: ServerEnvironment;
  setServerEnv: (env: ServerEnvironment) => void;
  apiBaseUrl: string;
  marketplaceUrl: string;
  envLabel: string;
}

const ServerEnvContext = createContext<ServerEnvContextValue | undefined>(undefined);

interface ServerEnvProviderProps {
  children: React.ReactNode;
}

export const ServerEnvProvider: React.FC<ServerEnvProviderProps> = ({ children }) => {
  const [serverEnv, setServerEnvState] = useState<ServerEnvironment>(DEFAULT_SERVER_ENV);

  // Load saved environment on mount
  useEffect(() => {
    const loadServerEnv = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_ENV);
        if (saved && saved in SERVER_ENVIRONMENTS) {
          setServerEnvState(saved as ServerEnvironment);
        }
      } catch (error) {
        console.error('Failed to load server environment:', error);
      }
    };
    loadServerEnv();
  }, []);

  const setServerEnv = useCallback(async (env: ServerEnvironment) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_ENV, env);
      setServerEnvState(env);
    } catch (error) {
      console.error('Failed to save server environment:', error);
    }
  }, []);

  const value = useMemo(() => ({
    serverEnv,
    setServerEnv,
    apiBaseUrl: SERVER_ENVIRONMENTS[serverEnv].apiBaseUrl,
    marketplaceUrl: SERVER_ENVIRONMENTS[serverEnv].marketplaceUrl,
    envLabel: SERVER_ENVIRONMENTS[serverEnv].label,
  }), [serverEnv, setServerEnv]);

  return (
    <ServerEnvContext.Provider value={value}>
      {children}
    </ServerEnvContext.Provider>
  );
};

export const useServerEnv = (): ServerEnvContextValue => {
  const context = useContext(ServerEnvContext);
  if (!context) {
    throw new Error('useServerEnv must be used within a ServerEnvProvider');
  }
  return context;
};

export default ServerEnvContext;

