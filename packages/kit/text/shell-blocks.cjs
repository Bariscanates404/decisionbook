// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's shell owner, PURE: inline code's blocks and statement ends by shell.json `code`; a statement is `sure` only after statements read
// in full or whose body it saw open.
const { code: CODE } = require('./shell.json');

const TOKENS = new RegExp(`(?<literal>${CODE.text}|${CODE.literal})|(?<note>${CODE.comment})|(?<brace>[{}])|(?<bracket>[()[\\]])|;|\\n(?<lead>[ \\t]*)`, 'g');
const NOTE = new RegExp(CODE.comment, 'y');
const SPACES = /\s*/y;
const START = new RegExp(CODE.start, 'y');
const whole = (key) => new RegExp(`^(?:${CODE.plain[key]})$`);
const UNREAD = new RegExp(CODE.plain.unread);
const [CONTROL, OPWORD, LOAD, ENDS] = ['control', 'opwords', 'loads', 'ends'].map(whole);
const PART = /\s*(?:([@$]{0,2}[A-Za-z_]\w*[?!]?)|((?:\.|::|->|\?\.|&\.)\s*[A-Za-z_]\w*[?!]?)|(\d[\w.]*)|(\(\)|\[\]|\{\})|([-+*/=<>!&|^?:~,]+))/y;
const KINDS = ['member', 'num', 'group', 'op']; // PART's groups after the word's
const WORDS = [[CONTROL, 'bad'], [OPWORD, 'op'], [LOAD, 'load']]; // a word's kind where it is one of these
// a statement's state -> by the part read -> its state after: a name alone may be an end word, or given a literal a command (puts 'x')
const NEXT = {
  start: { word: 'name', load: 'load', num: 'op', group: 'op', op: 'operand' },
  name: { member: 'op', group: 'op', op: 'operand', num: 'op' },
  operand: { word: 'op', load: 'op', num: 'op', group: 'op', op: 'operand' },
  op: { member: 'op', group: 'op', op: 'operand' },
  load: { word: 'load', load: 'load', member: 'load', num: 'load', group: 'load', op: 'load' }, // import a.b as c, d / from x import y
};
const DEEPEST = 64;
const PLAINEST = 1000; // blocks open at once: deeper code is not read; the longest statement (its literals one character) read in full

const innermost = (s) => s.open.at(-1) || s.root;
// The statement so far: each literal `0`, each comment nothing, each block seen `{}`; past PLAINEST it grows no more.
const saidTo = (s, at) => (s.said.length > PLAINEST ? s.said : `${s.said}${s.code.slice(s.from, at)}`);

function quietAt(s, at, { 0: quiet, groups: { literal } }) {
  s.said = `${saidTo(s, at)}${literal === undefined ? ' ' : '0'}`;
  s.from = at + quiet.length;
}

function outerOf(text) {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    depth -= Number(depth > 0 && ')]}'.includes(ch));
    if (depth === 0) out += ch;
    depth += Number('([{'.includes(ch));
  }
  return out;
}

function partKind(m) {
  if (m[1] === undefined) return KINDS.find((kind, k) => m[k + 2] !== undefined);
  return WORDS.find(([words]) => words.test(m[1]))?.[1] || 'word';
}

function walked(text, at) {
  let state = 'start';
  for (PART.lastIndex = at; state && PART.lastIndex < text.length;) {
    const m = PART.exec(text);
    state = m && NEXT[state][partKind(m)];
  }
  return state === 'op' || state === 'load' || (state === 'name' && ENDS.test(text.slice(at).trim()));
}

function readsInFull(said) {
  if (said.length > PLAINEST || UNREAD.test(said)) return false;
  const outer = /[([{]/.test(said) ? outerOf(said).trimEnd() : said.trimEnd();
  if (outer.endsWith('{}')) return true;
  START.lastIndex = 0;
  START.test(outer);
  return walked(outer, START.lastIndex);
}

function emit(s, e) {
  const block = innermost(s);
  if (e.after !== undefined) [s.from, e.sure] = [e.after, !block.pending && !block.hidden];
  s.out.push(e);
}

// One not read in full (`pending`) and followed by another, not by a block, hid a body (`hidden`).
function stopAt(s, at, after) {
  const said = saidTo(s, at);
  const block = innermost(s);
  s.said = '';
  if (/\S/.test(said)) [block.hidden, block.pending] = [Boolean(block.hidden || block.pending), !readsInFull(said)];
  emit(s, { at, stop: true, after });
}

function openAt(s, block, at, after) {
  innermost(s).pending = false;
  s.open.push(block);
  s.said = '';
  emit(s, { at, open: block, after });
}

function endFrom(s, k, at, after) {
  while (k >= 0 && s.open.length > k) {
    const block = s.open.pop();
    s.said = block.brace ? `${block.before}{}` : '';
    emit(s, { at, close: block, after });
  }
}

function lineStart(s, at, lead) {
  const first = at + 1 + lead.length;
  if (at >= 0) stopAt(s, at, at + 1);
  NOTE.lastIndex = first;
  if (/^[\n\r]?$/.test(s.code[first] ?? '') || NOTE.test(s.code)) return;
  endFrom(s, s.open.findLastIndex((block) => block.indent <= lead.length) + 1, first, first);
  if (s.last && lead.length > s.last.indent) openAt(s, { indent: lead.length, owner: s.last.at }, first, first);
  s.last = { at: at + 1, indent: lead.length };
}

function braceAt(s, brace, at) {
  if (brace === '{') {
    openAt(s, { brace: true, indent: s.last ? s.last.indent : 0, depth: s.depth, before: saidTo(s, at) }, at, at + 1);
    s.depth = 0;
    return;
  }
  const k = s.open.findLastIndex((block) => block.brace);
  if (k < 0) return;
  const { depth } = s.open[k];
  endFrom(s, k, at, at + 1);
  s.depth = depth;
}

// Events { open } / { close } / { stop }; `after`: where the next statement may begin, `sure`: it runs whenever its block does. Null past
// DEEPEST.
function scanBlocks(code) {
  const s = { out: [], open: [], depth: 0, last: null, code, from: 0, said: '', root: {} };
  for (const m of `\n${code}`.matchAll(TOKENS)) {
    const at = m.index - 1;
    const { literal, note, brace, bracket, lead } = m.groups;
    if (literal !== undefined || note !== undefined) quietAt(s, at, m);
    else if (bracket) s.depth = Math.max(0, s.depth + ('(['.includes(bracket) ? 1 : -1));
    else if (brace) braceAt(s, brace, at);
    else if (s.depth > 0) continue;
    else if (lead === undefined) stopAt(s, at, at + 1);
    else lineStart(s, at, lead);
    if (s.open.length > DEEPEST) return null;
  }
  stopAt(s, code.length);
  endFrom(s, 0, code.length);
  return s.out;
}

function isBody(code, head, open) {
  if (!open || open.fn) return false;
  SPACES.lastIndex = head.end;
  if (open.open.brace) return open.at === head.end - 1 || (SPACES.test(code) && SPACES.lastIndex === open.at);
  return open.open.owner === code.lastIndexOf('\n', head.at) + 1;
}

function codeBlocks(code, heads) {
  const blocks = scanBlocks(code);
  if (!blocks) return null;
  const opens = blocks.filter((e) => e.open);
  let next = 0; // the first open at or after the head walked now (heads in order)
  const own = [...heads].sort((a, b) => a.at - b.at).flatMap((head) => {
    while (next < opens.length && opens[next].at < head.end - 1) next += 1;
    if (!isBody(code, head, opens[next])) return [
      { at: head.end, open: { stop: true }, fn: head.fn, params: head.params, after: head.end }];
    Object.assign(opens[next], { fn: head.fn, params: head.params });
    return [];
  });
  return [...blocks, ...own];
}

module.exports = { codeBlocks };
