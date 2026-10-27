import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { FeeQuote } from '@/chains';
import { Alert, Button, Card, Icon, KeyValue, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { useAuthorize } from '@/lib/useAuthorize';
import { errorMessage, formatAmount, shortAddress } from '@/lib/format';
import { colors } from '@/theme';

type Phase = 'review' | 'sending' | 'done' | 'failed';

export default function Confirm() {
  const params = useLocalSearchParams<{ to: string; amount: string; token?: string }>();
  const { t, address, network, tokens, estimateFee, send } = useWallet();
  const authorize = useAuthorize();
  const token = useMemo(() => tokens.find((x) => x.address === params.token), [tokens, params.token]);
  const nativeSymbol = network?.symbol || 'ETH';
  const symbol = token ? token.symbol : nativeSymbol;

  const [estimate, setEstimate] = useState<FeeQuote | null>(null);
  const [estimateError, setEstimateError] = useState(false);
  const [phase, setPhase] = useState<Phase>('review');
  const [hash, setHash] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    estimateFee(params.to, params.amount, token)
      .then(setEstimate)
      .catch(() => setEstimateError(true));
  }, [estimateFee, token, params.to, params.amount]);

  const submit = async () => {
    if (!(await authorize(t('confirm')))) return;
    setPhase('sending');
    try {
      const result = await send(params.to, params.amount, token);
      setHash(result.hash);
      setPhase(result.status === 1 ? 'done' : 'failed');
      Haptics.notificationAsync(result.status === 1 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    } catch (e) {
      setError(errorMessage(e));
      setPhase('failed');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

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
          disabled={!estimate}
          onPress={submit}
        />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{t('send')}</Text>
        <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>{params.amount} <Text style={styles.heroSymbol}>{symbol}</Text></Text>
      </View>
      <Card>
        <KeyValue first k={t('from')} v={shortAddress(address)} mono />
        <KeyValue k={t('to')} v={params.to} mono />
        <KeyValue k={t('network')} v={network?.name || ''} />
      </Card>
      <Card>
        {estimate ? (
          <>
            <KeyValue first k={t('networkFee')} v={`${formatAmount(estimate.fee, 8)} ${nativeSymbol}`} />
            {!token && (
              <KeyValue k={t('total')} v={`${formatAmount(String(Number(params.amount) + Number(estimate.fee)), 8)} ${nativeSymbol}`} highlight />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  heroLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  heroAmount: { color: colors.text, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  heroSymbol: { fontSize: 20, color: colors.textSecondary },
  estimating: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  result: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 40 },
  resultIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 8 },
  resultAmount: { color: colors.textSecondary, fontSize: 18, fontWeight: '600' },
  hash: { color: colors.textMuted, fontFamily: 'Menlo', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
});
