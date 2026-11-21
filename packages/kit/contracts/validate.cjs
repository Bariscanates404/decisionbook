// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE validation owner: the only JSON door and the only shape checker, run at the boundaries. createValidate
// binds ONE shallow checker to a package's tables; a new schema is a row in that package's contracts. A refusal is a coded error
// (refuse[name], else shape-invalid) naming the first bad field; unknown keys are ignored.
// A shape is { field: type }: str int num bool obj arr any id digest address utc code counts codeCounts msg word ref, an enum name, or
// another shape name; `T[]`, `T{}`, a trailing `?` = may be null.
const { fail, isFail, MSG_CAP } = require('../base/errors.cjs');
const { plainRead } = require('../base/canonical.cjs');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v) && v >= 0;
const isHex64 = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const LISTS = { '[]': (v) => (Array.isArray(v) ? v : null), '{}': (v) => (isObj(v) ? Object.values(v) : null) };
const baseOf = (type) => type.replace(/\?$/, '').replace(/(\[\]|\{\})$/, '');
// what an example value of a type holds where a refusal shows the shape (a placeholder the type itself takes)
const PLACES = { str: '<text>', msg: '<text>', word: '<word>', id: '<id>', ref: '<file>:<line>', int: 1, num: 1, bool: true, obj: {}, arr: [] };
const JSON_TYPES = { str: 'string', int: 'integer', num: 'number', bool: 'boolean', obj: 'object', arr: 'array' };
/** What a provider is told of one field type: a list mark as what `LISTS` accepts, never as its value type. */
function toldAs(type, value = { type: JSON_TYPES[baseOf(type)] }) {
  const mark = /(\[\]|\{\})\??$/.exec(type)?.[1];
  if (mark === '[]') return { type: 'array', items: value };
  return mark === '{}' ? { type: 'object', additionalProperties: value } : value;
}

/** THE JSON door: text -> value, or a coded refusal (`code`, default json-invalid). A leading BOM is dropped. ONE path, kit's own reader
 * (base/canonical plainRead), never the engine's JSON.parse: on node 24 that one can hand back another key for a key written with an escape
 * (I-66). */
function json(text, code = 'json-invalid') {
  try {
    return plainRead(String(text).replace(/^\u{feff}/u, ''));
  } catch (err) {
    if (!isFail(err, 'json-invalid')) throw fail(code, err.code || err.name);
    throw Object.assign(fail(code, 'SyntaxError'), { broken: brokenAt(String(text), err) });
  }
}
/** Where JSON text broke, for the person who sent it (the message stays `SyntaxError`): none given, or the line and column of the first
 * character the reader could not take. */
function brokenAt(text, err) {
  if (!text.trim()) return { empty: true };
  const before = text.slice(0, Number(/at character (\d+)/.exec(err.message)?.[1] ?? text.length)).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
}
/** Text that may not be JSON at all, where that is an answer and not a stop: the value, or null. */
function jsonOrNull(text) {
  try {
    return json(text);
  } catch (err) {
    if (!isFail(err, 'json-invalid')) throw err;
    return null;
  }
}

const typesOf = (isCode) => ({
  str: (v) => typeof v === 'string' && v.length > 0,
  msg: (v) => typeof v === 'string' && v.length <= MSG_CAP,
  int: isInt,
  num: (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0,
  bool: (v) => typeof v === 'boolean',
  obj: isObj,
  arr: Array.isArray,
  any: (v) => v !== undefined,
  id: (v) => typeof v === 'string' && /^[A-Za-z0-9][\w.-]{0,127}$/.test(v),
  word: (v) => typeof v === 'string' && /^[^\s"'`=]{1,128}$/.test(v),
  ref: (v) => typeof v === 'string' && /^[^\n:"'`=]{1,256}:[1-9]\d*$/.test(v),
  digest: isHex64,
  address: (v) => typeof v === 'string' && v.startsWith('sha256:') && isHex64(v.slice(7)), // what base/hash `address` gives
  utc: (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v), // one width and one zone, so the order of the text is the order of time
  code: isCode,
  counts: (v) => isObj(v) && Object.values(v).every(isInt),
  codeCounts: (v) => isObj(v) && Object.entries(v).every(([k, n]) => isCode(k) && isInt(n)),
});

/** One value of shape `name` for a refusal to show -> { value, optional }: each required field (each field, `whole`) a placeholder its
 * type takes, `fixed` fields as given; and the names of the optional fields it left out. */
function exampleOf(tables, name, { fixed = {}, whole = false } = {}) {
  const { shapes, enums } = tables;
  const placeOf = (type) => (shapes[type] ? exampleOf(tables, type, { whole }).value : enums[type]?.[0] ?? PLACES[type] ?? `<${type}>`);
  const valueOf = (type) => (/\[\]\??$/.test(type) ? [placeOf(baseOf(type))] : placeOf(baseOf(type)));
  const fields = Object.entries(shapes[name]);
  const shown = fields.filter(([f, t]) => whole || !t.endsWith('?') || Object.hasOwn(fixed, f));
  return { value: Object.fromEntries(shown.map(([f, t]) => [f, Object.hasOwn(fixed, f) ? fixed[f] : valueOf(t)])),
    optional: fields.filter((field) => !shown.includes(field)).map(([f]) => f) };
}

/** createValidate({ shapes, enums, refuse, isCode }) -> { shape, problems, refusal, knows, json, jsonOrNull, lines, kept, jsonSchema,
 * example }. problems: every problem of `value` as `name`, so a writer fixes them in one go ([] when it fits). */
function createValidate({ shapes, enums, refuse, isCode }) {
  const TYPES = typesOf(isCode);
  const fitsBase = (type, v) => (enums[type] ? enums[type].includes(v) : TYPES[type](v));
  const knows = (type) => Boolean(TYPES[baseOf(type)] || enums[baseOf(type)] || shapes[baseOf(type)]);
  /** Every reason `value` is not `type` ('<Shape>.<field> is not <type>'), in field order; [] when it fits. */
  function whys(type, value, at) {
    if (type.endsWith('?')) return value === null || value === undefined ? [] : whys(type.slice(0, -1), value, at);
    const list = LISTS[type.slice(-2)];
    if (list) return list(value) ? list(value).flatMap((v) => whys(type.slice(0, -2), v, at)) : [`${at} is not ${type}`];
    if (shapes[type]) return isObj(value) ? Object.entries(shapes[type]).flatMap(([f, t]) => whys(t, value[f], `${type}.${f}`)) : [`${at} is not ${type}`];
    return fitsBase(type, value) ? [] : [`${at} is not ${enums[type] ? `one of ${enums[type].join(', ')}` : type}`];
  }
  const why = (type, value, at) => whys(type, value, at)[0] || null;

  /** shape(name, value) -> value, or throws fail(refuse[name] | shape-invalid, the first bad field). */
  function shape(name, value) {
    const bad = why(name, value, name);
    if (bad) throw fail(refuse[name] || 'shape-invalid', bad);
    return value;
  }

  /** shape() without the throw, for a door that keeps what it refuses: refuse[name] | shape-invalid, or null. */
  const refusal = (name, value) => (why(name, value, name) ? refuse[name] || 'shape-invalid' : null);

  /** THE NDJSON door -> { rows, refused }: every line `keep` keeps, through the shape when named; a torn line costs no other. */
  function kept(text, name, keep = () => true) {
    const out = { rows: [], refused: [] };
    String(text).split('\n').forEach((line, i) => {
      if (!line.trim()) return;
      try {
        const value = json(line, name ? refuse[name] || 'shape-invalid' : 'json-invalid');
        if (keep(Object(value))) out.rows.push(name ? shape(name, value) : value);
      } catch (err) {
        if (!isFail(err)) throw err;
        out.refused.push({ line: i + 1, code: err.code, msg: err.message });
      }
    });
    return out;
  }

  /** lines (text, name?, keep?): kept() for a store that must be whole; the first refused line throws, naming its line. */
  function lines(text, name, keep) {
    const { rows, refused: [bad] } = kept(text, name, keep);
    if (bad) throw fail(bad.code, `line ${bad.line}: ${bad.msg.replace(`${bad.code}: `, '')}`); // the code once, then why
    return rows;
  }

  /** The JSON schema of a shape, GENERATED from the same row validate checks (what a provider is told = what is checked).
   * `items` names the shape of an `arr` field's entries; `omit` drops fields at every level. */
  function jsonSchema(name, { items = {}, omit = [] } = {}) {
    const fields = Object.entries(shapes[name]).filter(([f]) => !omit.includes(f));
    const enumOf = (t) => (enums[baseOf(t)] ? { enum: enums[baseOf(t)] } : undefined);
    const typeOf = ([f, t]) => (items[f] ? { type: 'array', items: jsonSchema(items[f], { omit }) } : toldAs(t, enumOf(t)));
    return { type: 'object', properties: Object.fromEntries(fields.map((e) => [e[0], typeOf(e)])),
      required: fields.filter(([, t]) => !t.endsWith('?')).map(([f]) => f), additionalProperties: false };
  }

  const example = (name, asked) => exampleOf({ shapes, enums }, name, asked);
  return { shape, problems: (name, value) => whys(name, value, name), refusal, knows, json, jsonOrNull, lines, kept, jsonSchema, example };
}

module.exports = { createValidate, jsonOrNull };
