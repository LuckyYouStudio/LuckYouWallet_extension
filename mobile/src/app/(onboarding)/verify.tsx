import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Alert, Button, Screen } from '@/components/ui';
import { useWallet } from '@/state/WalletContext';
import { colors, mono } from '@/theme';

const QUESTIONS = 3;
const OPTIONS = 4;

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 随机抽取若干位置，每题给出正确单词 + 不在助记词中的干扰词 */
function buildQuiz(words: string[]) {
  const positions = shuffle(words.map((_, i) => i)).slice(0, QUESTIONS).sort((a, b) => a - b);
  const pool = wordlist.filter((w) => !words.includes(w));
  return positions.map((index) => ({
    index,
    answer: words[index],
    options: shuffle([words[index], ...shuffle(pool).slice(0, OPTIONS - 1)]),
  }));
}

/** 助记词备份验证：确认用户确实抄下了助记词后才能继续 */
export default function VerifyBackup() {
  const { t, draft } = useWallet();
  const words = useMemo(() => draft?.mnemonic?.split(' ') || [], [draft]);
  const quiz = useMemo(() => buildQuiz(words), [words]);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [wrong, setWrong] = useState<number | null>(null);

  const allCorrect = quiz.every((q) => picked[q.index] === q.answer);

  const choose = (index: number, word: string, answer: string) => {
    if (word === answer) {
      Haptics.selectionAsync();
      setPicked((p) => ({ ...p, [index]: word }));
      setWrong(null);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPicked((p) => {
        const next = { ...p };
        delete next[index];
        return next;
      });
      setWrong(index);
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button title={t('continue')} disabled={!allCorrect} onPress={() => router.push('/password')} />
          <Button title={t('viewPhraseAgain')} variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{t('verifyTitle')}</Text>
        <Text style={styles.hint}>{t('verifyHint')}</Text>
      </View>
      {wrong != null && <Alert tone="danger">{t('verifyWrong')}</Alert>}
      {quiz.map((q) => (
        <View key={q.index} style={{ gap: 10 }}>
          <Text style={styles.question}>{t('wordNumber', { n: String(q.index + 1) })}</Text>
          <View style={styles.options}>
            {q.options.map((word) => {
              const selected = picked[q.index] === word;
              return (
                <Pressable
                  key={word}
                  onPress={() => choose(q.index, word, q.answer)}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && { opacity: 0.8 }]}
                >
                  <Text style={[styles.optionText, selected && { color: '#fff' }]}>{word}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  hint: { color: colors.textSecondary, fontSize: 15 },
  question: { color: colors.text, fontSize: 16, fontWeight: '700' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    width: '48.5%',
    paddingVertical: 13,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { color: colors.text, fontFamily: mono, fontSize: 15, fontWeight: '600' },
});
