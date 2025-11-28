import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  NativeModules,
  Modal,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import DeviceInfo from 'react-native-device-info';
import { Text, ScreenTitle } from '@/components';
import { useTheme } from '@/context/ThemeContext';
import { APP_CONFIG } from '@/config';
import type { ThemeMode } from '@/types';

const { ScreenCaptureModule } = NativeModules;

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
  const [logsModalVisible, setLogsModalVisible] = useState(false);
  const [extensionLogs, setExtensionLogs] = useState<string>('');

  const handleThemeToggle = useCallback(() => {
    const newMode: ThemeMode = isDark ? 'light' : 'dark';
    setThemeMode(newMode);
  }, [isDark, setThemeMode]);

  const handleSystemTheme = useCallback(() => {
    setThemeMode('system');
  }, [setThemeMode]);

  const handleViewLogs = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS Only', 'Extension logs are only available on iOS');
      return;
    }
    
    try {
      const logs = await ScreenCaptureModule?.getExtensionLogs?.();
      setExtensionLogs(logs || 'No logs available');
      setLogsModalVisible(true);
    } catch (error) {
      Alert.alert('Error', `Failed to get logs: ${error}`);
    }
  }, []);

  const handleClearLogs = useCallback(async () => {
    try {
      await ScreenCaptureModule?.clearExtensionLogs?.();
      setExtensionLogs('Logs cleared');
      Alert.alert('Success', 'Extension logs cleared');
    } catch (error) {
      Alert.alert('Error', `Failed to clear logs: ${error}`);
    }
  }, []);

  const handleRefreshLogs = useCallback(async () => {
    try {
      const logs = await ScreenCaptureModule?.getExtensionLogs?.();
      setExtensionLogs(logs || 'No logs available');
    } catch (error) {
      Alert.alert('Error', `Failed to refresh logs: ${error}`);
    }
  }, []);

  const handleTestLog = useCallback(async () => {
    try {
      // This writes a test log from the main app to verify App Group works
      await ScreenCaptureModule?.writeTestLog?.();
      Alert.alert('Success', 'Test log written! Now tap "View Extension Logs" to see it.');
    } catch (error) {
      Alert.alert('Error', `Failed to write test log: ${error}`);
    }
  }, []);

  const handleCheckExtension = useCallback(async () => {
    try {
      const diagnostics = await ScreenCaptureModule?.checkExtensionSetup?.();
      Alert.alert('Extension Diagnostics', diagnostics || 'No diagnostics available');
    } catch (error) {
      Alert.alert('Error', `Failed to check extension: ${error}`);
    }
  }, []);

  const handleCheckExtensionRan = useCallback(async () => {
    try {
      const result = await ScreenCaptureModule?.checkExtensionRan?.();
      Alert.alert('Did Extension Run?', result || 'Unknown');
    } catch (error) {
      Alert.alert('Error', `Failed to check: ${error}`);
    }
  }, []);

  const handleResetFlag = useCallback(async () => {
    try {
      await ScreenCaptureModule?.resetExtensionFlag?.();
      Alert.alert('Reset', 'Extension flag reset. Start broadcast to test.');
    } catch (error) {
      Alert.alert('Error', `Failed to reset: ${error}`);
    }
  }, []);

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

        {/* Debug Section */}
        {Platform.OS === 'ios' && (
          <SettingSection title="Debug">
            <SettingItem
              icon="checkmark-circle-outline"
              title="Did Extension Run?"
              subtitle="Check if broadcast loaded your extension"
              onPress={handleCheckExtensionRan}
              showChevron
            />
            <SettingItem
              icon="refresh-outline"
              title="Reset Extension Flag"
              subtitle="Reset before testing broadcast"
              onPress={handleResetFlag}
              showChevron
            />
            <SettingItem
              icon="build-outline"
              title="Check Extension Setup"
              subtitle="Verify extension is properly installed"
              onPress={handleCheckExtension}
              showChevron
            />
            <SettingItem
              icon="flask-outline"
              title="Write Test Log"
              subtitle="Verify App Group is working"
              onPress={handleTestLog}
              showChevron
            />
            <SettingItem
              icon="document-text-outline"
              title="View Extension Logs"
              subtitle="See broadcast upload logs"
              onPress={handleViewLogs}
              showChevron
            />
            <SettingItem
              icon="trash-outline"
              title="Clear Logs"
              subtitle="Clear extension log file"
              onPress={handleClearLogs}
              showChevron
            />
          </SettingSection>
        )}
      </ScrollView>

      {/* Logs Modal */}
      <Modal
        visible={logsModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setLogsModalVisible(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.colors.border }]}>
            <TouchableOpacity onPress={() => setLogsModalVisible(false)}>
              <Text variant="body" color={theme.colors.primary}>Close</Text>
            </TouchableOpacity>
            <Text variant="body" weight="semiBold">Extension Logs</Text>
            <TouchableOpacity onPress={handleRefreshLogs}>
              <Text variant="body" color={theme.colors.primary}>Refresh</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.logsScrollView} contentContainerStyle={styles.logsContent}>
            <Text variant="caption" style={[styles.logsText, { color: theme.colors.text }]}>
              {extensionLogs}
            </Text>
          </ScrollView>
        </View>
      </Modal>

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
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  logsScrollView: {
    flex: 1,
  },
  logsContent: {
    padding: 16,
  },
  logsText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
});

export default SettingsScreen;

