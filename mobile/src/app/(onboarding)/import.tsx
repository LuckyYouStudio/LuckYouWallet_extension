import React, { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Button, Field, Screen, Segmented } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';

export default function ImportWallet() {
  const { t, startImport } = useWallet();
  const [method, setMethod] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    // 让出一帧以显示加载状态 (助记词派生在 JS 中计算)
    setTimeout(() => {
      try {
        startImport(method, input);
        setInput('');
        router.push('/password');
      } catch {
        setError(method === 'mnemonic' ? t('invalidPhrase') : t('invalidKey'));
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  return (
    <Screen footer={<Button title={t('import')} disabled={!input.trim()} loading={busy} onPress={submit} />}>
      <Segmented
        options={[
          { key: 'mnemonic', label: t('recoveryPhrase') },
          { key: 'privateKey', label: t('privateKey') },
        ]}
        value={method}
        onChange={(k) => {
          setMethod(k as typeof method);
          setInput('');
          setError(null);
        }}
      />
      <Field
        label={method === 'mnemonic' ? t('recoveryPhrase') : t('privateKey')}
        placeholder={method === 'mnemonic' ? t('phrasePlaceholder') : t('keyPlaceholder')}
        value={input}
        onChangeText={(v) => {
          setInput(v);
          setError(null);
        }}
        multiline={method === 'mnemonic'}
        secureTextEntry={method === 'privateKey'}
        monospace
        error={error}
        style={method === 'mnemonic' ? { minHeight: 130, textAlignVertical: 'top', paddingTop: 15 } : undefined}
        autoFocus
      />
      <Alert>{t('neverShare')}</Alert>
    </Screen>
  );
}
