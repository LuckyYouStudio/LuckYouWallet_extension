import React from 'react';
import { router } from 'expo-router';
import { Avatar, Icon, ListItem, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { colors } from '@/theme';

// 移动端隐藏本地开发网络
const HIDDEN = new Set(['hardhat', 'localhost']);

export default function Networks() {
  const { networks, networkKey, switchNetwork } = useWallet();

  return (
    <Screen>
      {Object.entries(networks)
        .filter(([key]) => !HIDDEN.has(key) || key === networkKey)
        .map(([key, net]) => (
          <ListItem
            key={key}
            selected={key === networkKey}
            left={<Avatar label={net.name} seed={key} size={36} />}
            title={net.name}
            subtitle={`Chain ID ${net.chainId} · ${net.currencySymbol}`}
            right={key === networkKey ? <Icon name="checkmark.circle.fill" size={22} color={colors.primary} /> : null}
            onPress={async () => {
              await switchNetwork(key);
              router.back();
            }}
          />
        ))}
    </Screen>
  );
}
