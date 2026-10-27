import React from 'react';
import { Image } from 'react-native';
import { Avatar } from '@/components/ui';
import { LOGO_SOURCES } from '@/lib/logoSources';
import { colors } from '@/theme';

/** 链 / 代币图标；没有打包图标时退回字母头像 */
export const CoinLogo: React.FC<{ logo: string | null; label: string; seed?: string; size?: number; color?: string }> = ({
  logo,
  label,
  seed,
  size = 40,
  color,
}) => {
  const source = logo ? LOGO_SOURCES[logo] : undefined;
  if (!source) return <Avatar label={label} seed={seed} size={size} color={color} />;
  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceHover }}
      accessibilityIgnoresInvertColors
    />
  );
};
