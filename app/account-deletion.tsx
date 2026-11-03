import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, ShieldAlert, Trash2 } from 'lucide-react-native';
import { Screen, Button, Card } from '@/components/ui';
import { useGameStore } from '@/store/gameStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function AccountDeletionScreen() {
  const { colors } = useTheme();
  const { currentPlayer, isLive, service, setCurrentPlayer } = useGameStore();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!isLive || !currentPlayer) {
      router.replace('/auth');
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await service.deleteAccount();
      setCurrentPlayer(null);
      setConfirming(false);
      router.replace('/auth');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Hesap silme işlemi tamamlanamadı.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Button label="Geri" variant="ghost" onPress={() => router.back()} icon={<ChevronLeft color={colors.textPrimary} size={18} />} />
          <Text style={[styles.eyebrow, { color: colors.textPrimaryMuted }]}>HESAP VE GİZLİLİK</Text>
        </View>

        <View style={styles.hero}>
          <View style={[styles.icon, { backgroundColor: colors.dangerSoft }]}>
            <ShieldAlert color={colors.danger} size={28} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Hesabını sil</Text>
          <Text style={[styles.subtitle, { color: colors.textPrimaryMuted }]}>
            Kızılkuyruk hesabını ve bu hesaba bağlı kişisel oyun verilerini kalıcı olarak silme talebini buradan gönderebilirsin.
          </Text>
        </View>

        <Card variant="surface">
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Silinecek bilgiler</Text>
          {[
            'Profil bilgileri ve yüklediğin avatar dosyaları',
            'Arkadaşlıklar, arkadaşlık istekleri ve engelleme kayıtları',
            'Puanlar, istatistikler ve sana bağlı oyun geçmişi kayıtları',
            'Aktif olmayan odalardaki oyuncu kimliğin ve özel oyun durumu',
          ].map((item) => (
            <Text key={item} style={[styles.bullet, { color: colors.textPrimaryMuted }]}>• {item}</Text>
          ))}
          <Text style={[styles.notice, { color: colors.warning }]}>
            Aktif bir oyundaysan önce o odadan ayrılmalısın. Hesap silme işlemi geri alınamaz.
          </Text>
          {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

          {isLive && currentPlayer ? (
            <Button
              label="Hesabımı kalıcı olarak sil"
              variant="danger"
              fullWidth
              onPress={() => setConfirming(true)}
              icon={<Trash2 color="#FFF" size={18} />}
            />
          ) : (
            <>
              <Text style={[styles.notice, { color: colors.textPrimaryMuted }]}>
                Silme talebi göndermek için aynı hesapla giriş yap. Giriş yaptıktan sonra bu sayfaya yeniden dön.
              </Text>
              <Button label="Giriş yap" fullWidth onPress={() => router.replace('/auth')} />
            </>
          )}
        </Card>
      </ScrollView>

      <Modal visible={confirming} transparent animationType="fade" onRequestClose={() => setConfirming(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Bu hesabı kalıcı olarak silelim mi?</Text>
            <Text style={[styles.modalText, { color: colors.textPrimaryMuted }]}>
              Profilin, avatarların, arkadaşlıkların ve sana bağlı oyun kayıtların silinecek. Bu işlem geri alınamaz.
            </Text>
            <Button label="Vazgeç" variant="ghost" fullWidth disabled={deleting} onPress={() => setConfirming(false)} />
            <Button
              label={deleting ? 'Hesap siliniyor…' : 'Evet, hesabımı sil'}
              variant="danger"
              fullWidth
              loading={deleting}
              disabled={deleting}
              onPress={() => void handleDelete()}
              icon={<Trash2 color="#FFF" size={18} />}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 44, gap: 22 },
  header: { gap: 12 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  icon: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 27, fontWeight: '900', textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 520 },
  sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 8 },
  bullet: { fontSize: 13, lineHeight: 20, marginBottom: 8 },
  notice: { fontSize: 12, lineHeight: 18, marginVertical: 12 },
  error: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 24 },
  modalCard: { borderWidth: 1, borderRadius: 24, padding: 22, gap: 14 },
  modalTitle: { fontSize: 19, fontWeight: '900' },
  modalText: { fontSize: 13, lineHeight: 20 },
});
