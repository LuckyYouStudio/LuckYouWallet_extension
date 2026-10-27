import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Field, Icon, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

export default function SetPassword() {
  const { t, finishSetup, biometricsAvailable } = useWallet();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [biometrics, setBiometrics] = useState(biometricsAvailable);
  const [busy, setBusy] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const valid = password.length >= 8 && password === confirm;

  const submit = () => {
    setBusy(true);
    setTimeout(async () => {
      try {
        await finishSetup(password, biometrics);
      } catch (e) {
        Alert.alert(t('somethingWrong'), errorMessage(e));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <Screen footer={<Button title={t('finish')} disabled={!valid} loading={busy} onPress={submit} />}>
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{t('setPassword')}</Text>
        <Text style={styles.hint}>{t('passwordHint')}</Text>
      </View>
      <Field label={t('password')} placeholder={t('atLeast8')} secureTextEntry value={password} onChangeText={setPassword} textContentType="newPassword" autoFocus />
      <Field
        label={t('confirmPassword')}
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        textContentType="newPassword"
        error={mismatch ? t('mismatch') : null}
        onSubmitEditing={() => valid && submit()}
      />
      {biometricsAvailable && (
        <View style={styles.row}>
          <Icon name="faceid" size={22} color={colors.primary} />
          <Text style={styles.rowText}>{t('enableFaceId')}</Text>
          <Switch value={biometrics} onValueChange={setBiometrics} trackColor={{ true: colors.primary }} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  hint: { color: colors.textSecondary, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  rowText: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '600' },
});
