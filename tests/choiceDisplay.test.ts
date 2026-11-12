import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displayGuessChoice } from '../features/game/choiceDisplay';

describe('blind guessing choice display', () => {
  it('renders real and player-written answers in identical lowercase format', () => {
    assert.equal(displayGuessChoice('Kanada'), 'kanada');
    assert.equal(displayGuessChoice('kANADA'), 'kanada');
    assert.equal(displayGuessChoice('KANADA'), 'kanada');
  });

  it('uses Turkish locale for capital dotted and dotless I', () => {
    assert.equal(displayGuessChoice('İSTANBUL'), 'istanbul');
    assert.equal(displayGuessChoice('IĞDIR'), 'ığdır');
    assert.equal(displayGuessChoice('İzmir'), 'izmir');
  });

  it('never changes the original input or option ids used by scoring', () => {
    const original = { choiceIndex: 3, text: 'İzmir / NEW YORK', authorId: 'player' };
    const shown = displayGuessChoice(original.text);
    assert.equal(shown, 'izmir / new york');
    assert.equal(original.text, 'İzmir / NEW YORK');
    assert.equal(original.choiceIndex, 3);
  });
});
