import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
  Modal,
  TouchableOpacity,
  Clipboard,
  Linking,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import {
  Container,
  Text,
  BroadcastPicker,
  ScreenTitle,
  UploadStatus,
  HelpModal,
} from '@/components';
import { useTheme } from '@/context/ThemeContext';
import { useTask, useServerEnv } from '@/context';
import { useScreenCapture } from '@/hooks';
import ScreenCapture from '@/native/ScreenCapture';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// AI App types
type AIAppType = 'gemini' | 'chatgpt';

export const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const { taskParams, hasTask, clearTaskParams } = useTask();
  const { state, isRecording } = useScreenCapture();
  const { apiBaseUrl, marketplaceUrl } = useServerEnv();
  const navigation = useNavigation();
  
  // AI App selection state
  const [showAIAppModal, setShowAIAppModal] = useState(false);
  const [aiAppSelected, setAiAppSelected] = useState(false);
  
  // Help modal state
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Stable callback for header button
  const openHelpModal = useCallback(() => {
    setShowHelpModal(true);
  }, []);

  // Set up header right button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: 16, padding: 8 }}
          onPress={openHelpModal}
        >
          <Icon name="ellipsis-horizontal-circle-outline" size={28} color={theme.colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme.colors.text, openHelpModal]);
  
  // ChatGPT specific state
  const [selectedAIAppType, setSelectedAIAppType] = useState<AIAppType | null>(null);
  const [isUploadingChatGPT, setIsUploadingChatGPT] = useState(false);
  
  // Task completion state
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [chunksUploaded, setChunksUploaded] = useState(0);
  const [completedTaskName, setCompletedTaskName] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [broadcastStarted, setBroadcastStarted] = useState(false);


  // Pulse animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 0.6,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      glowAnim.setValue(0.3);
    }
  }, [isRecording, pulseAnim, glowAnim]);

  // Open Marketplace in Chrome
  const handleOpenMarketplace = useCallback(() => {
    // Try to open in Chrome, fallback to default browser
    const chromeUrl = `googlechrome://${marketplaceUrl.replace(/^https?:\/\//, '')}`;
    Linking.canOpenURL(chromeUrl)
      .then(canOpen => {
        if (canOpen) {
          Linking.openURL(chromeUrl);
        } else {
          Linking.openURL(marketplaceUrl);
        }
      })
      .catch(() => {
        Linking.openURL(marketplaceUrl);
      });
  }, [marketplaceUrl]);

  // Handle Start task button when no task
  const handleNoTask = useCallback(() => {
    Alert.alert(
      'Start task',
      'Open Marketplace and start a task.\n\nMake sure you have Chrome app installed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Marketplace', onPress: handleOpenMarketplace },
      ],
    );
  }, [handleOpenMarketplace]);

  // Handle Start task button when has task
  const handleStartTask = useCallback(() => {
    setShowAIAppModal(true);
  }, []);

  // Handle AI app selection
  const handleAIAppSelect = useCallback((appType: AIAppType) => {
    setShowAIAppModal(false);
    setSelectedAIAppType(appType);
    setCompletedTaskName(taskParams?.campaignName || 'Task');
    
    // Save the AI app type and API URL (fire and forget)
    ScreenCapture.setTaskParams({
      ...taskParams,
      aiAppType: appType,
      apiBaseUrl: apiBaseUrl,
    }).catch(() => {});
    
    if (appType === 'chatgpt') {
      // Show instructions for ChatGPT
      Alert.alert(
        '📱 ChatGPT Export Required',
        'After your ChatGPT conversation:\n\n1. In ChatGPT app, tap the share icon\n2. Export the conversation as video to Photos\n3. Return here and tap "Submit task"\n\nTap OK to start recording.',
        [
          {
            text: 'OK',
            onPress: () => {
              setAiAppSelected(true);
              setRecordingStartTime(Date.now());
            },
          },
        ],
      );
    } else {
      // Gemini - proceed directly
      setAiAppSelected(true);
      setRecordingStartTime(Date.now());
    }
  }, [taskParams, apiBaseUrl]);

  // Poll broadcast state when AI app is selected
  useEffect(() => {
    if (!aiAppSelected) return;
    
    const checkBroadcastState = async () => {
      try {
        const isActive = await ScreenCapture.isBroadcastActive();
        
        if (isActive && !broadcastStarted) {
          // Broadcast just started
          setBroadcastStarted(true);
          setRecordingStartTime(Date.now());
        } else if (!isActive && broadcastStarted) {
          // Broadcast just stopped - show completion
          setBroadcastStarted(false);
          
          // Calculate duration
          if (recordingStartTime) {
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            setRecordingDuration(duration);
          }
          
          setAiAppSelected(false);
          setTaskCompleted(true);
          
          // Poll for upload status in background (max 10 seconds)
          const pollUploadStatus = async () => {
            for (let i = 0; i < 20; i++) {
              await new Promise<void>(resolve => setTimeout(resolve, 500));
              const status = await ScreenCapture.getUploadStatus();
              if (status?.status === 'success' && status.chunksUploaded > 0) {
                setChunksUploaded(status.chunksUploaded);
                return;
              }
            }
          };
          pollUploadStatus();
        }
      } catch {
        // Ignore errors
      }
    };
    
    // Check immediately and then every 500ms
    checkBroadcastState();
    const interval = setInterval(checkBroadcastState, 500);
    
    return () => clearInterval(interval);
  }, [aiAppSelected, broadcastStarted, recordingStartTime]);

  // Clear task and reset UI
  const resetTaskState = useCallback(() => {
    setTaskCompleted(false);
    setAiAppSelected(false);
    setRecordingDuration(0);
    setChunksUploaded(0);
    setCompletedTaskName(null);
    setRecordingStartTime(null);
    setBroadcastStarted(false);
    setSelectedAIAppType(null);
    setIsUploadingChatGPT(false);
    clearTaskParams();
  }, [clearTaskParams]);

  // Upload ChatGPT video to backend
  const uploadChatGPTVideo = useCallback(async (videoUri: string) => {
    if (!taskParams) return;
    
    setIsUploadingChatGPT(true);
    
    try {
      const formData = new FormData();
      
      // Add video file (named human_0.mp4 as per BE requirement)
      formData.append('file', {
        uri: videoUri,
        type: 'video/mp4',
        name: 'human_0.mp4',
      } as any);
      
      // Add metadata
      formData.append('tenant_id', taskParams.tenantId || '');
      formData.append('campaign_id', taskParams.campaignId || '');
      formData.append('task_id', taskParams.taskId || '');
      formData.append('step_id', taskParams.stepId || '');
      formData.append('recording_id', `chatgpt_${Date.now()}`);
      formData.append('chunk_index', '0');
      formData.append('is_final', 'true');
      formData.append('app_type', 'chatgpt');
      
      console.log('[ChatGPT Upload] URL:', `${apiBaseUrl}/api/upload-mobile-content`);
      console.log('[ChatGPT Upload] Video URI:', videoUri);
      console.log('[ChatGPT Upload] Task params:', JSON.stringify(taskParams));
      
      const response = await fetch(`${apiBaseUrl}/api/upload-mobile-content`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      const responseText = await response.text();
      console.log('[ChatGPT Upload] Response status:', response.status);
      console.log('[ChatGPT Upload] Response body:', responseText);
      
      if (response.ok) {
        Alert.alert('Success', 'ChatGPT video uploaded successfully!');
        resetTaskState();
      } else {
        Alert.alert('Upload Failed', `Server error: ${response.status}\n${responseText}`);
        setIsUploadingChatGPT(false);
      }
    } catch (error: any) {
      console.error('[ChatGPT Upload] Error:', error);
      Alert.alert('Upload Failed', `Error: ${error.message || 'Unknown error'}`);
      setIsUploadingChatGPT(false);
    }
  }, [taskParams, resetTaskState, apiBaseUrl]);

  // Handle Submit task
  const handleSubmitTask = useCallback(() => {
    if (selectedAIAppType === 'chatgpt') {
      // Show video picker for ChatGPT
      launchImageLibrary(
        {
          mediaType: 'video',
          selectionLimit: 1,
        },
        (response) => {
          if (response.didCancel) {
            // User cancelled - do nothing
            return;
          }
          if (response.errorCode) {
            Alert.alert('Error', response.errorMessage || 'Failed to open photo library');
            return;
          }
          if (response.assets && response.assets.length > 0) {
            const videoUri = response.assets[0].uri;
            if (videoUri) {
              uploadChatGPTVideo(videoUri);
            }
          }
        },
      );
    } else {
      // Gemini - just reset
      resetTaskState();
    }
  }, [selectedAIAppType, uploadChatGPTVideo, resetTaskState]);

  // Copy to clipboard
  const handleCopy = useCallback((text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  }, []);

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Background gradient when recording */}
      {isRecording && (
        <Animated.View style={[styles.recordingGlow, { opacity: glowAnim }]}>
          <View style={[styles.glowCircle, styles.glowCircle1]} />
          <View style={[styles.glowCircle, styles.glowCircle2]} />
        </Animated.View>
      )}

      <Container safeAreaEdges={['bottom']} style={styles.innerContainer}>
        <ScreenTitle title="Live Capture" />

        {/* Task Info Card - Active task */}
        {hasTask && taskParams && !taskCompleted && (
          <View style={[styles.taskBox, { borderColor: theme.colors.border }]}>
            <View style={styles.taskHeader}>
              <View style={[styles.taskIndicator, { backgroundColor: theme.colors.success }]} />
              <Text variant="caption" color={theme.colors.success} style={styles.activeTaskLabel}>
                ACTIVE TASK
              </Text>
            </View>
            <View style={styles.copyRow}>
              <TouchableOpacity
                onPress={() => handleCopy(taskParams.campaignName || '', 'Campaign name')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="copy-outline" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <Text variant="body" color={theme.colors.text} style={styles.taskValue}>
                {taskParams.campaignName}
              </Text>
            </View>
            <View style={styles.copyRow}>
              <TouchableOpacity
                onPress={() => handleCopy(taskParams.taskId || '', 'Task ID')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="copy-outline" size={14} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <Text variant="bodySmall" color={theme.colors.textSecondary} style={styles.taskIdText}>
                {taskParams.taskId}
              </Text>
            </View>
          </View>
        )}

        {/* Task Completed Card - with duration and chunks */}
        {taskCompleted && (
          <View style={[styles.taskBox, { borderColor: theme.colors.border }]}>
            <View style={styles.taskHeader}>
              <View style={[styles.taskIndicator, { backgroundColor: theme.colors.success }]} />
              <Text variant="caption" color={theme.colors.success} style={styles.activeTaskLabel}>
                COMPLETED
              </Text>
            </View>
            <View style={styles.copyRow}>
              <TouchableOpacity
                onPress={() => handleCopy(completedTaskName || '', 'Campaign name')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="copy-outline" size={16} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <Text variant="body" color={theme.colors.text} style={styles.taskValue}>
                {completedTaskName || 'Task'}
              </Text>
            </View>
            <View style={styles.copyRow}>
              <TouchableOpacity
                onPress={() => handleCopy(taskParams?.taskId || '', 'Task ID')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="copy-outline" size={14} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <Text variant="bodySmall" color={theme.colors.textSecondary} style={styles.taskIdText}>
                {taskParams?.taskId}
              </Text>
            </View>
            <View style={styles.completionStats}>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Duration</Text>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>{formatDuration(recordingDuration)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Chunks uploaded</Text>
                <Text style={[styles.statValue, { color: theme.colors.text }]}>{chunksUploaded}</Text>
              </View>
            </View>
          </View>
        )}

        {/* No Task Warning */}
        {!hasTask && (
          <View style={[styles.taskBox, { borderColor: theme.colors.border }]}>
            <Text variant="body" color={theme.colors.text} align="center" style={styles.noTaskTitle}>
              No task selected
            </Text>
            <Text variant="body" color={theme.colors.textSecondary} align="center" style={styles.noTaskHintBold}>
              Open{' '}
              <Text
                style={styles.marketplaceLink}
                onPress={handleOpenMarketplace}
              >
                Marketplace
              </Text>
              {' '}and start a task
            </Text>
          </View>
        )}

        {/* Live Badge when recording */}
        {isRecording && (
          <Animated.View
            style={[
              styles.liveBadgeContainer,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </Animated.View>
        )}

        {/* Upload Status */}
        <UploadStatus isRecording={isRecording} />

        {/* Error Message */}
        {state.error && (
          <View
            style={[
              styles.errorContainer,
              {
                backgroundColor: `${theme.colors.error}15`,
                borderColor: `${theme.colors.error}30`,
              },
            ]}
          >
            <Text variant="bodySmall" color={theme.colors.error} align="center">
              {state.error}
            </Text>
          </View>
        )}
      </Container>

      {/* Bottom Button Section */}
      <View style={[styles.buttonContainer, { backgroundColor: theme.colors.background }]}>
        {/* Task Completed - Show Submit button */}
        {taskCompleted && !isRecording ? (
          isUploadingChatGPT ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color="#10B981" />
              <Text style={[styles.uploadingText, { color: theme.colors.text }]}>
                Uploading ChatGPT video...
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.submitTaskButton, { backgroundColor: theme.colors.success }]}
              onPress={handleSubmitTask}
              activeOpacity={0.8}
            >
              <Text style={styles.submitTaskButtonText}>
                {selectedAIAppType === 'chatgpt' ? 'Select ChatGPT video & Submit' : 'Submit task'}
              </Text>
            </TouchableOpacity>
          )
        ) : !aiAppSelected && hasTask && !isRecording ? (
          /* Has task, no AI app selected - show Start task button */
          <TouchableOpacity
            style={[styles.startTaskButton, { backgroundColor: theme.colors.primary }]}
            onPress={handleStartTask}
            activeOpacity={0.8}
          >
            <Text style={styles.startTaskButtonText}>Start task</Text>
          </TouchableOpacity>
        ) : !hasTask && !isRecording ? (
          /* No task - show disabled-looking button */
          <TouchableOpacity
            style={[styles.startTaskButton, styles.startTaskButtonDisabled, { backgroundColor: theme.colors.textSecondary }]}
            onPress={handleNoTask}
            activeOpacity={0.8}
          >
            <Text style={styles.startTaskButtonText}>Start task</Text>
          </TouchableOpacity>
        ) : (
          /* AI app selected - show BroadcastPicker only */
          <BroadcastPicker
            style={styles.broadcastPicker}
            isRecording={isRecording}
            startTime={state.startTime}
          />
        )}
      </View>

      {/* AI App Selection Modal */}
      <Modal
        visible={showAIAppModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAIAppModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>
              Select app
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.colors.textSecondary }]}>
              Which app will you be using?
            </Text>
            
            <TouchableOpacity
              style={[styles.appOption, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              onPress={() => handleAIAppSelect('gemini')}
            >
              <Text style={[styles.appOptionText, { color: theme.colors.text }]}>
                🤖 Gemini
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.appOption, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              onPress={() => handleAIAppSelect('chatgpt')}
            >
              <Text style={[styles.appOptionText, { color: theme.colors.text }]}>
                💬 ChatGPT
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowAIAppModal(false)}
            >
              <Text style={[styles.cancelButtonText, { color: theme.colors.textSecondary }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Help Modal */}
      <HelpModal visible={showHelpModal} onClose={() => setShowHelpModal(false)} />

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
  },
  recordingGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  glowCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#FF3B30',
  },
  glowCircle1: {
    width: SCREEN_WIDTH * 1.5,
    height: SCREEN_WIDTH * 1.5,
    top: -SCREEN_WIDTH * 0.5,
    left: -SCREEN_WIDTH * 0.25,
    opacity: 0.1,
  },
  glowCircle2: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    bottom: -SCREEN_WIDTH * 0.3,
    right: -SCREEN_WIDTH * 0.3,
    opacity: 0.08,
  },
  liveBadgeContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    marginRight: 6,
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorContainer: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingTop: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  broadcastPicker: {
    width: '100%',
  },
  startTaskButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTaskButtonDisabled: {
    opacity: 0.5,
  },
  startTaskButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Task completion styles
  completionStats: {
    marginTop: 12,
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  uploadingContainer: {
    width: '100%',
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  uploadingText: {
    fontSize: 16,
    fontWeight: '500',
  },
  submitTaskButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitTaskButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  taskBox: {
    marginHorizontal: 24,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeTaskLabel: {
    fontWeight: '700',
  },
  taskIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  noTaskTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  noTaskHintBold: {
    marginTop: 8,
    fontWeight: '600',
    fontSize: 16,
  },
  taskValue: {
    fontWeight: '700',
    fontSize: 17,
    marginBottom: 4,
    flex: 1,
  },
  taskIdText: {
    marginTop: 2,
    flex: 1,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: SCREEN_WIDTH - 48,
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  appOption: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  marketplaceLink: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  appOptionText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  cancelButton: {
    marginTop: 8,
    padding: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
  },
});

export default HomeScreen;
