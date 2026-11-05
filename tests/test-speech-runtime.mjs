import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createSpeechService,speechLines,validateTelephoneWav} from '../speech.mjs';

const service=createSpeechService('/data');
const text="Vielen Dank für Ihren Anruf. Wir sind heute geschlossen. Bitte rufen Sie morgen erneut an.";
const draft=await service.generate(speechLines[0],text);
assert.equal(draft.text,text);
assert.equal(draft.line,speechLines[0]);
assert(draft.duration>1&&draft.duration<90);
assert.equal(service.latest()[speechLines[0]].id,draft.id);
const wav=fs.readFileSync(service.audioPath(speechLines[0],draft.id));
assert.equal(validateTelephoneWav(wav).duration,draft.duration);
const injection="Hallo. '; touch /data/unexpected-command; echo '";
await service.generate(speechLines[1],injection);
assert.equal(fs.existsSync('/data/unexpected-command'),false);
console.log('German runtime speech generation and playable telephone WAV checks passed.');
