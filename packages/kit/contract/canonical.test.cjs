// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Canonical JSON as RFC 8785 (JCS) says it, and the content address over its bytes. The vectors are the RFC's own
// (section 3.2.2, section 3.2.3, appendix B), each checked against this machine's engine; the properties run over small generated values from a fixed seed.
// This file is ASCII only: a character is spelled by its code point (`ch`), a JSON escape is built by `esc`, so no editor or tool can swap one for the other.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonical: { canonical, canonicalText, strictRead: read }, hash, createValidate } = require('@atlasbound/kit');

const ch = (...points) => String.fromCodePoint(...points);
const esc = (hex) => `${ch(0x5c)}u${hex}`; // the six characters of a JSON escape
const [EURO, E_ACUTE, O_UMLAUT, C1_CONTROL, GRIN, DALET, DELETE, LINE_SEP, BOM] = [0x20ac, 0xe9, 0xf6, 0x80, 0x1f600, 0xfb33, 0x7f, 0x2028, 0xfeff].map((p) => ch(p));
const [HIGH_HALF, LOW_HALF] = [ch(0xd83d), ch(0xde00)]; // the two UTF-16 units of GRIN, each alone
const refuses = (code, fn) => assert.throws(fn, { code });
const doubleOfHex = (hex) => Buffer.from(hex, 'hex').readDoubleBE(0);

// A small deterministic generator (mulberry32): the same values on every machine, so a red run can be repeated.
function seededDraws(seed) {
  let state = seed;
  return (below) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * below);
  };
}
const WORDS = ['', 'a', 'b', 'aa', E_ACUTE, EURO, GRIN, DALET, '\n', '"', '\\', '1'];
const SCALARS = [null, true, false, 0, -0, 1, -1, 0.1, 1.5, 1e21, 1e-7, 2 ** 53, ...WORDS];
function smallValue(draw, depth = 0) {
  const pick = draw(depth < 3 ? 10 : 6);
  if (pick < 6) return SCALARS[draw(SCALARS.length)];
  if (pick < 8) return Array.from({ length: draw(4) }, () => smallValue(draw, depth + 1));
  return Object.fromEntries(Array.from({ length: draw(4) }, () => [WORDS[draw(WORDS.length)], smallValue(draw, depth + 1)]));
}
/** The same value with every object's keys written in the opposite order. */
function keysReversed(value) {
  if (Array.isArray(value)) return value.map(keysReversed);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).reverse().map((k) => [k, keysReversed(value[k])]));
}
/** The oracle of meaning, with no serialiser in it: arrays by position, objects by key set, scalars by ===, so -0 is 0. */
function sameMeaning(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameMeaning(v, b[i]));
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && sameMeaning(a[k], b[k]));
}

test('[I-58] canonical JSON: the sample of RFC 8785 section 3.2.2 gives the RFC\'s canonical text', () => {
  const input = `{
    "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
    "string": "${esc('20ac')}$${esc('000F')}${esc('000a')}A'${esc('0042')}${esc('0022')}${esc('005c')}${String.raw`\\\"\/`}",
    "literals": [null, true, false]
  }`;
  const want = `{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"${EURO}$${esc('000f')}${String.raw`\nA'B\"\\\\\"/`}"}`;
  assert.equal(canonicalText(input), want);
  // the string member's bytes spelled by hand (not the RFC's hex listing): euro, $, the escape of U+000F, \n, A ' B, \", \\ twice, \", /, then the closing quote and brace
  const tail = ['e282ac', '24', '5c7530303066', '5c6e', '412742', '5c22', '5c5c5c5c', '5c22', '2f', '227d'].join('');
  assert.equal(Buffer.from(canonicalText(input), 'utf8').subarray(-tail.length / 2).toString('hex'), tail);
});

test('[I-58] canonical JSON: keys sort by UTF-16 code units, the order of RFC 8785 section 3.2.3, not by code points', () => {
  const input = `{"${esc('20ac')}": "Euro Sign", "${String.raw`\r`}": "Carriage Return", "${esc('fb33')}": "Hebrew Letter Dalet With Dagesh", "1": "One",
    "${esc('d83d')}${esc('de00')}": "Emoji: Grinning Face", "${esc('0080')}": "Control", "${esc('00f6')}": "Latin Small Letter O With Diaeresis"}`;
  const want = `{"${String.raw`\r`}":"Carriage Return","1":"One","${C1_CONTROL}":"Control","${O_UMLAUT}":"Latin Small Letter O With Diaeresis","${EURO}":"Euro Sign",`
    + `"${GRIN}":"Emoji: Grinning Face","${DALET}":"Hebrew Letter Dalet With Dagesh"}`;
  assert.equal(canonicalText(input), want);
  // the negative side: by code points U+FB33 would come before U+1F600; by UTF-16 units the pair D83D DE00 comes first
  assert.equal(canonical({ [DALET]: 1, [GRIN]: 2 }), `{"${GRIN}":2,"${DALET}":1}`);
  assert.equal(canonical({ b: 1, a: 2, B: 3, 10: 4, 9: 5 }), '{"10":4,"9":5,"B":3,"a":2,"b":1}');
});

test('[I-58] canonical JSON: a number is written as ECMAScript writes it (the table of RFC 8785 appendix B)', () => {
  const rows = [
    ['0000000000000000', '0'], ['8000000000000000', '0'], ['0000000000000001', '5e-324'], ['8000000000000001', '-5e-324'],
    ['7fefffffffffffff', '1.7976931348623157e+308'], ['ffefffffffffffff', '-1.7976931348623157e+308'],
    ['4340000000000000', '9007199254740992'], ['c340000000000000', '-9007199254740992'], ['4430000000000000', '295147905179352830000'],
    ['44b52d02c7e14af5', '9.999999999999997e+22'], ['44b52d02c7e14af6', '1e+23'], ['44b52d02c7e14af7', '1.0000000000000001e+23'],
    ['444b1ae4d6e2ef4e', '999999999999999700000'], ['444b1ae4d6e2ef4f', '999999999999999900000'], ['444b1ae4d6e2ef50', '1e+21'],
    ['3eb0c6f7a0b5ed8c', '9.999999999999997e-7'], ['3eb0c6f7a0b5ed8d', '0.000001'],
    ['41b3de4355555553', '333333333.3333332'], ['41b3de4355555554', '333333333.33333325'], ['41b3de4355555555', '333333333.3333333'],
    ['41b3de4355555556', '333333333.3333334'], ['41b3de4355555557', '333333333.33333343'],
    ['becbf647612f3696', '-0.0000033333333333333333'], ['43143ff3c1cb0959', '1424953923781206.2'],
  ];
  assert.deepEqual(rows.map(([hex]) => canonical(doubleOfHex(hex))), rows.map(([, text]) => text));
  refuses('json-not-finite', () => canonical(doubleOfHex('7fffffffffffffff'))); // NaN
  refuses('json-not-finite', () => canonical(doubleOfHex('7ff0000000000000'))); // Infinity
});

test('[I-58] canonical JSON: a string escapes only what the standard names, in lower case, and keeps everything else as it is', () => {
  assert.equal(canonical('\b\t\n\f\r'), String.raw`"\b\t\n\f\r"`);
  assert.equal(canonical(`${ch(0)}${ch(0x1f)}${DELETE}${LINE_SEP}/<`), `"${esc('0000')}${esc('001f')}${DELETE}${LINE_SEP}/<"`);
  assert.equal(canonical('"\\'), String.raw`"\"\\"`);
  assert.equal(canonicalText(`"${esc('00E9')}${esc('000A')}${String.raw`\/`}${esc('0041')}"`), `"${E_ACUTE}${String.raw`\n`}/A"`);
});

test('[I-58] canonical JSON: canonicalising twice changes nothing, and neither the order of keys nor white space is content', () => {
  const draw = seededDraws(8785);
  for (let n = 0; n < 400; n += 1) {
    const value = smallValue(draw);
    const once = canonical(value);
    assert.equal(canonicalText(once), once);
    assert.equal(canonical(keysReversed(value)), once);
    assert.equal(canonicalText(JSON.stringify(keysReversed(value), null, 3)), once);
  }
});

test('[I-58] canonical JSON: two values give the same bytes exactly when they mean the same', () => {
  const draw = seededDraws(2026);
  const values = Array.from({ length: 220 }, () => smallValue(draw));
  let [same, different] = [0, 0];
  for (const a of values) {
    for (const b of values) {
      const alike = sameMeaning(a, b);
      assert.equal(canonical(a) === canonical(b), alike, `${canonical(a)} against ${canonical(b)}`);
      if (alike) same += 1; else different += 1;
    }
  }
  assert.ok(same > values.length && different > 1000, `both sides were met: ${same} alike, ${different} different`);
  assert.notEqual(canonical({ a: [1, 2] }), canonical({ a: [2, 1] })); // an array's order is content
  assert.notEqual(canonical({ a: null }), canonical({})); // a null member is a member
  assert.notEqual(canonical('1'), canonical(1));
});

test('[I-59] canonical JSON: a number that is not finite is refused, as a value and as text that parses to one', () => {
  for (const bad of [NaN, Infinity, -Infinity, [1, [NaN]], { a: { b: Infinity } }]) refuses('json-not-finite', () => canonical(bad));
  refuses('json-not-finite', () => canonicalText('[1e999]'));
  refuses('json-not-finite', () => canonicalText('-1e400'));
  assert.equal(canonicalText('1e308'), '1e+308');
});

test('[I-59] canonical JSON: half of a surrogate pair is refused in a value and in a key; a whole pair is kept', () => {
  for (const bad of [HIGH_HALF, `a${LOW_HALF}b`, [HIGH_HALF], { [LOW_HALF]: 1 }, `${LOW_HALF}${HIGH_HALF}`]) refuses('json-lone-surrogate', () => canonical(bad));
  refuses('json-lone-surrogate', () => canonicalText(`"${esc('dc00')}"`));
  refuses('json-lone-surrogate', () => canonicalText(`{"${esc('d83d')}":1}`));
  assert.equal(canonicalText(`"${esc('d83d')}${esc('de00')}"`), `"${GRIN}"`);
  assert.equal(canonical(`${HIGH_HALF}${LOW_HALF}`), `"${GRIN}"`);
});

test('[I-59] canonical JSON: a value JSON cannot hold is refused, never dropped or rewritten', () => {
  const sparse = [1, 2, 3];
  delete sparse[1];
  class Seat { constructor() { this.id = 1; } }
  for (const bad of [undefined, () => 1, Symbol('s'), 10n, new Date(0), new Map(), new Seat(), sparse, { a: undefined }, [undefined], { toJSON: () => 1 }]) {
    refuses('json-not-json', () => canonical(bad));
  }
  assert.equal(canonical(Object.assign(Object.create(null), { b: 1, a: [] })), '{"a":[],"b":1}');
});

test('[I-59] canonical JSON: an object that names one key twice is refused, escapes read first', () => {
  for (const bad of ['{"a":1,"a":2}', `{"a":1,"${esc('0061')}":2}`, '{"x":[{"k":1,"j":2,"k":3}]}', '{"":1,"":1}', '{"a":{"b":1},"c":2,"a":3}', '{"__proto__":1,"__proto__":2}', '{ "a" : 1 , "a" : 2 }']) {
    refuses('json-duplicate-key', () => canonicalText(bad));
  }
  const nested = String.raw`{"a":{"a":1},"b":{"a":2},"c":["a","a"],"d":"{\"a\":1,\"a\":2}"}`;
  assert.equal(canonicalText(nested), nested);
  const quoted = String.raw`{"__proto__":{"x":1},"a":"\\","b":"\\\"","c\"":1,"c\\":2}`;
  assert.equal(canonicalText(quoted), quoted);
});

test('[I-59] canonical JSON: nesting past 64 levels is refused and at 64 kept, a value holding itself too', () => {
  const nested = (levels) => `${'['.repeat(levels)}${']'.repeat(levels)}`;
  assert.equal(canonicalText(nested(64)), nested(64));
  refuses('json-too-deep', () => canonicalText(nested(65)));
  refuses('json-too-deep', () => canonicalText(`${'{"a":'.repeat(65)}1${'}'.repeat(65)}`));
  const loop = { name: 'a' };
  loop.self = loop;
  refuses('json-too-deep', () => canonical(loop));
});

test('[I-59] canonical JSON: text past 1 MiB is refused by its bytes, not its characters; exactly 1 MiB is kept', () => {
  const MIB = 1024 * 1024;
  const exact = `"${'a'.repeat(MIB - 2)}"`;
  assert.equal(canonicalText(exact).length, MIB);
  refuses('json-too-large', () => canonicalText(`${exact} `));
  refuses('json-too-large', () => canonicalText(`"${EURO.repeat(MIB / 2)}"`)); // 524288 characters, 3 bytes each
  refuses('json-too-large', () => canonical(['a'.repeat(MIB)]));
});

test('[I-65] strict reader: an escaped key is read as written, where this engine\'s JSON.parse can hand back another key', () => {
  // found by the property above on node 24.12 and 24.16 (V8 13.6): once the process holds an object with a key that ends in a backslash, JSON.parse reads a key
  // that ends in an escaped quote, after the same keys, as that backslash key. The first line makes that state, so a reader built on JSON.parse fails here.
  const [backslash, text] = [JSON.parse(String.raw`{"a":1,"x\\":3}`), String.raw`{"a":1,"x\"":2}`];
  assert.deepEqual([Object.keys(backslash), Object.keys(read(text))], [['a', 'x\\'], ['a', 'x"']]);
  assert.equal(canonicalText(text), text);
});

test('[I-65] strict reader: it gives back every generated value, and a key named __proto__ is a member, never the prototype', () => {
  const draw = seededDraws(8259);
  for (let n = 0; n < 400; n += 1) {
    const value = smallValue(draw);
    assert.ok(sameMeaning(read(JSON.stringify(value, null, n % 4)), value), JSON.stringify(value));
  }
  const held = read('{"__proto__":{"admin":true},"constructor":1}');
  assert.deepEqual(Object.keys(held), ['__proto__', 'constructor']);
  assert.equal(Object.getPrototypeOf(held), Object.prototype);
  assert.equal(held.admin, undefined);
  assert.deepEqual(read(' \t\r\n[ 1 , -0.5e+1 , 1E2 , "" , { } , [ ] , true , false , null ] \n'), [1, -5, 100, '', {}, [], true, false, null]);
});

test('[I-65] strict reader: the grammar of RFC 8259 and nothing more', () => {
  const notJson = ['', ' ', '{a:1}', '[1,]', '{"a":1,}', "{'a':1}", 'NaN', 'Infinity', 'undefined', `${BOM}{}`, '{"a":1}}', '[1] [2]', '01', '-01', '+1', '.5', '1.', '1e', '1e+', '0x10', '-',
    '[1 2]', '{"a" 1}', '{"a":}', '{,}', '[,]', '{1:2}', 'tru', 'nulll', 'True', '"a', '"\n"', `"${ch(9)}"`, String.raw`"\x41"`, String.raw`"\u12G4"`, String.raw`"\u123"`, String.raw`"\'"`, '// c\n1', '/* c */1', '1 // c',
    `[1${ch(0xa0)}]`, `${ch(0x2028)}1`, 7, null, undefined, { a: 1 }, ['1']];
  for (const bad of notJson) refuses('json-invalid', () => canonicalText(bad));
  for (const bad of notJson) refuses('json-invalid', () => read(bad));
});

test('[I-59] canonical JSON: what is not JSON text is refused, and no refusal repeats the content it refused', () => {
  for (const bad of ['{a:1}', '[1,]', '01']) refuses('json-invalid', () => canonicalText(bad));
  const said = (fn) => { try { fn(); } catch (err) { return `${err.message} ${err.stack}`; } return assert.fail('no refusal'); };
  assert.doesNotMatch(said(() => canonicalText('{"zebra-key":1,"zebra-key":2}')), /zebra/);
  assert.doesNotMatch(said(() => canonicalText('{"a": zebra-word}')), /zebra/);
  assert.doesNotMatch(said(() => canonical({ a: 'zebra-word', b: undefined })), /zebra/);
});

test('[I-60] address: sha256 and a colon before the hex of the canonical bytes, so key order never moves it', () => {
  assert.equal(hash.address({}), 'sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a'); // sha256 of the two bytes "{}"
  const value = { b: [1, 'x'], a: { d: null, c: EURO } };
  const oracle = crypto.createHash('sha256').update(Buffer.from(`{"a":{"c":"${EURO}","d":null},"b":[1,"x"]}`, 'utf8')).digest('hex');
  assert.equal(hash.address(value), `sha256:${oracle}`);
  assert.equal(hash.address(keysReversed(value)), hash.address(value));
  assert.notEqual(hash.address({ ...value, b: [1, 'y'] }), hash.address(value));
  refuses('json-not-json', () => hash.address({ a: undefined }));
});

test('[I-60] validator: an address is what the hash owner gives, and a utc is one width of UTC seconds', () => {
  const { problems } = createValidate({ shapes: { Stamp: { of: 'address', at: 'utc', before: 'address[]?' } }, enums: {}, refuse: {}, isCode: () => false });
  assert.deepEqual(problems('Stamp', { of: hash.address({ a: 1 }), at: '2026-11-11T09:30:00Z', before: [hash.address(1)] }), []);
  const hex = hash.sha256('x');
  for (const of of [hex, `sha256:${hex.toUpperCase()}`, `sha256:${hex}0`, `sha512:${hex}`, `sha256:${hex.slice(1)}`, '', 7, null]) {
    assert.deepEqual(problems('Stamp', { of, at: '2026-11-11T09:30:00Z' }), ['Stamp.of is not address']);
  }
  for (const at of ['2026-11-11T09:30:00+09:00', '2026-11-11T09:30:00.000Z', '2026-11-11 09:30:00Z', '2026-11-11T09:30Z', '2026-11-11', 1762853400, '']) {
    assert.deepEqual(problems('Stamp', { of: hash.address(1), at }), ['Stamp.at is not utc']);
  }
  assert.ok('2026-11-11T09:30:00Z' < '2026-11-11T10:00:00Z' && '2026-11-11T23:59:59Z' < '2026-11-12T00:00:00Z');
});

// The JSON door every package reads outside text through. Measured on node 24.16 (V8 13.6): JSON.parse can hand back
// another key for ANY key written with an escape, when the process already holds an object with the same keys before it and, in its place, the first N raw
// characters of the key (N = the key's length once read). Each escape below is its raw characters and, written by hand, the character it means.
const BACKSLASH = ch(0x5c);
const ESCAPES = [['"', '"'], [BACKSLASH, BACKSLASH], ['/', '/'], ['b', ch(8)], ['f', ch(12)], ['n', ch(10)], ['r', ch(13)], ['t', ch(9)], ['u0041', 'A'], ['u0022', '"'],
  ['u005c', BACKSLASH], ['u00e9', E_ACUTE], [`ud83d${BACKSLASH}ude00`, GRIN]].map(([tail, means]) => [BACKSLASH + tail, means]);
const PLACES = [(e) => `x${e}`, (e) => `${e}x`, (e) => `x${e}y`, (e) => e, (e) => `xy${e}${e}`];
const door = createValidate({ shapes: {}, enums: {}, refuse: {}, isCode: () => false }).json;

/** Every escape at every place, read by `reader` in the state the fault needs: the process holds ONE object whose keys are `first`, then the first N raw
 * characters of the key (a first key of its own per case: the engine only misreads while that is the one key it has seen after `first`). -> the raw keys misread. */
function misreadBy(reader, firstOf) {
  const [held, misread] = [[], []];
  ESCAPES.forEach(([escape, means], e) => PLACES.forEach((place, p) => {
    const [raw, key, first] = [place(escape), place(means), firstOf(`${e}x${p}`)];
    held.push(JSON.parse(JSON.stringify({ [first]: 1, [raw.slice(0, key.length)]: 3 }))); // an object the engine's parser made: the state that misleads it
    if (Object.keys(reader(`{"${first}":1,"${raw}":2}`))[1] !== key) misread.push(raw);
  }));
  return misread;
}

test('[I-66] the JSON door: a key written with an escape is read as written, whatever keys the process already holds', () => {
  const held = JSON.parse(`{"a1":1,"x${BACKSLASH}${BACKSLASH}":3}`);
  assert.deepEqual([Object.keys(door(`{"a1":1,"x${BACKSLASH}"":2}`)), Object.keys(held)], [['a1', 'x"'], ['a1', `x${BACKSLASH}`]]); // the two-line repro, through the door
  assert.deepEqual(misreadBy(door, (n) => `door${n}`), []);
});

test('[I-66] the JSON door reads what JSON.parse is defined to read, at any size, and refuses with the caller\'s code', () => {
  const big = `{"content":"${'a line of a file'.repeat(1024 * 80)}","n":1}`; // past the canonical reader's megabyte: a hook event carries a whole file
  assert.deepEqual([big.length > 1024 * 1024, door(big).n, door(`${BOM}{"a":1}`), door('{"a":1,"a":2}'), door(`"${esc('d800')}"`).length, door('1e999')], [true, 1, { a: 1 }, { a: 2 }, 1, Infinity]);
  assert.deepEqual(Object.keys(door('{"__proto__":1,"b":2}')), ['__proto__', 'b']);
  for (const text of ['{"a":', '{"a":1,}', "{'a':1}", '', 'undefined', '{"a":1} x', `"${ch(10)}"`]) refuses('json-invalid', () => door(text));
  assert.throws(() => door('{"a":', 'config-invalid'), { code: 'config-invalid', message: 'config-invalid: SyntaxError' });
  assert.equal(door(`${'['.repeat(512)}${']'.repeat(512)}`).length, 1);
  assert.throws(() => door(`${'['.repeat(513)}${']'.repeat(513)}`), { code: 'json-invalid', message: 'json-invalid: json-too-deep' });
});

test('[I-66] engine pin: JSON.parse misreads an escaped key on one engine version only, and a change is noticed', () => {
  const misread = misreadBy(JSON.parse, (n) => `engine${n}`);
  const told = `V8 ${process.versions.v8} misread ${misread.length} of 65 escaped keys: when this turns red, the engine changed; update this pin and I-66 (the door needs its own reader only while an engine misreads)`;
  assert.equal(misread.length, process.versions.v8.startsWith('13.6.') ? 60 : 0, told); // the 5 it reads right: the first raw characters ARE the key
});
