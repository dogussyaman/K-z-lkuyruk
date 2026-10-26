import type { GameMode } from '../../types/game';
import { gameModeImages } from '../../assets/game-modes';

export type AnyGameModeId = GameMode;
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
  fakeAnswersPerRound?: number;
  hasGoldenRounds?: boolean;
  goldenRoundEvery?: number;
  goldenCorrectMultiplier?: number;
  hasSecretMissions?: boolean;
  hasDetectiveRole?: boolean;
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
  { id:'classic', name:'Klasik Blöf', tagline:'Bilgi ve zekice tuzakların eğlenceli savaşı', description:'Sahte cevap üret, rakipleri kandır ve doğru cevabı bul.', badge:'VARSAYILAN', status:'active', playerCountLabel:'2–10 Oyuncu', estimatedDurationLabel:'5–10 dk', difficultyLabel:'Dinamik', accentColor:'#FF713D', gradientColors:['#FF713D','#A16BFF','#28183D'], iconName:'Sparkles', illustrationKey:'classic', rules:{defaultRoundSeconds:15,minRoundSeconds:10,maxRoundSeconds:30,defaultRounds:5,minPlayers:2,maxPlayers:10,hasLives:false,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:true}, features:['Doğru cevap +2','Rakip tuzağa düşerse +1','Kredi tabanlı yetenekler'] },
  { id:'survival', name:'Hayatta Kalma', tagline:'3 canla başla, elenmeden son tilki ol!', description:'Yanlış cevap veya süre aşımı can götürür. Son ayakta kalan kazanır.', badge:'REKABETÇİ', status:'active', playerCountLabel:'2–10 Oyuncu', estimatedDurationLabel:'4–8 dk', difficultyLabel:'Zor', accentColor:'#EF4444', gradientColors:['#EF4444','#991B1B','#1A1228'], iconName:'Shield', illustrationKey:'survival', rules:{defaultRoundSeconds:15,minRoundSeconds:10,maxRoundSeconds:25,defaultRounds:5,minPlayers:2,maxPlayers:10,hasLives:true,startingLives:3,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:true}, features:['3 can','Yanlışta -1 can','Son hayatta kalan kazanır'] },
  { id:'suspicious', name:'Herkes Şüpheli', tagline:'Blöfün yanına sosyal çıkarımı ekle!', description:'Doğru cevabı bulurken kimin başarılı blöf yaptığını da tahmin et.', badge:'SOSYAL', status:'active', playerCountLabel:'2–10 Oyuncu', estimatedDurationLabel:'6–12 dk', difficultyLabel:'Taktiksel', accentColor:'#A16BFF', gradientColors:['#A16BFF','#7547C4','#110D1B'], iconName:'Search', illustrationKey:'suspicious', rules:{defaultRoundSeconds:20,minRoundSeconds:12,maxRoundSeconds:35,defaultRounds:5,minPlayers:2,maxPlayers:10,hasLives:false,hasSuspectDeduction:true,correctAnswerPoints:2,trapVictimPoints:1,suspectBonusPoints:1,allowAbilities:true}, features:['Şüpheli seçimi','Başarılı blöfçüyü bulursan +1','Tur sonu ifşa'] },
  { id:'blitz', name:'Fırtına Turu', tagline:'7 saniyede düşün, ilk 3 saniyede bonusu kap!', description:'Hız baskılı kısa turlar ve erken doğru cevap bonusu.', badge:'YÜKSEK HIZ', status:'active', playerCountLabel:'2–10 Oyuncu', estimatedDurationLabel:'3–5 dk', difficultyLabel:'Dinamik', accentColor:'#FFD166', gradientColors:['#FFD166','#FF713D','#1A1228'], iconName:'Zap', illustrationKey:'blitz', rules:{defaultRoundSeconds:7,minRoundSeconds:5,maxRoundSeconds:10,defaultRounds:5,minPlayers:2,maxPlayers:10,hasLives:false,hasSpeedBonus:true,speedBonusThresholdSeconds:3,speedBonusPoints:1,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:false}, features:['7 saniye','İlk 3 saniyede +1 hız bonusu','Yetenek yok'] },
  { id:'team_battle', name:'Takım Savaşı', tagline:'A ve B takımları aynı arenada!', description:'Takımlar puanlarını birleştirir. Dost tuzakları puan üretmez, saldırı yetenekleri yalnız rakibe gider.', badge:'TAKIM', status:'active', playerCountLabel:'4–10 Oyuncu', estimatedDurationLabel:'8–15 dk', difficultyLabel:'Taktiksel', accentColor:'#35B8FF', gradientColors:['#FF654D','#35B8FF','#0E1220'], iconName:'Users', illustrationKey:'team_battle', rules:{defaultRoundSeconds:15,minRoundSeconds:10,maxRoundSeconds:25,defaultRounds:6,minPlayers:4,maxPlayers:10,hasLives:false,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:true}, features:['2v2–5v5','Dost tuzağı puansız','Takım toplamı + MVP'] },
  { id:'secret_missions', name:'Gizli Görevler', tagline:'Her oyuncunun gizli hedefi var!', description:'Maç boyunca görünmeyen mini görevler bonus puan kazandırır ve farklı davranışları teşvik eder.', badge:'GİZLİ', status:'active', playerCountLabel:'3–8 Oyuncu', estimatedDurationLabel:'6–10 dk', difficultyLabel:'Zor', accentColor:'#10B981', gradientColors:['#10B981','#047857','#071713'], iconName:'Scroll', illustrationKey:'secret_missions', rules:{defaultRoundSeconds:18,minRoundSeconds:12,maxRoundSeconds:25,defaultRounds:5,minPlayers:3,maxPlayers:8,hasLives:false,hasSecretMissions:true,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:true}, features:['Gizli hedef','Tur/maç bonusları','Finalde görev ifşası'] },
  { id:'double_trap', name:'Çifte Tuzak', tagline:'Tek blöf yetmez: iki farklı sahte cevap!', description:'Her oyuncu iki blöf üretir; seçenek havuzu daha kaotik ve kandırma potansiyeli daha yüksektir.', badge:'KAOS', status:'active', playerCountLabel:'2–6 Oyuncu', estimatedDurationLabel:'7–12 dk', difficultyLabel:'Zor', accentColor:'#EC4899', gradientColors:['#EC4899','#BE185D','#190C17'], iconName:'Boxes', illustrationKey:'double_trap', rules:{defaultRoundSeconds:22,minRoundSeconds:15,maxRoundSeconds:35,defaultRounds:5,minPlayers:2,maxPlayers:6,hasLives:false,fakeAnswersPerRound:2,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:true}, features:['2 sahte cevap','Daha geniş seçenek havuzu','Yüksek kaos'] },
  { id:'golden_question', name:'Altın Soru', tagline:'Belirli turlar maçı tamamen çevirebilir!', description:'Her üçüncü tur altın turdur; doğru cevap puanı çarpanlıdır ve ödül ekonomisi daha agresiftir.', badge:'JACKPOT', status:'active', playerCountLabel:'2–10 Oyuncu', estimatedDurationLabel:'5–10 dk', difficultyLabel:'Orta', accentColor:'#F59E0B', gradientColors:['#F59E0B','#FDE047','#171105'], iconName:'Crown', illustrationKey:'golden_question', rules:{defaultRoundSeconds:15,minRoundSeconds:10,maxRoundSeconds:25,defaultRounds:6,minPlayers:2,maxPlayers:10,hasLives:false,hasGoldenRounds:true,goldenRoundEvery:3,goldenCorrectMultiplier:3,correctAnswerPoints:2,trapVictimPoints:1,allowAbilities:true}, features:['Her 3. tur altın','Doğru cevap x3','Altın tema ve sonuç vurgusu'] },
  { id:'detective_fox', name:'Dedektif Tilki', tagline:'Sırayla dedektif ol, blöf ağını çöz!', description:'Her tur bir oyuncu dedektif rolünü alır. Başarılı blöfçüyü doğru teşhis etmek bonus getirir.', badge:'DEDEKTİF', status:'active', playerCountLabel:'4–10 Oyuncu', estimatedDurationLabel:'8–14 dk', difficultyLabel:'Taktiksel', accentColor:'#8B5CF6', gradientColors:['#8B5CF6','#38BDF8','#080C16'], iconName:'Search', illustrationKey:'detective_fox', rules:{defaultRoundSeconds:25,minRoundSeconds:15,maxRoundSeconds:40,defaultRounds:5,minPlayers:4,maxPlayers:10,hasLives:false,hasDetectiveRole:true,correctAnswerPoints:2,trapVictimPoints:1,suspectBonusPoints:2,allowAbilities:true}, features:['Dönüşümlü dedektif','Başarılı blöfçüyü bul +2','Noir sorgu teması'] },
  { id:'gizli_tilki', name:'Gizli Tilki', tagline:'Kaynakları yönet, operasyonu kurtar ve sabotajcıyı bul.', description:'A/B ekipleri enerji, parça ve güven yönetirken gizli sabotajcılar operasyonu içeriden bozmaya çalışır. Gizli roller, ortak kararlar ve yüksek riskli görevler.', badge:'YENİ MOD', status:'active', playerCountLabel:'4–10 Oyuncu', estimatedDurationLabel:'8–15 dk', difficultyLabel:'Taktiksel', accentColor:'#FF654D', gradientColors:['#FF654D','#35B8FF','#0B101C'], iconName:'Users', illustrationKey:'detective_fox', rules:{defaultRoundSeconds:20,minRoundSeconds:10,maxRoundSeconds:30,defaultRounds:5,minPlayers:4,maxPlayers:10,hasLives:false,correctAnswerPoints:0,trapVictimPoints:0,allowAbilities:false}, features:['A/B takım operasyonları','Enerji · Parça · Güven ekonomisi','Gizli sabotaj ve şüphe oylaması','Sunucu otoriteli gerçek zamanlı turlar'] },
];

export function getGameMode(id?: string | null): GameModeDefinition {
  return GAME_MODES.find((mode) => mode.id === id) ?? GAME_MODES[0];
}
export function isGameModeActive(id?: string | null): boolean {
  return !!GAME_MODES.find((m) => m.id === id && m.status === 'active');
}
export function getActiveGameModes(): GameModeDefinition[] { return GAME_MODES.filter((m) => m.status === 'active'); }
export function getComingSoonGameModes(): GameModeDefinition[] { return GAME_MODES.filter((m) => m.status === 'coming_soon'); }
export function getAllGameModes(): GameModeDefinition[] { return GAME_MODES; }
