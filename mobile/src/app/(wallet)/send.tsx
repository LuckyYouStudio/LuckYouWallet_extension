import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Avatar, Button, Field, ListItem, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { formatAmount } from '@/lib/format';
import { colors } from '@/theme';

export default function Send() {
  const { token: tokenAddress } = useLocalSearchParams<{ token?: string }>();
  const { t, network, adapter, balance, tokens, tokenBalances } = useWallet();
  const token = useMemo(() => tokens.find((x) => x.address === tokenAddress), [tokens, tokenAddress]);
  const symbol = token ? token.symbol : network?.symbol || 'ETH';
  const isValidAddress = (a: string) => !!adapter?.isValidAddress(a);
  const placeholder = { evm: '0x…', bitcoin: network?.isTestnet ? 'tb1…' : 'bc1…', solana: 'Solana address', tron: 'T…' }[network?.family || 'evm'];
  const available = token ? tokenBalances[token.address] || '0' : balance || '0';

  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  const addressError = to && !isValidAddress(to) ? t('invalidAddress') : null;
  const amountNum = Number(amount);
  const amountError = amount && (!(amountNum > 0) || amountNum > Number(available)) ? t('invalidAmount') : null;
  const valid = isValidAddress(to) && amountNum > 0 && !amountError;

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
        placeholder={placeholder}
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
