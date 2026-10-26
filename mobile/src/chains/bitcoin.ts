import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { formatUnits, parseUnits } from './encoding';
import type { AppNetwork, ChainAccount, ChainAdapter } from './types';

interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status: { confirmed: boolean };
}

async function api<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export function createBitcoinAdapter(network: AppNetwork): ChainAdapter {
  const base = network.endpoint!;
  const btcNetwork = network.isTestnet ? btc.TEST_NETWORK : btc.NETWORK;

  /** 构建 (可选签名) 交易：选币、找零、按 mempool.space "半小时内确认" 费率计费 */
  async function build(account: Pick<ChainAccount, 'address'> & { privateKey?: string }, to: string, amount: string) {
    const [utxos, fees] = await Promise.all([
      api<EsploraUtxo[]>(base, `/address/${account.address}/utxo`),
      api<{ halfHourFee: number }>(base, '/v1/fees/recommended'),
    ]);
    const script = btc.OutScript.encode(btc.Address(btcNetwork).decode(account.address));
    const inputs = utxos.map((u) => ({
      txid: hex.decode(u.txid),
      index: u.vout,
      witnessUtxo: { script, amount: BigInt(u.value) },
    }));
    const selected = btc.selectUTXO(inputs, [{ address: to, amount: parseUnits(amount, 8) }], 'default', {
      feePerByte: BigInt(Math.max(1, Math.ceil(fees.halfHourFee))),
      changeAddress: account.address,
      network: btcNetwork,
      createTx: true,
    });
    if (!selected || !selected.tx) throw new Error('Insufficient balance');
    return selected;
  }

  return {
    isValidAddress(address) {
      try {
        btc.Address(btcNetwork).decode(address);
        return true;
      } catch {
        return false;
      }
    },

    async getBalance(address) {
      const info = await api<{
        chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
        mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
      }>(base, `/address/${address}`);
      const sats =
        info.chain_stats.funded_txo_sum -
        info.chain_stats.spent_txo_sum +
        info.mempool_stats.funded_txo_sum -
        info.mempool_stats.spent_txo_sum;
      return formatUnits(BigInt(sats), 8);
    },

    async getTokens() {
      return [];
    },

    async estimateFee(from, to, amount) {
      const { fee } = await build({ address: from }, to, amount);
      return { fee: formatUnits(fee!, 8) };
    },

    async send(account, to, amount) {
      const { tx } = await build(account, to, amount);
      const privateKey = hex.decode(account.privateKey);
      // 防御性检查：私钥必须对应当前地址
      const derived = btc.p2wpkh(secp256k1.getPublicKey(privateKey, true), btcNetwork).address;
      if (derived !== account.address) throw new Error('Key does not match address');
      tx!.sign(privateKey);
      tx!.finalize();
      const txid = await api<string>(base, '/tx', { method: 'POST', body: tx!.hex });
      // 比特币确认需要约 10 分钟，广播成功即视为已提交
      return { hash: String(txid).trim(), status: 1 };
    },
  };
}
