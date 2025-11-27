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

interface BroadcastPickerProps {
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

// Native component - this is the iOS system broadcast picker
let NativeBroadcastPicker: React.ComponentType<any> | null = null;

if (Platform.OS === 'ios') {
  try {
    NativeBroadcastPicker = requireNativeComponent('BroadcastPickerView');
    console.log('[BroadcastPicker] Native component loaded successfully');
  } catch (e) {
    console.log('[BroadcastPicker] Native component not available:', e);
  }
}

export const BroadcastPicker: React.FC<BroadcastPickerProps> = ({ style }) => {
  // If native component available, show it directly (it has its own button)
  if (Platform.OS === 'ios' && NativeBroadcastPicker) {
    return (
      <View style={[styles.container, style]}>
        {/* Native broadcast picker - renders its own tappable button */}
        <View style={styles.pickerWrapper}>
          <NativeBroadcastPicker style={styles.nativePicker} />
        </View>

        {/* Text label below */}
        <Text style={styles.labelText}>Tap to Start Broadcast</Text>
        <Text style={styles.subtitleText}>
          Select "MP Live Screen" from the menu
        </Text>
      </View>
    );
  }

  // Fallback for Android or if native component not available
  return (
    <View style={[styles.container, style]}>
      <View style={styles.fallbackButton}>
        <View style={styles.fallbackIcon} />
      </View>
      <Text style={styles.labelText}>Start Broadcast</Text>
      <Text style={styles.subtitleText}>Screen sharing not available</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 24,
  },
  pickerWrapper: {
    width: 100,
    height: 100,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativePicker: {
    width: 100,
    height: 100,
  },
  fallbackButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  fallbackIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  labelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 13,
    color: '#888',
  },
});

export default BroadcastPicker;

