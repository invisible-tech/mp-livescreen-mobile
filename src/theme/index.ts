import type { Theme } from '@/types';
import { lightColors, darkColors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { borderRadius } from './borderRadius';

export const lightTheme: Theme = {
  colors: lightColors,
  spacing,
  typography,
  borderRadius,
  isDark: false,
};

export const darkTheme: Theme = {
  colors: darkColors,
  spacing,
  typography,
  borderRadius,
  isDark: true,
};

export { lightColors, darkColors } from './colors';
export { spacing } from './spacing';
export { typography } from './typography';
export { borderRadius } from './borderRadius';

