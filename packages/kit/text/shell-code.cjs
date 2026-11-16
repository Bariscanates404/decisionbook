// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's shell owner, PURE: the files inline code's write calls open, each path valued where its call stands; a value that is no literal is
// unplaced, too long or deep is `unread`.
// A sure assignment sets its name for the rest of the block, any other adds a value; a function's parameters stay in its body, so a write
// there is placed once per call.
const { code: CODE } = require('./shell.json');
const { codeBlocks } = require('./shell-blocks.cjs');

const TERM = `(?:${CODE.literal}|${CODE.name})`;
const EXPR = `${TERM}(?:\\s*(?:${CODE.join})\\s*${TERM})*`;
const WHOLE = new RegExp(`^\\s*${EXPR}\\s*$`);
const TERMS = new RegExp(`${CODE.literal}|${CODE.name}`, 'g');
const ARG = new RegExp(`\\s*(${EXPR})\\s*([,)])`, 'y');
const PARAM = new RegExp(CODE.param);
const INTERPOLATES = new RegExp(CODE.interpolates);
const START = new RegExp(CODE.start, 'y');
const CALL = /(?<![\w$.])(?<name>[A-Za-z_$][\w$]*)\s*\(/g;
const CAP = 64;
const LONGEST = 200000; // the values one name, path or write may hold, more is unplaced; the longest code text read, more is unread
const isParam = (part) => typeof part !== 'string';
const builtFrom = (fn) => (value) => Boolean(value && value.some((part) => isParam(part) && part.fn === fn));
const allMatches = (sources, text) => sources.flatMap((source) => [...text.matchAll(new RegExp(source, 'g'))]);
// at one place: a statement ends, then blocks end, then open, then what stands there
const orderAt = (e) => (e.stop ? 0 : e.close ? 1 : e.open ? 2 : 3);

function joined(lists) {
  return lists.reduce((values, list) => {
    const next = new Map(values.flatMap((a) => list.map((b) => (a && b ? [...a, ...b] : null)))
      .map((value) => [JSON.stringify(value), value]));
    return next.size > CAP ? [null] : [...next.values()];
  }, [[]]);
}

function eventsOf(code) {
  const paramsOf = (text) => text.split(',').map((p) => (PARAM.exec(p) || {}).groups);
  const heads = allMatches(CODE.heads, code)
    .map((m) => ({ at: m.index, end: m.index + m[0].length, head: true, fn: m.groups.name, params: paramsOf(m.groups.params) }));
  const blocks = codeBlocks(code, heads);
  const own = new Set(heads.map((h) => h.fn));
  return blocks && [...blocks, ...heads,
    ...allMatches([CODE.assign], code).map((m) => ({ at: m.index, names: [m.groups.name],
      value: /^:?$/.test(m.groups.op) && code[m.index + m[0].length] !== '=' ? m.groups.value : null })),
    ...allMatches(CODE.loops, code).map((m) => ({ at: m.index, names: m.groups.names.split(/\s*(?:,|=>)\s*/), value: null })),
    ...allMatches(CODE.calls, code).map((m) => ({ at: m.index, write: (m.groups && m.groups.path) ?? null })),
    ...[...code.matchAll(CALL)].filter((m) => own.has(m.groups.name))
      .map((m) => ({ at: m.index, call: m.groups.name, args: m.index + m[0].length })),
  ].sort((a, b) => a.at - b.at || orderAt(a) - orderAt(b));
}

function blockNames() {
  const frames = [{ vars: null }]; // a frame's names, made at its first binding
  const get = (name) => frames.findLast((f) => f.vars && f.vars.has(name))?.vars.get(name);
  const put = (name, values) => (frames.at(-1).vars ??= new Map()).set(name, joined([values]));
  const add = (name, values) => put(name, [...(get(name) || []), ...values]);
  const end = () => {
    const top = frames.pop();
    if (top.vars) top.vars.forEach((values, name) => add(name, top.fn ? values.filter((value) => !builtFrom(top.fn)(value)) : values));
    return top;
  };
  const varsOf = (fn, params) => (params.length ? new Map(params.flatMap((p, i) => (p ? [[p.name, [[{ fn, i }]]]] : []))) : null);
  const open = ({ fn = null, params = [], open: block }) => frames.push({ vars: varsOf(fn, params), fn, stop: Boolean(block.stop) });
  return {
    get, put, add,
    move: (e) => { // a block opens; a block ends, with the statement blocks in it; a statement ends, with its statement blocks
      if (e.open) open(e);
      else if (e.close) while (frames.length > 1 && end().stop);
      else while (frames.length > 1 && frames.at(-1).stop) end();
    },
  };
}

function valueOf(text, scope) {
  const terms = WHOLE.test(text) ? [...text.matchAll(TERMS)] : [];
  if (!terms.length || terms.length > CAP) return [null];
  return joined(terms.map(([term]) => {
    const quoted = /^['"`]/.test(term) ? term.slice(1, -1) : null;
    return quoted === null ? scope.get(term) || [null] : [INTERPOLATES.test(quoted) ? null : [quoted]];
  }));
}

function argsOf(code, from, scope) {
  const args = [];
  ARG.lastIndex = from;
  for (let m = ARG.exec(code); m; m = m[2] === ',' ? ARG.exec(code) : null) args.push(valueOf(m[1], scope));
  return args;
}

// Replace only where every value reads (one that cannot may be a condition's, `x if c`) and the statement surely runs; else add.
function replaces(code, e, values, walk) {
  START.lastIndex = walk.start.after;
  return walk.start.sure && !values.includes(null) && START.test(code) && START.lastIndex === e.at;
}

function bindEvent(code, e, scope, walk) {
  if (e.write !== undefined) walk.writes.push({ at: e.at, values: e.write === null ? [null] : valueOf(e.write, scope) });
  else if (e.at < walk.head) return;
  else if (e.call) walk.calls.push({ at: e.at, fn: e.call, args: argsOf(code, e.args, scope) });
  else {
    const values = e.value === null ? [null] : valueOf(e.value, scope);
    for (const name of e.names) (replaces(code, e, values, walk) ? scope.put : scope.add)(name, values);
  }
}

function bindInOrder(code, past) {
  const events = eventsOf(code);
  const scope = blockNames();
  const walk = { writes: [], calls: [], start: { after: 0, sure: true }, head: 0 };
  for (const e of events || []) {
    if (past()) return { ...walk, unread: true };
    if (e.after !== undefined) walk.start = e;
    if (e.head) walk.head = Math.max(walk.head, e.end);
    else if (e.stop || e.close || e.open) scope.move(e);
    else bindEvent(code, e, scope, walk);
  }
  return { ...walk, unread: !events };
}

const itself = (value, part) => value && value.length === 1 && JSON.stringify(value[0]) === JSON.stringify(part);
const given = (call, part) => (call.args[part.i] || [[part]]).filter((value) => !itself(value, part));

function callsPlace({ at, values }, byFn) {
  return values.flatMap((parts) => {
    const param = (parts || []).find(isParam);
    if (!param) return [{ at, parts }];
    const mine = byFn.get(param.fn) || [];
    if (!mine.length || mine.length * values.length > CAP * CAP) return [{ at, parts: null }];
    const valuesIn = (call) => parts.map((part) => (isParam(part) && part.fn === param.fn ? given(call, part) : [[part]]));
    return mine.flatMap((call) => joined(valuesIn(call)).map((each) => ({ at: call.at, parts: each })));
  });
}

function known(files) {
  const placed = files.filter((f) => f.parts && !f.parts.some(isParam)).sort((a, b) => a.at - b.at);
  return { paths: [...new Set(placed.map((f) => f.parts.join('')))], unplaced: placed.length < files.length };
}

function codeWrites(code, past = () => false) {
  const text = String(code ?? '');
  if (text.length > LONGEST) return { paths: [], unplaced: true, unread: true };
  const { writes, calls, unread } = bindInOrder(text, past);
  const byFn = Map.groupBy(calls, (call) => call.fn);
  const files = [];
  for (const w of writes) {
    files.push(...callsPlace(w, byFn));
    if (past() && w !== writes.at(-1)) return { paths: known(files).paths, unplaced: true, unread: true };
  }
  const { paths, unplaced } = known(files);
  return { paths, unplaced: unplaced || unread, unread };
}

module.exports = { codeWrites };
