import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
  TouchableOpacity,
  Clipboard,
  Linking,
  ActivityIndicator,
  Platform,
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
import { useTask, useServerEnv, getAppTypeFromStepName, type AIAppType } from '@/context';
import { useScreenCapture } from '@/hooks';
import ScreenCapture from '@/native/ScreenCapture';
import { API_CONFIG } from '@/config';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const { taskParams, hasTask, clearTaskParams } = useTask();
  const { state, isRecording } = useScreenCapture();
  const { apiBaseUrl, marketplaceUrl } = useServerEnv();
  const navigation = useNavigation();
  
  // AI App selection state (now derived from step name)
  const [aiAppSelected, setAiAppSelected] = useState(false);
  
  // Derive app type from step name (null if not recognized)
  const derivedAppType = taskParams?.stepName ? getAppTypeFromStepName(taskParams.stepName) : null;
  
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Task completion state
  const [taskCompleted, setTaskCompleted] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [chunksUploaded, setChunksUploaded] = useState(0);
  const [isFinalUploadComplete, setIsFinalUploadComplete] = useState(false);
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

  // Handle Start task button - now uses step name to determine app type
  const handleStartTask = useCallback(() => {
    const appType = derivedAppType;
    
    if (!appType) {
      Alert.alert(
        'Unsupported Step Type',
        'Please select a task from one of the supported step types:\n\n• Gemini Live\n• ChatGPT\n• Search Live',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setSelectedAIAppType(appType);
    setCompletedTaskName(taskParams?.campaignName || 'Task');
    
    // Save the AI app type and API URL (fire and forget)
    ScreenCapture.setTaskParams({
      ...taskParams,
      aiAppType: appType,
      apiBaseUrl: apiBaseUrl,
    }).catch(() => {});
    
    // All app types proceed directly
    setAiAppSelected(true);
    setRecordingStartTime(Date.now());
  }, [derivedAppType, taskParams, apiBaseUrl]);

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

  // Poll for final upload status when task is completed (separate effect)
  useEffect(() => {
    if (!taskCompleted || isFinalUploadComplete) return;
    if (selectedAIAppType === 'chatgpt') {
      // ChatGPT doesn't need to wait for upload
      setIsFinalUploadComplete(true);
      return;
    }
    
    let cancelled = false;
    
    const pollUploadStatus = async () => {
      let lastTimestamp: number | null = null;
      let staleCount = 0;
      
      // Poll for max 10 seconds (20 iterations * 500ms)
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        try {
          const status = await ScreenCapture.getUploadStatus();
          
          if (status?.chunksUploaded > 0) {
            setChunksUploaded(status.chunksUploaded);
          }
          
          // Check for isFinalUploaded or success status
          if (status?.isFinalUploaded === true || status?.isFinalUploaded === 1 || 
              status?.status === 'success') {
            setIsFinalUploadComplete(true);
            return;
          }
          
          // If timestamp hasn't changed for 3 checks (1.5 sec), assume upload is done/stuck
          if (status?.timestamp === lastTimestamp) {
            staleCount++;
            if (staleCount >= 3) {
              setIsFinalUploadComplete(true);
              return;
            }
          } else {
            staleCount = 0;
            lastTimestamp = status?.timestamp;
          }
        } catch {
          // Ignore errors
        }
        await new Promise<void>(resolve => setTimeout(resolve, 500));
      }
      // Timeout - enable submit anyway
      if (!cancelled) {
        setIsFinalUploadComplete(true);
      }
    };
    
    pollUploadStatus();
    
    return () => {
      cancelled = true;
    };
  }, [taskCompleted, isFinalUploadComplete, selectedAIAppType]);

  // Clear task and reset UI
  const resetTaskState = useCallback(() => {
    setTaskCompleted(false);
    setAiAppSelected(false);
    setRecordingDuration(0);
    setChunksUploaded(0);
    setIsFinalUploadComplete(false);
    setCompletedTaskName(null);
    setRecordingStartTime(null);
    setBroadcastStarted(false);
    setSelectedAIAppType(null);
    setIsUploadingChatGPT(false);
    setIsSubmitting(false);
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
      formData.append('os_type', Platform.OS);
      formData.append('task_type', taskParams.taskType || 'audio-video');
      
      console.log('[ChatGPT Upload] URL:', `${apiBaseUrl}/api/upload-mobile-content`);
      console.log('[ChatGPT Upload] Video URI:', videoUri);
      console.log('[ChatGPT Upload] Task params:', JSON.stringify(taskParams));
      
      const response = await fetch(`${apiBaseUrl}/api/upload-mobile-content`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-API-Key': API_CONFIG.API_KEY,
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

  // Submit task to backend
  const submitTaskToBackend = useCallback(async (): Promise<boolean> => {
    if (!taskParams || !selectedAIAppType) {
      Alert.alert('Error', 'Missing task parameters. Please try again.');
      return false;
    }
    
    try {
      const payload = {
        tenant_id: taskParams.tenantId,
        campaign_id: taskParams.campaignId,
        task_id: taskParams.taskId,
        step_id: taskParams.stepId,
        app_type: selectedAIAppType,
        task_type: taskParams.taskType || 'audio-video',
        os_type: Platform.OS,
        task_data: taskParams.taskData || {},
      };
      
      console.log('[Submit Task] URL:', `${apiBaseUrl}/api/submit-task-mobile`);
      console.log('[Submit Task] Payload:', JSON.stringify(payload));
      
      const response = await fetch(`${apiBaseUrl}/api/submit-task-mobile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_CONFIG.API_KEY,
        },
        body: JSON.stringify(payload),
      });
      
      const responseText = await response.text();
      console.log('[Submit Task] Response status:', response.status);
      console.log('[Submit Task] Response body:', responseText);
      
      if (!response.ok) {
        console.error('[Submit Task] Failed:', response.status, responseText);
        
        // Try to parse error message from response
        let errorMessage = `Server error (${response.status})`;
        try {
          const errorJson = JSON.parse(responseText);
          if (errorJson.error) {
            errorMessage = errorJson.error;
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch {
          // Use responseText if not JSON
          if (responseText && responseText.length < 200) {
            errorMessage = responseText;
          }
        }
        
        Alert.alert('Submit Failed', errorMessage);
        return false;
      }
      
      return true;
    } catch (error: any) {
      console.error('[Submit Task] Error:', error);
      Alert.alert('Submit Failed', error.message || 'Network error. Please check your connection.');
      return false;
    }
  }, [taskParams, selectedAIAppType, apiBaseUrl]);

  // Handle Submit task
  const handleSubmitTask = useCallback(async () => {
    if (selectedAIAppType === 'chatgpt') {
      // Show video picker for ChatGPT
      launchImageLibrary(
        {
          mediaType: 'video',
          selectionLimit: 1,
        },
        async (response) => {
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
              setIsSubmitting(true);
              try {
                // Upload video first, then submit task
                await uploadChatGPTVideo(videoUri);
                const success = await submitTaskToBackend();
                if (success) {
                  resetTaskState();
                }
              } finally {
                setIsSubmitting(false);
              }
            }
          }
        },
      );
    } else {
      // Gemini / Search Live - submit task to backend
      setIsSubmitting(true);
      try {
        const success = await submitTaskToBackend();
        if (success) {
          resetTaskState();
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  }, [selectedAIAppType, uploadChatGPTVideo, resetTaskState, submitTaskToBackend]);

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

        {/* Selected App Indicator - shows until user submits task */}
        {hasTask && taskParams?.stepName && derivedAppType && (
          <View style={[styles.selectedAppContainer, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <View style={styles.selectedAppRow}>
              <Icon 
                name={derivedAppType === 'gemini' ? 'sparkles' : derivedAppType === 'chatgpt' ? 'chatbubble-ellipses' : 'search'} 
                size={18} 
                color={theme.colors.text} 
              />
              <Text style={[styles.selectedAppText, { color: theme.colors.text }]}>
                <Text style={styles.boldText}>{taskParams.stepName}</Text>
              </Text>
            </View>
            <Text style={[styles.taskTypeText, { color: theme.colors.textSecondary }]}>
              Task type: <Text style={styles.boldText}>{taskParams?.taskType === 'audio' ? 'Audio' : 'Video'}</Text>
            </Text>
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
          ) : isSubmitting ? (
            <View style={[styles.uploadingContainer, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <ActivityIndicator size="small" color={theme.colors.text} />
              <Text style={[styles.uploadingText, { color: theme.colors.textSecondary }]}>
                Submitting task...
              </Text>
            </View>
          ) : !isFinalUploadComplete && selectedAIAppType !== 'chatgpt' ? (
            <View style={[styles.uploadingContainer, { backgroundColor: theme.colors.backgroundSecondary }]}>
              <ActivityIndicator size="small" color={theme.colors.text} />
              <Text style={[styles.uploadingText, { color: theme.colors.textSecondary }]}>
                Waiting for upload to complete...
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
            style={[styles.startTaskButton, { backgroundColor: theme.colors.text }]}
            onPress={handleStartTask}
            activeOpacity={0.8}
          >
            <Text style={[styles.startTaskButtonText, { color: theme.colors.background }]}>
              {derivedAppType ? `Start Task - ${taskParams?.stepName}` : 'Start Task'}
            </Text>
          </TouchableOpacity>
        ) : !hasTask && !isRecording ? (
          /* No task - show disabled-looking button */
          <TouchableOpacity
            style={[styles.startTaskButton, styles.startTaskButtonDisabled, { backgroundColor: theme.colors.text }]}
            onPress={handleNoTask}
            activeOpacity={0.8}
          >
            <Text style={[styles.startTaskButtonText, { color: theme.colors.background }]}>Start task</Text>
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
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 12,
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
  selectedAppContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    gap: 4,
  },
  selectedAppRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedAppText: {
    fontSize: 15,
  },
  taskTypeText: {
    fontSize: 13,
    marginTop: 2,
  },
  boldText: {
    fontWeight: '700',
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  marketplaceLink: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
});

export default HomeScreen;
