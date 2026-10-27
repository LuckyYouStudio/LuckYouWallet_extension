import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { FeeLevel, FeeQuote } from '@/chains';
import { FeeSheet } from '@/components/FeeSheet';
import { Alert, Button, Card, Icon, KeyValue, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { useAuthorize } from '@/lib/useAuthorize';
import { errorMessage, formatAmount, formatUsd, shortAddress, usdValue } from '@/lib/format';
import { colors } from '@/theme';

type Phase = 'review' | 'sending' | 'done' | 'failed';

const LEVEL_LABELS = { low: 'feeLow', market: 'feeMarket', aggressive: 'feeAggressive', custom: 'feeCustom' } as const;

export default function Confirm() {
  const params = useLocalSearchParams<{ to: string; amount: string; token?: string }>();
  const { t, address, network, tokens, prices, estimateFee, send } = useWallet();
  const authorize = useAuthorize();
  const token = useMemo(() => tokens.find((x) => x.address === params.token), [tokens, params.token]);
  const nativeSymbol = network?.symbol || 'ETH';
  const symbol = token ? token.symbol : nativeSymbol;

  /** 默认估算 (含各档位) 与当前选中的手续费 */
  const [estimate, setEstimate] = useState<FeeQuote | null>(null);
  const [chosen, setChosen] = useState<FeeQuote | null>(null);
  const [level, setLevel] = useState<FeeLevel>('market');
  const [editing, setEditing] = useState(false);
  const [estimateError, setEstimateError] = useState(false);
  const [phase, setPhase] = useState<Phase>('review');
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    estimateFee(params.to, params.amount, token)
      .then((quote) => {
        setEstimate(quote);
        setChosen(quote);
      })
      .catch(() => setEstimateError(true));
  }, [estimateFee, token, params.to, params.amount]);

  const submit = async () => {
    if (!(await authorize(t('confirm')))) return;
    setPhase('sending');
    try {
      const result = await send(params.to, params.amount, token, chosen?.settings);
      setHash(result.hash);
      setPhase(result.status === 1 ? 'done' : 'failed');
      Haptics.notificationAsync(result.status === 1 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      setError(errorMessage(e));
      setPhase('failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const amountPrice = token ? prices.tokens[token.address] : prices.native;
  const amountUsd = formatUsd(usdValue(params.amount, amountPrice));
  const feeUsd = formatUsd(usdValue(chosen?.fee, prices.native));
  const totalUsd = !token && chosen ? formatUsd(usdValue(String(Number(params.amount) + Number(chosen.fee)), prices.native)) : '';

  const txUrl = network?.txUrl;

  if (phase === 'done' || phase === 'failed') {
    const ok = phase === 'done';
    return (
      <Screen
        footer={
          <>
            {hash && txUrl ? <Button title={t('viewExplorer')} variant="secondary" icon="safari" onPress={() => Linking.openURL(txUrl(hash))} /> : null}
            <Button title={t('finish')} onPress={() => router.dismissTo('/home')} />
          </>
        }
      >
        <View style={styles.result}>
          <View style={[styles.resultIcon, { backgroundColor: ok ? colors.successSoft : colors.dangerSoft }]}>
            <Icon name={ok ? 'checkmark' : 'xmark'} size={38} color={ok ? colors.success : colors.danger} />
          </View>
          <Text style={styles.resultTitle}>{ok ? t('sent') : t('sendFailed')}</Text>
          <Text style={styles.resultAmount}>{params.amount} {symbol}</Text>
          {hash ? <Text style={styles.hash} selectable>{hash}</Text> : null}
          {ok && network?.family === 'bitcoin' ? <Alert>{t('btcConfirmNote')}</Alert> : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          title={phase === 'sending' ? t('sending') : t('confirm')}
          icon="paperplane.fill"
          loading={phase === 'sending'}
          disabled={!chosen}
          onPress={submit}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('send')}</Text>
        <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{params.amount} <Text style={styles.heroSymbol}>{symbol}</Text></Text>
        {amountUsd ? <Text style={styles.heroUsd}>≈ {amountUsd}</Text> : null}
      </View>
      <Card>
        <KeyValue first k={t('from')} v={shortAddress(address)} mono />
        <KeyValue k={t('to')} v={params.to} mono />
        <KeyValue k={t('network')} v={network?.name || ''} />
      </Card>
      <Card>
        {chosen && estimate ? (
          <>
            <Pressable
              disabled={!estimate.options}
              onPress={() => setEditing(true)}
              style={({ pressed }) => [styles.feeRow, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.feeLabel}>{t('networkFee')}</Text>
                {estimate.options ? (
                  <View style={styles.levelChip}>
                    <Text style={styles.levelText}>{t(LEVEL_LABELS[level])}</Text>
                    <Icon name="chevron.right" size={10} color={colors.primary} />
                  </View>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={styles.feeValue}>{feeUsd || `${formatAmount(chosen.fee, 8)} ${nativeSymbol}`}</Text>
                {feeUsd ? <Text style={styles.feeSub}>{formatAmount(chosen.fee, 8)} {nativeSymbol}</Text> : null}
              </View>
            </Pressable>
            {!token && (
              <KeyValue
                k={t('total')}
                v={`${formatAmount(String(Number(params.amount) + Number(chosen.fee)), 8)} ${nativeSymbol}${totalUsd ? `  ≈ ${totalUsd}` : ''}`}
                highlight
              />
            )}
          </>
        ) : estimateError ? (
          <Alert tone="danger">{t('estimateFailed')}</Alert>
        ) : (
          <View style={styles.estimating}>
            <ActivityIndicator color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary }}>{t('estimating')}</Text>
          </View>
        )}
      </Card>
      {estimate && chosen ? (
        <FeeSheet
          visible={editing}
          quote={estimate}
          selected={level}
          current={chosen.settings}
          symbol={nativeSymbol}
          price={prices.native}
          onSelect={(option) => {
            setLevel(option.level);
            setChosen({ ...estimate, fee: option.fee, maxFee: option.maxFee, settings: option.settings });
            setEditing(false);
          }}
          onCustom={async (settings) => {
            const quote = await estimateFee(params.to, params.amount, token, settings);
            setLevel('custom');
            setChosen(quote);
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  heroLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  heroAmount: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  heroSymbol: { fontSize: 20, color: colors.textSecondary },
  heroUsd: { color: colors.textSecondary, fontSize: 16, fontWeight: '600' },
  feeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  feeLabel: { color: colors.textSecondary, fontSize: 14 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  levelText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  feeValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  feeSub: { color: colors.textSecondary, fontSize: 13 },
  estimating: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 40 },
  resultIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 8 },
  resultAmount: { color: colors.textSecondary, fontSize: 18, fontWeight: '600' },
  hash: { color: colors.textMuted, fontFamily: 'Menlo', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
});
