import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SymbolViewProps } from 'expo-symbols';
import { Avatar, Button, Icon, ListItem, Screen, SectionTitle } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { formatAmount, shortAddress } from '@/lib/format';
import { colors, gradient } from '@/theme';

const Action: React.FC<{ icon: SymbolViewProps['name']; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable style={styles.action} onPress={onPress}>
    {({ pressed }) => (
      <>
        <View style={[styles.actionIcon, pressed && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
          <Icon name={icon} size={20} />
        </View>
        <Text style={styles.actionLabel}>{label}</Text>
      </>
    )}
  </Pressable>
);

export default function Home() {
  const { t, address, network, balance, tokens, tokenBalances, refreshing, refresh } = useWallet();
  const symbol = network?.currencySymbol || 'ETH';
  const [copied, setCopied] = React.useState(false);

  const copyAddress = async () => {
    await Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Screen edges={['top']} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}>
      <View style={styles.topBar}>
        <Pressable style={styles.networkPill} onPress={() => router.push('/networks')}>
          <View style={styles.dot} />
          <Text style={styles.networkText} numberOfLines={1}>{network?.name}</Text>
          <Icon name="chevron.down" size={11} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => router.push('/settings')} hitSlop={8}>
          <Icon name="gearshape.fill" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.cardCircle} />
        <Pressable style={styles.addressChip} onPress={copyAddress}>
          <Text style={styles.addressText}>{copied ? t('copied') : shortAddress(address)}</Text>
          <Icon name={copied ? 'checkmark' : 'doc.on.doc'} size={12} color="#fff" />
        </Pressable>
        <Text style={styles.balanceLabel}>{t('balance')}</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balance} numberOfLines={1} adjustsFontSizeToFit>
            {balance == null ? (refreshing ? '···' : '—') : formatAmount(balance)}
          </Text>
          <Text style={styles.balanceSymbol}>{symbol}</Text>
        </View>
      </LinearGradient>

      <View style={styles.actions}>
        <Action icon="arrow.up.right" label={t('send')} onPress={() => router.push('/send')} />
        <Action icon="arrow.down.left" label={t('receive')} onPress={() => router.push('/receive')} />
        <Action icon="clock.arrow.circlepath" label={t('activity')} onPress={() => router.push('/activity')} />
        <Action icon="plus" label={t('token')} onPress={() => router.push('/add-token')} />
      </View>

      <SectionTitle title={t('assets')} />
      <View style={{ gap: 8 }}>
        <ListItem
          left={<LinearGradient colors={gradient} style={styles.nativeAvatar}><Text style={styles.nativeAvatarText}>{symbol[0]}</Text></LinearGradient>}
          title={symbol}
          subtitle={network?.name}
          right={<Text style={styles.amount}>{balance == null ? '—' : formatAmount(balance)}</Text>}
          onPress={() => router.push('/send')}
        />
        {tokens.map((token) => (
          <ListItem
            key={token.address}
            left={<Avatar label={token.symbol} seed={token.address} />}
            title={token.symbol}
            subtitle={token.name}
            right={<Text style={styles.amount}>{formatAmount(tokenBalances[token.address] || '0')}</Text>}
            onPress={() => router.push({ pathname: '/token/[address]', params: { address: token.address } })}
          />
        ))}
      </View>
      <Button title={`+ ${t('addToken')}`} variant="ghost" onPress={() => router.push('/add-token')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 240,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  networkText: { color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  iconButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 26, padding: 22, overflow: 'hidden', minHeight: 180 },
  cardCircle: { position: 'absolute', right: -50, top: -50, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.12)' },
  addressChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.22)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  addressText: { color: '#fff', fontFamily: 'Menlo', fontSize: 13 },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', marginTop: 26, fontSize: 14, fontWeight: '600' },
  balanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  balance: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1, flexShrink: 1 },
  balanceSymbol: { color: 'rgba(255,255,255,0.85)', fontSize: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  action: { alignItems: 'center', gap: 8, width: 72 },
  actionIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  nativeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nativeAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  amount: { color: colors.text, fontSize: 16, fontWeight: '700' },
});
