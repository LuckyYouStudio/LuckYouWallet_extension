import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { fromGwei, toGwei } from '@core/fees';
import type { FeeLevel, FeeOption, FeeQuote, FeeSettings } from '@/chains';
import { Alert, Button, Field, Icon } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { errorMessage, formatAmount, formatUsd, usdValue } from '@/lib/format';
import { colors } from '@/theme';
import type { StringKey } from '@/lib/i18n';

const LEVEL_LABELS: Record<FeeLevel, StringKey> = {
  low: 'feeLow',
  market: 'feeMarket',
  aggressive: 'feeAggressive',
  custom: 'feeCustom',
};

/** 去掉多余的小数位，方便在输入框里编辑 */
const trimGwei = (wei: bigint) => {
  const n = Number(toGwei(wei));
  return n >= 1 ? String(Number(n.toFixed(3))) : String(Number(n.toPrecision(3)));
};

interface Props {
  visible: boolean;
  /** 默认估算结果，包含各档位 */
  quote: FeeQuote;
  selected: FeeLevel;
  /** 当前生效的参数，用于预填自定义表单 */
  current?: FeeSettings;
  symbol: string;
  price: number | null;
  onSelect: (option: FeeOption) => void;
  /** 应用自定义参数；抛出的错误显示在表单里 */
  onCustom: (settings: FeeSettings) => Promise<void>;
  onClose: () => void;
}

/** 编辑网络费：低 / 市场 / 激进 三档 + 高级自定义 (参考 MetaMask) */
export function FeeSheet({ visible, quote, selected, current, symbol, price, onSelect, onCustom, onClose }: Props) {
  const { t } = useWallet();
  const base = current || quote.settings;
  const isBtc = base?.kind === 'btc';
  const evm = base?.kind === 'evm' ? base.gas : undefined;
  const isLegacy = !isBtc && (quote.baseFee == null || evm?.gasPrice != null);

  /** 用当前生效的参数预填自定义表单 */
  const initialForm = () => {
    const form = { maxBase: '', priority: '', gasPrice: '', gasLimit: '', rate: '' };
    if (base?.kind === 'btc') form.rate = String(base.satPerVbyte);
    if (evm) {
      form.gasLimit = evm.gasLimit.toString();
      if (evm.gasPrice != null) form.gasPrice = trimGwei(evm.gasPrice);
      if (evm.maxFeePerGas != null && evm.maxPriorityFeePerGas != null) {
        form.priority = trimGwei(evm.maxPriorityFeePerGas);
        form.maxBase = trimGwei(evm.maxFeePerGas - evm.maxPriorityFeePerGas);
      }
    }
    return form;
  };

  const [form, setForm] = useState(initialForm);
  const [showCustom, setShowCustom] = useState(selected === 'custom');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { maxBase, priority, gasPrice, gasLimit, rate } = form;
  const setField = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // 每次打开时重置表单 (在渲染期间根据 props 变化调整状态)
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setForm(initialForm());
      setShowCustom(selected === 'custom');
      setError('');
    }
  }

  const parseSettings = (): FeeSettings => {
    if (isBtc) {
      const satPerVbyte = Number(rate);
      if (!(satPerVbyte >= 1)) throw new Error(t('invalidAmount'));
      return { kind: 'btc', satPerVbyte };
    }
    const limit = BigInt(gasLimit || '0');
    if (limit < 21000n) throw new Error(`${t('gasLimit')} ≥ 21000`);
    if (isLegacy) {
      const price = fromGwei(gasPrice || '0');
      if (price <= 0n) throw new Error(t('invalidAmount'));
      return { kind: 'evm', gas: { gasLimit: limit, gasPrice: price } };
    }
    const tip = fromGwei(priority || '0');
    const maxBaseFee = fromGwei(maxBase || '0');
    if (maxBaseFee <= 0n) throw new Error(t('invalidAmount'));
    return { kind: 'evm', gas: { gasLimit: limit, maxPriorityFeePerGas: tip, maxFeePerGas: maxBaseFee + tip } };
  };

  const belowBaseFee = (() => {
    if (isBtc || isLegacy || quote.baseFee == null || !maxBase) return false;
    try {
      return fromGwei(maxBase) < quote.baseFee;
    } catch {
      return false;
    }
  })();

  const save = async () => {
    setError('');
    let settings: FeeSettings;
    try {
      settings = parseSettings();
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    setSaving(true);
    try {
      await onCustom(settings);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const renderOption = (option: FeeOption) => {
    const active = option.level === selected;
    const usd = formatUsd(usdValue(option.fee, price));
    return (
      <Pressable
        key={option.level}
        onPress={() => {
          Haptics.selectionAsync();
          onSelect(option);
        }}
        style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && { opacity: 0.85 }]}
      >
        {active && <View style={styles.activeBar} />}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.optionTitle}>{t(LEVEL_LABELS[option.level])}</Text>
          {option.wait ? <Text style={[styles.optionSub, active && { color: colors.primary }]}>{option.wait}</Text> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={styles.optionValue}>{usd || `${formatAmount(option.fee, 8)} ${symbol}`}</Text>
          {usd ? <Text style={styles.optionSub}>{formatAmount(option.fee, 8)} {symbol}</Text> : null}
          {option.maxFee && option.maxFee !== option.fee ? (
            <Text style={styles.optionMax}>{t('maxFee')} {formatAmount(option.maxFee, 8)}</Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('editFee')}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Icon name="xmark" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {(quote.options || []).map(renderOption)}

          <Pressable
            onPress={() => setShowCustom((v) => !v)}
            style={({ pressed }) => [styles.option, selected === 'custom' && styles.optionActive, pressed && { opacity: 0.85 }]}
          >
            {selected === 'custom' && <View style={styles.activeBar} />}
            <Text style={[styles.optionTitle, { flex: 1 }]}>{t('feeCustom')}</Text>
            <Icon name={showCustom ? 'chevron.up' : 'chevron.down'} size={13} color={colors.textMuted} />
          </Pressable>

          {showCustom && (
            <View style={styles.custom}>
              <Text style={styles.hint}>{t('feeCustomHint')}</Text>
              {isBtc ? (
                <Field label={t('feeRate')} keyboardType="decimal-pad" value={rate} onChangeText={setField('rate')} />
              ) : isLegacy ? (
                <Field label={t('gasPrice')} keyboardType="decimal-pad" value={gasPrice} onChangeText={setField('gasPrice')} />
              ) : (
                <>
                  <Field label={t('maxBaseFee')} keyboardType="decimal-pad" value={maxBase} onChangeText={setField('maxBase')} />
                  <Field label={t('priorityFee')} keyboardType="decimal-pad" value={priority} onChangeText={setField('priority')} />
                </>
              )}
              {!isBtc && <Field label={t('gasLimit')} keyboardType="number-pad" value={gasLimit} onChangeText={setField('gasLimit')} />}
              {belowBaseFee && <Alert tone="warning">{t('feeTooLow')}</Alert>}
              {error ? <Alert tone="danger">{error}</Alert> : null}
              <Button title={t('save')} loading={saving} onPress={save} />
            </View>
          )}

          {quote.baseFee != null && (
            <View style={styles.status}>
              <Text style={styles.statusLabel}>{t('currentBaseFee')}</Text>
              <Text style={styles.statusValue}>{trimGwei(quote.baseFee)} GWEI</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bgElevated },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 22, paddingBottom: 14 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  close: {
    position: 'absolute',
    right: 18,
    top: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  optionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  activeBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: colors.primary },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  optionSub: { color: colors.textSecondary, fontSize: 13 },
  optionValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  optionMax: { color: colors.textMuted, fontSize: 12 },
  custom: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  status: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  statusLabel: { color: colors.textMuted, fontSize: 13 },
  statusValue: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
