import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Button, Field } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useWallet } from '@/state/WalletContext';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

export default function Unlock() {
  const { t, unlock, unlockWithBiometrics, biometricsEnabled, reset } = useWallet();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (biometricsEnabled) unlockWithBiometrics();
  }, [biometricsEnabled, unlockWithBiometrics]);

  const submit = () => {
    setBusy(true);
    setTimeout(async () => {
      try {
        if (await unlock(password)) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(t('wrongPassword'));
      } catch (e) {
        setError(errorMessage(e));
      }
      setBusy(false);
    }, 30);
  };

  const confirmReset = () =>
    Alert.alert(t('resetTitle'), t('resetBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('reset'), style: 'destructive', onPress: () => reset().catch((e) => Alert.alert(t('somethingWrong'), errorMessage(e))) },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['rgba(124,92,255,0.25)', 'transparent']} style={styles.glow} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={styles.container} behavior="padding">
          <View style={styles.hero}>
            <Logo size={84} />
            <Text style={styles.title}>{t('welcomeBack')}</Text>
            <Text style={styles.subtitle}>{t('enterPassword')}</Text>
          </View>
          <View style={{ gap: 12 }}>
            <Field
              placeholder={t('password')}
              secureTextEntry
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              onSubmitEditing={() => password && submit()}
              error={error}
              textContentType="password"
            />
            <Button title={t('unlock')} icon="lock.open.fill" disabled={!password} loading={busy} onPress={submit} />
            {biometricsEnabled && <Button title={t('unlockFaceId')} variant="secondary" icon="faceid" onPress={unlockWithBiometrics} />}
            <Button title={t('forgot')} variant="ghost" onPress={confirmReset} />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 8 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginTop: 16 },
  subtitle: { color: colors.textSecondary, fontSize: 15 },
});
