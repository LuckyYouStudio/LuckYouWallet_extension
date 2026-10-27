import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon } from './ui';
import { colors } from '@/theme';

/** 兜底错误页：不依赖钱包状态，因此中英文同时显示 */
export const ErrorScreen: React.FC<{ title: string; message: string; detail?: string; onRetry: () => void; retryLabel: string }> = ({
  title,
  message,
  detail,
  onRetry,
  retryLabel,
}) => (
  <SafeAreaView style={styles.container}>
    <View style={styles.body}>
      <View style={styles.icon}>
        <Icon name="exclamationmark.triangle.fill" size={34} color={colors.warning} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={4}>
          {detail}
        </Text>
      ) : null}
    </View>
    <Button title={retryLabel} icon="arrow.clockwise" onPress={onRetry} />
  </SafeAreaView>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  icon: { width: 76, height: 76, borderRadius: 24, backgroundColor: colors.warningSoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  message: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  detail: { color: colors.textMuted, fontSize: 12, fontFamily: 'Menlo', textAlign: 'center' },
});
