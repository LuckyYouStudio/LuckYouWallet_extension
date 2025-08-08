import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';

const Popup: React.FC = () => {
  const [address, setAddress] = useState<string>('');
  const [balance, setBalance] = useState<string>('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    async function load() {
      if ((window as any).ethereum) {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          const bal = await provider.getBalance(accounts[0]);
          setBalance(ethers.formatEther(bal));
        }
      }
    }
    load();
  }, []);

  const sendTransaction = async () => {
    if (!recipient || !amount) return;
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    await signer.sendTransaction({
      to: recipient,
      value: ethers.parseEther(amount),
    });
  };

  return (
    <div style={{ padding: '1rem', width: 300 }}>
      <h1>LuckYou Wallet</h1>
      <p><strong>Address:</strong> {address}</p>
      <p><strong>Balance:</strong> {balance} ETH</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Recipient"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
        />
        <input
          type="text"
          placeholder="Amount in ETH"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button onClick={sendTransaction}>Send</button>
      </div>
    </div>
  );
};

export default Popup;

