import '@/lib/storage';
import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { LinearGradient } from 'expo-linear-gradient';
import { WalletProvider, useWallet } from '@/state/WalletContext';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

const screenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
  headerTitleStyle: { fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.bg },
};

/** App 切到后台/多任务界面时遮挡内容，避免助记词等敏感信息出现在系统快照中 */
function PrivacyShield() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setHidden(s !== 'active'));
    return () => sub.remove();
  }, []);
  if (!hidden) return null;
  return <LinearGradient colors={[colors.bg, '#1a1233']} style={StyleSheet.absoluteFill} />;
}

function RootNavigator() {
  const { status, t } = useWallet();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Protected guard={status === 'onboarding'}>
        <Stack.Screen name="(onboarding)/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(onboarding)/create" options={{ title: '' }} />
        <Stack.Screen name="(onboarding)/import" options={{ title: t('importTitle') }} />
        <Stack.Screen name="(onboarding)/password" options={{ title: '' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'locked'}>
        <Stack.Screen name="unlock" options={{ headerShown: false, animation: 'fade' }} />
      </Stack.Protected>
      <Stack.Protected guard={status === 'unlocked'}>
        <Stack.Screen name="(wallet)/home" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(wallet)/send" options={{ title: t('send') }} />
        <Stack.Screen name="(wallet)/confirm" options={{ title: t('confirmTitle') }} />
        <Stack.Screen name="(wallet)/receive" options={{ title: t('receive'), presentation: 'modal' }} />
        <Stack.Screen name="(wallet)/activity" options={{ title: t('activity') }} />
        <Stack.Screen name="(wallet)/add-token" options={{ title: t('addToken'), presentation: 'modal' }} />
        <Stack.Screen name="(wallet)/token/[address]" options={{ title: '' }} />
        <Stack.Screen name="(wallet)/networks" options={{ title: t('networks'), presentation: 'modal' }} />
        <Stack.Screen name="(wallet)/settings" options={{ title: t('settings') }} />
        <Stack.Screen name="(wallet)/secret" options={{ title: '' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <WalletProvider>
      <StatusBar style="light" />
      <RootNavigator />
      <PrivacyShield />
    </WalletProvider>
  );
}
