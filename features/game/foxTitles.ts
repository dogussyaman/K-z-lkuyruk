import type { GameMode, GameState, Player, PlayerId } from '../../types/game';

export type FoxTitleId = 'champion' | 'sharp_mind' | 'trap_master' | 'easy_target' | 'survivor';

export interface FoxTitle {
  id: FoxTitleId;
  name: string;
  emoji: string;
  description: string;
  playerIds: PlayerId[];
}

const award = (
  id: FoxTitleId,
  name: string,
  emoji: string,
  description: string,
  playerIds: PlayerId[]
): FoxTitle | null => playerIds.length ? { id, name, emoji, description, playerIds } : null;

function leadersBy<T extends Player>(
  players: T[],
  score: (player: T) => number,
  minimum = 1
): T[] {
  if (!players.length) return [];
  const max = Math.max(...players.map(score));
  return max < minimum ? [] : players.filter((player) => score(player) === max);
}

/** Derive fun, match-specific titles from the final server-provided match history. */
export function getFoxTitles(state: Pick<GameState, 'players' | 'history' | 'config'>): FoxTitle[] {
  const players = Object.values(state.players);
  if (!players.length) return [];

  const totals = new Map<PlayerId, { correct: number; victims: number; trapped: number }>();
  for (const player of players) totals.set(player.id, { correct: 0, victims: 0, trapped: 0 });

  for (const round of state.history ?? []) {
    for (const row of round ?? []) {
      const total = totals.get(row.playerId);
      if (!total) continue;
      if (row.outcome?.correct) total.correct += 1;
      total.victims += Math.max(0, Number.isFinite(row.victimsCount) ? row.victimsCount : 0);
      if (row.outcome?.zartalandın) total.trapped += 1;
    }
  }

  const correct = (player: Player) => totals.get(player.id)?.correct ?? 0;
  const victims = (player: Player) => totals.get(player.id)?.victims ?? 0;
  const trapped = (player: Player) => totals.get(player.id)?.trapped ?? 0;
  const alive = (player: Player) => (player.livesRemaining ?? 0) > 0;

  const titles = [
    award('champion', 'Puan Avcısı', '🏆', 'Maçın en yüksek puanını topladı.', leadersBy(players, (p) => p.score).map((p) => p.id)),
    award('sharp_mind', 'Keskin Zihin', '🧠', 'En fazla gerçek cevabı bildi.', leadersBy(players, correct).map((p) => p.id)),
    award('trap_master', 'Tuzak Ustası', '🦊', 'Rakiplerini en çok kendi tuzağına düşürdü.', leadersBy(players, victims).map((p) => p.id)),
    award('easy_target', 'Kolay Lokma', '🎯', 'En fazla rakibin tuzağına yakalandı.', leadersBy(players, trapped).map((p) => p.id)),
    state.config.gameMode === 'survival'
      ? award('survivor', 'Son Tilki', '❤️', 'Hayatta kalma modunda canlarını korudu.', players.filter(alive).map((p) => p.id))
      : null,
  ];
  return titles.filter((title): title is FoxTitle => title !== null);
}
