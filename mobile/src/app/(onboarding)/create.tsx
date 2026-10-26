import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Alert, Button, Icon, Screen } from '@/components/ui';
import { MnemonicGrid } from '@/components/MnemonicGrid';
import { useWallet } from '@/state/WalletContext';
import { colors } from '@/theme';

export default function CreateWallet() {
  const { t, draft } = useWallet();
  const [revealed, setRevealed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const words = draft?.mnemonic?.split(' ') || [];

  return (
    <Screen
      footer={<Button title={t('continue')} disabled={!revealed || !confirmed} onPress={() => router.push('/password')} />}
    >
      <Text style={styles.title}>{t('backupTitle')}</Text>
      <Alert tone="warning">{t('backupWarning')}</Alert>
      <MnemonicGrid words={words} hidden={!revealed} onReveal={() => setRevealed(true)} revealLabel={t('tapToReveal')} />
      <Pressable style={styles.check} onPress={() => setConfirmed((c) => !c)} disabled={!revealed}>
        <View style={[styles.box, confirmed && styles.boxChecked]}>
          {confirmed && <Icon name="checkmark" size={13} color="#fff" />}
        </View>
        <Text style={[styles.checkText, !revealed && { opacity: 0.5 }]}>{t('backedUp')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { color: colors.textSecondary, fontSize: 15, flex: 1 },
});
