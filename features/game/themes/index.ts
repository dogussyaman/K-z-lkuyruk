import type { GameMode } from '../../../types/game';

export interface GameModeTheme {
  id: GameMode;
  accent: string;
  accentSecondary: string;
  background: string;
  surface: string;
  glow: string;
  heroEmoji: string;
  atmosphere: 'campfire' | 'survival' | 'mystery' | 'storm' | 'versus' | 'spy' | 'chaos' | 'gold' | 'noir';
  lobbyTitle: string;
  roundTitle: string;
  victoryTitle: string;
}

export const GAME_MODE_THEMES: Record<GameMode, GameModeTheme> = {
  classic: {
    id: 'classic', accent: '#FF713D', accentSecondary: '#A16BFF', background: '#160F22', surface: '#241634', glow: 'rgba(255,113,61,0.25)', heroEmoji: '🦊', atmosphere: 'campfire', lobbyTitle: 'Kamp Ateşi Lobisi', roundTitle: 'Blöf Zamanı', victoryTitle: 'Kurnazlığın Kazandı',
  },
  survival: {
    id: 'survival', accent: '#EF4444', accentSecondary: '#F97316', background: '#180B0B', surface: '#2A1111', glow: 'rgba(239,68,68,0.28)', heroEmoji: '❤️‍🔥', atmosphere: 'survival', lobbyTitle: 'Hayatta Kalma Kampı', roundTitle: 'Canını Koru', victoryTitle: 'Son Tilki Ayakta',
  },
  suspicious: {
    id: 'suspicious', accent: '#A16BFF', accentSecondary: '#22D3EE', background: '#100B1A', surface: '#211333', glow: 'rgba(161,107,255,0.26)', heroEmoji: '🕵️', atmosphere: 'mystery', lobbyTitle: 'Şüpheliler Odası', roundTitle: 'Kimi İzliyorsun?', victoryTitle: 'Dedektif Raporu',
  },
  blitz: {
    id: 'blitz', accent: '#FFD166', accentSecondary: '#FF713D', background: '#17120A', surface: '#2B2110', glow: 'rgba(255,209,102,0.30)', heroEmoji: '⚡', atmosphere: 'storm', lobbyTitle: 'Fırtına İstasyonu', roundTitle: '7 Saniye!', victoryTitle: 'Hız Şampiyonu',
  },
  team_battle: {
    id: 'team_battle', accent: '#FF654D', accentSecondary: '#35B8FF', background: '#0E1220', surface: '#171D31', glow: 'rgba(53,184,255,0.24)', heroEmoji: '⚔️', atmosphere: 'versus', lobbyTitle: 'A/B Savaş Arenası', roundTitle: 'Takımını Taşı', victoryTitle: 'Zafer Bayrağı',
  },
  secret_missions: {
    id: 'secret_missions', accent: '#10B981', accentSecondary: '#84CC16', background: '#071713', surface: '#0E2A20', glow: 'rgba(16,185,129,0.26)', heroEmoji: '🗝️', atmosphere: 'spy', lobbyTitle: 'Gizli Operasyon', roundTitle: 'Görevini Sakla', victoryTitle: 'Görev Dosyası Açıldı',
  },
  double_trap: {
    id: 'double_trap', accent: '#EC4899', accentSecondary: '#A855F7', background: '#190C17', surface: '#2C1329', glow: 'rgba(236,72,153,0.28)', heroEmoji: '🎭', atmosphere: 'chaos', lobbyTitle: 'Çifte Tuzak Sahnesi', roundTitle: 'İki Blöf Kur', victoryTitle: 'Kaos Ustası',
  },
  golden_question: {
    id: 'golden_question', accent: '#F59E0B', accentSecondary: '#FDE047', background: '#171105', surface: '#2D230B', glow: 'rgba(245,158,11,0.30)', heroEmoji: '👑', atmosphere: 'gold', lobbyTitle: 'Altın Salon', roundTitle: 'Altın Tur', victoryTitle: 'Altın Taç',
  },
  detective_fox: {
    id: 'detective_fox', accent: '#8B5CF6', accentSecondary: '#38BDF8', background: '#080C16', surface: '#11192A', glow: 'rgba(139,92,246,0.25)', heroEmoji: '🔎', atmosphere: 'noir', lobbyTitle: 'Dedektif Bürosu', roundTitle: 'İpuçlarını Birleştir', victoryTitle: 'Dosya Çözüldü',
  },
  gizli_tilki: {
    id: 'gizli_tilki', accent: '#FF654D', accentSecondary: '#35B8FF', background: '#080E18', surface: '#121D2C', glow: 'rgba(53,184,255,0.25)', heroEmoji: '🦊', atmosphere: 'versus', lobbyTitle: 'Gizli Operasyon Merkezi', roundTitle: 'Operasyon Kararı', victoryTitle: 'Operasyon Tamamlandı',
  },
};

export function getGameModeTheme(mode?: GameMode | null): GameModeTheme {
  return GAME_MODE_THEMES[mode ?? 'classic'];
}
