// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Whose a plan and a line of it are to this clone, as git says: the one answer the open plan's readers, `new`, `close`, a compared link
// and a decision written over a line all ask, and the mark by which a reader names a teammate instead of "the person".
const { isTheirs, sameSlot, headsOf, isAnswered, sameName } = require('../base/text.cjs');
const { teammatesLine } = require('../core/text/refused.cjs');
const { everyRow, personOf } = require('./here.cjs');
const { PHASE } = require('./phase.cjs');
const store = require('./store.cjs');
const trust = require('./trust.cjs');

// a plan is this clone's work too once a session here made it or the person's yes to it is kept here (steps/trust: the yes the gate
// reads); a record an AI adds takes nothing up, and with no home no yes is kept: git alone says whose it is
const takenUp = (io, id) => Boolean(io.home) && (everyRow(io).some((row) => row.t === PHASE && row.id === id && row.phase === 'created')
  || trust.isTrusted(io, store.readPlan(io, id)));

/** Each of `lines` ({ plan, line }: a line of a plan's file; the line that replaced it and the keep on it, where it holds them) that
 * another author than this clone commits as committed is marked with who (`author`); one blame per plan file, and kit's git port reads both
 * sides as blame names an author. Unmarked: this clone's own (not committed yet, its own commit), or git names no one here. -> lines */
async function markTeammates(io, lines) {
  const every = lines.flatMap((d) => [d, d.replaced, d.kept]).filter(Boolean);
  const me = every.length ? (await io.git.me()).mail : null;
  const files = [...new Set(every.map((d) => store.pathOf(d.plan)))];
  const blameOf = async (file) => (me ? store.blameHeld(io, file) : []);
  const blamed = new Map(await Promise.all(files.map(async (file) => [file, await blameOf(file)])));
  every.forEach((d) => {
    const held = blamed.get(store.pathOf(d.plan))[d.line - 1];
    if (held?.mail && held.mail.toLowerCase() !== me.toLowerCase()) d.author = held.author; // git reads a mail in any case
  });
  return lines;
}

/** THE answer to whose a plan is to this clone's sessions, and whose one `line` of it is -> the other author, where it is a teammate's.
 * A plan is read by its first line, its plan record, and only while no session here took it up. null: this clone's own. */
async function teammateOf(io, id, line = null) {
  if (line === null && takenUp(io, id)) return null;
  const [read] = await markTeammates(io, [{ plan: id, line: line ?? 1 }]);
  return read.author ?? null;
}

const DROPPED = ['aside']; // a plan set aside is history; a question of any other plan waits until answered, closed or not
/** THE questions that wait with someone on the team, for every reader that names them (the session start, `inbox`): each question a plan
 * among `views` (a draft, READY or closed; not one set aside) parked with someone (`to`) that no human answered yet, whoever wrote the plan
 * and on whichever branch, so a teammate who pulled it sees it too. `mine`: it waits for the person working here, by name; `author`: the
 * teammate who asked it, where another clone committed its line. -> [{ id, branch, title, q, text, to, source, mine, author? }] */
async function parkedWaiting(io, views) {
  const person = await personOf(io);
  const asked = await markTeammates(io, views.filter((v) => !DROPPED.includes(v.state)).flatMap((v) => v.questions
    .filter((q) => q.to && !isAnswered(v, q)).map((q) => ({ plan: v.id, line: q.line, branch: v.branch, title: v.title, q }))));
  return asked.map(({ plan, branch, title, q, author }) => ({ id: plan, branch, title, q: q.q, text: q.text, to: q.to, source: q.source,
    mine: Boolean(person) && sameName(q.to, person), ...(author && { author }) }));
}

/** The person's lines of `d`'s key that stand in `view` (base/text headsOf): the lines a person's line of that key written now replaces. */
const standingLinesOf = (view, d) => (isTheirs(d) ? headsOf(view.decisions.filter((o) => isTheirs(o) && sameSlot(o, d))) : []);

/** A person's decision written over a teammate's standing line of its key in the plan's file is refused, whoever sends it: `<plan>/<key>`
 * would name the new line in every record that named the old one, and no merge would show two people disagreed. -> [code, detail] | null */
async function teammatesLineRefused(io, batch, value) {
  if (batch.fresh || value.t !== 'decision') return null;
  const standing = await markTeammates(io, standingLinesOf(store.readPlan(io, batch.id), value));
  const [theirs] = standing.filter((d) => d.author);
  return theirs ? teammatesLine(`${batch.id}/${value.key}`, theirs.author) : null;
}

module.exports = { teammateOf, markTeammates, parkedWaiting, standingLinesOf, teammatesLineRefused };
