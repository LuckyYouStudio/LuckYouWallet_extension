import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hex } from '@scure/base';
import type { TokenInfo } from '@core/wallet';
import { formatUnits, isTronAddress, parseUnits, tronAddressFromPublicKey, tronToHex } from './encoding';
import type { AppNetwork, Asset, ChainAccount, ChainAdapter } from './types';

// 主网内置 TRC20 代币 (精度已在链上核对)
const MAINNET_TOKENS: TokenInfo[] = [
  { address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { address: 'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { address: 'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn', symbol: 'USDD', name: 'Decentralized USD', decimals: 18 },
  { address: 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR', symbol: 'WTRX', name: 'Wrapped TRX', decimals: 6 },
];

/** TRC20 转账的手续费上限 (sun)，不足能量时最多燃烧这么多 TRX */
const FEE_LIMIT = 100_000_000;
/** 无免费带宽时 TRX 转账约消耗 ~270 带宽 × 1000 sun */
const TRANSFER_BANDWIDTH_FEE = 270_000n;

export interface TronTx {
  txID: string;
  raw_data_hex: string;
  raw_data: unknown;
  visible?: boolean;
  signature?: string[];
}

/** protobuf varint 编码 (用于在交易字节中校验金额) */
export function varint(n: bigint): string {
  const bytes: number[] = [];
  let v = n;
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    bytes.push(b);
  } while (v > 0n);
  return hex.encode(Uint8Array.from(bytes));
}

/**
 * 交易由节点构建，签名前在本地校验：
 * 1. txID 必须等于 sha256(raw_data_hex)，否则签的不是我们看到的交易
 * 2. raw_data_hex 必须包含预期的地址、金额/调用数据，防止节点篡改收款方或金额
 */
export function assertTxMatches(tx: TronTx, needles: string[]) {
  if (hex.encode(sha256(hex.decode(tx.raw_data_hex))) !== tx.txID.toLowerCase()) {
    throw new Error('Transaction hash mismatch');
  }
  const raw = tx.raw_data_hex.toLowerCase();
  for (const needle of needles) {
    if (!raw.includes(needle.toLowerCase())) throw new Error('Transaction content mismatch');
  }
}

export function encodeTransfer(to: string, amount: bigint): string {
  const addr = tronToHex(to).slice(2).padStart(64, '0');
  return addr + amount.toString(16).padStart(64, '0');
}

export function signTronTx(tx: TronTx, privateKey: Uint8Array): TronTx {
  const sig = secp256k1.sign(hex.decode(tx.txID), privateKey, { prehash: false, format: 'recovered' });
  // noble 输出 [recovery, r, s]；Tron 需要 r || s || (recovery + 27)
  const signature = hex.encode(sig.slice(1)) + (sig[0] + 27).toString(16).padStart(2, '0');
  return { ...tx, signature: [signature] };
}

/**
 * TronGrid 公共端点限制约 3 次/秒，超限会返回 429 或 200 + Error("rate exceeded…")
 * 并暂停服务约 3 秒，两种情况都退避重试
 */
async function tronFetch(url: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    const json = res.status === 429 ? null : await res.json().catch(() => null);
    const rateLimited = res.status === 429 || /rate exceeded|suspended/i.test(String(json?.Error ?? ''));
    if (rateLimited && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Tron API ${res.status}`);
    if (json?.Error) throw new Error(json.Error);
    return json;
  }
}

type TronAccount = { balance?: number; trc20?: Record<string, string>[] } | null;

export function createTronAdapter(network: AppNetwork): ChainAdapter {
  const base = network.endpoint!;
  const tokens = network.isTestnet ? [] : MAINNET_TOKENS;
  // 余额与代币共用同一次账户查询，减少请求次数
  const accountCache = new Map<string, { at: number; promise: Promise<TronAccount> }>();

  function post<T>(path: string, body: unknown): Promise<T> {
    return tronFetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function getAccount(address: string): Promise<TronAccount> {
    const cached = accountCache.get(address);
    if (cached && Date.now() - cached.at < 5000) return cached.promise;
    // 未激活账户返回空数组
    const promise = tronFetch(`${base}/v1/accounts/${address}`).then((json) => (json.data?.[0] ?? null) as TronAccount);
    promise.catch(() => accountCache.delete(address));
    accountCache.set(address, { at: Date.now(), promise });
    return promise;
  }

  async function waitForReceipt(txID: string, isContract: boolean): Promise<number> {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const info = await post<{ blockNumber?: number; receipt?: { result?: string }; result?: string }>(
        '/wallet/gettransactioninfobyid',
        { value: txID },
      );
      if (info.blockNumber) {
        if (info.result === 'FAILED') return 0;
        if (isContract) return info.receipt?.result === 'SUCCESS' ? 1 : 0;
        return 1;
      }
    }
    return 1;
  }

  return {
    isValidAddress: isTronAddress,

    async getBalance(address) {
      const account = await getAccount(address);
      return formatUnits(BigInt(account?.balance ?? 0), 6);
    },

    async getTokens(address) {
      if (tokens.length === 0) return [];
      const account = await getAccount(address);
      const balances = new Map<string, string>();
      (account?.trc20 ?? []).forEach((entry) => Object.entries(entry).forEach(([k, v]) => balances.set(k, v)));
      return tokens
        .filter((t) => BigInt(balances.get(t.address) ?? '0') > 0n)
        .map<Asset>((t) => ({ token: t, balance: formatUnits(BigInt(balances.get(t.address)!), t.decimals) }));
    },

    async estimateFee(from, to, amount, token) {
      const resources = await post<{ freeNetLimit?: number; freeNetUsed?: number; NetLimit?: number; NetUsed?: number }>(
        '/wallet/getaccountresource',
        { address: from, visible: true },
      );
      const freeBandwidth =
        (resources.freeNetLimit ?? 0) - (resources.freeNetUsed ?? 0) + (resources.NetLimit ?? 0) - (resources.NetUsed ?? 0);
      const bandwidthFee = freeBandwidth >= 350 ? 0n : TRANSFER_BANDWIDTH_FEE;
      if (!token) return { fee: formatUnits(bandwidthFee, 6) };

      // TRC20 转账消耗能量，按模拟执行的能量 × 当前能量单价估算
      const [sim, params] = await Promise.all([
        post<{ energy_used?: number }>('/wallet/triggerconstantcontract', {
          owner_address: from,
          contract_address: token.address,
          function_selector: 'transfer(address,uint256)',
          parameter: encodeTransfer(to, parseUnits(amount, token.decimals)),
          visible: true,
        }),
        post<{ chainParameter: { key: string; value?: number }[] }>('/wallet/getchainparameters', {}),
      ]);
      const energyPrice = params.chainParameter.find((p) => p.key === 'getEnergyFee')?.value ?? 210;
      const energyFee = BigInt(sim.energy_used ?? 65_000) * BigInt(energyPrice);
      return { fee: formatUnits(energyFee + bandwidthFee, 6) };
    },

    async send(account: ChainAccount, to, amount, token) {
      const privateKey = hex.decode(account.privateKey);
      if (tronAddressFromPublicKey(secp256k1.getPublicKey(privateKey, false)) !== account.address) {
        throw new Error('Key does not match address');
      }
      const ownerHex = tronToHex(account.address);
      const toHex = tronToHex(to);
      let tx: TronTx;

      if (!token) {
        const value = parseUnits(amount, 6);
        tx = await post<TronTx>('/wallet/createtransaction', {
          owner_address: account.address,
          to_address: to,
          amount: Number(value),
          visible: true,
        });
        // TransferContract: owner(field 1) / to(field 2) / amount(field 3, varint)
        assertTxMatches(tx, [`0a15${ownerHex}`, `1215${toHex}`, `18${varint(value)}`]);
      } else {
        const parameter = encodeTransfer(to, parseUnits(amount, token.decimals));
        const res = await post<{ transaction: TronTx; result?: { result?: boolean; message?: string } }>(
          '/wallet/triggersmartcontract',
          {
            owner_address: account.address,
            contract_address: token.address,
            function_selector: 'transfer(address,uint256)',
            parameter,
            fee_limit: FEE_LIMIT,
            call_value: 0,
            visible: true,
          },
        );
        if (!res.result?.result) throw new Error(res.result?.message || 'Failed to build transaction');
        tx = res.transaction;
        // 调用数据 = transfer 选择器 a9059cbb + 参数
        assertTxMatches(tx, [ownerHex, tronToHex(token.address), `a9059cbb${parameter}`]);
      }

      const signed = signTronTx(tx, privateKey);
      const result = await post<{ result?: boolean; code?: string; message?: string }>('/wallet/broadcasttransaction', signed);
      if (!result.result) {
        const message = result.message ? new TextDecoder().decode(hex.decode(result.message)) : result.code;
        throw new Error(message || 'Broadcast failed');
      }
      return { hash: tx.txID, status: await waitForReceipt(tx.txID, !!token) };
    },
  };
}
