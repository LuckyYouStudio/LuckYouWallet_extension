import React, { useState } from 'react';
import { formatEther } from 'ethers';
import { evmFeeCost, EvmFeeSuggestion, EvmGasSettings, FEE_LEVELS, FeeLevel, fromGwei, toGwei } from '../core/fees';
import { formatUsd, usdValue } from '../core/prices';
import { formatAmount, Icon } from './ui';

export type FeeChoice = FeeLevel | 'custom';

const LABELS: Record<FeeChoice, [string, string]> = {
  low: ['Low', '低'],
  market: ['Market', '市场'],
  aggressive: ['Aggressive', '激进'],
  custom: ['Advanced', '高级'],
};

export const feeLabel = (level: FeeChoice, lang: string) => LABELS[level][lang === 'zh' ? 1 : 0];

/** 去掉多余的小数位，方便在输入框里编辑 */
const trimGwei = (wei: bigint) => {
  const n = Number(toGwei(wei));
  return n >= 1 ? String(Number(n.toFixed(3))) : String(Number(n.toPrecision(3)));
};

interface Props {
  suggestion: EvmFeeSuggestion;
  selected: FeeChoice;
  /** 当前生效的参数，用于预填自定义表单 */
  current: EvmGasSettings;
  symbol: string;
  price: number | null;
  lang: string;
  onSelect: (level: FeeChoice, gas: EvmGasSettings) => void;
  onClose: () => void;
}

/** 编辑网络费：低 / 市场 / 激进 三档 + 高级自定义 (与 App 一致) */
export function FeeEditor({ suggestion, selected, current, symbol, price, lang, onSelect, onClose }: Props) {
  const tr = (en: string, zh: string) => (lang === 'zh' ? zh : en);
  const { baseFee } = suggestion;
  const isLegacy = baseFee == null || current.gasPrice != null;

  const [showCustom, setShowCustom] = useState(selected === 'custom');
  const [form, setForm] = useState(() => ({
    gasLimit: current.gasLimit.toString(),
    gasPrice: current.gasPrice != null ? trimGwei(current.gasPrice) : '',
    priority: current.maxPriorityFeePerGas != null ? trimGwei(current.maxPriorityFeePerGas) : '',
    maxBase:
      current.maxFeePerGas != null && current.maxPriorityFeePerGas != null
        ? trimGwei(current.maxFeePerGas - current.maxPriorityFeePerGas)
        : '',
  }));
  const [error, setError] = useState('');
  const setField = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value.trim() }));

  const belowBaseFee = (() => {
    if (isLegacy || baseFee == null || !form.maxBase) return false;
    try {
      return fromGwei(form.maxBase) < baseFee;
    } catch {
      return false;
    }
  })();

  const save = () => {
    // GWEI 最多 9 位小数 (即 1 wei)
    const isNumber = (v: string) => /^\d+(\.\d{1,9})?$/.test(v);
    const fields = isLegacy ? [form.gasPrice, form.gasLimit] : [form.maxBase, form.priority, form.gasLimit];
    if (!fields.every(isNumber) || !/^\d+$/.test(form.gasLimit)) {
      setError(tr('Invalid number', '数字格式不正确'));
      return;
    }
    const gasLimit = BigInt(form.gasLimit);
    if (gasLimit < 21000n) {
      setError(tr('Gas limit must be at least 21000', 'Gas 上限不能低于 21000'));
      return;
    }
    const price = fromGwei(isLegacy ? form.gasPrice : form.maxBase);
    if (price <= 0n) {
      setError(tr('Fee must be greater than 0', '费用必须大于 0'));
      return;
    }
    if (isLegacy) {
      onSelect('custom', { gasLimit, gasPrice: price });
    } else {
      const priority = fromGwei(form.priority);
      onSelect('custom', { gasLimit, maxPriorityFeePerGas: priority, maxFeePerGas: price + priority });
    }
  };

  const renderOption = (level: FeeLevel) => {
    const gas = suggestion.levels[level];
    const cost = evmFeeCost(gas, baseFee);
    const fee = formatEther(cost.expected);
    const usd = formatUsd(usdValue(fee, price));
    return (
      <button key={level} className={`fee-option${selected === level ? ' active' : ''}`} onClick={() => onSelect(level, gas)}>
        <span className="fee-name">{feeLabel(level, lang)}</span>
        <span className="fee-values">
          <span className="fee-main">{usd || `${formatAmount(fee, 8)} ${symbol}`}</span>
          {usd && <span className="fee-sub">{formatAmount(fee, 8)} {symbol}</span>}
          {cost.max !== cost.expected && (
            <span className="fee-max">{tr('Max fee', '最高')} {formatAmount(formatEther(cost.max), 8)}</span>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h3>{tr('Edit network fee', '编辑网络费')}</h3>
          <button className="icon-btn ghost" onClick={onClose} aria-label="close">
            <Icon name="plus" size={18} className="rotate-45" />
          </button>
        </div>
        <div className="sheet-body">
          {FEE_LEVELS.map(renderOption)}
          <button className={`fee-option${selected === 'custom' ? ' active' : ''}`} onClick={() => setShowCustom((v) => !v)}>
            <span className="fee-name">{feeLabel('custom', lang)}</span>
            <Icon name="chevron" size={14} className={showCustom ? 'rotate-180' : ''} />
          </button>
          {showCustom && (
            <div className="card fee-custom">
              <p className="text-secondary" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
                {tr(
                  'Set your own fee. Too low and the transaction may take a long time or never confirm.',
                  '自定义手续费。设得太低，交易可能很久才确认，甚至一直不确认。',
                )}
              </p>
              {isLegacy ? (
                <label className="field">
                  <span className="field-label">{tr('Gas price (GWEI)', 'Gas 价格 (GWEI)')}</span>
                  <input className="input" inputMode="decimal" value={form.gasPrice} onChange={setField('gasPrice')} />
                </label>
              ) : (
                <>
                  <label className="field">
                    <span className="field-label">{tr('Max base fee (GWEI)', '最高基础费用 (GWEI)')}</span>
                    <input className="input" inputMode="decimal" value={form.maxBase} onChange={setField('maxBase')} />
                  </label>
                  <label className="field">
                    <span className="field-label">{tr('Priority fee (GWEI)', '优先费用 (GWEI)')}</span>
                    <input className="input" inputMode="decimal" value={form.priority} onChange={setField('priority')} />
                  </label>
                </>
              )}
              <label className="field">
                <span className="field-label">{tr('Gas limit', 'Gas 上限')}</span>
                <input className="input" inputMode="numeric" value={form.gasLimit} onChange={setField('gasLimit')} />
              </label>
              {belowBaseFee && (
                <div className="alert alert-warning">
                  <Icon name="warning" size={15} />
                  {tr('Lower than the current base fee; the transaction may get stuck.', '低于当前基础费用，交易可能卡住。')}
                </div>
              )}
              {error && <div className="text-danger">{error}</div>}
              <button className="btn btn-primary" onClick={save}>{tr('Save', '保存')}</button>
            </div>
          )}
          {baseFee != null && (
            <div className="fee-status">
              <span>{tr('Current base fee', '当前基础费用')}</span>
              <span>{trimGwei(baseFee)} GWEI</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
