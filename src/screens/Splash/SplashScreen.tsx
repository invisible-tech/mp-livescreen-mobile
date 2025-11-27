import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { Text } from '@/components';
import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SplashScreenProps {
  onAnimationComplete?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onAnimationComplete }) => {
  const { theme } = useTheme();
  
  const logoScale = useRef(new Animated.Value(0.3)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.3)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animation sequence
    Animated.sequence([
      // Ring pulse animation
      Animated.parallel([
        Animated.timing(ringOpacity, {
          toValue: 0.3,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(ringScale, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      // Second ring pulse
      Animated.parallel([
        Animated.timing(ring2Opacity, {
          toValue: 0.2,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(ring2Scale, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Logo appears
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      // Text appears
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Subtitle appears
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      // Wait a moment
      Animated.delay(500),
    ]).start(() => {
      onAnimationComplete?.();
    });
  }, [
    logoScale,
    logoOpacity,
    textOpacity,
    subtitleOpacity,
    ringScale,
    ringOpacity,
    ring2Scale,
    ring2Opacity,
    onAnimationComplete,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Background gradient effect */}
      <View style={[styles.gradientOverlay, { opacity: theme.isDark ? 0.3 : 0.1 }]} />
      
      {/* Animated rings */}
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: theme.colors.primary,
            opacity: ringOpacity,
            transform: [{ scale: ringScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring2,
          {
            borderColor: theme.colors.primary,
            opacity: ring2Opacity,
            transform: [{ scale: ring2Scale }],
          },
        ]}
      />

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            backgroundColor: theme.colors.primary,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          },
        ]}
      >
        <Text variant="h1" weight="bold" color={theme.colors.white} style={styles.logoText}>
          MP
        </Text>
      </Animated.View>

      {/* App name */}
      <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
        <Text variant="h2" weight="bold" align="center">
          MP Live Screen
        </Text>
      </Animated.View>

      {/* Subtitle */}
      <Animated.View style={[styles.subtitleContainer, { opacity: subtitleOpacity }]}>
        <Text variant="bodySmall" color={theme.colors.textSecondary} align="center">
          by Invisible Technologies
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0066FF',
  },
  ring: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    borderRadius: SCREEN_WIDTH * 0.3,
    borderWidth: 2,
  },
  ring2: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    borderRadius: SCREEN_WIDTH * 0.4,
    borderWidth: 1,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  logoText: {
    fontSize: 48,
    letterSpacing: -2,
  },
  textContainer: {
    marginTop: 32,
  },
  subtitleContainer: {
    marginTop: 8,
  },
});

export default SplashScreen;

