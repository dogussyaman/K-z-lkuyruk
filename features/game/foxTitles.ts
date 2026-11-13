import type { GameState, Player, PlayerId } from '../../types/game';
import type { MatchTitleStat } from '../../services/types';

export type FoxTitleId = 'champion' | 'sharp_mind' | 'trap_master' | 'easy_target' | 'never_fooled' | 'survivor';

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
export function getFoxTitles(state: Pick<GameState, 'players' | 'history' | 'config'>, stats?: MatchTitleStat[]): FoxTitle[] {
  const players = Object.values(state.players);
  if (!players.length) return [];

  const totals = new Map<PlayerId, { rounds: number; correct: number; victims: number; trapped: number }>();
  for (const player of players) totals.set(player.id, { rounds: 0, correct: 0, victims: 0, trapped: 0 });

  for (const round of state.history ?? []) {
    for (const row of round ?? []) {
      const total = totals.get(row.playerId);
      if (!total) continue;
      total.rounds += 1;
      if (row.outcome?.correct) total.correct += 1;
      total.victims += Math.max(0, Number.isFinite(row.victimsCount) ? row.victimsCount : 0);
      if (row.outcome?.zartalandın) total.trapped += 1;
    }
  }

  // Online rooms do not include all previous rounds in roomState.history.
  // When supplied, trustworthy per-match totals from the server take priority.
  if (stats) {
    for (const stat of stats) if (totals.has(stat.playerId)) {
      totals.set(stat.playerId, {
        rounds: Math.max(0, stat.rounds),
        correct: Math.max(0, stat.correct),
        victims: Math.max(0, stat.victims),
        trapped: Math.max(0, stat.trapped),
      });
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
    award('never_fooled', 'Kimseye Kanmayan', '🛡️', 'Maç boyunca hiçbir sahte cevaba kanmadı.', players.filter((p) => {
      const match = totals.get(p.id);
      return !!match && match.rounds > 0 && match.trapped === 0;
    }).map((p) => p.id)),
    state.config.gameMode === 'survival'
      ? award('survivor', 'Son Tilki', '❤️', 'Hayatta kalma modunda canlarını korudu.', players.filter(alive).map((p) => p.id))
      : null,
  ];
  return titles.filter((title): title is FoxTitle => title !== null);
}
