import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

export type RootStackParamList = {
  MainTabs: undefined;
  Settings: undefined;
  Subscription: undefined;
  LegalDocument: { title: string; content: string };
};

export type AuthStackParamList = {
  Login: undefined;
  EmailLogin: undefined;
  SignUp: undefined;
  EmailSignUp: undefined;
  FamilyGroup: undefined;
};

export type TermsStackParamList = {
  TermsAcceptance: undefined;
};

export type FamilyGroupStackParamList = {
  FamilyGroup: undefined;
};

export type MainTabParamList = {
  Lists: undefined;
  Urgent: undefined;
  History: undefined;
  Analytics: undefined;
  Budget: undefined;
};

export type ListsStackParamList = {
  Home: undefined;
  ListDetail: { listId: string };
  HistoryDetail: { listId: string };
  ReceiptCamera: { listId: string };
  ReceiptMatch: { listId: string };
  ReceiptView: { listId: string };
};

export type HistoryStackParamList = {
  HistoryHome: undefined;
  HistoryDetail: { listId: string };
  ReceiptView: { listId: string };
};

export type ListDetailScreenProps = CompositeScreenProps<
  StackScreenProps<ListsStackParamList, 'ListDetail'>,
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, 'Lists'>,
    StackScreenProps<RootStackParamList>
  >
>;

export type HomeScreenProps = CompositeScreenProps<
  StackScreenProps<ListsStackParamList, 'Home'>,
  CompositeScreenProps<
    BottomTabScreenProps<MainTabParamList, 'Lists'>,
    StackScreenProps<RootStackParamList>
  >
>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
