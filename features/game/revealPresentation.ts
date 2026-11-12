import type { Player } from '../../types/game';
import type { RoundRevealChoice } from '../../services/types';

export interface RevealedChoiceView {
  choice: RoundRevealChoice;
  author: Player | null;
  voters: Player[];
  voteCount: number;
  isMyPick: boolean;
  isMyTrap: boolean;
  isMostConvincingFake: boolean;
}

/** Builds the public, post-round choice distribution without exposing pre-reveal state. */
export function buildRevealedChoices(
  choices: RoundRevealChoice[],
  players: Player[],
  currentPlayerId: string | null | undefined
): RevealedChoiceView[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  const maxFakeVotes = choices.reduce(
    (max, choice) => choice.isCorrect ? max : Math.max(max, new Set(choice.pickedBy).size),
    0
  );

  return choices.map((choice) => {
    const voterIds = [...new Set(choice.pickedBy)];
    return {
      choice,
      author: choice.authorId ? byId.get(choice.authorId) ?? null : null,
      voters: voterIds.map((id) => byId.get(id)).filter((player): player is Player => !!player),
      voteCount: voterIds.length,
      isMyPick: !!currentPlayerId && voterIds.includes(currentPlayerId),
      isMyTrap: !!currentPlayerId && choice.authorId === currentPlayerId && !choice.isCorrect,
      isMostConvincingFake: !choice.isCorrect && maxFakeVotes > 0 && voterIds.length === maxFakeVotes,
    };
  }).sort((a, b) =>
    b.voteCount - a.voteCount || Number(b.choice.isCorrect) - Number(a.choice.isCorrect) || a.choice.choiceIndex - b.choice.choiceIndex
  );
}
