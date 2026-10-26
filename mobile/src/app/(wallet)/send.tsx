import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { isAddress } from 'ethers';
import { Avatar, Button, Field, ListItem, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { formatAmount } from '@/lib/format';
import { colors } from '@/theme';

export default function Send() {
  const { token: tokenAddress } = useLocalSearchParams<{ token?: string }>();
  const { t, network, balance, tokens, tokenBalances } = useWallet();
  const token = useMemo(() => tokens.find((x) => x.address === tokenAddress), [tokens, tokenAddress]);
  const symbol = token ? token.symbol : network?.currencySymbol || 'ETH';
  const available = token ? tokenBalances[token.address] || '0' : balance || '0';

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  const addressError = to && !isAddress(to) ? t('invalidAddress') : null;
  const amountNum = Number(amount);
  const amountError = amount && (!(amountNum > 0) || amountNum > Number(available)) ? t('invalidAmount') : null;
  const valid = isAddress(to) && amountNum > 0 && !amountError;

  return (
    <Screen
      footer={
        <Button
          title={t('next')}
          disabled={!valid}
          onPress={() => router.push({ pathname: '/confirm', params: { to, amount, token: token?.address || '' } })}
        />
      }
    >
      <ListItem
        left={<Avatar label={symbol} seed={token?.address || symbol} />}
        title={symbol}
        subtitle={`${t('available')}: ${formatAmount(available)}`}
      />
      <Field
        label={t('to')}
        placeholder="0x…"
        value={to}
        onChangeText={(v) => setTo(v.trim())}
        monospace
        error={addressError}
        right={
          <Pressable onPress={async () => setTo((await Clipboard.getStringAsync()).trim())} hitSlop={8}>
            <Text style={styles.link}>{t('paste')}</Text>
          </Pressable>
        }
      />
      <Field
        label={t('amount')}
        placeholder="0.0"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={(v) => setAmount(v.replace(',', '.'))}
        error={amountError}
        right={
          token ? (
            <Pressable onPress={() => setAmount(available)} hitSlop={8}>
              <Text style={styles.link}>{t('max')}</Text>
            </Pressable>
          ) : undefined
        }
        style={{ fontSize: 22, fontWeight: '700' }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
