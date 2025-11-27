import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';

interface ContainerProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  safeArea?: boolean;
  safeAreaEdges?: ('top' | 'bottom' | 'left' | 'right')[];
  centered?: boolean;
  padding?: boolean;
}

export const Container: React.FC<ContainerProps> = ({
  children,
  style,
  safeArea = true,
  safeAreaEdges = ['top', 'bottom'],
  centered = false,
  padding = true,
}) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const safeAreaStyle: ViewStyle = safeArea
    ? {
        paddingTop: safeAreaEdges.includes('top') ? insets.top : 0,
        paddingBottom: safeAreaEdges.includes('bottom') ? insets.bottom : 0,
        paddingLeft: safeAreaEdges.includes('left') ? insets.left : 0,
        paddingRight: safeAreaEdges.includes('right') ? insets.right : 0,
      }
    : {};

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
        safeAreaStyle,
        padding && { padding: theme.spacing.md },
        centered && styles.centered,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Container;

