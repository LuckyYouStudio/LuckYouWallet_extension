import React, { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Button, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { colors, mono } from '@/theme';

export default function Receive() {
  const { t, address, network } = useWallet();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Screen
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title={copied ? t('copied') : t('copyAddress')} icon={copied ? 'checkmark' : 'doc.on.doc'} onPress={copy} style={{ flex: 1 }} />
          <Button title={t('share')} variant="secondary" icon="square.and.arrow.up" onPress={() => Share.share({ message: address })} style={{ flex: 1 }} />
        </View>
      }
    >
      <Text style={styles.hint}>{t('receiveHint', { network: network?.name || '' })}</Text>
      <View style={styles.qrCard}>
        <QRCode value={address} size={220} backgroundColor="#fff" color="#0b0d14" />
      </View>
      <Text style={styles.address} selectable>{address}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textSecondary, textAlign: 'center', fontSize: 15, marginTop: 8 },
  qrCard: { alignSelf: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 24, marginVertical: 12 },
  address: { color: colors.text, fontFamily: mono, fontSize: 15, textAlign: 'center', lineHeight: 24, paddingHorizontal: 12 },
});
