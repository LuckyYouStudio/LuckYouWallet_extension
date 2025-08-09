import React, { useState } from 'react';
import { createWallet, importWallet } from '../core/wallet';

type View = 'home' | 'created' | 'import' | 'imported';

const Popup: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [mnemonic, setMnemonic] = useState('');
  const [address, setAddress] = useState('');
  const [inputMnemonic, setInputMnemonic] = useState('');

  const handleCreate = () => {
    const w = createWallet();
    setMnemonic(w.mnemonic);
    setAddress(w.address);
    setView('created');
  };

  const handleImport = () => {
    try {
      const w = importWallet(inputMnemonic);
      setMnemonic(w.mnemonic);
      setAddress(w.address);
      setView('imported');
    } catch (err) {
      alert('Invalid mnemonic');
    }
  };

  const backHome = () => {
    setView('home');
    setMnemonic('');
    setAddress('');
    setInputMnemonic('');
  };

  return (
    <div style={{ padding: '1rem', width: 300 }}>
      <h1>LuckYou Wallet</h1>
      {view === 'home' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button onClick={handleCreate}>Create Wallet</button>
          <button onClick={() => setView('import')}>Import Wallet</button>
        </div>
      )}
      {view === 'created' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p><strong>Mnemonic:</strong> {mnemonic}</p>
          <p><strong>Address:</strong> {address}</p>
          <button onClick={backHome}>Back</button>
        </div>
      )}
      {view === 'import' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea
            placeholder="Enter mnemonic"
            value={inputMnemonic}
            onChange={(e) => setInputMnemonic(e.target.value)}
            style={{ width: '100%' }}
          />
          <button onClick={handleImport}>Import</button>
          <button onClick={backHome}>Cancel</button>
        </div>
      )}
      {view === 'imported' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p><strong>Address:</strong> {address}</p>
          <button onClick={backHome}>Back</button>
        </div>
      )}
    </div>
  );
};

export default Popup;
