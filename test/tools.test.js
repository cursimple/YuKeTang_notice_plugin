import test from 'node:test';
import assert from 'node:assert/strict';
import {versionTapGate} from '../plugin-packages/yuketang-notice/ui/tools-shell.js';

test('activation matches host and resets after a long gap',()=>{
 const gate=versionTapGate();
 for(let i=0;i<4;i++)assert.equal(gate.tap(i*100),false);
 assert.equal(gate.tap(3401),false);
 for(let i=1;i<4;i++)assert.equal(gate.tap(3401+i*100),false);
 assert.equal(gate.tap(3901),true);
 assert.equal(gate.tap(4000),false);
 gate.reset();
 for(let i=0;i<4;i++)assert.equal(gate.tap(4100+i*100),false);
 assert.equal(gate.tap(4500),true);
});
test('host policy and separate activation counters are respected',()=>{
 const one=versionTapGate({activationTaps:3,resetAfterMillis:20}),two=versionTapGate();
 assert.equal(one.tap(0),false);assert.equal(one.tap(20),false);assert.equal(two.tap(0),false);assert.equal(one.tap(40),true);
});
