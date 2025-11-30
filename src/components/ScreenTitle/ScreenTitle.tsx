import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';

interface ScreenTitleProps {
  title: string;
  rightElement?: React.ReactNode;
}

export const ScreenTitle: React.FC<ScreenTitleProps> = ({ title, rightElement }) => {
  return (
    <View style={styles.container}>
      <Text variant="h1" weight="bold">
        {title}
      </Text>
      {rightElement && <View style={styles.rightContainer}>{rightElement}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
    paddingBottom: 12,
    paddingLeft: 24,
    paddingRight: 24,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

export default ScreenTitle;

