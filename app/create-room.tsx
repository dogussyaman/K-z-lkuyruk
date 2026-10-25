import { useTheme, useThemeStyles } from '@/theme/ThemeProvider';
import type { ThemeColors } from '@/theme/ThemeProvider';
import { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  ImageBackground,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Sparkles, Check, Clock, Layers, Flame, Eye, EyeOff, Edit2, Shield, Zap, Search, Compass } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen, Button, Card, Avatar, Badge, StickyActionBar, Input } from '@/components/ui';
import { spacing, typography, radii, shadows } from '@/theme';
import { useGameStore } from '@/store/gameStore';
import { useHaptics } from '@/hooks/useHaptics';
import {
  CATEGORY_GROUPS,
  CATEGORY_OPTIONS,
  type CategoryOptionId,
} from '@/features/game/categories';
import { AVATAR_KEYS, DICEBEAR_AVATAR_KEYS } from '@/features/game/players';
import { mascotImages } from '@/assets/illustrations';
import { soundService } from '@/services/soundService';
import { categoryOptionImages } from '@/assets/categories/options';
import { QUESTIONS } from '@/features/game/questions';
import type { GameMode } from '@/types/game';
import { BLITZ_ROUND_SECONDS } from '@/features/game/modes';
import { gameModeImages } from '@/assets/game-modes';

const ROUND_OPTIONS = [3, 5, 7, 10];
const TIME_OPTIONS = [10, 15, 20, 30];
const BLITZ_TIME_OPTIONS = [5, 7, 10];

export default function CreateRoomScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { service, currentPlayer, setCurrentPlayer, setRoomCode, setRoomState } = useGameStore();
  const { trigger } = useHaptics();

  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode: GameMode = (params.mode === 'survival' || params.mode === 'suspicious' || params.mode === 'blitz')
    ? params.mode
    : 'classic';

  const [hostName, setHostName] = useState(currentPlayer?.name ?? 'Ev Sahibi');
  const [nameDraft, setNameDraft] = useState(currentPlayer?.name ?? 'Ev Sahibi');
  const [showNameModal, setShowNameModal] = useState(false);
  const [avatarKey, setAvatarKey] = useState(currentPlayer?.avatarKey ?? 'fox');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [rounds, setRounds] = useState(5);
  const [gameMode, setGameMode] = useState<GameMode>(initialMode);
  const [roundSeconds, setRoundSeconds] = useState(initialMode === 'blitz' ? BLITZ_ROUND_SECONDS : 15);
  const [selectedCats, setSelectedCats] = useState<CategoryOptionId[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');
  const [showRoomPassword, setShowRoomPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const handleSelectGameMode = (selected: GameMode) => {
    soundService.play('click');
    trigger('light');
    setGameMode(selected);
    if (selected === 'blitz') {
      setRoundSeconds(BLITZ_ROUND_SECONDS);
    } else if (roundSeconds < 10) {
      setRoundSeconds(15);
    }
  };

  const toggleCategory = (id: CategoryOptionId) => {
    soundService.play('click');
    trigger('light');
    if (selectedCats.includes(id)) {
      setSelectedCats(selectedCats.filter((c) => c !== id));
    } else {
      setSelectedCats([...selectedCats, id]);
    }
  };

  const toggleAllCategories = () => {
    soundService.play('click');
    trigger('light');
    if (selectedCats.length === CATEGORY_OPTIONS.length) {
      setSelectedCats([]);
    } else {
      setSelectedCats(CATEGORY_OPTIONS.map((category) => category.id));
    }
  };

  const handleCreate = async () => {
    if (submitting.current) return;
    if (selectedCats.length === 0) {
      trigger('warning');
      setError('Lütfen en az 1 kategori seçin.');
      return;
    }
    if (isPrivate && (roomPassword.length < 8 || roomPassword.length > 72)) {
      setError('Kilitli oda şifresi 8-72 karakter arasında olmalıdır.');
      return;
    }
    const supportedQuestionCategories = new Set(
      CATEGORY_OPTIONS
        .filter((category) => selectedCats.includes(category.id))
        .map((category) => category.questionCategoryId)
    );
    const availableQuestionCount = new Set(
      QUESTIONS.filter((question) => supportedQuestionCategories.has(question.categoryId))
        .map((question) => question.id)
    ).size;
    if (availableQuestionCount < rounds) {
      setError(`Seçtiğin kategorilerde ${rounds} tur için yeterli farklı soru yok.`);
      return;
    }
    submitting.current = true;
    trigger('medium');
    setLoading(true);
    setError(null);
    try {
      const res = await service.createRoom({
        hostName: hostName.trim() || 'Ev Sahibi',
        avatarKey,
        totalRounds: rounds,
        roundSeconds,
        gameMode,
        categories: Array.from(
          new Set(
            CATEGORY_OPTIONS
              .filter((category) => selectedCats.includes(category.id))
              .map((category) => category.questionCategoryId)
          )
        ),
        isPrivate,
        password: isPrivate ? roomPassword : undefined,
      });

      setRoomCode(res.code);
      const state = await service.getRoomState(res.code);
      setRoomState(state);
      if (state?.players[res.playerId]) {
        setCurrentPlayer(state.players[res.playerId]);
      }

      router.replace('/lobby');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return (
    <Screen gradient diagonalSlice>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <ChevronLeft color={colors.textPrimary} size={22} />
          </Pressable>
          <Text style={styles.screenTitle}>Oda Oluştur</Text>
          <Badge tone="purple" sticker>HOST</Badge>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Card with Host Fox Mascot */}
          <View style={styles.mascotBanner}>
            <View style={styles.mascotBannerContent}>
              <View style={styles.mascotKickerRow}>
                <Flame color={colors.orange} size={14} />
                <Text style={styles.mascotKicker}>OYUNUN PATRONU SENSİN</Text>
              </View>
              <Text style={styles.mascotBannerTitle}>Parti Kurallarını Belirle</Text>
              <Text style={styles.mascotBannerDesc}>
                Tur sayısını, düşünme süresini ayarla ve arkadaşlarını lobide karşıla!
              </Text>
            </View>
            <Image
              source={mascotImages.lobby}
              style={styles.mascotImage}
              resizeMode="contain"
            />
          </View>

          {/* Host identity Card */}
          <Card variant="surface" style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Profilin & Görünüşün</Text>
            <View style={styles.hostRow}>
              <Pressable
                onPress={() => setShowAvatarPicker(!showAvatarPicker)}
                style={styles.avatarButton}
              >
                <Avatar
                  avatarKey={
                    currentPlayer?.avatarKey === avatarKey
                      ? currentPlayer.avatarUrl ?? avatarKey
                      : avatarKey
                  }
                  userId={currentPlayer?.id}
                  size={54}
                  ring
                />
                <View style={styles.avatarChangeBadge}>
                  <Text style={styles.avatarChangeText}>Değiştir</Text>
                </View>
              </Pressable>

              <View style={styles.hostNameContainer}>
                <Text style={styles.hostName} numberOfLines={1}>
                  {hostName || 'Ev Sahibi'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Oda sahibinin ismini güncelle"
                  onPress={() => {
                    setNameDraft(hostName);
                    setShowNameModal(true);
                  }}
                  style={styles.editHostNameButton}
                >
                  <Edit2 color={colors.orange} size={16} />
                  <Text style={styles.editHostNameText}>İsmi düzenle</Text>
                </Pressable>
              </View>
            </View>

            {/* Avatar Picker Drawer */}
            {showAvatarPicker && (
              <View style={styles.avatarPickerRow}>
                {[...AVATAR_KEYS, ...DICEBEAR_AVATAR_KEYS].map((k) => (
                  <Pressable
                    key={k}
                    onPress={() => {
                      trigger('light');
                      setAvatarKey(k);
                      setShowAvatarPicker(false);
                    }}
                    style={[
                      styles.avatarPickItem,
                      avatarKey === k && styles.avatarPickItemActive,
                    ]}
                  >
                    <Avatar avatarKey={k} size={38} />
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          <Card variant="surface" style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Oyun Modu</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tüm modları incele"
                onPress={() => router.push('/game-modes')}
                style={styles.exploreModesLink}
              >
                <Compass size={14} color={colors.orange} />
                <Text style={styles.exploreModesLinkText}>Tüm Modları Keşfet</Text>
              </Pressable>
            </View>

            <View style={styles.modesGrid}>
              {/* Klasik */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: gameMode === 'classic' }}
                onPress={() => handleSelectGameMode('classic')}
                style={[styles.modeSelectCard, gameMode === 'classic' && styles.modeSelectCardActive]}
              >
                <View style={styles.modeCardHeader}>
                  <Image source={gameModeImages.classic} style={styles.modeCardThumb} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.modeTitleRow}>
                      <Text style={[styles.modeSelectTitle, gameMode === 'classic' && styles.modeSelectTitleActive]}>
                        Klasik Blöf
                      </Text>
                      <Badge tone="orange" style={styles.modeTinyBadge}>VARSAYILAN</Badge>
                    </View>
                    <Text style={styles.modeSelectDesc}>Puan biriktir, tuzak kur ve en yüksek skorla kazan.</Text>
                  </View>
                </View>
              </Pressable>

              {/* Hayatta Kalma */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: gameMode === 'survival' }}
                onPress={() => handleSelectGameMode('survival')}
                style={[styles.modeSelectCard, gameMode === 'survival' && styles.modeSelectCardActive]}
              >
                <View style={styles.modeCardHeader}>
                  <Image source={gameModeImages.survival} style={styles.modeCardThumb} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.modeTitleRow}>
                      <Text style={[styles.modeSelectTitle, gameMode === 'survival' && styles.modeSelectTitleActive]}>
                        Hayatta Kalma
                      </Text>
                      <Badge tone="danger" style={styles.modeTinyBadge}>3 CAN</Badge>
                    </View>
                    <Text style={styles.modeSelectDesc}>3 canla başla; yanlış cevap veya süre aşımında can kaybet.</Text>
                  </View>
                </View>
              </Pressable>

              {/* Herkes Şüpheli */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: gameMode === 'suspicious' }}
                onPress={() => handleSelectGameMode('suspicious')}
                style={[styles.modeSelectCard, gameMode === 'suspicious' && styles.modeSelectCardActive]}
              >
                <View style={styles.modeCardHeader}>
                  <Image source={gameModeImages.suspicious} style={styles.modeCardThumb} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.modeTitleRow}>
                      <Text style={[styles.modeSelectTitle, gameMode === 'suspicious' && styles.modeSelectTitleActive]}>
                        Herkes Şüpheli
                      </Text>
                      <Badge tone="purple" style={styles.modeTinyBadge}>YENİ MOD</Badge>
                    </View>
                    <Text style={styles.modeSelectDesc}>Tuzak kuranları tahmin et, dedektif puanları topla.</Text>
                  </View>
                </View>
              </Pressable>

              {/* Fırtına Turu */}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: gameMode === 'blitz' }}
                onPress={() => handleSelectGameMode('blitz')}
                style={[styles.modeSelectCard, gameMode === 'blitz' && styles.modeSelectCardActive]}
              >
                <View style={styles.modeCardHeader}>
                  <Image source={gameModeImages.blitz} style={styles.modeCardThumb} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.modeTitleRow}>
                      <Text style={[styles.modeSelectTitle, gameMode === 'blitz' && styles.modeSelectTitleActive]}>
                        Fırtına Turu
                      </Text>
                      <Badge tone="yellow" style={styles.modeTinyBadge}>7 SANİYE</Badge>
                    </View>
                    <Text style={styles.modeSelectDesc}>Hızlı cevapla, ilk 3 saniyede bilip hız bonusunu kap!</Text>
                  </View>
                </View>
              </Pressable>
            </View>
          </Card>

          <Card variant="surface" style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Oda Erişimi</Text>
            <View style={styles.roomTypeRow}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: !isPrivate }}
                onPress={() => setIsPrivate(false)}
                style={[styles.roomTypeButton, !isPrivate && styles.roomTypeButtonActive]}
              >
                <Text style={[styles.roomTypeTitle, !isPrivate && styles.roomTypeTitleActive]}>
                  Herkese Açık
                </Text>
                <Text style={styles.roomTypeDescription}>Açık oda listesinde görünür.</Text>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: isPrivate }}
                onPress={() => setIsPrivate(true)}
                style={[styles.roomTypeButton, isPrivate && styles.roomTypeButtonActive]}
              >
                <Text style={[styles.roomTypeTitle, isPrivate && styles.roomTypeTitleActive]}>
                  Kilitli / Özel
                </Text>
                <Text style={styles.roomTypeDescription}>Katılım için oda kodu ve şifre gerekir.</Text>
              </Pressable>
            </View>
            {isPrivate ? (
              <View style={styles.roomPasswordRow}>
                <TextInput
                  value={roomPassword}
                  onChangeText={setRoomPassword}
                  placeholder="En az 8 karakter"
                  placeholderTextColor={colors.textMuted}
                  style={styles.roomPasswordInput}
                  secureTextEntry={!showRoomPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={72}
                  accessibilityLabel="Özel oda şifresi"
                />
                <Pressable
                  onPress={() => setShowRoomPassword((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={showRoomPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  style={styles.passwordVisibilityButton}
                >
                  {showRoomPassword
                    ? <EyeOff color={colors.textSecondary} size={20} />
                    : <Eye color={colors.textSecondary} size={20} />}
                </Pressable>
              </View>
            ) : null}
          </Card>

          {/* Rounds selector */}
          <Card variant="surface" style={styles.sectionCard}>
            <View style={styles.labelRow}>
              <Layers color={colors.purpleSoft} size={18} />
              <Text style={styles.sectionLabel}>Tur Sayısı</Text>
              <Text style={styles.selectedSettingText}>{rounds} Tur</Text>
            </View>
            <View style={styles.optionRow}>
              {ROUND_OPTIONS.map((r) => {
                const active = rounds === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      trigger('light');
                      setRounds(r);
                    }}
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                    <Text
                      style={[
                        styles.segmentSub,
                        active && styles.segmentSubActive,
                      ]}
                    >
                      Tur
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Time limit selector */}
          <Card variant="surface" style={styles.sectionCard}>
            <View style={styles.labelRow}>
              <Clock color={gameMode === 'blitz' ? colors.yellow : colors.orange} size={18} />
              <Text style={styles.sectionLabel}>
                {gameMode === 'blitz' ? 'Fırtına Süresi (Hızlı)' : 'Cevap Süresi'}
              </Text>
              <Text style={[styles.selectedSettingText, gameMode === 'blitz' && { color: colors.yellow }]}>
                {roundSeconds} sn
              </Text>
            </View>
            <View style={styles.optionRow}>
              {(gameMode === 'blitz' ? BLITZ_TIME_OPTIONS : TIME_OPTIONS).map((t) => {
                const active = roundSeconds === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      trigger('light');
                      setRoundSeconds(t);
                    }}
                    style={[
                      styles.segmentBtn,
                      active && (gameMode === 'blitz' ? styles.segmentBtnActiveBlitz : styles.segmentBtnActiveTime),
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active && styles.segmentTextActive,
                      ]}
                    >
                      {t}
                    </Text>
                    <Text
                      style={[
                        styles.segmentSub,
                        active && styles.segmentSubActive,
                      ]}
                    >
                      sn
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Category selection */}
          <View style={styles.catHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>Kategoriler</Text>
              <Badge tone="yellow">{selectedCats.length} Seçili</Badge>
            </View>
            <Pressable onPress={toggleAllCategories}>
              <Text style={styles.allLink}>
                {selectedCats.length === CATEGORY_OPTIONS.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.categoryHint}>
            Alt kategoriler, en yakın mevcut soru havuzunu kullanır.
          </Text>

          {CATEGORY_GROUPS.map((group) => (
            <View key={group.id} style={styles.catGroup}>
              <View style={styles.catGroupHeading}>
                <Text style={styles.catGroupEmoji}>{group.emoji}</Text>
                <Text style={styles.catGroupTitle}>{group.name}</Text>
              </View>
              <View style={styles.catGrid}>
                {group.categories.map((category) => {
                  const isSelected = selectedCats.includes(category.id);
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => toggleCategory(category.id)}
                      style={({ pressed }) => [
                        styles.catCard,
                        isSelected && styles.catCardSelected,
                        { transform: [{ scale: pressed ? 0.98 : 1 }] },
                      ]}
                    >
                      <ImageBackground
                        source={categoryOptionImages[category.id]}
                        style={styles.catCardGradient}
                        imageStyle={styles.categoryImage}
                      >
                        <LinearGradient
                          colors={['rgba(15, 9, 27, 0.2)', 'rgba(15, 9, 27, 0.82)']}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                        <View style={styles.catCardContent}>
                          <View style={styles.catTopRow}>
                            <Text style={styles.catEmoji}>{category.emoji}</Text>
                            <View
                              style={[
                                styles.checkCircle,
                                isSelected ? styles.checkCircleActive : styles.checkCircleInactive,
                              ]}
                            >
                              {isSelected && <Check color="#171026" size={13} strokeWidth={3} />}
                            </View>
                          </View>
                          <Text style={styles.catName} numberOfLines={3}>
                            {category.name}
                          </Text>
                        </View>
                      </ImageBackground>
                      {isSelected && (
                        <View pointerEvents="none" style={styles.catCardSelectedOutline} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

        </ScrollView>
        <StickyActionBar>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button
            label="Odayı Kur & Lobiye Geç"
            onPress={handleCreate}
            variant="orange"
            loading={loading}
            fullWidth
            icon={<Sparkles color="#FFF" size={20} />}
          />
        </StickyActionBar>
      </KeyboardAvoidingView>
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.nameModalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            accessibilityLabel="İsim güncelleme penceresini kapat"
            onPress={() => setShowNameModal(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.nameModal}>
            <Text style={styles.nameModalTitle}>İsmini güncelle</Text>
            <Text style={styles.nameModalHint}>Lobide oyuncular seni bu isimle görecek.</Text>
            <Input
              accessibilityLabel="Yeni oyuncu adı"
              autoCapitalize="words"
              autoCorrect={false}
              autoFocus
              maxLength={16}
              onChangeText={setNameDraft}
              onSubmitEditing={() => {
                setHostName(nameDraft.trim() || 'Ev Sahibi');
                setShowNameModal(false);
              }}
              placeholder="Oyuncu adı"
              returnKeyType="done"
              style={styles.nameModalInput}
              value={nameDraft}
            />
            <View style={styles.nameModalActions}>
              <Button
                label="Vazgeç"
                onPress={() => setShowNameModal(false)}
                variant="secondary"
                size="md"
              />
              <Button
                label="Kaydet"
                onPress={() => {
                  setHostName(nameDraft.trim() || 'Ev Sahibi');
                  setShowNameModal(false);
                }}
                variant="orange"
                size="md"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  scroll: {
    paddingBottom: spacing.md,
  },
  mascotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  mascotBannerContent: {
    flex: 1.2,
    paddingRight: 6,
  },
  mascotKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  mascotKicker: {
    fontFamily: 'Poppins-Bold',
    fontSize: 10,
    color: colors.orange,
    letterSpacing: 0.6,
  },
  mascotBannerTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  mascotBannerDesc: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    lineHeight: 15,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mascotImage: {
    width: 82,
    height: 82,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  roomTypeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  roomTypeButton: {
    flex: 1,
    minHeight: 82,
    justifyContent: 'center',
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
  },
  roomTypeButtonActive: {
    borderColor: colors.orange,
    backgroundColor: 'rgba(255, 113, 59, 0.12)',
  },
  roomTypeTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  roomTypeTitleActive: {
    color: colors.orange,
  },
  roomTypeDescription: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  exploreModesLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 113, 59, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  exploreModesLinkText: {
    ...typography.caption,
    fontFamily: 'Poppins-Bold',
    color: colors.orange,
    fontSize: 11,
  },
  modesGrid: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modeSelectCard: {
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
  },
  modeSelectCardActive: {
    borderColor: colors.orange,
    backgroundColor: 'rgba(255, 113, 59, 0.12)',
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modeCardThumb: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  modeSelectTitle: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  modeSelectTitleActive: {
    color: colors.orange,
  },
  modeSelectDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  modeTinyBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  segmentBtnActiveBlitz: {
    borderColor: colors.yellow,
    backgroundColor: 'rgba(255, 209, 102, 0.18)',
  },
  roomPasswordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bgSurfaceAlt,
  },
  roomPasswordInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  passwordVisibilityButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    flex: 1,
  },
  selectedSettingText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: colors.orange,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: spacing.xs,
  },
  hostNameContainer: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  hostName: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  editHostNameButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurfaceAlt,
  },
  editHostNameText: {
    ...typography.caption,
    color: colors.orange,
    fontFamily: 'Poppins-SemiBold',
  },
  nameModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,7,18,0.72)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  nameModal: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nameModalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  nameModalHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  nameModalInput: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.orange,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.bgSurfaceAlt,
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
  },
  nameModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  avatarButton: {
    alignItems: 'center',
  },
  avatarChangeBadge: {
    marginTop: 4,
  },
  avatarChangeText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    color: colors.orange,
  },
  avatarPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  avatarPickItem: {
    padding: 2,
    borderRadius: 24,
  },
  avatarPickItemActive: {
    borderWidth: 2,
    borderColor: colors.orange,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.purple,
    borderColor: '#A78BFA',
    borderBottomWidth: 3.5,
    borderBottomColor: '#7C3AED',
    ...shadows.glow,
  },
  segmentBtnActiveTime: {
    backgroundColor: colors.orange,
    borderColor: '#FFA07A',
    borderBottomWidth: 3.5,
    borderBottomColor: '#D9480F',
    ...shadows.glowOrange,
  },
  segmentText: {
    fontSize: 18,
    fontFamily: 'Poppins-Bold',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: '#FFF',
  },
  segmentSub: {
    fontSize: 10,
    fontFamily: 'Poppins-Medium',
    color: colors.textMuted,
    marginTop: -2,
  },
  segmentSubActive: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  catHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
  },
  allLink: {
    ...typography.small,
    color: colors.orange,
    fontFamily: 'Poppins-Bold',
  },
  categoryHint: {
    color: colors.textMuted,
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  catGroup: {
    marginBottom: spacing.md,
  },
  catGroupHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  catGroupEmoji: {
    fontSize: 18,
  },
  catGroupTitle: {
    color: colors.textPrimary,
    fontFamily: 'Poppins-Bold',
    fontSize: 14,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.lg,
  },
  catCard: {
    width: '47%',
    minWidth: 0,
    borderRadius: radii.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    ...shadows.card,
  },
  catCardSelected: {
    borderColor: colors.orange,
    ...shadows.glowOrange,
  },
  catCardGradient: {
    flex: 1,
    minHeight: 104,
  },
  categoryImage: {
    resizeMode: 'cover',
  },
  catCardContent: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  catCardSelectedOutline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.xl,
    borderWidth: 2.5,
    borderColor: colors.orange,
  },
  catTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  catEmoji: {
    fontSize: 20,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: colors.lime,
  },
  checkCircleInactive: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  catName: {
    fontFamily: 'Poppins-Bold',
    fontSize: 13,
    color: '#FFF',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  errorText: {
    ...typography.small,
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
    fontFamily: 'Poppins-Medium',
  },
});
