import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Alert, Button, Card, Screen } from '@/components/ui';
import { MnemonicGrid } from '@/components/MnemonicGrid';
import { useWallet } from '@/state/WalletContext';
import { colors, mono } from '@/theme';

export default function Secret() {
  const { type } = useLocalSearchParams<{ type: 'phrase' | 'key' }>();
  const { t, getSecret } = useWallet();
  const secret = getSecret();
  const [revealed, setRevealed] = useState(false);
  const isPhrase = type === 'phrase';
  const value = isPhrase ? secret?.mnemonic : secret?.privateKey;

  return (
    <Screen
      footer={
        revealed && value ? (
          <Button
            title={t('copy')}
            variant="secondary"
            icon="doc.on.doc"
            onPress={async () => {
              await Clipboard.setStringAsync(value);
              // 60 秒后清空剪贴板，降低泄露风险
              setTimeout(() => Clipboard.setStringAsync(''), 60_000);
            }}
          />
        ) : undefined
      }
    >
      <Stack.Screen options={{ title: isPhrase ? t('showPhrase') : t('showKey') }} />
      <Alert tone="danger">{t('hideSecret')}</Alert>
      {!value ? (
        <Text style={{ color: colors.textSecondary }}>{t('noPhrase')}</Text>
      ) : isPhrase ? (
        <MnemonicGrid words={value.split(' ')} hidden={!revealed} onReveal={() => setRevealed(true)} revealLabel={t('tapToReveal')} />
      ) : revealed ? (
        <Card>
          <Text style={styles.key} selectable>{value}</Text>
        </Card>
      ) : (
        <Button title={t('tapToReveal')} variant="secondary" icon="eye.fill" onPress={() => setRevealed(true)} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  key: { color: colors.text, fontFamily: mono, fontSize: 15, lineHeight: 24 },
});
