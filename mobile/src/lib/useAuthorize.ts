import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useWallet } from '@/state/WalletContext';
import * as vault from './vault';

/** 敏感操作 (发送交易、查看密钥) 前再次验证身份：优先面容 ID，否则输入密码 */
export function useAuthorize() {
  const { t, biometricsEnabled } = useWallet();

  return useCallback(
    async (reason: string): Promise<boolean> => {
      if (biometricsEnabled && (await vault.authenticateBiometric(reason))) return true;
      return new Promise((resolve) => {
        Alert.prompt(
          reason,
          t('enterPassword'),
          [
            { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
            {
              text: t('verify'),
              onPress: async (password?: string) => {
                const ok = !!password && (await vault.verifyPassword(password));
                if (!ok) Alert.alert(t('wrongPassword'));
                resolve(ok);
              },
            },
          ],
          'secure-text',
        );
      });
    },
    [t, biometricsEnabled],
  );
}
