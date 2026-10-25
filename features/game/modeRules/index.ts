import type { GameMode, Player, PlayerId, RoundChoice } from '../../../types/game';

export function isGoldenRound(mode: GameMode | undefined, round: number): boolean {
  return mode === 'golden_question' && round > 0 && round % 3 === 0;
}

export function detectiveForRound(players: Player[], mode: GameMode | undefined, round: number): PlayerId | null {
  if (mode !== 'detective_fox' || players.length === 0) return null;
  const ordered = [...players].sort((a, b) => a.id.localeCompare(b.id));
  return ordered[(Math.max(1, round) - 1) % ordered.length]?.id ?? null;
}

export function isEnemyTarget(actor: Player, target: Player, mode: GameMode | undefined): boolean {
  if (mode !== 'team_battle') return actor.id !== target.id;
  return !!actor.teamId && !!target.teamId && actor.teamId !== target.teamId;
}

export function countsAsTrapVictim(
  picker: Player,
  author: Player | undefined,
  mode: GameMode | undefined
): boolean {
  if (!author || picker.id === author.id) return false;
  if (mode === 'team_battle' && picker.teamId && author.teamId && picker.teamId === author.teamId) return false;
  return true;
}

export function missionBonusForRound(input: {
  mode?: GameMode;
  player: Player;
  chosen?: RoundChoice;
  victimsCount: number;
  round: number;
}): number {
  if (input.mode !== 'secret_missions') return 0;
  const missionIndex = Math.abs(hashCode(input.player.id)) % 3;
  if (missionIndex === 0) return input.victimsCount >= 2 ? 2 : 0;
  if (missionIndex === 1) return input.chosen?.isCorrect ? 1 : 0;
  return input.victimsCount >= 1 && input.round % 2 === 0 ? 2 : 0;
}

export function missionHintForPlayer(playerId: PlayerId): string {
  const missionIndex = Math.abs(hashCode(playerId)) % 3;
  if (missionIndex === 0) return 'Aynı turda en az 2 rakibi blöfünle kandır.';
  if (missionIndex === 1) return 'Bu tur doğru cevabı bul.';
  return 'Çift numaralı bir turda en az 1 rakibi kandır.';
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return hash;
}
