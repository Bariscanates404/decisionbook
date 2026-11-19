// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE one answer to "who is acting". A person sits at a terminal no AI host stands above. Inside an AI session the AI acts, and what
// stands behind it is the person's last prompt of that session (its time and its words) when the session's rows hold one. Anything
// else is the AI alone: "could not tell" is the AI, never a yes. The host's own ask is the person's third way (`asksPerson`).
// Every package asks through the composition root's `io.actor`; what marks an AI host is data (contracts/person.json).
// A person types into a shell: a terminal with no shell a person types into, from this process up to the terminal's session leader
// (it was opened for this command alone, or for a command string or a script), is no person's, for every verb. A person's terminal
// may still be WRAPPED: a program of the list stands above it (a terminal multiplexer, a tool that opens a pseudo-terminal, a script
// runner) and can type for them; a grave act (one that takes a protection away) is refused there. Named limit: no signal on the
// machine proves a person; a terminal window, or a typing shell on a pseudo-terminal, that another program opened and typed into
// reads as theirs.
const RULES = require('../contracts/person.json');
const { programOf, commandNames } = require('../base/paths.cjs');
const { shellLang, handsText } = require('../text/shell-win.cjs');

// a shell a person types into, by the shape of its command line: a login shell, or a program given nothing but options, none a command;
// which words hand a Windows shell a command is the shell owner's answer, the one the write gate reads
const WIN = RULES.windows;
function isTyped(words) {
  const lang = shellLang(programOf(words[0]));
  if (lang) return !handsText(lang, words.slice(1));
  return String(words[0]).startsWith('-') || words.slice(1).every((word) => word.startsWith('-') && word !== RULES.commandOption);
}
// Windows keeps no terminal sessions (the walk says `sessions: false`): there the terminal's side ends at the farthest shell of the list;
// with none (-1) that side is empty, which holds no typing shell
const leaderOf = (walk) => (walk.sessions === false ? walk.chain.findLastIndex((words) => WIN.shells.includes(programOf(words[0])))
  : walk.leader);
const SHOWN = 6; // how many ancestors' programs the root's row names: the shell, the terminal and what stands between

/** PURE. Where a process sits. `tty`: its input is a terminal; `marks`: the AI session variables its environment holds; `walk`: its
 * ancestors ({ chain: their command words, nearest first; leader: the place in it of the terminal's session leader, -1 this process,
 * null not seen }), or null where that walk could not be done whole. -> { person, why }, a person's with `above` (its nearest
 * ancestors' programs) and `wrapped` (the first of them that can type for a person) where one is there. */
function seatOf({ tty, marks, walk }) {
  if (marks.length) return { person: false, why: 'ai-session-mark' };
  if (!tty) return { person: false, why: 'no-terminal' };
  if (walk === null) return { person: false, why: 'ancestry-unknown' };
  if (walk.chain.some((words) => commandNames(words, RULES.aiHosts.names))) return { person: false, why: 'ai-host-above' };
  const leader = leaderOf(walk);
  if (leader === null || !walk.chain.slice(0, leader + 1).some(isTyped)) return { person: false, why: 'no-typing-shell' };
  const above = walk.chain.map((words) => programOf(words[0]));
  const wrapped = above.find((program) => RULES.wrappers.includes(program));
  return { person: true, why: 'own-terminal', above: above.slice(0, SHOWN), ...(wrapped ? { wrapped } : {}) };
}

/** PURE. Who acts from a seat. `prompts`: the person's prompts the session's rows hold, oldest first ({ at, text? }); null where
 * there is no session. -> { who: terminal | prompt | ai, why }, a prompt with its time and its words; a session whose rows hold no
 * prompt is the AI (`no-prompt-row`: it could not tell). */
function whoActs(seat, prompts) {
  if (seat.person) return { who: 'terminal', why: seat.why, ...(seat.wrapped ? { wrapped: seat.wrapped } : {}) };
  if (!prompts) return { who: 'ai', why: seat.why };
  const last = prompts.at(-1);
  if (!last) return { who: 'ai', why: 'no-prompt-row', seat: seat.why };
  return { who: 'prompt', why: 'prompt-row', seat: seat.why, at: last.at, text: last.text ?? null };
}

/** PURE. Whether a person stands behind an act on something made at `at`: at their terminal, yes; in an AI session only when their
 * last prompt is later than `at`; the AI alone is unknown, which no caller reads as a yes. -> yes | no | unknown */
function saidAfter(actor, at) {
  if (actor.who !== 'prompt') return actor.who === 'terminal' ? 'yes' : 'unknown';
  return Date.parse(actor.at) > Date.parse(at) ? 'yes' : 'no';
}

/** Is a hook's ask put to a person in this permission mode? In any other it passes with no one asked, so its gate must deny. */
const asksPerson = (mode) => RULES.askingModes.includes(mode || 'default');

/** The actor of this process, for the composition root: the seat is read once, and the ancestors only where a terminal with no mark
 * is there (it costs one listing of the machine's processes). `said`: called with each answer, for the root's trace row. */
function createActor({ env, proc, input, said }) {
  let seat = null;
  function seated() {
    if (seat) return seat;
    const marks = RULES.aiSessionEnv.filter((name) => env.get(name) !== null);
    const tty = Boolean(input.isTTY);
    seat = seatOf({ tty, marks, walk: tty && !marks.length ? proc.ancestry(RULES.aiHosts.levels) : null });
    return seat;
  }
  return (prompts = null) => {
    const actor = whoActs(seated(), prompts);
    said(seat.above ? { ...actor, above: seat.above } : actor);
    return actor;
  };
}

/** PURE. Whether a hook call is the AI host's own: only then are a prompt's words the person's. The host hands its hook one end of a
 * socket pair as standard output and keeps the other end itself; a process the AI starts from its shell tool gets a file there, and
 * whatever socket it makes for itself has another process, or no path-less pair, at its other end. `caller` (io/proc callerOf): the
 * kernel's word on who holds that end, this process's parent and the parent's command words. -> { host, why }: `host-socket`;
 * `peer-not-parent`, `parent-not-host`, `caller-unread` (it could not be read: never a yes); on a platform with no reader (data:
 * `hostCall.judged`) `unjudged`, heard as any other caller. Named limit: a program that stands in for the whole host (it is named as one,
 * starts the hook itself and keeps the pair's other end) reads as the host. */
function hostCalled(caller) {
  if (!RULES.hostCall.judged.includes(caller.platform)) return { host: true, why: 'unjudged' };
  if (!caller.read) return { host: false, why: 'caller-unread' };
  if (caller.peer !== caller.parent || !caller.pair) return { host: false, why: 'peer-not-parent' };
  return commandNames(caller.words, RULES.aiHosts.names) ? { host: true, why: 'host-socket' } : { host: false, why: 'parent-not-host' };
}

module.exports = { saidAfter, asksPerson, createActor, hostCalled };
