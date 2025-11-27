import React, { useState } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
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
  const [showSplash, setShowSplash] = useState(true);

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
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
};

export default App;
