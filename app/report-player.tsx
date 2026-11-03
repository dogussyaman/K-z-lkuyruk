import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle2, ChevronLeft, Flag, ShieldAlert } from 'lucide-react-native';
import { Screen, Button, Card } from '@/components/ui';
import { useGameStore } from '@/store/gameStore';
import { useTheme } from '@/theme/ThemeProvider';
import type { PlayerReportCategory } from '@/services/types';

const categories: Array<{ value: PlayerReportCategory; label: string }> = [
  { value: 'harassment', label: 'Taciz veya hakaret' },
  { value: 'inappropriate_name', label: 'Uygunsuz kullanıcı adı' },
  { value: 'inappropriate_content', label: 'Uygunsuz içerik' },
  { value: 'cheating', label: 'Hile veya oyun bozma' },
  { value: 'spam', label: 'Spam' },
  { value: 'other', label: 'Diğer' },
];

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ReportPlayerScreen() {
  const { colors } = useTheme();
  const { roomState, currentPlayer, service } = useGameStore();
  const params = useLocalSearchParams<{ playerId?: string | string[]; roomCode?: string | string[] }>();
  const playerId = firstParam(params.playerId);
  const roomCode = firstParam(params.roomCode)?.trim().toUpperCase();
  const target = playerId ? roomState?.players[playerId] : undefined;
  const canReport = service.kind === 'supabase'
    && Boolean(currentPlayer && roomCode && playerId && target)
    && target?.id !== currentPlayer?.id
    && target?.isBot !== true;

  const [category, setCategory] = useState<PlayerReportCategory>('inappropriate_name');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitReport = async () => {
    if (!canReport || !roomCode || !playerId) return;
    setSubmitting(true);
    setError(null);
    try {
      await service.reportPlayer(roomCode, playerId, category, description.trim());
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bildirim gönderilemedi. Tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Button label="Geri" variant="ghost" onPress={() => router.back()} icon={<ChevronLeft color={colors.textPrimary} size={18} />} />
          <Text style={[styles.eyebrow, { color: colors.textMuted }]}>GÜVENLİ OYUN</Text>
        </View>

        {submitted ? (
          <Card variant="surface" gap={16}>
            <View style={[styles.successIcon, { backgroundColor: colors.successSurface }]}>
              <CheckCircle2 color={colors.success} size={30} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Bildirimin alındı</Text>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              Bildirimin moderasyon kaydına eklendi. Diğer oyuncular bu bildirimi göremez.
            </Text>
            <Button label="Sonuçlara dön" fullWidth onPress={() => router.back()} />
          </Card>
        ) : (
          <>
            <View style={styles.hero}>
              <View style={[styles.icon, { backgroundColor: colors.orangeSurface }]}>
                <Flag color={colors.orange} size={25} />
              </View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Oyuncuyu bildir</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                {target?.name ? `${target.name} adlı oyuncu için bildirim gönderiyorsun.` : 'Bu oyuncu için güvenlik bildirimi gönder.'}
              </Text>
            </View>

            <Card variant="surface" gap={14}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Bildirim nedeni</Text>
              {categories.map((option) => {
                const selected = category === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(option.value)}
                    style={[
                      styles.category,
                      { borderColor: selected ? colors.orange : colors.border, backgroundColor: selected ? colors.orangeSurface : colors.bgCard },
                    ]}
                  >
                    <View style={[styles.radio, { borderColor: selected ? colors.orange : colors.textMuted }]}>
                      {selected ? <View style={[styles.radioDot, { backgroundColor: colors.orange }]} /> : null}
                    </View>
                    <Text style={[styles.categoryText, { color: colors.textPrimary }]}>{option.label}</Text>
                  </Pressable>
                );
              })}

              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 6 }]}>Açıklama (isteğe bağlı)</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Ne olduğunu kısaca anlat…"
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={500}
                textAlignVertical="top"
                style={[styles.description, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.bgCard }]}
              />
              <Text style={[styles.counter, { color: colors.textMuted }]}>{description.length}/500</Text>

              {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
              {!canReport ? (
                <View style={styles.unavailable}>
                  <ShieldAlert color={colors.warning} size={18} />
                  <Text style={[styles.unavailableText, { color: colors.textMuted }]}>
                    Bu oyuncu için bildirim gönderilemiyor. Yalnızca aynı canlı odadaki gerçek oyuncular bildirilebilir.
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.privacy, { color: colors.textMuted }]}>
                Bildirim yalnızca moderasyon amacıyla saklanır ve diğer oyunculara gösterilmez.
              </Text>
              <Button
                label={submitting ? 'Gönderiliyor…' : 'Bildirimi gönder'}
                fullWidth
                disabled={!canReport || submitting}
                loading={submitting}
                onPress={() => void submitReport()}
                icon={<Flag color="#FFF" size={17} />}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 42, gap: 20 },
  header: { gap: 10 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  hero: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  icon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  successIcon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  body: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  category: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  categoryText: { fontSize: 13, fontWeight: '600' },
  description: { minHeight: 112, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 13, lineHeight: 19 },
  counter: { fontSize: 10, textAlign: 'right', marginTop: -8 },
  error: { fontSize: 12, lineHeight: 18 },
  unavailable: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unavailableText: { flex: 1, fontSize: 12, lineHeight: 18 },
  privacy: { fontSize: 11, lineHeight: 17 },
});
