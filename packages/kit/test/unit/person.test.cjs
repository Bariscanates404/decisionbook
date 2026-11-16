// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's one answer to "who is acting", over a faked process: its terminal, the marks in its environment, its ancestors' command words
// (nearest first), and the prompt rows a session holds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createActor, saidAfter, asksPerson } = require('../../run/person.cjs');
const RULES = require('../../contracts/person.json');

const PERSON = [['-zsh'], ['login', '-pfl', 'dev'], ['/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal']];
const [MARK] = RULES.aiSessionEnv;

/** The actor of a faked process and what it did: `walks` the listings of the machine's processes, `said` each answer it told. `leads`:
 * the place in `above` of the terminal's session leader (as a terminal starts `login`), -1 this process itself, null none seen. */
function processOf({ tty = true, marks = [], above = PERSON, leads = above && above.findIndex((words) => words[0] === 'login') } = {}) {
  const seen = { walks: 0, levels: null, said: [] };
  const proc = { ancestry(levels) {
    seen.walks += 1;
    seen.levels = levels;
    return above && { chain: above, leader: leads };
  } };
  const env = { get: (name) => (marks.includes(name) ? '1' : null) };
  const actor = createActor({ env, proc, input: { isTTY: tty }, said: (answer) => seen.said.push(answer) });
  return { actor, seen };
}
const who = (process, prompts) => processOf(process).actor(prompts);

test('an AI host above the terminal is no person, named by a path part of its command words, at any depth', () => {
  const above = (chain) => who({ above: chain });
  assert.deepEqual(above(PERSON), { who: 'terminal', why: 'own-terminal' });
  const AI = { who: 'ai', why: 'ai-host-above' };
  assert.deepEqual(above([['python3', '-c', 'import pty'], ['/bin/zsh', '-c', 'x'], ['claude', '--permission-mode', 'auto'], ...PERSON]), AI);
  assert.deepEqual(above([['script', '-q', '/dev/null'], ['node', '/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js'], ...PERSON]), AI,
    'an npm install runs as node');
  assert.deepEqual(above([['/Users/a/.local/bin/claude'], ...PERSON]), AI);
  assert.deepEqual(above([['vim', 'notes-about-claude.md'], ['grep', '-r', 'x', 'claude'], ...PERSON]).who, 'terminal',
    'a word that only holds the name, or a later argument, is no host');
  assert.deepEqual(above(null), { who: 'ai', why: 'ancestry-unknown' }, 'no listing, a parent not in it or more than the bound: no person');
});

test('a person needs a terminal with no AI session mark; the ancestors are listed once, and only at an unmarked terminal', () => {
  const person = processOf();
  assert.deepEqual([person.actor().who, person.actor().who, person.seen.walks, person.seen.levels], ['terminal', 'terminal', 1, 12]);
  const marked = processOf({ marks: [MARK] });
  assert.deepEqual([marked.actor(), marked.seen.walks], [{ who: 'ai', why: 'ai-session-mark' }, 0]);
  const piped = processOf({ tty: false });
  assert.deepEqual([piped.actor(), piped.seen.walks], [{ who: 'ai', why: 'no-terminal' }, 0], 'a hook\'s piped stdin pays no process listing');
  assert.deepEqual(RULES.aiSessionEnv.map((name) => who({ marks: [name] }).why), ['ai-session-mark', 'ai-session-mark'], 'every mark alone');
});

test('a program above a person\'s terminal that can type for them is named: by its name in any case, a path and a version aside', () => {
  const seated = (chain) => {
    const { actor, seen } = processOf({ above: [...chain, ...PERSON] });
    return [actor().who, actor().wrapped ?? null, seen.said[0].above.join(' < ')];
  };
  assert.deepEqual(seated([]), ['terminal', null, '-zsh < login < terminal'], 'a plain terminal: the programs above it go to the root\'s row');
  assert.deepEqual(seated([['sh', '-c', 'x'], ['tmux', '-L', 'x', 'new-session']]), ['terminal', 'tmux', 'sh < tmux < -zsh < login < terminal']);
  const typers = [['SCREEN', '-dmS', 's'], ['/usr/bin/script', '-q', '/dev/null'], ['expect', '-c', 'spawn'], ['osascript', '-e', 'x'], ['script3.2']];
  assert.deepEqual(typers.map((words) => seated([words])[1]), ['screen', 'script', 'expect', 'osascript', 'script']);
  assert.equal(seated([['vim', 'script'], ['less', '/usr/bin/tmux']])[1], null, 'a later word of a command line is no program');
  assert.equal(seated(Array(8).fill(['sh']))[2], 'sh < sh < sh < sh < sh < sh', 'the row names the nearest six');
});

test('a terminal with no shell a person types into, from this process up to its session leader, is no person\'s', () => {
  const NONE = { who: 'ai', why: 'no-typing-shell' };
  const THEIRS = { who: 'terminal', why: 'own-terminal' };
  const seat = (above, leads) => processOf({ above, leads }).actor();
  const opener = [['/usr/bin/some-interpreter', 'pty.py']];
  assert.deepEqual(seat(opener, -1), NONE, 'a pseudo-terminal opened for this command alone: the command leads its own session');
  assert.deepEqual(seat([['sh', '-c', 'the command'], ...opener], 0), NONE, 'a shell handed a command string');
  assert.deepEqual(seat([['bash', '/tmp/run.sh'], ...opener], 0), NONE, 'a shell handed a script');
  assert.deepEqual(seat([['-zsh'], ...opener], null), NONE, 'no leader seen: could not tell is never a person');
  assert.deepEqual(seat([['make', 'off'], ['sh', '-c', 'make off'], ...PERSON], 3), THEIRS, 'a person\'s login shell further up: theirs');
  for (const shell of [['-zsh'], ['bash'], ['/bin/zsh', '-il'], ['fish', '--login']]) assert.deepEqual(seat([shell, ...opener], 0), THEIRS, shell.join(' '));
  assert.deepEqual(seat([['zsh', '-i'], ...opener], 0), THEIRS, 'the named limit: a typing shell another program opened and typed into');
});

test('in an AI session the last prompt row stands behind the AI with its time and words; with no row it is the AI alone', () => {
  const rows = [{ at: '2026-11-02T06:00:00.000Z', text: 'rename fmt' }, { at: '2026-11-02T06:05:00.000Z', text: 'yes, go' }];
  assert.deepEqual(who({ marks: [MARK] }, rows),
    { who: 'prompt', why: 'prompt-row', seat: 'ai-session-mark', at: '2026-11-02T06:05:00.000Z', text: 'yes, go' });
  assert.equal(who({ marks: [MARK] }, [{ at: rows[0].at }]).text, null, 'a row that keeps no words');
  assert.deepEqual(who({ marks: [MARK] }, []), { who: 'ai', why: 'no-prompt-row', seat: 'ai-session-mark' }, 'could not tell is the AI');
  assert.deepEqual(who({ tty: false }, null), { who: 'ai', why: 'no-terminal' }, 'no session at all');
  assert.deepEqual(who({}, rows), { who: 'terminal', why: 'own-terminal' }, 'a person at their terminal needs no row');
});

test('a person said so after a moment at their terminal or by a later prompt; the AI alone is unknown, never a yes', () => {
  const at = '2026-11-02T06:03:00.000Z';
  assert.equal(saidAfter({ who: 'terminal', why: 'own-terminal' }, at), 'yes');
  assert.equal(saidAfter({ who: 'prompt', at: '2026-11-02T06:05:00.000Z' }, at), 'yes');
  assert.equal(saidAfter({ who: 'prompt', at: '2026-11-02T06:01:00.000Z' }, at), 'no');
  assert.equal(saidAfter({ who: 'prompt', at }, at), 'no', 'the same instant is not after');
  assert.equal(saidAfter({ who: 'ai', why: 'no-prompt-row' }, at), 'unknown');
});

test('the actor tells its caller every answer, who and why, so the root writes one row format everywhere', () => {
  const { actor, seen } = processOf({ marks: [MARK] });
  actor(null);
  actor([{ at: '2026-11-02T06:05:00.000Z', text: 'yes' }]);
  assert.deepEqual(seen.said.map((answer) => [answer.who, answer.why]), [['ai', 'ai-session-mark'], ['prompt', 'prompt-row']]);
});

test('a hook ask reaches a person only in a permission mode that shows it; no mode named is the default one', () => {
  assert.deepEqual(['default', 'acceptEdits', 'plan', undefined].map(asksPerson), [true, true, true, true]);
  assert.deepEqual(['bypassPermissions', 'dontAsk', 'auto'].map(asksPerson), [false, false, false]);
});
