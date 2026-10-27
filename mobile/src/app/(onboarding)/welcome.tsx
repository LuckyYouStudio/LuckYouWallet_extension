import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useWallet } from '@/state/WalletContext';
import { colors } from '@/theme';

export default function Welcome() {
  const { t, lang, setLang, startCreate } = useWallet();
  const [creating, setCreating] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['rgba(124,92,255,0.28)', 'transparent']} style={styles.glow} />
      <SafeAreaView style={styles.container}>
        <Pressable style={styles.lang} onPress={() => setLang(lang === 'zh' ? 'en' : 'zh')} hitSlop={10}>
          <Icon name="globe" size={15} color={colors.textSecondary} />
          <Text style={styles.langText}>{lang === 'zh' ? 'English' : '中文'}</Text>
        </Pressable>
        <View style={styles.hero}>
          <Logo size={96} />
          <Text style={styles.title}>LuckYou Wallet</Text>
          <Text style={styles.subtitle}>{t('tagline')}</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Button
            title={t('createWallet')}
            icon="plus"
            loading={creating}
            onPress={() => {
              setCreating(true);
              // 让出一帧以显示加载状态 (助记词与密钥派生在 JS 中计算)
              setTimeout(() => {
                startCreate();
                setCreating(false);
                router.push('/create');
              }, 30);
            }}
          />
          <Button title={t('importWallet')} variant="secondary" icon="arrow.down.to.line" onPress={() => router.push('/import')} />
          <Text style={styles.footnote}>{t('keysNeverLeave')}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  container: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  lang: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  langText: { color: colors.textSecondary, fontWeight: '600' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 14 },
  subtitle: { color: colors.textSecondary, fontSize: 16 },
  footnote: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center', marginTop: 6 },
});
