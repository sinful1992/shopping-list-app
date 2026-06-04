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

export type ListsStackParamList = {
  Home: undefined;
  ListDetail: { listId: string };
  HistoryDetail: { listId: string };
  ReceiptCamera: { listId: string; autoAddAll?: boolean };
  ReceiptMatch: { listId: string; autoAddAll?: boolean };
  ReceiptView: { listId: string };
};

export type HistoryStackParamList = {
  HistoryHome: undefined;
  HistoryDetail: { listId: string };
  ReceiptView: { listId: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
