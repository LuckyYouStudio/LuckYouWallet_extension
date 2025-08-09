import React from 'react';
import { TransactionRecord, WalletInfo } from '../core/wallet';

interface ActivityProps {
  records: TransactionRecord[];
  wallet: WalletInfo;
  onBack: () => void;
}

const Activity: React.FC<ActivityProps> = ({ records, wallet, onBack }) => {
  const address = wallet.address.toLowerCase();
  const sent = records.filter((r) => r.from.toLowerCase() === address);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <button onClick={onBack}>Back</button>
      <h3>Activity</h3>
      {sent.length === 0 ? (
        <p>No sent transactions</p>
      ) : (
        <ul style={{ maxHeight: '150px', overflowY: 'auto', paddingLeft: '1rem' }}>
          {sent.map((r) => (
            <li key={r.hash}>
              Sent {r.value} ETH to {r.to} ({r.status === 1 ? 'Success' : 'Fail'})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Activity;
