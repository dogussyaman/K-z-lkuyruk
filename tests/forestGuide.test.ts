import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockedReason, nextMission } from '../features/forest/guide';
const supplies = {progress:0,fragments:0,food:3,rope:1,torch:1,morale:3};
test('equipment shortages guide player to forage at a blocked crossing', () => {
 assert.equal(nextMission({...supplies,progress:3,rope:0,torch:0}).action,'forage');
 assert.equal(nextMission({...supplies,progress:2,rope:0,torch:0}).action,'explore');
});
test('treasure requires both map fragments and six steps', () => {
 assert.ok(lockedReason('claim_treasure',{...supplies,progress:6,fragments:2}));
 assert.ok(lockedReason('claim_treasure',{...supplies,progress:5,fragments:3}));
 assert.equal(lockedReason('claim_treasure',{...supplies,progress:6,fragments:3}),null);
 assert.equal(nextMission({...supplies,progress:6,fragments:3}).action,'claim_treasure');
});
test('spent resources cannot be selected', () => {
 for (const [action,key] of [['use_rope','rope'],['use_torch','torch'],['camp','food']]) {
  assert.ok(lockedReason(action,{...supplies,[key]:0}));
  assert.equal(lockedReason(action,supplies),null);
 }
});
