import React, { useState, useEffect } from 'react';
import { StatusBar, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme, TaskProvider, useTask, parseDeepLink, RecordingProvider, ServerEnvProvider, useServerEnv } from '@/context';
import { RootNavigator } from '@/navigation';
import { SplashScreen } from '@/screens';
import { lightTheme, darkTheme } from '@/theme';

const AppNavigationTheme = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: lightTheme.colors.primary,
      background: lightTheme.colors.background,
      card: lightTheme.colors.surface,
      text: lightTheme.colors.text,
      border: lightTheme.colors.border,
      notification: lightTheme.colors.primary,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: darkTheme.colors.primary,
      background: darkTheme.colors.background,
      card: darkTheme.colors.surface,
      text: darkTheme.colors.text,
      border: darkTheme.colors.border,
      notification: darkTheme.colors.primary,
    },
  },
};

const AppContent: React.FC = () => {
  const { isDark } = useTheme();
  const { setTaskParams } = useTask();
  const { apiBaseUrl } = useServerEnv();
  const [showSplash, setShowSplash] = useState(true);

  // Handle deep links
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      console.log('[App] Processing deep link:', url);
      const params = parseDeepLink(url);
      console.log('[App] Parsed params:', params);
      
      if (params) {
        console.log('[App] Setting task params...');
        setTaskParams(params, apiBaseUrl);
      } else {
        console.log('[App] Failed to parse deep link params');
      }
    };

    // Handle deep link when app is opened from closed state
    const getInitialURL = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        console.log('[App] Initial URL check:', initialUrl);
        if (initialUrl) {
          handleDeepLink(initialUrl);
        }
      } catch (error) {
        console.error('[App] Error getting initial URL:', error);
      }
    };

    getInitialURL();

    // Handle deep link when app is already open (in background)
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('[App] URL event received:', event.url);
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [setTaskParams, apiBaseUrl]);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return (
      <>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />
        <SplashScreen onAnimationComplete={handleSplashComplete} />
      </>
    );
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <NavigationContainer theme={isDark ? AppNavigationTheme.dark : AppNavigationTheme.light}>
        <RootNavigator />
      </NavigationContainer>
    </>
  );
};

const App: React.FC = () => {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ServerEnvProvider>
          <TaskProvider>
            <RecordingProvider>
              <AppContent />
            </RecordingProvider>
          </TaskProvider>
        </ServerEnvProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
