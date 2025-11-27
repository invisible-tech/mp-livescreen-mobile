import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { useTheme } from '@/context/ThemeContext';
import { HomeScreen, SettingsScreen } from '@/screens';
import type { MainTabsParamList } from './types';

const Tab = createBottomTabNavigator<MainTabsParamList>();

interface TabIconProps {
  name: string;
  focused: boolean;
  color: string;
  size: number;
}

const TabIcon: React.FC<TabIconProps> = ({ name, focused, color, size }) => {
  const iconName = focused ? name : `${name}-outline`;
  return <Icon name={iconName} size={size} color={color} />;
};

export const MainTabNavigator: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: theme.colors.background,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        headerTitleStyle: {
          color: theme.colors.text,
          fontWeight: '600',
          fontSize: 17,
        },
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          paddingTop: 8,
          height: 85,
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'MP Live Screen',
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="home" focused={focused} color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused, color, size }) => (
            <TabIcon name="settings" focused={focused} color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;

