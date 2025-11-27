import React from 'react';
import {
  ViewStyle,
  StyleProp,
  Platform,
  View,
  StyleSheet,
  Text,
  requireNativeComponent,
} from 'react-native';
import { Timer } from '@/components/Timer';

interface BroadcastPickerProps {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  isRecording?: boolean;
  startTime?: number | null;
}

// Native component - this is the iOS system broadcast picker
let NativeBroadcastPicker: React.ComponentType<any> | null = null;

if (Platform.OS === 'ios') {
  try {
    NativeBroadcastPicker = requireNativeComponent('BroadcastPickerView');
  } catch (e) {
    console.log('[BroadcastPicker] Native component not available:', e);
  }
}

export const BroadcastPicker: React.FC<BroadcastPickerProps> = ({
  style,
  isRecording = false,
  startTime = null,
}) => {
  return (
    <View style={[styles.container, style]}>
      {/* Button with native picker overlay */}
      <View style={styles.buttonWrapper}>
        {/* Glow effect */}
        <View style={[styles.buttonGlow, isRecording && styles.buttonGlowRecording]} />
        
        {/* Visible button */}
        <View style={[styles.button, isRecording && styles.buttonRecording]}>
          <View style={styles.iconContainer}>
            {isRecording ? (
              <View style={styles.stopIcon} />
            ) : (
              <View style={styles.iconOuter}>
                <View style={styles.iconInner} />
              </View>
            )}
          </View>
        </View>

        {/* Native picker - positioned exactly over the button */}
        {Platform.OS === 'ios' && NativeBroadcastPicker && !isRecording && (
          <View style={styles.nativePickerContainer}>
            <NativeBroadcastPicker style={styles.nativePicker} />
          </View>
        )}
      </View>

      {/* Text or Timer */}
      <View style={styles.textContainer}>
        {isRecording ? (
          <>
            <Text style={styles.recordingLabel}>Recording</Text>
            <Timer isRunning={isRecording} startTime={startTime} />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>Tap to share your screen</Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
  },
  buttonWrapper: {
    width: 100,
    height: 100,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF3B30',
    opacity: 0.2,
  },
  buttonGlowRecording: {
    opacity: 0.4,
  },
  button: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  buttonRecording: {
    backgroundColor: '#CC2F26',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  iconOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  nativePickerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativePicker: {
    width: 100,
    height: 100,
    opacity: 0.02,
  },
  textContainer: {
    alignItems: 'center',
  },
  recordingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
});

export default BroadcastPicker;
