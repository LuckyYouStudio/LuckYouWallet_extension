import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStorage, KeyValueStorage, NetworkKey, TokenInfo, TransactionRecord } from '@core/wallet';

// 非敏感数据 (网络、代币列表、交易记录、偏好) 存放在 AsyncStorage；密钥只在 Keychain (见 vault.ts)
const asyncStorage: KeyValueStorage = {
  async get(key) {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      // 本地数据损坏时当作不存在，避免整个页面崩溃
      return undefined;
    }
  },
  async set(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
};

configureStorage(asyncStorage);

export const kv = asyncStorage;

const tokensKey = (address: string, network: NetworkKey) => `tokens:${address.toLowerCase()}:${network}`;
const historyKey = (address: string, network: NetworkKey) => `history:${address.toLowerCase()}:${network}`;

export async function loadTokens(address: string, network: NetworkKey): Promise<TokenInfo[]> {
  return (await kv.get<TokenInfo[]>(tokensKey(address, network))) || [];
}

export async function saveTokens(address: string, network: NetworkKey, tokens: TokenInfo[]) {
  await kv.set(tokensKey(address, network), tokens);
}

export async function loadHistory(address: string, network: NetworkKey): Promise<TransactionRecord[]> {
  return (await kv.get<TransactionRecord[]>(historyKey(address, network))) || [];
}

export async function appendHistory(address: string, network: NetworkKey, record: TransactionRecord) {
  const history = await loadHistory(address, network);
  await kv.set(historyKey(address, network), [record, ...history].slice(0, 200));
}

export async function clearAll() {
  await AsyncStorage.clear();
}

/** 后台确认完成后更新本机发出交易的状态 */
export async function updateHistoryStatus(address: string, network: NetworkKey, hash: string, status: number) {
  const history = await loadHistory(address, network);
  await kv.set(
    historyKey(address, network),
    history.map((r) => (r.hash === hash ? { ...r, status } : r)),
  );
}
