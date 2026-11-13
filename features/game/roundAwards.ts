import { POINTS } from './outcomes';
import type { RoundResultRow } from '../../types/game';

/**
 * Never invent earned points from a client-side guess when the server has
 * already resolved the round. Extra mode bonuses stay separate so the
 * correct/wrong marker cannot misleadingly claim to have earned them.
 */
export function describeRoundAwards(
  result: RoundResultRow | undefined,
  correct: boolean,
  victimsCount: number
) {
  const multiplier = correct ? Math.max(1, result?.goldenMultiplier ?? 1) : 1;
  const safeVictims = Math.max(0, victimsCount);
  const standardTrap = safeVictims * POINTS.fakeChosenBonus * multiplier;
  const standardCorrect = correct ? POINTS.correct * multiplier : 0;
  const total = result?.pointsDelta;
  const accounted = standardTrap + standardCorrect;
  return {
    trapPoints: standardTrap,
    correctPoints: standardCorrect,
    totalPoints: typeof total === 'number' ? total : null,
    otherPoints: typeof total === 'number' ? total - accounted : 0,
    hasAuthoritativeResult: typeof total === 'number',
  };
}

/** Correct answer success must not be obscured by an unsuccessful bluff. */
export function headlineForRound(correct: boolean, trappedCount: number): string {
  if (trappedCount > 0) return 'HARİKASIN!';
  if (correct) return 'DOĞRUYU BULDUN!';
  return 'BİR SONRAKİ TURDA!';
}
