import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ActivityItem, localToActivity, mergeActivity } from '@core/history';
import { Alert, Avatar, Icon, ListItem, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { loadHistory } from '@/lib/storage';
import { formatAmount, shortAddress } from '@/lib/format';
import { colors } from '@/theme';

type Source = 'chain' | 'local' | 'failed';

export default function Activity() {
  const { t, lang, address, networkKey, network, adapter, tokens } = useWallet();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [source, setSource] = useState<Source>('local');
  const [refreshing, setRefreshing] = useState(false);
  const txUrl = network?.txUrl;
  const symbol = network?.symbol || 'ETH';

  /** 链上记录 (含收款) + 本机发出但尚未被索引的交易 */
  const load = useCallback(async () => {
    const local = (await loadHistory(address, networkKey).catch(() => [])).map((r) => localToActivity(r, symbol));
    if (!adapter?.getHistory) {
      setItems(local);
      setSource('local');
      return;
    }
    try {
      const remote = await adapter.getHistory(address, tokens);
      setItems(mergeActivity(remote, local));
      setSource('chain');
    } catch {
      setItems(local);
      setSource('failed');
    }
  }, [address, networkKey, adapter, tokens, symbol]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const notice =
    source === 'local' ? t('localOnlyHistory') : source === 'failed' ? t('historyFailed') : null;

  if (items === null) {
    return (
      <Screen>
        <View style={styles.empty}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}>
      {notice ? <Alert tone={source === 'failed' ? 'warning' : 'info'}>{notice}</Alert> : null}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="clock" size={28} color={colors.textMuted} /></View>
          <Text style={styles.emptyText}>{t('noActivity')}</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {items.map((item, index) => {
            const incoming = item.direction === 'in';
            const failed = item.status === 'failed';
            const tint = failed ? colors.textMuted : incoming ? colors.success : colors.danger;
            const title =
              item.direction === 'self'
                ? t('toSelf')
                : `${incoming ? t('received') : t('sentOut')} ${incoming ? '←' : '→'} ${shortAddress(item.counterparty)}`;
            const state = item.status === 'pending' ? t('pending') : failed ? t('failed') : null;
            const time = item.timestamp ? formatTime(item.timestamp) : null;
            return (
              <ListItem
                key={`${item.hash}-${index}`}
                left={
                  <Avatar label="" color={failed ? colors.surfaceHover : incoming ? colors.successSoft : colors.dangerSoft}>
                    <Icon name={incoming ? 'arrow.down.left' : 'arrow.up.right'} size={16} color={tint} />
                  </Avatar>
                }
                title={title}
                subtitle={[time, state].filter(Boolean).join(' · ') || t('success')}
                right={
                  <Text style={[styles.value, incoming && !failed && { color: colors.success }, failed && styles.failed]}>
                    {incoming ? '+' : item.direction === 'out' ? '-' : ''}
                    {formatAmount(item.value)} {item.symbol}
                  </Text>
                }
                onPress={txUrl ? () => Linking.openURL(txUrl(item.hash)) : undefined}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 120 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  value: { color: colors.text, fontWeight: '700', fontSize: 15, maxWidth: 150, textAlign: 'right' },
  failed: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
