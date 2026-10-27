import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { router } from 'expo-router';
import { isAddress } from 'ethers';
import { getTokenInfo, TokenInfo } from '@core/wallet';
import { Avatar, Button, Field, ListItem, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

export default function AddToken() {
  const { t, networkKey, tokens, addToken } = useWallet();
  const [address, setAddress] = useState('');
  // 合约查询结果按地址缓存，输入变化时自动失效
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{ address: string; info: TokenInfo | null } | null>(null);

  const validationError = !address
    ? null
    : !isAddress(address)
      ? t('invalidAddress')
      : tokens.some((x) => x.address.toLowerCase() === address.toLowerCase())
        ? t('alreadyAdded')
        : null;
  const canLookup = !!address && !validationError;
  const result = lookup?.address === address ? lookup : null;
  const preview = result?.info ?? null;
  const loading = canLookup && !result;
  const error = saveError || validationError || (result && !result.info ? t('tokenNotFound') : null);

  useEffect(() => {
    if (!canLookup) return;
    let cancelled = false;
    getTokenInfo(address, networkKey)
      .then((info) => !cancelled && setLookup({ address, info }))
      .catch(() => !cancelled && setLookup({ address, info: null }));
    return () => {
      cancelled = true;
    };
  }, [address, canLookup, networkKey]);

  return (
    <Screen
      footer={
        <Button
          title={t('addToken')}
          disabled={!preview}
          onPress={async () => {
            if (!preview) return;
            try {
              await addToken(preview);
              router.back();
            } catch (e) {
              setSaveError(errorMessage(e));
            }
          }}
        />
      }
    >
      <Field label={t('tokenAddress')} placeholder="0x…" value={address} onChangeText={(v) => {
          setAddress(v.trim());
          setSaveError(null);
        }} monospace error={error} autoFocus />
      {loading && <ActivityIndicator color={colors.textSecondary} />}
      {preview && (
        <ListItem
          left={<Avatar label={preview.symbol} seed={preview.address} />}
          title={preview.symbol}
          subtitle={preview.name}
          right={<Text style={{ color: colors.textMuted }}>{t('decimals')} {preview.decimals}</Text>}
        />
      )}
    </Screen>
  );
}
