import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SimpleMarkdownProps {
  content: string;
}

const SimpleMarkdown: React.FC<SimpleMarkdownProps> = ({ content }) => {
  const lines = content.split('\n');

  const renderLine = (line: string, index: number) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return <View key={index} style={styles.spacer} />;
    }

    // ## Header 2
    if (trimmed.startsWith('## ')) {
      return (
        <Text key={index} style={styles.h2}>
          {renderInline(trimmed.slice(3))}
        </Text>
      );
    }

    // # Header 1
    if (trimmed.startsWith('# ')) {
      return (
        <Text key={index} style={styles.h1}>
          {renderInline(trimmed.slice(2))}
        </Text>
      );
    }

    // ### Header 3
    if (trimmed.startsWith('### ')) {
      return (
        <Text key={index} style={styles.h3}>
          {renderInline(trimmed.slice(4))}
        </Text>
      );
    }

    // - Bullet item
    if (trimmed.startsWith('- ')) {
      return (
        <View key={index} style={styles.bulletRow}>
          <Text style={styles.bullet}>{'\u2022'}</Text>
          <Text style={styles.bulletText}>{renderInline(trimmed.slice(2))}</Text>
        </View>
      );
    }

    // Numbered list (e.g., "1. item")
    const numberedMatch = trimmed.match(/^(\d+)\.\s(.+)/);
    if (numberedMatch) {
      return (
        <View key={index} style={styles.bulletRow}>
          <Text style={styles.bullet}>{numberedMatch[1]}.</Text>
          <Text style={styles.bulletText}>{renderInline(numberedMatch[2])}</Text>
        </View>
      );
    }

    // Regular paragraph
    return (
      <Text key={index} style={styles.paragraph}>
        {renderInline(trimmed)}
      </Text>
    );
  };

  const renderInline = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <Text key={match.index} style={styles.bold}>
          {match[1]}
        </Text>,
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return <View style={styles.container}>{lines.map(renderLine)}</View>;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 14,
    marginBottom: 6,
  },
  h3: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e0e0e0',
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 14,
    color: '#c0c0c0',
    lineHeight: 20,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
    color: '#e0e0e0',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 8,
  },
  bullet: {
    fontSize: 14,
    color: '#007AFF',
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 14,
    color: '#c0c0c0',
    lineHeight: 20,
    flex: 1,
  },
  spacer: {
    height: 6,
  },
});

export default SimpleMarkdown;
