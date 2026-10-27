import React, { useEffect, useState } from 'react';
import { TokenInfo, TransactionRecord, WalletInfo } from '../core/wallet';
import { ActivityItem, getEvmActivity, hasEvmHistory, localToActivity, mergeActivity } from '../core/history';
import { TranslationKey } from '../core/i18n';
import { Icon, PageHeader, shortAddress, formatAmount } from './ui';

interface ActivityProps {
  /** 本机发出的交易 (尚未被链上索引的也会显示) */
  records: TransactionRecord[];
  wallet: WalletInfo;
  network: string;
  tokens: TokenInfo[];
  lang: string;
  onBack: () => void;
  t: (key: TranslationKey) => string;
  symbol: string;
  explorerBase: string;
}

type Source = 'loading' | 'chain' | 'local' | 'failed';

const Activity: React.FC<ActivityProps> = ({ records, wallet, network, tokens, lang, onBack, t, symbol, explorerBase }) => {
  const tr = (en: string, zh: string) => (lang === 'zh' ? zh : en);
  const address = wallet.address.toLowerCase();
  const local = records.filter((r) => r.from.toLowerCase() === address).map((r) => localToActivity(r, symbol));
  const supported = hasEvmHistory(network);
  const [remote, setRemote] = useState<ActivityItem[] | null>(null);
  const [source, setSource] = useState<Source>(supported ? 'loading' : 'local');
  const [selected, setSelected] = useState<ActivityItem | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    getEvmActivity(wallet.address, network, tokens)
      .then((items) => {
        if (cancelled) return;
        setRemote(items);
        setSource('chain');
      })
      .catch(() => !cancelled && setSource('failed'));
    return () => {
      cancelled = true;
    };
  }, [supported, wallet.address, network, tokens]);

  const items = remote ? mergeActivity(remote, local) : local;
  const formatTime = (ms: number) =>
    new Date(ms).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const label = (item: ActivityItem) =>
    item.direction === 'self' ? tr('To yourself', '转给自己') : item.direction === 'in' ? tr('Received', '收款') : t('send');
  const sign = (item: ActivityItem) => (item.direction === 'in' ? '+' : item.direction === 'out' ? '-' : '');
  const statusPill = (item: ActivityItem) =>
    item.status === 'success' ? null : (
      <span className={`status-pill ${item.status === 'failed' ? 'fail' : 'pending'}`}>
        {item.status === 'failed' ? t('fail') : tr('Pending', '待确认')}
      </span>
    );

  if (selected) {
    const incoming = selected.direction === 'in';
    return (
      <div className="page">
        <PageHeader title={t('transactionDetails')} onBack={() => setSelected(null)} />
        <div className="card center">
          <div className={`avatar ${incoming ? 'received' : 'sent'} receive-avatar`} style={{ margin: '0 auto 10px' }}>
            <Icon name={incoming ? 'arrowDown' : 'arrowUp'} size={24} />
          </div>
          <div className="balance-amount" style={{ fontSize: 26 }}>
            {sign(selected)}{formatAmount(selected.value)}<span className="sym" style={{ fontSize: 14 }}>{selected.symbol}</span>
          </div>
          <span className={`status-pill ${selected.status === 'success' ? 'ok' : selected.status === 'failed' ? 'fail' : 'pending'}`}>
            {selected.status === 'success' ? t('success') : selected.status === 'failed' ? t('fail') : tr('Pending', '待确认')}
          </span>
        </div>
        <div className="card">
          <div className="kv">
            <span className="k">{incoming ? t('from') : t('to')}</span>
            <span className="v mono">{selected.counterparty}</span>
          </div>
          {selected.timestamp > 0 && (
            <div className="kv"><span className="k">{tr('Time', '时间')}</span><span className="v">{new Date(selected.timestamp).toLocaleString()}</span></div>
          )}
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
      {source === 'local' && (
        <div className="alert alert-info">
          <Icon name="shield" size={15} />
          {tr('This network only shows transactions sent from this device.', '该网络仅显示本机发出的交易。')}
        </div>
      )}
      {source === 'failed' && (
        <div className="alert alert-warning">
          <Icon name="warning" size={15} />
          {tr('Could not load on-chain history. Showing transactions sent from this device.', '链上记录加载失败，仅显示本机发出的交易。')}
        </div>
      )}
      {source === 'loading' && items.length === 0 ? (
        <div className="empty"><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="activity" /></div>
          {t('noTransactions')}
        </div>
      ) : (
        <div className="list">
          {items.map((item, index) => {
            const incoming = item.direction === 'in';
            return (
              <button key={`${item.hash}-${index}`} className="list-item" onClick={() => setSelected(item)}>
                <div className={`avatar ${incoming ? 'received' : 'sent'}`}>
                  <Icon name={incoming ? 'arrowDown' : 'arrowUp'} size={16} />
                </div>
                <div className="main">
                  <div className="title">{label(item)}</div>
                  <div className="sub">
                    <span className="mono">{shortAddress(item.counterparty)}</span>
                    {item.timestamp > 0 && ` · ${formatTime(item.timestamp)}`}
                  </div>
                </div>
                <div className={`end${incoming && item.status !== 'failed' ? ' text-success' : ''}`}>
                  {sign(item)}{formatAmount(item.value)} {item.symbol}
                  {statusPill(item) && <div>{statusPill(item)}</div>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Activity;
