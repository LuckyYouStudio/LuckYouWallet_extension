import React, { useState } from 'react';
import { TransactionRecord, WalletInfo } from '../core/wallet';
import { TranslationKey } from '../core/i18n';
import { Icon, PageHeader, shortAddress, formatAmount } from './ui';

interface ActivityProps {
  records: TransactionRecord[];
  wallet: WalletInfo;
  onBack: () => void;
  t: (key: TranslationKey) => string;
  symbol: string;
  explorerBase: string;
}

const Activity: React.FC<ActivityProps> = ({ records, wallet, onBack, t, symbol, explorerBase }) => {
  const address = wallet.address.toLowerCase();
  const sent = records.filter((r) => r.from.toLowerCase() === address);
  const [selected, setSelected] = useState<TransactionRecord | null>(null);

  if (selected) {
    return (
      <div className="page">
        <PageHeader title={t('transactionDetails')} onBack={() => setSelected(null)} />
        <div className="card center">
          <div className="avatar sent receive-avatar" style={{ margin: '0 auto 10px' }}>
            <Icon name="arrowUp" size={24} />
          </div>
          <div className="balance-amount" style={{ fontSize: 26 }}>
            -{formatAmount(selected.value)}<span className="sym" style={{ fontSize: 14 }}>{symbol}</span>
          </div>
          <span className={`status-pill ${selected.status === 1 ? 'ok' : 'fail'}`}>
            {selected.status === 1 ? t('success') : t('fail')}
          </span>
        </div>
        <div className="card">
          <div className="kv"><span className="k">{t('from')}</span><span className="v mono">{selected.from}</span></div>
          <div className="kv"><span className="k">{t('to')}</span><span className="v mono">{selected.to}</span></div>
          <div className="kv"><span className="k">{t('hash')}</span><span className="v mono">{selected.hash}</span></div>
        </div>
        {explorerBase && (
          <a
            className="btn btn-secondary"
            style={{ textDecoration: 'none' }}
            href={`${explorerBase}/tx/${selected.hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={16} /> {t('viewOnEtherscan')}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title={t('activity')} onBack={onBack} />
      {sent.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="activity" /></div>
          {t('noTransactions')}
        </div>
      ) : (
        <div className="list">
          {sent.map((r) => (
            <button key={r.hash} className="list-item" onClick={() => setSelected(r)}>
              <div className="avatar sent"><Icon name="arrowUp" size={16} /></div>
              <div className="main">
                <div className="title">{t('send')}</div>
                <div className="sub mono">{shortAddress(r.to)}</div>
              </div>
              <div className="end">
                -{formatAmount(r.value)} {symbol}
                <div>
                  <span className={`status-pill ${r.status === 1 ? 'ok' : 'fail'}`}>
                    {r.status === 1 ? t('success') : t('fail')}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default Activity;
