import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeRoundAwards, headlineForRound } from '../features/game/roundAwards';
import type { RoundResultRow } from '../types/game';

function resolved(pointsDelta: number, victimsCount: number, goldenMultiplier?: number): RoundResultRow {
  return { playerId: 'p1', pointsDelta, victimsCount, outcome: {
    correct: true, zartaladın: victimsCount>0, zartalandın: false, victimsCount, pointsEarned: pointsDelta, labels: []
  }, labels: [], goldenMultiplier };
}

describe('authoritative classic round awards', () => {
  it('correct answer plus two traps equals the authoritative four points', () => {
    assert.deepEqual(describeRoundAwards(resolved(4,2),true,2), {
      trapPoints:2, correctPoints:2, totalPoints:4, otherPoints:0, hasAuthoritativeResult:true
    });
  });
  it('correct without victims remains a success on the celebration screen', () => {
    const x=describeRoundAwards(resolved(2,0),true,0);
    assert.equal(x.trapPoints,0);
    assert.equal(x.correctPoints,2);
    assert.equal(headlineForRound(true,0),'DOĞRUYU BULDUN!');
  });
  it('one successful fake without a correct guess shows one point', () => {
    const x=describeRoundAwards(resolved(1,1),false,1);
    assert.deepEqual([x.trapPoints,x.correctPoints,x.totalPoints],[1,0,1]);
    assert.equal(headlineForRound(false,1),'HARİKASIN!');
  });
  it('special mode bonuses are not misattributed to guessing or deceiving', () => {
    const x=describeRoundAwards(resolved(5,1),true,1);
    assert.equal(x.correctPoints,2);
    assert.equal(x.trapPoints,1);
    assert.equal(x.otherPoints,2);
    assert.equal(x.totalPoints,5);
  });
  it('golden multipliers are recognized without changing real results', () => {
    const x=describeRoundAwards(resolved(9,1,3),true,1);
    assert.equal(x.correctPoints,6);
    assert.equal(x.trapPoints,3);
    assert.equal(x.otherPoints,0);
  });
  it('missing authoritative data is not disguised as a confirmed zero', () => {
    const x=describeRoundAwards(undefined,false,0);
    assert.equal(x.totalPoints,null);
    assert.equal(x.hasAuthoritativeResult,false);
  });
});
