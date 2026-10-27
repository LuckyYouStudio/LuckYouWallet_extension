import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './ui';
import { colors, mono } from '@/theme';

export const MnemonicGrid: React.FC<{ words: string[]; hidden?: boolean; onReveal?: () => void; revealLabel?: string }> = ({
  words,
  hidden,
  onReveal,
  revealLabel,
}) => (
  <View>
    <View style={styles.grid}>
      {words.map((word, i) => (
        <View key={i} style={styles.word}>
          <Text style={styles.index}>{i + 1}</Text>
          <Text style={styles.text}>{hidden ? '••••••' : word}</Text>
        </View>
      ))}
    </View>
    {hidden && (
      <Pressable style={styles.overlay} onPress={onReveal}>
        <View style={styles.revealPill}>
          <Icon name="eye.fill" size={16} />
          <Text style={styles.revealText}>{revealLabel}</Text>
        </View>
      </Pressable>
    )}
  </View>
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  word: {
    width: '31.6%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: colors.bgElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  index: { color: colors.textMuted, fontSize: 11, width: 16 },
  text: { color: colors.text, fontFamily: mono, fontSize: 14, fontWeight: '600' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,13,20,0.55)', borderRadius: 12 },
  revealPill: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceHover, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.borderStrong },
  revealText: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
