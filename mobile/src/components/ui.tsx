import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { colors, radius, mono, avatarColor } from '@/theme';

export const Icon: React.FC<{ name: SymbolViewProps['name']; size?: number; color?: string }> = ({
  name,
  size = 20,
  color = colors.text,
}) => <SymbolView name={name} size={size} tintColor={color} weight="semibold" />;

export const Screen: React.FC<{
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  footer?: React.ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}> = ({ children, scroll = true, edges = ['bottom'], footer, refreshControl }) => (
  <SafeAreaView style={styles.screen} edges={edges}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          contentInsetAdjustmentBehavior="automatic"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
      {footer && <View style={styles.footer}>{footer}</View>}
    </KeyboardAvoidingView>
  </SafeAreaView>
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const Button: React.FC<{
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: SymbolViewProps['name'];
  style?: StyleProp<ViewStyle>;
}> = ({ title, onPress, variant = 'primary', disabled, loading, icon, style }) => {
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.textSecondary : colors.text;
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={17} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
};

export const Field: React.FC<TextInputProps & { label?: string; right?: React.ReactNode; error?: string | null; monospace?: boolean }> = ({
  label,
  right,
  error,
  monospace,
  style,
  ...props
}) => (
  <View style={{ gap: 8 }}>
    {(label || right) && (
      <View style={styles.rowBetween}>
        {label ? <Text style={styles.label}>{label}</Text> : <View />}
        {right}
      </View>
    )}
    <TextInput
      placeholderTextColor={colors.textMuted}
      selectionColor={colors.primary}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      keyboardAppearance="dark"
      // 地址/密钥类输入强制英文键盘，避免中文输入法吞字符
      keyboardType={monospace ? 'ascii-capable' : undefined}
      style={[styles.input, monospace && { fontFamily: mono, fontSize: 14 }, error ? { borderColor: colors.danger } : null, style]}
      {...props}
    />
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>
);

export const Card: React.FC<{ children: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

export const KeyValue: React.FC<{ k: string; v: string; mono?: boolean; highlight?: boolean; first?: boolean }> = ({
  k,
  v,
  mono: isMono,
  highlight,
  first,
}) => (
  <View style={[styles.kv, !first && styles.kvBorder]}>
    <Text style={styles.kvKey}>{k}</Text>
    <Text
      style={[styles.kvValue, isMono && { fontFamily: mono, fontSize: 12 }, highlight && { color: colors.accent, fontSize: 16, fontWeight: '700' }]}
      selectable
    >
      {v}
    </Text>
  </View>
);

export const Avatar: React.FC<{ label: string; seed?: string; size?: number; color?: string; textColor?: string; children?: React.ReactNode }> = ({
  label,
  seed,
  size = 40,
  color,
  textColor = '#fff',
  children,
}) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color || avatarColor(seed || label),
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children || <Text style={{ color: textColor, fontWeight: '800', fontSize: size * 0.38 }}>{label.slice(0, 1).toUpperCase()}</Text>}
  </View>
);

export const ListItem: React.FC<{
  left?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
}> = ({ left, title, subtitle, right, onPress, selected }) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    style={({ pressed }) => [styles.listItem, selected && styles.listItemSelected, pressed && { backgroundColor: colors.surfaceHover }]}
  >
    {left}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={styles.listTitle} numberOfLines={1}>{title}</Text>
      {subtitle ? <Text style={styles.listSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
    </View>
    {right}
  </Pressable>
);

export const Alert: React.FC<{ tone?: 'warning' | 'danger' | 'info'; children: React.ReactNode }> = ({ tone = 'info', children }) => {
  const palette = {
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'exclamationmark.triangle.fill' as const },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: 'xmark.octagon.fill' as const },
    info: { bg: colors.primarySoft, fg: '#b9a8ff', icon: 'lock.shield.fill' as const },
  }[tone];
  return (
    <View style={[styles.alert, { backgroundColor: palette.bg }]}>
      <Icon name={palette.icon} size={16} color={palette.fg} />
      <Text style={[styles.alertText, { color: palette.fg }]}>{children}</Text>
    </View>
  );
};

export const SectionTitle: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <View style={[styles.rowBetween, { marginTop: 8 }]}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {right}
  </View>
);

export const Segmented: React.FC<{ options: { key: string; label: string }[]; value: string; onChange: (key: string) => void }> = ({
  options,
  value,
  onChange,
}) => (
  <View style={styles.segmented}>
    {options.map((o) => (
      <Pressable key={o.key} onPress={() => onChange(o.key)} style={[styles.segment, value === o.key && styles.segmentActive]}>
        <Text style={[styles.segmentText, value === o.key && { color: colors.text }]}>{o.label}</Text>
      </Pressable>
    ))}
  </View>
);

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, flexGrow: 1 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  button: {
    height: 54,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  button_primary: { backgroundColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
  button_secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  button_danger: { backgroundColor: colors.dangerSoft },
  button_ghost: { backgroundColor: 'transparent', height: 44 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  error: { color: colors.danger, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10 },
  kvBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong },
  kvKey: { color: colors.textSecondary, fontSize: 14 },
  kvValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItemSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  listTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  listSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  alert: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, alignItems: 'flex-start' },
  alertText: { flex: 1, fontSize: 13.5, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  segmented: { flexDirection: 'row', backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.surfaceHover },
  segmentText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },
});
