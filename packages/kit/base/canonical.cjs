// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE canonical JSON owner: RFC 8785 (JCS). A value has ONE text: no white space, object keys sorted by UTF-16 code units, numbers and
// strings as ECMAScript writes them.
// What has no canonical text is refused with a code, never repaired, and a refusal never repeats the content it refused. Bounds are data.
// Text is read by a reader of our own (RFC 8259, strict), not by JSON.parse: that one keeps the last of two equal keys and says nothing,
// and on node 24 (V8 13.6) it can hand back a wrong key for an escaped one (I-65, I-66; pinned in contract/canonical.test.cjs). The
// same reader, under JSON.parse's rules, is the JSON door's (plainRead): one reader in the product, two sets of rules.
const { fail } = require('./errors.cjs');

const BOUNDS = Object.freeze({ depth: 64, bytes: 1024 * 1024 });
// the JSON door's reading (plainRead): no byte bound, and nesting only this deep, so the reader's own recursion never runs out
const PLAIN_DEPTH = 512;
const LONE_SURROGATE = /\p{Cs}/u; // with the u flag a whole pair is one code point, so only half of one matches
const isPlain = (value) => [Object.prototype, null].includes(Object.getPrototypeOf(value));

function stringText(text) {
  if (LONE_SURROGATE.test(text)) throw fail('json-lone-surrogate');
  return JSON.stringify(text);
}

function numberText(number) {
  if (!Number.isFinite(number)) throw fail('json-not-finite');
  return JSON.stringify(number); // -0 is written 0, as the RFC asks
}

function canonicalAt(value, depth) {
  if (value === null || typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'string') return stringText(value);
  if (typeof value !== 'object') throw fail('json-not-json', typeof value);
  if (depth === BOUNDS.depth) throw fail('json-too-deep', `past ${BOUNDS.depth} levels`);
  if (Array.isArray(value)) return `[${Array.from(value, (item) => canonicalAt(item, depth + 1)).join(',')}]`; // Array.from visits a hole, map would skip it
  if (!isPlain(value)) throw fail('json-not-json', 'an object of a class');
  return `{${Object.keys(value).sort().map((key) => `${stringText(key)}:${canonicalAt(value[key], depth + 1)}`).join(',')}}`; // sort() with no comparer orders by UTF-16 code units
}

function withinBytes(text) {
  if (Buffer.byteLength(text, 'utf8') > BOUNDS.bytes) throw fail('json-too-large', `past ${BOUNDS.bytes} bytes`);
  return text;
}

/** canonical(value) -> its one text, or a coded refusal: json-not-finite, json-lone-surrogate, json-not-json, json-too-deep,
 * json-too-large. */
const canonical = (value) => withinBytes(canonicalAt(value, 0));

// The reader. `cur` is { text, at }; every piece reads at the cursor and leaves it after what it read.
const SPACE = /[ \t\n\r]*/y;
const PLAIN = /[^"\\\x00-\x1f]*/y; // a run of string characters that need no reading
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const HEX4 = /[0-9a-fA-F]{4}/y;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
const LITERALS = { t: ['true', true], f: ['false', false], n: ['null', null] };
const bad = (cur, code = 'json-invalid') => fail(code, `at character ${cur.at}`);

/** What `re` (sticky) matches at the cursor, the cursor moved past it; '' when nothing. */
function matched(re, cur) {
  re.lastIndex = cur.at;
  const [hit = ''] = re.exec(cur.text) || [];
  cur.at += hit.length;
  return hit;
}

function readEscape(cur) {
  const ch = cur.text[cur.at + 1];
  cur.at += 2;
  if (ch === 'u') {
    const hex = matched(HEX4, cur);
    if (!hex) throw bad(cur);
    return String.fromCharCode(parseInt(hex, 16));
  }
  if (!Object.hasOwn(ESCAPES, ch ?? '')) throw bad(cur);
  return ESCAPES[ch];
}

function readString(cur) {
  cur.at += 1;
  let out = matched(PLAIN, cur);
  while (cur.text[cur.at] !== '"') {
    if (cur.text[cur.at] !== '\\') throw bad(cur); // the end of the text, or a raw control character
    out += readEscape(cur) + matched(PLAIN, cur);
  }
  cur.at += 1;
  if (cur.strict && LONE_SURROGATE.test(out)) throw bad(cur, 'json-lone-surrogate');
  return out;
}

function readNumber(cur) {
  const token = matched(NUMBER, cur);
  if (!token) throw bad(cur);
  const number = Number(token); // the same correctly rounded reading ECMAScript gives a number literal
  if (cur.strict && !Number.isFinite(number)) throw bad(cur, 'json-not-finite');
  return number;
}

function readMember(cur, depth, into) {
  matched(SPACE, cur);
  const keyAt = cur.at;
  if (cur.text[keyAt] !== '"') throw bad(cur);
  const key = readString(cur);
  if (cur.strict && Object.hasOwn(into, key)) throw bad({ at: keyAt }, 'json-duplicate-key');
  matched(SPACE, cur);
  if (cur.text[cur.at] !== ':') throw bad(cur);
  cur.at += 1;
  // an own property whatever the key: a plain assignment would make `__proto__` the prototype
  Object.defineProperty(into, key, { value: readValue(cur, depth), writable: true, enumerable: true, configurable: true });
}

/** The comma-separated items up to `close`, the opening bracket just passed; `item` reads one at the cursor. */
function readItems(cur, close, item) {
  matched(SPACE, cur);
  let more = cur.text[cur.at] !== close;
  while (more) {
    item();
    matched(SPACE, cur);
    more = cur.text[cur.at] === ',';
    if (!more && cur.text[cur.at] !== close) throw bad(cur);
    if (more) cur.at += 1;
  }
  cur.at += 1;
}

function readContainer(cur, depth) {
  if (depth === cur.depth) throw bad(cur, 'json-too-deep');
  const isObject = cur.text[cur.at] === '{';
  const out = isObject ? {} : [];
  cur.at += 1;
  readItems(cur, isObject ? '}' : ']', isObject ? () => readMember(cur, depth + 1, out) : () => out.push(readValue(cur, depth + 1)));
  return out;
}

function readValue(cur, depth) {
  matched(SPACE, cur);
  const ch = cur.text[cur.at];
  if (ch === '"') return readString(cur);
  if (ch === '{' || ch === '[') return readContainer(cur, depth);
  if (!Object.hasOwn(LITERALS, ch ?? '')) return readNumber(cur);
  const [word, value] = LITERALS[ch];
  if (!cur.text.startsWith(word, cur.at)) throw bad(cur);
  cur.at += word.length;
  return value;
}

/** strictRead(text) -> the value strict JSON text holds, or a coded refusal: json-invalid, json-duplicate-key, json-lone-surrogate,
 * json-not-finite, json-too-deep, json-too-large. Whatever it returns, `canonical` can write. No BOM, no comment, no trailing comma, no
 * repair. */
const strictRead = (text) => wholeText({ text: withinBytes(textOnly(text)), at: 0, strict: true, depth: BOUNDS.depth });

/** plainRead(text) -> the value JSON text holds as ECMAScript's JSON.parse defines it, read by this reader and never by the engine's
 * (I-66):
 * any size, a repeated key keeps its last value, half a surrogate pair and a number past the finite ones stay as they read. Refused:
 * json-invalid, and json-too-deep past PLAIN_DEPTH. */
const plainRead = (text) => wholeText({ text: textOnly(text), at: 0, strict: false, depth: PLAIN_DEPTH });

function textOnly(text) {
  if (typeof text !== 'string') throw fail('json-invalid', 'not text');
  return text;
}

/** The one value the cursor's whole text holds. */
function wholeText(cur) {
  const value = readValue(cur, 0);
  matched(SPACE, cur);
  if (cur.at !== cur.text.length) throw bad(cur);
  return value;
}

/** canonicalText(text) -> the canonical text of the JSON that `text` holds, or a coded refusal (strictRead's and canonical's). */
const canonicalText = (text) => canonical(strictRead(text));

module.exports = { canonical, canonicalText, strictRead, plainRead };
