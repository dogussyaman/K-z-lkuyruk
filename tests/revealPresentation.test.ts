import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRevealedChoices } from '../features/game/revealPresentation';
import type { RoundRevealChoice } from '../services/types';
import type { Player } from '../types/game';

const player = (id: string, name: string) => ({ id, name }) as Player;
const players = [player('a','Ayşe'), player('b','Berk'), player('c','Cem')];

describe('round choice reveal presentation', () => {
  const choices: RoundRevealChoice[] = [
    { choiceIndex: 0, text: 'Kanada', authorId: 'a', isCorrect: false, pickedBy: ['b','c'] },
    { choiceIndex: 1, text: 'Avustralya', authorId: null, isCorrect: true, pickedBy: ['a'] },
    { choiceIndex: 2, text: 'Meksika', authorId: 'c', isCorrect: false, pickedBy: [] },
  ];

  it('shows every answer, including the correct one and answers nobody picked', () => {
    const rows = buildRevealedChoices(choices, players, 'a');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.choice.text), ['Kanada','Avustralya','Meksika']);
    assert.equal(rows[2].voteCount, 0);
    assert.equal(rows[1].choice.isCorrect, true);
    assert.equal(rows[1].isMyPick, true);
  });

  it('identifies own successful trap, who chose it, and most convincing fake', () => {
    const rows = buildRevealedChoices(choices, players, 'a');
    assert.equal(rows[0].isMyTrap, true);
    assert.equal(rows[0].author?.name, 'Ayşe');
    assert.deepEqual(rows[0].voters.map(v => v.name), ['Berk','Cem']);
    assert.equal(rows[0].isMostConvincingFake, true);
    assert.equal(rows[1].isMostConvincingFake, false);
  });

  it('shows who tricked the current player and preserves ties', () => {
    const rows = buildRevealedChoices(choices, players, 'b');
    assert.equal(rows[0].isMyPick, true);
    assert.equal(rows[0].isMyTrap, false);
    assert.equal(rows[0].author?.name, 'Ayşe');
    const tied = buildRevealedChoices([
      { choiceIndex: 1, text: 'Bir', authorId: 'a', isCorrect: false, pickedBy: ['b'] },
      { choiceIndex: 0, text: 'İki', authorId: 'c', isCorrect: false, pickedBy: ['a'] },
    ], players, 'b');
    assert.equal(tied[0].choice.choiceIndex, 0);
    assert.equal(tied.filter(r => r.isMostConvincingFake).length, 2);
  });

  it('deduplicates repeated voter ids and tolerates missing player records', () => {
    const rows = buildRevealedChoices([
      { choiceIndex: 3, text: 'Sahte', authorId: 'missing', isCorrect: false, pickedBy: ['b','b','missing'] },
    ], players, 'b');
    assert.equal(rows[0].voteCount, 2);
    assert.equal(rows[0].voters.length, 1);
    assert.equal(rows[0].author, null);
  });

  it('does not mark a fake as winning if nobody selected one', () => {
    const rows = buildRevealedChoices([
      { choiceIndex: 1, text: 'A', authorId: 'a', isCorrect: false, pickedBy: [] },
    ], players, 'a');
    assert.equal(rows[0].isMostConvincingFake, false);
  });
});
