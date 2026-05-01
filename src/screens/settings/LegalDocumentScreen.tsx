import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../types/navigation';
import SimpleMarkdown from '../../components/SimpleMarkdown';

const LegalDocumentScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'LegalDocument'>>();
  const { content } = route.params;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <SimpleMarkdown content={content} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12121C',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
});

export default LegalDocumentScreen;
