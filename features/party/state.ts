import type { PartyState } from './catalog';

/** A delayed poll must not reopen an old turn after a submission or rematch. */
export function selectPartySnapshot(previous: PartyState | null, next: PartyState): PartyState {
  if (!previous || previous.mode !== next.mode) return next;
  if (next.gameNumber !== previous.gameNumber) {
    return next.gameNumber > previous.gameNumber ? next : previous;
  }
  if (next.stateVersion < previous.stateVersion || next.step < previous.step) return previous;
  return next;
}
