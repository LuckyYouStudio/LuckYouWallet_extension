import React from 'react';
import { Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient } from '@/theme';

export const Logo: React.FC<{ size?: number }> = ({ size = 72 }) => (
  <LinearGradient
    colors={gradient}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.3,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#7c5cff',
      shadowOpacity: 0.55,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    }}
  >
    <Text style={{ color: '#fff', fontSize: size * 0.48, fontWeight: '900' }}>L</Text>
  </LinearGradient>
);
