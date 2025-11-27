import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleSheet,
  TextStyle,
  StyleProp,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';

type TextVariant = 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'caption' | 'label';
type TextWeight = 'regular' | 'medium' | 'semiBold' | 'bold';
type TextAlign = 'left' | 'center' | 'right';

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  weight?: TextWeight;
  color?: string;
  align?: TextAlign;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
}

export const Text: React.FC<TextProps> = ({
  variant = 'body',
  weight = 'regular',
  color,
  align = 'left',
  style,
  children,
  ...props
}) => {
  const { theme } = useTheme();

  const variantStyles: Record<TextVariant, TextStyle> = {
    h1: {
      fontSize: theme.typography.fontSize.xxxl,
      lineHeight: theme.typography.fontSize.xxxl * theme.typography.lineHeight.tight,
    },
    h2: {
      fontSize: theme.typography.fontSize.xxl,
      lineHeight: theme.typography.fontSize.xxl * theme.typography.lineHeight.tight,
    },
    h3: {
      fontSize: theme.typography.fontSize.xl,
      lineHeight: theme.typography.fontSize.xl * theme.typography.lineHeight.tight,
    },
    body: {
      fontSize: theme.typography.fontSize.lg,
      lineHeight: theme.typography.fontSize.lg * theme.typography.lineHeight.normal,
    },
    bodySmall: {
      fontSize: theme.typography.fontSize.md,
      lineHeight: theme.typography.fontSize.md * theme.typography.lineHeight.normal,
    },
    caption: {
      fontSize: theme.typography.fontSize.sm,
      lineHeight: theme.typography.fontSize.sm * theme.typography.lineHeight.normal,
    },
    label: {
      fontSize: theme.typography.fontSize.xs,
      lineHeight: theme.typography.fontSize.xs * theme.typography.lineHeight.normal,
    },
  };

  const weightStyles: Record<TextWeight, TextStyle> = {
    regular: { fontWeight: '400' },
    medium: { fontWeight: '500' },
    semiBold: { fontWeight: '600' },
    bold: { fontWeight: '700' },
  };

  return (
    <RNText
      style={[
        styles.base,
        { color: color || theme.colors.text },
        variantStyles[variant],
        weightStyles[weight],
        { textAlign: align },
        style,
      ]}
      {...props}
    >
      {children}
    </RNText>
  );
};

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});

export default Text;

