import React, { useState, useEffect } from 'react';
import { createWallet, importWallet, WalletInfo } from '../core/wallet';

type View = 'home' | 'created' | 'import' | 'imported';

const STORAGE_KEY = 'currentWallet';
interface StoredWallet extends WalletInfo {
  source: 'created' | 'imported';
}

const Popup: React.FC = () => {
  const [view, setView] = useState<View>('home');
  const [mnemonic, setMnemonic] = useState('');
  const [address, setAddress] = useState('');
  const [inputMnemonic, setInputMnemonic] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const w: StoredWallet = JSON.parse(stored);
        setMnemonic(w.mnemonic);
        setAddress(w.address);
        setView(w.source);
      } catch (e) {
        console.error('Failed to parse stored wallet', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const handleCreate = () => {
    const w = createWallet();
    setMnemonic(w.mnemonic);
    setAddress(w.address);
    setView('created');
    const stored: StoredWallet = { ...w, source: 'created' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  };

  const handleImport = () => {
    try {
      const w = importWallet(inputMnemonic);
      setMnemonic(w.mnemonic);
      setAddress(w.address);
      setView('imported');
      const stored: StoredWallet = { ...w, source: 'imported' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
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

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    backHome();
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
          <button onClick={logout}>Logout</button>
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
          <button onClick={logout}>Logout</button>
        </div>
      )}
    </div>
  );
};

export default Popup;
