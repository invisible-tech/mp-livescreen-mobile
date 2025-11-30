import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type TabType = 'gemini' | 'chatgpt';

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('gemini');

  const renderVideoPlaceholder = (appType: TabType) => {
    const isGemini = appType === 'gemini';
    return (
      <View style={[styles.videoContainer, { backgroundColor: theme.colors.backgroundSecondary }]}>
        <View style={[styles.videoPlaceholder, { borderColor: theme.colors.border }]}>
          <View style={[styles.playButton, { backgroundColor: isGemini ? '#4285F4' : '#10A37F' }]}>
            <Icon name="play" size={32} color="#FFFFFF" />
          </View>
          <Text style={[styles.videoLabel, { color: theme.colors.textSecondary }]}>
            {isGemini ? '🤖 Gemini Tutorial' : '💬 ChatGPT Tutorial'}
          </Text>
          <Text style={[styles.videoDuration, { color: theme.colors.textTertiary }]}>
            Video coming soon
          </Text>
        </View>
      </View>
    );
  };

  const renderGeminiSteps = () => (
    <View style={styles.stepsContainer}>
      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#4285F4' }]}>
          <Text style={styles.stepNumberText}>1</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Start from Marketplace
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Open Marketplace web app and start a task
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#4285F4' }]}>
          <Text style={styles.stepNumberText}>2</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Select Gemini
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Tap "Start task" and choose Gemini
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#4285F4' }]}>
          <Text style={styles.stepNumberText}>3</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Start Recording
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Tap the record button and enable microphone
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#4285F4' }]}>
          <Text style={styles.stepNumberText}>4</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Have Your Conversation
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Open Gemini app and talk naturally
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#4285F4' }]}>
          <Text style={styles.stepNumberText}>5</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Stop & Submit
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Stop from Control Center, return here and submit
          </Text>
        </View>
      </View>
    </View>
  );

  const renderChatGPTSteps = () => (
    <View style={styles.stepsContainer}>
      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.stepNumberText}>1</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Start from Marketplace
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Open Marketplace web app and start a task
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.stepNumberText}>2</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Select ChatGPT
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Tap "Start task" and choose ChatGPT
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.stepNumberText}>3</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Start Recording
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Tap the record button (screen only)
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.stepNumberText}>4</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Have Your Conversation
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Open ChatGPT app and talk naturally
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.stepNumberText}>5</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Export from ChatGPT
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            In ChatGPT, tap share → export video to Photos
          </Text>
        </View>
      </View>

      <View style={styles.stepRow}>
        <View style={[styles.stepNumber, { backgroundColor: '#10A37F' }]}>
          <Text style={styles.stepNumberText}>6</Text>
        </View>
        <View style={styles.stepContent}>
          <Text style={[styles.stepTitle, { color: theme.colors.text }]}>
            Stop & Submit
          </Text>
          <Text style={[styles.stepDesc, { color: theme.colors.textSecondary }]}>
            Stop recording, submit and select the exported video
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              How to use
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={[styles.tabContainer, { backgroundColor: theme.colors.backgroundSecondary }]}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'gemini' && styles.tabActive,
                activeTab === 'gemini' && { backgroundColor: theme.colors.surface },
              ]}
              onPress={() => setActiveTab('gemini')}
            >
              <Text style={[
                styles.tabText,
                { color: activeTab === 'gemini' ? '#4285F4' : theme.colors.textSecondary },
                activeTab === 'gemini' && styles.tabTextActive,
              ]}>
                🤖 Gemini
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'chatgpt' && styles.tabActive,
                activeTab === 'chatgpt' && { backgroundColor: theme.colors.surface },
              ]}
              onPress={() => setActiveTab('chatgpt')}
            >
              <Text style={[
                styles.tabText,
                { color: activeTab === 'chatgpt' ? '#10A37F' : theme.colors.textSecondary },
                activeTab === 'chatgpt' && styles.tabTextActive,
              ]}>
                💬 ChatGPT
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View style={{ flex: 1 }}>
            <ScrollView 
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.scrollContent}
              bounces={true}
            >
              {/* Video Section */}
              {renderVideoPlaceholder(activeTab)}

              {/* Steps Section */}
              <View style={styles.stepsSection}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Step by step
                </Text>
                {activeTab === 'gemini' ? renderGeminiSteps() : renderChatGPTSteps()}
              </View>
            </ScrollView>
          </View>

          {/* Close Button */}
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: theme.colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.closeButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: SCREEN_WIDTH - 32,
    height: SCREEN_HEIGHT * 0.8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  videoContainer: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  videoPlaceholder: {
    aspectRatio: 16 / 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    margin: 2,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  videoLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoDuration: {
    fontSize: 13,
  },
  stepsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 16,
  },
  stepsContainer: {
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  closeButton: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default HelpModal;
