import type { GameMode } from '../../types/game';
import { gameModeImages } from '../../assets/game-modes';

export type FutureGameMode =
  | 'team_battle'
  | 'secret_missions'
  | 'double_trap'
  | 'golden_question'
  | 'detective_fox';

export type AnyGameModeId = GameMode | FutureGameMode;

export type GameModeStatus = 'active' | 'coming_soon';

export interface GameModeRuleSet {
  defaultRoundSeconds: number;
  minRoundSeconds: number;
  maxRoundSeconds: number;
  defaultRounds: number;
  minPlayers: number;
  maxPlayers: number;
  hasLives: boolean;
  startingLives?: number;
  hasSuspectDeduction?: boolean;
  hasSpeedBonus?: boolean;
  speedBonusThresholdSeconds?: number;
  speedBonusPoints?: number;
  correctAnswerPoints: number;
  trapVictimPoints: number;
  suspectBonusPoints?: number;
  allowAbilities: boolean;
}

export interface GameModeDefinition {
  id: AnyGameModeId;
  name: string;
  tagline: string;
  description: string;
  badge: string;
  status: GameModeStatus;
  playerCountLabel: string;
  estimatedDurationLabel: string;
  difficultyLabel: 'Kolay' | 'Orta' | 'Zor' | 'Dinamik' | 'Taktiksel';
  accentColor: string;
  gradientColors: [string, string, string];
  iconName: 'Zap' | 'Shield' | 'Users' | 'Sparkles' | 'Swords' | 'Scroll' | 'Boxes' | 'Crown' | 'Search';
  illustrationKey: keyof typeof gameModeImages;
  rules: GameModeRuleSet;
  features: string[];
}

export const BLITZ_ROUND_SECONDS = 7;
export const BLITZ_SPEED_BONUS_THRESHOLD_MS = 3000;
export const BLITZ_SPEED_BONUS_POINTS = 1;
export const SUSPECT_DEDUCTION_BONUS_POINTS = 1;

export const GAME_MODES: GameModeDefinition[] = [
  {
    id: 'classic',
    name: 'Klasik Blöf',
    tagline: 'Bilgi ve zekice tuzakların eğlenceli savaşı',
    description: 'Her tur uydurduğun sahte cevapla rakiplerini kandır, gerçek cevabı bul ve en yüksek puanla maçı kazan.',
    badge: 'VARSAYILAN',
    status: 'active',
    playerCountLabel: '2–10 Oyuncu',
    estimatedDurationLabel: '5–10 dk',
    difficultyLabel: 'Dinamik',
    accentColor: '#FF713D',
    gradientColors: ['#FF713D', '#A16BFF', '#28183D'],
    iconName: 'Sparkles',
    illustrationKey: 'classic',
    rules: {
      defaultRoundSeconds: 15,
      minRoundSeconds: 10,
      maxRoundSeconds: 30,
      defaultRounds: 5,
      minPlayers: 2,
      maxPlayers: 10,
      hasLives: false,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      'Doğru cevap: +2 puan',
      'Tuzağa düşen rakip başına: +1 puan',
      'Kalkan ve Blok yetenekleri açık',
      'Dengeli parti modu',
    ],
  },
  {
    id: 'survival',
    name: 'Hayatta Kalma',
    tagline: '3 canla başla, elenmeden son tilki ol!',
    description: 'Yanlış cevap veren veya süresi dolan bir canını kaybeder. Canı tükenen elenir; ayakta kalan son tilki şampiyon olur.',
    badge: 'REKABETÇİ',
    status: 'active',
    playerCountLabel: '2–10 Oyuncu',
    estimatedDurationLabel: '4–8 dk',
    difficultyLabel: 'Zor',
    accentColor: '#EF4444',
    gradientColors: ['#EF4444', '#991B1B', '#1A1228'],
    iconName: 'Shield',
    illustrationKey: 'survival',
    rules: {
      defaultRoundSeconds: 15,
      minRoundSeconds: 10,
      maxRoundSeconds: 25,
      defaultRounds: 5,
      minPlayers: 2,
      maxPlayers: 10,
      hasLives: true,
      startingLives: 3,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      'Oyuncular 3 can ile başlar',
      'Yanlış cevap / süre aşımı: -1 can',
      'Canı biten oyuncu elenir',
      'Son hayatta kalan oyuncu kazanır',
    ],
  },
  {
    id: 'suspicious',
    name: 'Herkes Şüpheli',
    tagline: 'Sosyal çıkarım, blöf ve dedektif tilki avı!',
    description: 'Sadece doğru cevabı bulmak yetmez! Tur sırasında kimin kurnaz bir tuzak kurduğunu tahmin et; doğru şüphe ile ekstra Dedektif Puanı topla.',
    badge: 'YENİ MOD',
    status: 'active',
    playerCountLabel: '2–10 Oyuncu',
    estimatedDurationLabel: '6–12 dk',
    difficultyLabel: 'Taktiksel',
    accentColor: '#A16BFF',
    gradientColors: ['#A16BFF', '#7547C4', '#110D1B'],
    iconName: 'Search',
    illustrationKey: 'suspicious',
    rules: {
      defaultRoundSeconds: 20,
      minRoundSeconds: 12,
      maxRoundSeconds: 35,
      defaultRounds: 5,
      minPlayers: 2,
      maxPlayers: 10,
      hasLives: false,
      hasSuspectDeduction: true,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      suspectBonusPoints: SUSPECT_DEDUCTION_BONUS_POINTS,
      allowAbilities: true,
    },
    features: [
      'Doğru cevap tahmini +2 puan',
      'Tuzağına düşürdüğün rakip başına +1 puan',
      'Kurnaz tuzakçıyı doğru tahmin edersen +1 Dedektif Bonusu',
      'Gizli dedektif oylaması ve tur sonu ifşa raporu',
    ],
  },
  {
    id: 'blitz',
    name: 'Fırtına Turu',
    tagline: '7 saniye içinde hızlı düşün, hız bonusunu kap!',
    description: 'Zaman baskısı tavan! Her soru için yalnızca 7 saniye. İlk 3 saniyede doğru cevaplayanlar ekstra +1 Hız Bonusu kazanır.',
    badge: 'YÜKSEK HIZ',
    status: 'active',
    playerCountLabel: '2–10 Oyuncu',
    estimatedDurationLabel: '3–5 dk',
    difficultyLabel: 'Dinamik',
    accentColor: '#FFD166',
    gradientColors: ['#FFD166', '#FF713D', '#1A1228'],
    iconName: 'Zap',
    illustrationKey: 'blitz',
    rules: {
      defaultRoundSeconds: BLITZ_ROUND_SECONDS,
      minRoundSeconds: 5,
      maxRoundSeconds: 10,
      defaultRounds: 5,
      minPlayers: 2,
      maxPlayers: 10,
      hasLives: false,
      hasSpeedBonus: true,
      speedBonusThresholdSeconds: 3,
      speedBonusPoints: BLITZ_SPEED_BONUS_POINTS,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: false,
    },
    features: [
      'Her soru için 7 saniye yıldırım geri sayım',
      'İlk 3 saniyede doğru bilenlere +1 Hız Bonusu (Toplam +3)',
      'Tüm oyuncular erken cevaplarsa beklemeden sonraki tura geçer',
      'Süre dolunca geç kalan cevaplar sunucu tarafından anında reddedilir',
    ],
  },
  {
    id: 'team_battle',
    name: 'Takım Savaşı',
    tagline: 'Kızılkuyruklar Mavi Pençelere Karşı!',
    description: 'Arkadaşlarınla 2 takıma ayrıl. Takım puan havuzunu büyüt, ortak stratejiyle rakipleri tuzağa çek.',
    badge: 'YAKINDA',
    status: 'coming_soon',
    playerCountLabel: '4–10 Oyuncu',
    estimatedDurationLabel: '8–15 dk',
    difficultyLabel: 'Taktiksel',
    accentColor: '#3B82F6',
    gradientColors: ['#3B82F6', '#1D4ED8', '#110D1B'],
    iconName: 'Users',
    illustrationKey: 'team_battle',
    rules: {
      defaultRoundSeconds: 15,
      minRoundSeconds: 10,
      maxRoundSeconds: 25,
      defaultRounds: 6,
      minPlayers: 4,
      maxPlayers: 10,
      hasLives: false,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      '2v2 ve 5v5 takım desteği',
      'Ortak takım puan havuzu',
      'Takım içi tuzak koruması',
      'Zafer bayrağı animasyonları',
    ],
  },
  {
    id: 'secret_missions',
    name: 'Gizli Görevler',
    tagline: 'Her turun gizli bir özel görevi var!',
    description: 'Maç başında sana gizli bir kart verilir: “Kimseye yakalanmadan en az 2 kişiyi kandır” gibi görevleri tamamla, bonus puan kap.',
    badge: 'YAKINDA',
    status: 'coming_soon',
    playerCountLabel: '3–8 Oyuncu',
    estimatedDurationLabel: '6–10 dk',
    difficultyLabel: 'Zor',
    accentColor: '#10B981',
    gradientColors: ['#10B981', '#047857', '#110D1B'],
    iconName: 'Scroll',
    illustrationKey: 'secret_missions',
    rules: {
      defaultRoundSeconds: 18,
      minRoundSeconds: 12,
      maxRoundSeconds: 25,
      defaultRounds: 5,
      minPlayers: 3,
      maxPlayers: 8,
      hasLives: false,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      'Kişiye özel gizli hedef kartları',
      'Fark ettirmeden görevi tamamlama heyecanı',
      'Sürpriz maç sonu görev puanları',
    ],
  },
  {
    id: 'double_trap',
    name: 'Çifte Tuzak',
    tagline: 'Bir değil, iki katı tuzak şansı!',
    description: 'Her oyuncu aynı turda iki farklı sahte cevap üretir. Seçenek havuzu genişler, şüphe ikiye katlanır.',
    badge: 'YAKINDA',
    status: 'coming_soon',
    playerCountLabel: '2–6 Oyuncu',
    estimatedDurationLabel: '7–12 dk',
    difficultyLabel: 'Zor',
    accentColor: '#EC4899',
    gradientColors: ['#EC4899', '#BE185D', '#110D1B'],
    iconName: 'Boxes',
    illustrationKey: 'double_trap',
    rules: {
      defaultRoundSeconds: 20,
      minRoundSeconds: 15,
      maxRoundSeconds: 30,
      defaultRounds: 5,
      minPlayers: 2,
      maxPlayers: 6,
      hasLives: false,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      'Tur başına 2 farklı sahte cevap girişi',
      'Çifte tuzak geliri',
      'Daha zengin seçenek kartları',
    ],
  },
  {
    id: 'golden_question',
    name: 'Altın Soru',
    tagline: 'Kaderi anında değiştiren kritik turlar!',
    description: 'Belirli turlarda aniden Altın Soru devreye girer. Bu turda doğru bilen 3 kat puan ve çifte yetenek kredisi alır.',
    badge: 'YAKINDA',
    status: 'coming_soon',
    playerCountLabel: '2–10 Oyuncu',
    estimatedDurationLabel: '5–10 dk',
    difficultyLabel: 'Orta',
    accentColor: '#F59E0B',
    gradientColors: ['#F59E0B', '#B45309', '#110D1B'],
    iconName: 'Crown',
    illustrationKey: 'golden_question',
    rules: {
      defaultRoundSeconds: 15,
      minRoundSeconds: 10,
      maxRoundSeconds: 25,
      defaultRounds: 5,
      minPlayers: 2,
      maxPlayers: 10,
      hasLives: false,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      'Rastgele beliren altın soru turları',
      '3 kat doğru cevap puanı',
      'Çifte yetenek kredisi ödülü',
    ],
  },
  {
    id: 'detective_fox',
    name: 'Dedektif Tilki',
    tagline: 'İpuçlarını birleştir, gizemi aydınlat!',
    description: 'Her tur bir oyuncu Dedektif seçilir. Dedektif diğer oyuncuların yanıtlarını sorgulayarak doğru cevabı ve blöfleri çözmeye çalışır.',
    badge: 'YAKINDA',
    status: 'coming_soon',
    playerCountLabel: '4–10 Oyuncu',
    estimatedDurationLabel: '8–14 dk',
    difficultyLabel: 'Taktiksel',
    accentColor: '#8B5CF6',
    gradientColors: ['#8B5CF6', '#6D28D9', '#110D1B'],
    iconName: 'Search',
    illustrationKey: 'detective_fox',
    rules: {
      defaultRoundSeconds: 25,
      minRoundSeconds: 15,
      maxRoundSeconds: 40,
      defaultRounds: 5,
      minPlayers: 4,
      maxPlayers: 10,
      hasLives: false,
      correctAnswerPoints: 2,
      trapVictimPoints: 1,
      allowAbilities: true,
    },
    features: [
      'Sırayla seçilen dedektif rolü',
      'Özel sorgu ve ipucu aşaması',
      'Büyük dedektif ödül havuzu',
    ],
  },
];

export function getGameMode(id?: string | null): GameModeDefinition {
  const found = GAME_MODES.find((mode) => mode.id === id);
  return found ?? GAME_MODES[0];
}

export function isGameModeActive(id?: string | null): boolean {
  if (!id) return false;
  const mode = GAME_MODES.find((m) => m.id === id);
  return mode?.status === 'active';
}

export function getActiveGameModes(): GameModeDefinition[] {
  return GAME_MODES.filter((mode) => mode.status === 'active');
}

export function getComingSoonGameModes(): GameModeDefinition[] {
  return GAME_MODES.filter((mode) => mode.status === 'coming_soon');
}

export function getAllGameModes(): GameModeDefinition[] {
  return GAME_MODES;
}
