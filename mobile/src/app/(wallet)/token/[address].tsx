import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, KeyValue, Screen } from '@/components/ui';
import { CoinLogo } from '@/components/CoinLogo';
import { useWallet } from '@/state/WalletContext';
import { tokenLogo } from '@core/logos';
import { formatAmount, formatUsd, shortAddress, usdValue } from '@/lib/format';
import { colors } from '@/theme';

export default function TokenDetail() {
  const { address } = useLocalSearchParams<{ address: string }>();
  const { t, tokens, tokenBalances, prices } = useWallet();
  const token = tokens.find((x) => x.address === address);
  if (!token) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: token.symbol }} />
      <View style={styles.hero}>
        <CoinLogo logo={tokenLogo(token.address, token.symbol)} label={token.symbol} seed={token.address} size={68} />
        <Text style={styles.amount}>
          {formatAmount(tokenBalances[token.address] || '0')} <Text style={styles.symbol}>{token.symbol}</Text>
        </Text>
        {prices.tokens[token.address] != null ? (
          <Text style={styles.usd}>≈ {formatUsd(usdValue(tokenBalances[token.address] || '0', prices.tokens[token.address]))}</Text>
        ) : null}
        <Text style={styles.name}>{token.name}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title={t('send')}
          icon="arrow.up.right"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: '/send', params: { token: token.address } })}
        />
        <Button title={t('receive')} icon="arrow.down.left" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/receive')} />
      </View>
      <Card>
        <KeyValue first k={t('contract')} v={shortAddress(token.address)} mono />
        <KeyValue k={t('decimals')} v={String(token.decimals)} />
      </Card>
      <Button title={t('copy')} variant="ghost" icon="doc.on.doc" onPress={() => Clipboard.setStringAsync(token.address)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  usd: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  amount: { color: colors.text, fontSize: 34, fontWeight: '800', marginTop: 8 },
  symbol: { fontSize: 18, color: colors.textSecondary },
  name: { color: colors.textMuted, fontSize: 14 },
});
