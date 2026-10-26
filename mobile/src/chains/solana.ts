import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64, hex } from '@scure/base';
import type { TokenInfo } from '@core/wallet';
import { bs58, formatUnits, parseUnits } from './encoding';
import type { AppNetwork, Asset, ChainAdapter } from './types';

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const LAMPORTS_PER_SIGNATURE = 5000n;
const TOKEN_ACCOUNT_SIZE = 165;

// 主网内置主流 SPL 代币 (均为经典 Token Program，精度已在链上核对)
const MAINNET_TOKENS: TokenInfo[] = [
  { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', name: 'Jupiter', decimals: 6 },
  { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', name: 'Bonk', decimals: 5 },
  { address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', decimals: 6 },
];

// ---------- 交易序列化 (legacy message) ----------

function compactU16(n: number): number[] {
  const out: number[] = [];
  let rem = n;
  for (;;) {
    let byte = rem & 0x7f;
    rem >>= 7;
    if (rem === 0) {
      out.push(byte);
      return out;
    }
    byte |= 0x80;
    out.push(byte);
  }
}

function u64(n: bigint): number[] {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return Array.from(out);
}

export interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

export interface Instruction {
  programId: string;
  keys: AccountMeta[];
  data: number[];
}

/** 编译消息：账户按 可写签名者 → 只读签名者 → 可写非签名者 → 只读非签名者 排序 */
export function compileMessage(payer: string, instructions: Instruction[], recentBlockhash: string): Uint8Array {
  const metas = new Map<string, AccountMeta>();
  const upsert = (m: AccountMeta) => {
    const prev = metas.get(m.pubkey);
    metas.set(m.pubkey, {
      pubkey: m.pubkey,
      isSigner: (prev?.isSigner ?? false) || m.isSigner,
      isWritable: (prev?.isWritable ?? false) || m.isWritable,
    });
  };
  upsert({ pubkey: payer, isSigner: true, isWritable: true });
  instructions.forEach((ix) => {
    ix.keys.forEach(upsert);
    upsert({ pubkey: ix.programId, isSigner: false, isWritable: false });
  });
  const all = [...metas.values()];
  const rank = (m: AccountMeta) => (m.isSigner ? (m.isWritable ? 0 : 1) : m.isWritable ? 2 : 3);
  const ordered = [all.find((m) => m.pubkey === payer)!, ...all.filter((m) => m.pubkey !== payer).sort((a, b) => rank(a) - rank(b))];
  const index = new Map(ordered.map((m, i) => [m.pubkey, i]));

  const bytes: number[] = [
    ordered.filter((m) => m.isSigner).length,
    ordered.filter((m) => m.isSigner && !m.isWritable).length,
    ordered.filter((m) => !m.isSigner && !m.isWritable).length,
    ...compactU16(ordered.length),
  ];
  ordered.forEach((m) => bytes.push(...bs58.decode(m.pubkey)));
  bytes.push(...bs58.decode(recentBlockhash));
  bytes.push(...compactU16(instructions.length));
  instructions.forEach((ix) => {
    bytes.push(index.get(ix.programId)!);
    bytes.push(...compactU16(ix.keys.length), ...ix.keys.map((k) => index.get(k.pubkey)!));
    bytes.push(...compactU16(ix.data.length), ...ix.data);
  });
  return Uint8Array.from(bytes);
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.Point.fromBytes(bytes, true);
    return true;
  } catch {
    return false;
  }
}

/** 计算 PDA (与 @solana/web3.js 的 findProgramAddressSync 一致) */
function findProgramAddress(seeds: Uint8Array[], programId: string): string {
  const program = bs58.decode(programId);
  const marker = new TextEncoder().encode('ProgramDerivedAddress');
  for (let bump = 255; bump >= 0; bump--) {
    const buf = new Uint8Array([...seeds.flatMap((s) => Array.from(s)), bump, ...program, ...marker]);
    const hash = sha256(buf);
    if (!isOnCurve(hash)) return bs58.encode(hash);
  }
  throw new Error('Unable to find a viable program address');
}

export function associatedTokenAddress(owner: string, mint: string): string {
  return findProgramAddress([bs58.decode(owner), bs58.decode(TOKEN_PROGRAM), bs58.decode(mint)], ATA_PROGRAM);
}

/** 构建转账指令：SOL 用 System Program；SPL 代币用 TransferChecked，必要时先创建收款方代币账户 */
export function transferInstructions(
  from: string,
  to: string,
  amount: string,
  token: TokenInfo | undefined,
  createsAccount: boolean,
): Instruction[] {
  if (!token) {
    return [
      {
        programId: SYSTEM_PROGRAM,
        keys: [
          { pubkey: from, isSigner: true, isWritable: true },
          { pubkey: to, isSigner: false, isWritable: true },
        ],
        data: [2, 0, 0, 0, ...u64(parseUnits(amount, 9))],
      },
    ];
  }
  const source = associatedTokenAddress(from, token.address);
  const destination = associatedTokenAddress(to, token.address);
  const instructions: Instruction[] = [];
  if (createsAccount) {
    // 收款方还没有该代币账户时先创建 (幂等指令)，租金由发送方支付
    instructions.push({
      programId: ATA_PROGRAM,
      keys: [
        { pubkey: from, isSigner: true, isWritable: true },
        { pubkey: destination, isSigner: false, isWritable: true },
        { pubkey: to, isSigner: false, isWritable: false },
        { pubkey: token.address, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
      ],
      data: [1],
    });
  }
  instructions.push({
    programId: TOKEN_PROGRAM,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: token.address, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: from, isSigner: true, isWritable: false },
    ],
    // TransferChecked: [12, amount u64, decimals u8]
    data: [12, ...u64(parseUnits(amount, token.decimals)), token.decimals],
  });
  return instructions;
}

// ---------- RPC ----------

async function rpc<T>(endpoint: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
  return json.result as T;
}

export function createSolanaAdapter(network: AppNetwork): ChainAdapter {
  const endpoint = network.endpoint!;
  const tokens = network.isTestnet ? [] : MAINNET_TOKENS;

  async function accountExists(address: string): Promise<boolean> {
    const info = await rpc<{ value: unknown }>(endpoint, 'getAccountInfo', [address, { encoding: 'base64' }]);
    return info.value != null;
  }

  async function buildInstructions(from: string, to: string, amount: string, token?: TokenInfo) {
    const createsAccount = token ? !(await accountExists(associatedTokenAddress(to, token.address))) : false;
    return { instructions: transferInstructions(from, to, amount, token, createsAccount), createsAccount };
  }

  return {
    isValidAddress(address) {
      try {
        return bs58.decode(address).length === 32;
      } catch {
        return false;
      }
    },

    async getBalance(address) {
      const res = await rpc<{ value: number }>(endpoint, 'getBalance', [address, { commitment: 'confirmed' }]);
      return formatUnits(BigInt(res.value), 9);
    },

    async getTokens(address) {
      if (tokens.length === 0) return [];
      const res = await rpc<{
        value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string } } } } } }[];
      }>(endpoint, 'getTokenAccountsByOwner', [address, { programId: TOKEN_PROGRAM }, { encoding: 'jsonParsed' }]);
      const balances = new Map<string, bigint>();
      res.value.forEach(({ account }) => {
        const { mint, tokenAmount } = account.data.parsed.info;
        balances.set(mint, (balances.get(mint) ?? 0n) + BigInt(tokenAmount.amount));
      });
      return tokens
        .filter((t) => (balances.get(t.address) ?? 0n) > 0n)
        .map<Asset>((t) => ({ token: t, balance: formatUnits(balances.get(t.address)!, t.decimals) }));
    },

    async estimateFee(from, to, amount, token) {
      const { createsAccount } = await buildInstructions(from, to, amount, token);
      let fee = LAMPORTS_PER_SIGNATURE;
      if (createsAccount) {
        fee += BigInt(await rpc<number>(endpoint, 'getMinimumBalanceForRentExemption', [TOKEN_ACCOUNT_SIZE]));
      }
      return { fee: formatUnits(fee, 9) };
    },

    async send(account, to, amount, token) {
      const secret = hex.decode(account.privateKey);
      if (bs58.encode(ed25519.getPublicKey(secret)) !== account.address) throw new Error('Key does not match address');
      const { instructions } = await buildInstructions(account.address, to, amount, token);
      const { value } = await rpc<{ value: { blockhash: string } }>(endpoint, 'getLatestBlockhash', [{ commitment: 'confirmed' }]);
      const message = compileMessage(account.address, instructions, value.blockhash);
      const signature = ed25519.sign(message, secret);
      const tx = new Uint8Array([...compactU16(1), ...signature, ...message]);
      const hash = await rpc<string>(endpoint, 'sendTransaction', [base64.encode(tx), { encoding: 'base64', preflightCommitment: 'confirmed' }]);

      // 轮询确认状态 (最长约 60 秒)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { value: statuses } = await rpc<{ value: ({ err: unknown; confirmationStatus?: string } | null)[] }>(
          endpoint,
          'getSignatureStatuses',
          [[hash]],
        );
        const status = statuses[0];
        if (status?.err) return { hash, status: 0 };
        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') return { hash, status: 1 };
      }
      return { hash, status: 1 };
    },
  };
}
