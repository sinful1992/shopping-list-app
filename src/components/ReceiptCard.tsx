import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import Svg, { Polygon, Line } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

/** Font that evokes thermal receipt print. */
export const RECEIPT_FONT = Platform.select({ ios: 'Menlo', default: 'monospace' });

const TOOTH_HEIGHT = 7;
const TEETH = 24;
const EDGE_VIEWBOX_W = TEETH * 10;

function serratedPoints(): string {
  const pts: string[] = [`0,${TOOTH_HEIGHT}`];
  for (let i = 0; i < TEETH; i++) {
    pts.push(`${i * 10 + 5},0`);
    pts.push(`${(i + 1) * 10},${TOOTH_HEIGHT}`);
  }
  return pts.join(' ');
}
const EDGE_POINTS = serratedPoints();

const SerratedEdge: React.FC<{ color: string; flipped?: boolean }> = ({ color, flipped }) => (
  <Svg
    width="100%"
    height={TOOTH_HEIGHT}
    viewBox={`0 0 ${EDGE_VIEWBOX_W} ${TOOTH_HEIGHT}`}
    preserveAspectRatio="none"
    style={flipped ? styles.flipped : undefined}
  >
    <Polygon points={EDGE_POINTS} fill={color} />
  </Svg>
);

/** Dashed separator — SVG because RN's dashed border is unreliable on Android. */
export const ReceiptRule: React.FC = () => {
  const { theme } = useTheme();
  return (
    <Svg width="100%" height={1} style={styles.rule}>
      <Line
        x1="0"
        y1="0.5"
        x2="100%"
        y2="0.5"
        stroke={theme.border.strong}
        strokeWidth={1}
        strokeDasharray="4,3"
      />
    </Svg>
  );
};

/**
 * Thermal-receipt styled card: serrated top/bottom edges around a paper
 * body. The app's signature visual — reserve it for receipt and cost
 * breakdowns so it stays memorable.
 */
const ReceiptCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const paper = theme.background.secondary;
  return (
    <View style={styles.container}>
      <SerratedEdge color={paper} />
      <View style={[styles.body, { backgroundColor: paper }]}>{children}</View>
      <SerratedEdge color={paper} flipped />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 10,
    marginTop: 10,
    marginBottom: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  flipped: {
    transform: [{ scaleY: -1 }],
  },
  rule: {
    marginVertical: 10,
  },
});

export default ReceiptCard;
