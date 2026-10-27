import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { SymbolViewProps } from 'expo-symbols';
import { Icon, Screen, Segmented } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { useAuthorize } from '@/lib/useAuthorize';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

const Row: React.FC<{
  icon: SymbolViewProps['name'];
  label: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}> = ({ icon, label, onPress, right, danger }) => (
  <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceHover }]}>
    <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
      <Icon name={icon} size={16} color={danger ? colors.danger : colors.text} />
    </View>
    <Text style={[styles.rowLabel, danger && { color: colors.danger }]}>{label}</Text>
    {right ?? (onPress ? <Icon name="chevron.right" size={13} color={colors.textMuted} /> : null)}
  </Pressable>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={{ gap: 8 }}>
    <Text style={styles.groupTitle}>{title}</Text>
    <View style={styles.group}>{children}</View>
  </View>
);

export default function Settings() {
  const { t, lang, setLang, biometricsAvailable, biometricsEnabled, setBiometrics, lock, reset, getSecret } = useWallet();
  const authorize = useAuthorize();
  const hasPhrase = !!getSecret()?.mnemonic;

  const openSecret = async (type: 'phrase' | 'key') => {
    if (await authorize(t('verifyIdentity'))) router.push({ pathname: '/secret', params: { type } });
  };

  return (
    <Screen>
      <Group title={t('security')}>
        {biometricsAvailable && (
          <Row
            icon="faceid"
            label={t('enableFaceId')}
            right={<Switch value={biometricsEnabled} onValueChange={setBiometrics} trackColor={{ true: colors.primary }} />}
          />
        )}
        {hasPhrase && <Row icon="key.fill" label={t('showPhrase')} onPress={() => openSecret('phrase')} />}
        <Row icon="lock.doc.fill" label={t('showKey')} onPress={() => openSecret('key')} />
        <Row icon="lock.fill" label={t('lockNow')} onPress={lock} />
      </Group>

      <Group title={t('language')}>
        <View style={{ padding: 10 }}>
          <Segmented
            options={[
              { key: 'en', label: 'English' },
              { key: 'zh', label: '简体中文' },
            ]}
            value={lang}
            onChange={(k) => setLang(k as 'en' | 'zh')}
          />
        </View>
      </Group>

      <Group title={t('about')}>
        <Row icon="info.circle.fill" label={t('version')} right={<Text style={styles.muted}>{Constants.expoConfig?.version}</Text>} />
      </Group>

      <Group title={t('dangerZone')}>
        <Row
          icon="trash.fill"
          label={t('reset')}
          danger
          onPress={() =>
            Alert.alert(t('resetTitle'), t('resetBody'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('reset'), style: 'destructive', onPress: () => reset().catch((e) => Alert.alert(t('somethingWrong'), errorMessage(e))) },
            ])
          }
        />
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '500' },
  muted: { color: colors.textMuted, fontSize: 15 },
});
