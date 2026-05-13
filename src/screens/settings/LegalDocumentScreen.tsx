import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../types/navigation';
import SimpleMarkdown from '../../components/SimpleMarkdown';
import { useTheme } from '../../contexts/ThemeContext';

const LegalDocumentScreen = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'LegalDocument'>>();
  const { content } = route.params;
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <SimpleMarkdown content={content} />
    </ScrollView>
  );
};

const createStyles = (theme: import('../../styles/theme').Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background.primary,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
});

export default LegalDocumentScreen;
