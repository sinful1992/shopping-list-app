import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import SimpleMarkdown from '../../components/SimpleMarkdown';

const LegalDocumentScreen = () => {
  const route = useRoute<any>();
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
    backgroundColor: '#0a0a0a',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
});

export default LegalDocumentScreen;
