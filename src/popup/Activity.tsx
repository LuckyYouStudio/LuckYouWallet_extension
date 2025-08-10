import React, { useState } from 'react';
import { TransactionRecord, WalletInfo } from '../core/wallet';
import { TranslationKey } from '../core/i18n';

interface ActivityProps {
  records: TransactionRecord[];
  wallet: WalletInfo;
  onBack: () => void;
  t: (key: TranslationKey) => string;
}

const Activity: React.FC<ActivityProps> = ({ records, wallet, onBack, t }) => {
  const address = wallet.address.toLowerCase();
  const sent = records.filter((r) => r.from.toLowerCase() === address);
  const [selected, setSelected] = useState<TransactionRecord | null>(null);

  if (selected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button onClick={() => setSelected(null)}>{t('back')}</button>
        <h3>{t('transactionDetails')}</h3>
        <p>
          <strong>{t('hash')}:</strong> {selected.hash}
        </p>
        <p>
          <strong>{t('from')}:</strong> {selected.from}
        </p>
        <p>
          <strong>{t('to')}:</strong> {selected.to}
        </p>
        <p>
          <strong>{t('value')}:</strong> {selected.value} ETH
        </p>
        <p>
          <strong>{t('status')}:</strong>{' '}
          {selected.status === 1 ? t('success') : t('fail')}
        </p>
        <a
          href={`https://sepolia.etherscan.io/tx/${selected.hash}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('viewOnEtherscan')}
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button onClick={onBack}>{t('back')}</button>
      <h3>{t('activity')}</h3>
      {sent.length === 0 ? (
        <p>{t('noTransactions')}</p>
      ) : (
        <ul style={{ maxHeight: '150px', overflowY: 'auto', paddingLeft: '1rem' }}>
          {sent.map((r) => (
            <li key={r.hash}>
              <button
                onClick={() => setSelected(r)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                Sent {r.value} ETH to {r.to} ({r.status === 1 ? t('success') : t('fail')})
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Activity;
