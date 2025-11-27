import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// Root Stack Types
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList>;
};

// Bottom Tab Types
export type MainTabsParamList = {
  Home: undefined;
  Settings: undefined;
};

// Screen Props Types
export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabsScreenProps<T extends keyof MainTabsParamList> = CompositeScreenProps<
  BottomTabScreenProps<MainTabsParamList, T>,
  RootStackScreenProps<keyof RootStackParamList>
>;

// Declare global navigation types for useNavigation hook
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

