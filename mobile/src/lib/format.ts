export const shortAddress = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '');

export const formatAmount = (value: string, maxDecimals = 6) => {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return value || '0';
  if (n === 0) return '0';
  if (n < 10 ** -maxDecimals) return `<${10 ** -maxDecimals}`;
  return n.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
};
