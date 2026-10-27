import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { AppNetwork } from '@/chains';
import { Icon, ListItem, Screen, SectionTitle } from '@/components/ui';
import { CoinLogo } from '@/components/CoinLogo';
import { useWallet } from '@/state/WalletContext';
import { networkLogo } from '@core/logos';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

// 各链的代表色，用于网络头像
const FAMILY_COLORS: Record<string, string> = {
  bitcoin: '#f7931a',
  solana: '#9945ff',
  tron: '#eb0029',
};

export default function Networks() {
  const { t, networks, networkKey, switchNetwork } = useWallet();
  const all = Object.values(networks);
  const groups: { title: string; items: AppNetwork[] }[] = [
    { title: t('mainnets'), items: all.filter((n) => n.family === 'evm' && !n.isTestnet) },
    { title: t('otherChains'), items: all.filter((n) => n.family !== 'evm' && !n.isTestnet) },
    { title: t('testnets'), items: all.filter((n) => n.isTestnet) },
  ];

  return (
    <Screen>
      {groups.map((group) => (
        <React.Fragment key={group.title}>
          <SectionTitle title={group.title} />
          {group.items.map((net) => (
            <ListItem
              key={net.key}
              selected={net.key === networkKey}
              left={<CoinLogo logo={networkLogo(net.key)} label={net.name} seed={net.key} size={36} color={FAMILY_COLORS[net.family]} />}
              title={net.name}
              subtitle={net.symbol}
              right={net.key === networkKey ? <Icon name="checkmark.circle.fill" size={22} color={colors.primary} /> : null}
              onPress={async () => {
                try {
                  await switchNetwork(net.key);
                  router.back();
                } catch (e) {
                  Alert.alert(t('somethingWrong'), errorMessage(e));
                }
              }}
            />
          ))}
        </React.Fragment>
      ))}
    </Screen>
  );
}
