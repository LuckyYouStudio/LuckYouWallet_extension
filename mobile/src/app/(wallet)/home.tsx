import React from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SymbolViewProps } from 'expo-symbols';
import { Alert, Button, Icon, ListItem, Screen, SectionTitle } from '@/components/ui';
import { CoinLogo } from '@/components/CoinLogo';
import { useWallet } from '@/state/WalletContext';
import { nativeLogo, networkLogo, tokenLogo } from '@core/logos';
import { formatAmount, formatUsd, shortAddress, usdValue } from '@/lib/format';
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
  const { t, address, unsupported, network, networkKey, balance, tokens, tokenBalances, prices, refreshing, refresh, incoming, clearIncoming } = useWallet();
  const symbol = network?.symbol || 'ETH';
  const isEvm = network?.family === 'evm';
  const [copied, setCopied] = React.useState(false);

  // 自动刷新发现到账：震动提示，几秒后自动消失
  React.useEffect(() => {
    if (!incoming) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(clearIncoming, 5000);
    return () => clearTimeout(timer);
  }, [incoming, clearIncoming]);

  const nativeUsd = usdValue(balance, prices.native);
  const tokenUsd = (address: string) => usdValue(tokenBalances[address] || '0', prices.tokens[address]);
  // 总价值 = 原生币 + 有报价的代币；没有任何报价时不显示
  const priced = [nativeUsd, ...tokens.map((x) => tokenUsd(x.address))].filter((v): v is number => v != null);
  const totalUsd = priced.length ? priced.reduce((a, b) => a + b, 0) : null;

  const amountWithUsd = (amount: string, usd: number | null) => (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      <Text style={styles.amount}>{amount}</Text>
      {usd != null ? <Text style={styles.amountUsd}>{formatUsd(usd)}</Text> : null}
    </View>
  );

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
          {networkLogo(networkKey) ? <CoinLogo logo={networkLogo(networkKey)} label={network?.name || ''} size={18} /> : <View style={styles.dot} />}
          <Text style={styles.networkText} numberOfLines={1}>{network?.name}</Text>
          <Icon name="chevron.down" size={11} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => router.push('/settings')} hitSlop={8}>
          <Icon name="gearshape.fill" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {incoming ? (
        <Pressable style={styles.incoming} onPress={() => router.push('/activity')}>
          <Icon name="arrow.down.left" size={15} color={colors.success} />
          <Text style={styles.incomingText}>{t('receivedToast', { amount: formatAmount(incoming.amount), symbol: incoming.symbol })}</Text>
        </Pressable>
      ) : null}

      {unsupported ? (
        <Alert tone="warning">{t('needsPhrase')}</Alert>
      ) : (
        <>
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
          {totalUsd != null ? (
            <Text style={styles.totalUsd}>{t('totalValue')} {formatUsd(totalUsd)}</Text>
          ) : null}
        </LinearGradient>

        <View style={styles.actions}>
          <Action icon="arrow.up.right" label={t('send')} onPress={() => router.push('/send')} />
          <Action icon="arrow.down.left" label={t('receive')} onPress={() => router.push('/receive')} />
          <Action icon="clock.arrow.circlepath" label={t('activity')} onPress={() => router.push('/activity')} />
          {isEvm && <Action icon="plus" label={t('token')} onPress={() => router.push('/add-token')} />}
        </View>

        <SectionTitle title={t('assets')} />
        <View style={{ gap: 8 }}>
          <ListItem
            left={
              nativeLogo(networkKey) ? (
                <CoinLogo logo={nativeLogo(networkKey)} label={symbol} />
              ) : (
                <LinearGradient colors={gradient} style={styles.nativeAvatar}><Text style={styles.nativeAvatarText}>{symbol[0]}</Text></LinearGradient>
              )
            }
            title={symbol}
            subtitle={network?.name}
            right={amountWithUsd(balance == null ? '—' : formatAmount(balance), nativeUsd)}
            onPress={() => router.push('/send')}
          />
          {tokens.map((token) => (
            <ListItem
              key={token.address}
              left={<CoinLogo logo={tokenLogo(token.address, token.symbol)} label={token.symbol} seed={token.address} />}
              title={token.symbol}
              subtitle={token.name}
              right={amountWithUsd(formatAmount(tokenBalances[token.address] || '0'), tokenUsd(token.address))}
              onPress={() => router.push({ pathname: '/token/[address]', params: { address: token.address } })}
            />
          ))}
        </View>
        {isEvm && <Button title={`+ ${t('addToken')}`} variant="ghost" onPress={() => router.push('/add-token')} />}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  incoming: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
  },
  incomingText: { color: colors.success, fontWeight: '700', fontSize: 14 },
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
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 6 },
  action: { alignItems: 'center', gap: 8, width: 72 },
  actionIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  nativeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nativeAvatarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  amount: { color: colors.text, fontSize: 16, fontWeight: '700' },
  amountUsd: { color: colors.textSecondary, fontSize: 13 },
  totalUsd: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '600', marginTop: 6 },
});
