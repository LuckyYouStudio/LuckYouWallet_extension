// 与浏览器插件保持一致的设计令牌 (src/popup/theme.css)
export const colors = {
  bg: '#0b0d14',
  bgElevated: '#121521',
  surface: '#181c2b',
  surfaceHover: '#1f2436',
  border: '#262b3f',
  borderStrong: '#353b55',
  text: '#f2f4fb',
  textSecondary: '#a3a9c2',
  textMuted: '#6b7190',
  primary: '#7c5cff',
  primarySoft: 'rgba(124, 92, 255, 0.16)',
  accent: '#ffc94d',
  success: '#2fd286',
  successSoft: 'rgba(47, 210, 134, 0.14)',
  danger: '#ff5c7a',
  dangerSoft: 'rgba(255, 92, 122, 0.14)',
  warning: '#ffb547',
  warningSoft: 'rgba(255, 181, 71, 0.12)',
};

export const gradient = ['#7c5cff', '#b05cff', '#ff7ab6'] as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 26 };

export const mono = 'Menlo';

const AVATAR_COLORS = ['#7c5cff', '#2fd286', '#ff7ab6', '#ffb547', '#4fb8ff', '#ff5c7a', '#00c2a8'];

export const avatarColor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
