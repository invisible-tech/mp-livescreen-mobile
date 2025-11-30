import React from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface HelpModalProps {
  visible: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: theme.colors.surface }]}>
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

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Gemini Instructions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                🤖 Gemini
              </Text>
              <View style={styles.steps}>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  1. Open Marketplace and start a task
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  2. Tap "Start task" and select Gemini
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  3. Tap the record button and enable microphone
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  4. Open Gemini app and have your conversation
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  5. When done, stop recording from Control Center
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  6. Return here and tap "Submit task"
                </Text>
              </View>
            </View>

            {/* ChatGPT Instructions */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                💬 ChatGPT
              </Text>
              <View style={styles.steps}>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  1. Open Marketplace and start a task
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  2. Tap "Start task" and select ChatGPT
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  3. Tap the record button (screen only)
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  4. Open ChatGPT and have your conversation
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  5. In ChatGPT, export the conversation video to Photos
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  6. Stop recording from Control Center
                </Text>
                <Text style={[styles.step, { color: theme.colors.textSecondary }]}>
                  7. Return here, tap "Submit task" and select the video
                </Text>
              </View>
            </View>
          </ScrollView>

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
    width: SCREEN_WIDTH - 48,
    maxHeight: '80%',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  scroll: {
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
  },
  steps: {
    gap: 8,
  },
  step: {
    fontSize: 15,
    lineHeight: 22,
  },
  closeButton: {
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

