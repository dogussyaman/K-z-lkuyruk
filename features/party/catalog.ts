export const PARTY_IDS = [
  'tilki_soygunu',
  'kizil_pakt',
  'kilit_altinda',
  'kayip_kare',
  'gece_pazari',
] as const;
export type PartyMode = (typeof PARTY_IDS)[number];
export const isPartyMode = (value?: string | null): value is PartyMode =>
  PARTY_IDS.includes(value as PartyMode);
export const PARTY_GAMES = [
  {
    id: 'tilki_soygunu',
    name: 'Tilki Soygunu',
    tagline: 'İşi kim yapacak, payı kim çalacak?',
    description:
      'Aynı ekiple kasayı aç; gözcü ol veya sınırlı çalma hakkınla fazladan pay al. Üç alarmda herkes kaybeder.',
    badge: 'GÜVEN & İHANET',
    emoji: '💰',
    accent: '#FFB454',
    background: '#15101E',
    surface: '#2B2035',
    min: 4,
    max: 8,
    rounds: 5,
    minutes: '5–8 dk',
    illustration: 'golden_question',
    steps: [
      'Herkes gizlice bir hamle seçer.',
      'En az yarı ekip kasayı açmalı, bir kişi gözcü olmalı.',
      'Başarılı işte çalışan +2, pay çalan +4 alır.',
      'Beş iş sonunda en çok ganimet kazanır; üç alarmda herkes kaybeder.',
    ],
  },
  {
    id: 'kizil_pakt',
    name: 'Kızıl Pakt',
    tagline: 'Sözlere değil, gecenin izlerine bak.',
    description:
      'Köydeki gizli tilkiler erzakları sabote ediyor. Konum beyanlarını, izcinin bulgusunu ve oylamayı birlikte değerlendir.',
    badge: 'GİZLİ ROL',
    emoji: '🌘',
    accent: '#FF7283',
    background: '#180E21',
    surface: '#30203B',
    min: 6,
    max: 10,
    rounds: 5,
    minutes: '8–12 dk',
    illustration: 'detective_fox',
    steps: [
      'Gizli rolünü yalnız sen görürsün.',
      'Gece gerçek konumunu ve gündüz söyleyeceğin konumu seç.',
      'İzci iki aday görür; her koruyucunun maç boyunca iki koruma hakkı vardır. Bir gecede en fazla bir erzak kaybedilir.',
      'Çoğunlukla gözetim kararı verilir, kimse oyundan çıkmaz. Üç erzak kaybında tilkiler; beş gece dayanılırsa veya hepsi ifşa edilirse köy kazanır.',
    ],
  },
  {
    id: 'kilit_altinda',
    name: 'Kilit Altında',
    tagline: 'Çözüm sende değil; aranızda.',
    description:
      'Sıra, renk eşlemesi ve güvenlik kuralı farklı oyuncularda. İpuçlarını birleştirip dört kilidi beraber açın.',
    badge: 'BİRLİKTE ÇÖZ',
    emoji: '🔐',
    accent: '#64E4DB',
    background: '#091B25',
    surface: '#12343F',
    min: 3,
    max: 6,
    rounds: 6,
    minutes: '5–8 dk',
    illustration: 'secret_missions',
    steps: [
      'Herkes yalnızca çözümün bir parçasını görür.',
      'Aşama başına iki kısa mesajla bilgini paylaş.',
      'Her oyuncu üç rengin sırasını kilitler; en çok seçilen sıra uygulanır.',
      'Eşit oyda kilit açılmaz. Üç hatadan önce dört kilit açarsanız hepiniz kazanırsınız.',
    ],
  },
  {
    id: 'kayip_kare',
    name: 'Kayıp Kare',
    tagline: 'Aynı yere mi bakıyoruz?',
    description:
      'Herkes ortak sahnenin başka bir köşesini görür; sahtekarın görüntüsü farklıdır. İki gözlem turundan sonra onu bulun.',
    badge: 'GÖRSEL BLÖF',
    emoji: '🖼️',
    accent: '#C3A3FF',
    background: '#15102D',
    surface: '#2B2249',
    min: 4,
    max: 8,
    rounds: 1,
    minutes: '4–7 dk',
    illustration: 'suspicious',
    steps: [
      'Kendi görsel parçanı incele; bütünü kimse görmez.',
      'Bir gözlem, sonra ışık veya yön hakkında bir ayrıntı paylaş.',
      'Farklı sahneyi göreni gizlice oyla.',
      'Sahtekar yakalanırsa ortak sahneyi tahmin ederek son kez kurtulabilir. Eşit oyda sıyrılır.',
    ],
  },
  {
    id: 'gece_pazari',
    name: 'Gece Pazarı',
    tagline: 'Fiyat ortada. Gerçek değer gizli.',
    description:
      'Sırayla satıcı ol; özel ekspertiz raporuna göre kapalı teklif ver. Finalde paran ve mallarının gerçek değeri sayılır.',
    badge: 'PAZARLIK',
    emoji: '🧰',
    accent: '#DCB8FF',
    background: '#1B1122',
    surface: '#392540',
    min: 3,
    max: 6,
    rounds: 6,
    minutes: '6–10 dk',
    illustration: 'double_trap',
    steps: [
      'Her oyuncu bir kez satıcı olur; sandığın değeri 0–8 arasındadır.',
      'Satıcı değeri bilir ve açıklamasında blöf yapabilir. Alıcılar farklı özel aralıklar görür.',
      'Kapalı teklifini ver veya 0 ile geç. En yüksek teklif eşitse satış olmaz.',
      'Satıcı satılan sandıktan 2 + teklifin üçte biri kadar komisyon alır. Finalde para + malların gerçek değeri kazanır.',
    ],
  },
] as const;
export function partyGame(id: PartyMode) {
  return PARTY_GAMES.find((game) => game.id === id)!;
}
export const SCENES = [
  'Gece İstasyonu',
  'Havalimanı',
  'Liman',
  'Lunapark',
  'Kütüphane',
  'Orman Kampı',
] as const;
export const SITES = ['Değirmen', 'Erzak Deposu', 'Köprü'] as const;
export const PERMUTATIONS = ['123', '132', '213', '231', '312', '321'];
export const COLOR_NAMES: Record<string, string> = {
  '1': 'Mercan',
  '2': 'Mavi',
  '3': 'Sarı',
};
export const ROLE_NAMES: Record<string, string> = {
  fox: 'Kızıl Tilki',
  scout: 'İzci',
  keeper: 'Köylü Koruyucu',
  impostor: 'Sahtekar',
  observer: 'Gözlemci',
  player: 'Ekip Üyesi',
};
export const PHASE_NAMES: Record<string, string> = {
  plan: 'Hamleni gizle',
  night: 'Gece başladı',
  vote: 'Şüpheni kilitle',
  lock: 'Birlikte çözün',
  clue: 'İlk gözlemin',
  detail: 'Işık ve yön',
  last_guess: 'Son tahmin',
  pitch: 'Sandığını tanıt',
  bid: 'Kapalı teklif',
  report: 'Hamleler açıldı',
  finished: 'Oyun tamamlandı',
};
export interface PartyPlayer {
  id: string;
  name: string;
  avatarKey: string;
  isBot: boolean;
  score: number;
  coins: number | null;
  role: string | null;
  submitted: boolean;
}
export interface PartyState {
  gameNumber: number;
  stateVersion: number;
  mode: PartyMode;
  phase: string;
  round: number;
  step: number;
  deadline: string | null;
  pausedAt: string | null;
  isHost: boolean;
  canAct: boolean;
  public: {
    alarm?: number;
    successes?: number;
    damage?: number;
    locks?: number;
    errors?: number;
    rounds: number;
    seller?: string;
    pitch?: string;
    scene?: number;
    exposed?: string[];
    detained?: string;
    events?: { site: number; protected: boolean; damage: number }[];
    claims?: { playerId: string; site: string }[];
    clues?: { playerId: string; text: string }[];
    details?: { playerId: string; text: string }[];
  };
  me: {
    role: string;
    hint?: string;
    scene?: number;
    crop?: number;
    steals: number;
    protects: number;
    coins: number;
    assetCount: number;
    suspects?: string[];
    allies?: string[];
    exposed: boolean;
    detained: number;
  };
  players: PartyPlayer[];
  report: { message?: string; details?: unknown };
  result: string | null;
  winnerIds: string[];
  submittedCount: number;
  totalCount: number;
  messages: { id: number; playerId: string; text: string }[];
}
