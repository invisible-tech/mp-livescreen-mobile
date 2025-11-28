import React, { useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DeviceInfo from 'react-native-device-info';
import { Text, ScreenTitle } from '@/components';
import { useTheme } from '@/context/ThemeContext';
import { APP_CONFIG } from '@/config';
import type { ThemeMode } from '@/types';

interface SettingItemProps {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
}

const SettingItem: React.FC<SettingItemProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  rightElement,
  showChevron = false,
}) => {
  const { theme } = useTheme();

  const content = (
    <View
      style={[
        styles.settingItem,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.borderRadius.md,
        },
      ]}
    >
      <View
        style={[
          styles.iconContainer,
          {
            backgroundColor: theme.colors.backgroundSecondary,
            borderRadius: theme.borderRadius.sm,
          },
        ]}
      >
        <Icon name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text variant="body" weight="medium">
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color={theme.colors.textSecondary}>
            {subtitle}
          </Text>
        )}
      </View>
      {rightElement}
      {showChevron && (
        <Icon name="chevron-forward" size={20} color={theme.colors.textTertiary} />
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
};

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

const SettingSection: React.FC<SettingSectionProps> = ({ title, children }) => {
  const { theme } = useTheme();

  return (
    <View style={styles.section}>
      <Text
        variant="caption"
        weight="semiBold"
        color={theme.colors.textSecondary}
        style={styles.sectionTitle}
      >
        {title.toUpperCase()}
      </Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
};

export const SettingsScreen: React.FC = () => {
  const { theme, themeMode, setThemeMode, isDark } = useTheme();

  const handleThemeToggle = useCallback(() => {
    const newMode: ThemeMode = isDark ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [isDark, setThemeMode]);

  const handleSystemTheme = useCallback(() => {
    setThemeMode('system');
  }, [setThemeMode]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScreenTitle title="Settings" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Appearance Section */}
        <SettingSection title="Appearance">
          <SettingItem
            icon="moon-outline"
            title="Dark Mode"
            subtitle={themeMode === 'system' ? 'Following system' : isDark ? 'On' : 'Off'}
            rightElement={
              <Switch
                value={isDark}
                onValueChange={handleThemeToggle}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primaryLight,
                }}
                thumbColor={isDark ? theme.colors.primary : theme.colors.white}
              />
            }
          />
          <SettingItem
            icon="phone-portrait-outline"
            title="Use System Theme"
            subtitle={themeMode === 'system' ? 'Enabled' : 'Disabled'}
            onPress={handleSystemTheme}
            rightElement={
              <View
                style={[
                  styles.checkmark,
                  {
                    backgroundColor:
                      themeMode === 'system' ? theme.colors.primary : theme.colors.transparent,
                    borderColor:
                      themeMode === 'system' ? theme.colors.primary : theme.colors.border,
                  },
                ]}
              >
                {themeMode === 'system' && (
                  <Icon name="checkmark" size={14} color={theme.colors.white} />
                )}
              </View>
            }
          />
        </SettingSection>
      </ScrollView>

      {/* Version Footer - Fixed at bottom */}
      <View style={styles.versionFooter}>
        <Text variant="caption" color={theme.colors.textTertiary} align="center">
          {DeviceInfo.getVersion()}.{DeviceInfo.getBuildNumber()} ({APP_CONFIG.ENV})
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 1,
  },
  sectionContent: {
    gap: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  checkmark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 24,
  },
});

export default SettingsScreen;
