import Config from 'react-native-config';

export type Environment = 'dev' | 'staging' | 'prod';

interface EnvironmentConfig {
  apiBaseUrl: string;
  apiKey: string;
  env: Environment;
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
}

const getEnvironment = (): Environment => {
  const env = Config.APP_ENV as Environment;
  if (['dev', 'staging', 'prod'].includes(env)) {
    return env;
  }
  return 'dev';
};

const currentEnv = getEnvironment();

export const ENV: EnvironmentConfig = {
  apiBaseUrl: Config.API_BASE_URL || 'https://vdi-dev.invsta.systems',
  apiKey: Config.API_KEY || '',
  env: currentEnv,
  isDevelopment: currentEnv === 'dev',
  isStaging: currentEnv === 'staging',
  isProduction: currentEnv === 'prod',
};

export default ENV;

