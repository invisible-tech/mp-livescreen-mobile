import { Platform } from 'react-native';
import type { ThemeTypography } from '@/types';

const fontFamily = Platform.select({
  ios: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
  android: {
    regular: 'Roboto',
    medium: 'Roboto-Medium',
    semiBold: 'Roboto-Medium',
    bold: 'Roboto-Bold',
  },
  default: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
});

export const typography: ThemeTypography = {
  fontFamily,
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

