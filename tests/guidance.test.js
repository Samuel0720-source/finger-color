import test from 'node:test';
import assert from 'node:assert/strict';
import {getGuidance} from '../src/guidance.js';
test('blank questionnaire does not become symptom-free',()=>{const r=getGuidance('tapping');assert.equal(r.conclusion,'Insufficient symptom information');assert.ok(r.answers.every(a=>a.answer==='Not answered'));});
test('explicit no answers are distinct',()=>assert.equal(getGuidance('tapping',{symptom0:'No',symptom1:'No',symptom2:'No',symptom3:'No'}).conclusion,'No listed symptoms reported'));
test('worsening symptoms explain referral',()=>{const r=getGuidance('tapping',{symptom0:'Yes',trend:'Worsening'});assert.equal(r.conclusion,'Clinical assessment recommended');assert.match(r.lines.join(' '),/worsening/);});
