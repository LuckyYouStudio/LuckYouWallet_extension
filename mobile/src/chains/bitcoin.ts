import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { formatUnits, parseUnits } from './encoding';
import type { ActivityItem } from '@core/history';
import type { AppNetwork, ChainAdapter, FeeOption } from './types';

interface EsploraTx {
  txid: string;
  fee: number;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

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

  const fetchUtxos = (address: string) => api<EsploraUtxo[]>(base, `/address/${address}/utxo`);
  const fetchRates = () =>
    api<{ fastestFee: number; halfHourFee: number; hourFee: number }>(base, '/v1/fees/recommended');

  /** 构建 (可选签名) 交易：选币、找零，按给定费率 (sat/vB) 计费 */
  function build(address: string, utxos: EsploraUtxo[], to: string, amount: string, satPerVbyte: number) {
    const script = btc.OutScript.encode(btc.Address(btcNetwork).decode(address));
    const inputs = utxos.map((u) => ({
      txid: hex.decode(u.txid),
      index: u.vout,
      witnessUtxo: { script, amount: BigInt(u.value) },
    }));
    const selected = btc.selectUTXO(inputs, [{ address: to, amount: parseUnits(amount, 8) }], 'default', {
      feePerByte: BigInt(Math.max(1, Math.ceil(satPerVbyte))),
      changeAddress: address,
      network: btcNetwork,
      createTx: true,
    });
    if (!selected || !selected.tx) throw new Error('Insufficient balance');
    return selected;
  }

  const quote = (level: FeeOption['level'], fee: bigint, satPerVbyte: number, wait?: string): FeeOption => ({
    level,
    fee: formatUnits(fee, 8),
    wait,
    settings: { kind: 'btc', satPerVbyte },
  });

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

    /** 最近 25 笔 (含未确认)：按本地址的输入/输出净额判断收发 */
    async getHistory(address) {
      const txs = await api<EsploraTx[]>(base, `/address/${address}/txs`);
      return txs.map((tx): ActivityItem => {
        const received = tx.vout.reduce((sum, o) => (o.scriptpubkey_address === address ? sum + BigInt(o.value) : sum), 0n);
        const spent = tx.vin.reduce((sum, i) => (i.prevout?.scriptpubkey_address === address ? sum + BigInt(i.prevout.value) : sum), 0n);
        const outgoing = spent > 0n;
        // 发送金额 = 花费 - 找零 - 手续费
        const value = outgoing ? spent - received - BigInt(tx.fee) : received;
        const other = outgoing
          ? tx.vout.find((o) => o.scriptpubkey_address && o.scriptpubkey_address !== address)?.scriptpubkey_address
          : tx.vin.find((i) => i.prevout?.scriptpubkey_address !== address)?.prevout?.scriptpubkey_address;
        return {
          hash: tx.txid,
          direction: outgoing ? (value === 0n ? 'self' : 'out') : 'in',
          counterparty: other || address,
          value: formatUnits(value, 8),
          symbol: network.symbol,
          timestamp: (tx.status.block_time || 0) * 1000,
          status: tx.status.confirmed ? 'success' : 'pending',
        };
      });
    },

    async estimateFee(from, to, amount, _token, settings) {
      const utxos = await fetchUtxos(from);
      if (settings?.kind === 'btc') {
        const picked = quote('custom', build(from, utxos, to, amount, settings.satPerVbyte).fee!, settings.satPerVbyte);
        return { fee: picked.fee, settings: picked.settings };
      }
      const rates = await fetchRates();
      // mempool.space 推荐费率：1 小时 / 半小时 / 下一个区块
      const tiers: [FeeOption['level'], number, string][] = [
        ['low', rates.hourFee, '~60 min'],
        ['market', rates.halfHourFee, '~30 min'],
        ['aggressive', rates.fastestFee, '~10 min'],
      ];
      const options = tiers.map(([level, rate, wait]) => quote(level, build(from, utxos, to, amount, rate).fee!, rate, wait));
      const market = options[1];
      return { fee: market.fee, settings: market.settings, options };
    },

    async send(account, to, amount, _token, settings) {
      const [utxos, satPerVbyte] = await Promise.all([
        fetchUtxos(account.address),
        settings?.kind === 'btc' ? Promise.resolve(settings.satPerVbyte) : fetchRates().then((r) => r.halfHourFee),
      ]);
      const { tx } = build(account.address, utxos, to, amount, satPerVbyte);
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
