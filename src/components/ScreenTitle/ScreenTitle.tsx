import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';

interface ScreenTitleProps {
  title: string;
}

export const ScreenTitle: React.FC<ScreenTitleProps> = ({ title }) => {
  return (
    <View style={styles.container}>
      <Text variant="h1" weight="bold">
        {title}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    paddingTop: 0,
    paddingBottom: 12,
    paddingLeft: 24,
  },
});

export default ScreenTitle;

