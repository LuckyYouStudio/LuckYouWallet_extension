import React, { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { TransactionRecord } from '@core/wallet';
import { Avatar, Icon, ListItem, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { loadHistory } from '@/lib/storage';
import { shortAddress } from '@/lib/format';
import { colors } from '@/theme';

export default function Activity() {
  const { t, address, networkKey, network } = useWallet();
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const explorer = (network?.blockExplorer || '').replace(/\/$/, '');
  const symbol = network?.currencySymbol || 'ETH';

  useFocusEffect(
    useCallback(() => {
      loadHistory(address, networkKey).then(setRecords);
    }, [address, networkKey]),
  );

  if (records.length === 0) {
    return (
      <Screen>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="clock" size={28} color={colors.textMuted} /></View>
          <Text style={styles.emptyText}>{t('noActivity')}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        {records.map((r) => {
          const ok = r.status === 1;
          // 代币交易的 value 已包含符号
          const value = r.value.includes(' ') ? r.value : `${r.value} ${symbol}`;
          return (
            <ListItem
              key={r.hash}
              left={
                <Avatar label="" color={ok ? colors.dangerSoft : colors.surfaceHover}>
                  <Icon name="arrow.up.right" size={16} color={ok ? colors.danger : colors.textMuted} />
                </Avatar>
              }
              title={`${t('send')} → ${shortAddress(r.to)}`}
              subtitle={ok ? t('success') : t('failed')}
              right={<Text style={styles.value}>-{value}</Text>}
              onPress={explorer ? () => Linking.openURL(`${explorer}/tx/${r.hash}`) : undefined}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 120 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 15 },
  value: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
