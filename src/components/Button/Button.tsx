import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  StyleProp,
  ActivityIndicator,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '@/context/ThemeContext';
import { Text } from '@/components/Text';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps {
  title?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  fullWidth = false,
}) => {
  const { theme } = useTheme();

  const sizeStyles: Record<ButtonSize, ViewStyle> = {
    sm: {
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      minHeight: 32,
    },
    md: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      minHeight: 44,
    },
    lg: {
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      minHeight: 52,
    },
    xl: {
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.xl,
      minHeight: 64,
    },
  };

  const iconSizes: Record<ButtonSize, number> = {
    sm: 16,
    md: 20,
    lg: 24,
    xl: 28,
  };

  const fontSizes: Record<ButtonSize, number> = {
    sm: theme.typography.fontSize.sm,
    md: theme.typography.fontSize.md,
    lg: theme.typography.fontSize.lg,
    xl: theme.typography.fontSize.xl,
  };

  const getVariantStyles = (): { container: ViewStyle; textColor: string } => {
    const isDisabled = disabled || loading;

    switch (variant) {
      case 'primary':
        return {
          container: {
            backgroundColor: isDisabled ? theme.colors.border : theme.colors.text,
          },
          textColor: theme.colors.background,
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: isDisabled ? theme.colors.border : theme.colors.backgroundSecondary,
          },
          textColor: isDisabled ? theme.colors.textTertiary : theme.colors.text,
        };
      case 'outline':
        return {
          container: {
            backgroundColor: theme.colors.transparent,
            borderWidth: 1,
            borderColor: isDisabled ? theme.colors.border : theme.colors.text,
          },
          textColor: isDisabled ? theme.colors.textTertiary : theme.colors.text,
        };
      case 'ghost':
        return {
          container: {
            backgroundColor: theme.colors.transparent,
          },
          textColor: isDisabled ? theme.colors.textTertiary : theme.colors.text,
        };
      case 'danger':
        return {
          container: {
            backgroundColor: isDisabled ? theme.colors.border : theme.colors.error,
          },
          textColor: theme.colors.white,
        };
      default:
        return {
          container: {
            backgroundColor: theme.colors.text,
          },
          textColor: theme.colors.background,
        };
    }
  };

  const variantStyles = getVariantStyles();

  const renderContent = () => {
    if (loading) {
      return <ActivityIndicator color={variantStyles.textColor} size="small" />;
    }

    const iconElement = icon && (
      <Icon
        name={icon}
        size={iconSizes[size]}
        color={variantStyles.textColor}
        style={title ? (iconPosition === 'left' ? styles.iconLeft : styles.iconRight) : undefined}
      />
    );

    return (
      <View style={styles.contentContainer}>
        {iconPosition === 'left' && iconElement}
        {title && (
          <Text
            weight="semiBold"
            color={variantStyles.textColor}
            style={{ fontSize: fontSizes[size] }}
          >
            {title}
          </Text>
        )}
        {iconPosition === 'right' && iconElement}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { borderRadius: theme.borderRadius.lg },
        sizeStyles[size],
        variantStyles.container,
        fullWidth && styles.fullWidth,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {renderContent()}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});

export default Button;

