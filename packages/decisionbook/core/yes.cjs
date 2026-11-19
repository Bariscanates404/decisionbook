// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a person's yes covers, and whose a record is: the decider is set here, never taken from the sender's words. A confirm is
// the person's yes after a prompt of theirs since the plan's `new`, on the plan as they saw it (core/level). What the person meant is
// their own AI's reading, written in `value`; the product reads no meaning. It checks one thing on a record made as theirs in an AI
// session: its `said` is whole clauses of a message they typed in this session (kit's one test over the sealed prompt rows).
const { person: { saidAfter }, said: { notTheirs } } = require('@atlasbound/kit');
const { isAi, saidOf, isAnswered, personAnswers, isAfter, isKeep, personsOwn, unsealed, sealKey, wordCut, asList } = require('../base/text.cjs');
const { HEARD } = require('../contracts/rubric.cjs');
const { foldPlan, planChange } = require('./fold.cjs');
const { grownSince } = require('./level.cjs');
const { unstanding } = require('./ready.cjs');
const { notSaid, yesOutgrown, yesUnseen, refusedRefs } = require('./text/refused.cjs');

const NOT_ASKED = 'confirm-not-asked'; // a confirm that is no yes of the person's
const NOT_THEIRS = 'said-not-theirs'; // a record made as the person's whose words they did not type in this session
const PERSON = 'the person'; // the one `by` the product writes for a person
const AI = 'ai'; // the AI's `by`, and why a record is not the person's: an AI's own
const UNSEEN = ['amend', 'task', 'check']; // the plan's goal, tasks and checks: a yes covers them only once the person saw them

/** `actor`: who acts (kit's answer over this session's prompt rows); `rows`: the plan's records as the batch leaves
 * them; `view`: their fold. -> { amended: the kinds of record that changed the plan after the person saw it }, or
 * { refused: why this confirm is no person's yes }. */
function yesCovers({ actor, rows, view, danger }) {
  if (saidAfter(actor, view.at) !== 'yes') return { refused: notSaid(NOT_ASKED, actor.why !== 'no-prompt-row') };
  if (actor.who === 'terminal') return { amended: [] };
  const seen = foldPlan(rows.filter((row, i) => !i || !isAfter(row.at, actor.at)));
  const grown = grownSince(seen, view, danger);
  if (grown.length) return { refused: yesOutgrown(grown) };
  const amended = rows.filter((row) => isAfter(row.at, actor.at)).map(planChange).filter(Boolean);
  const unseen = [...new Set(amended.filter((kind) => UNSEEN.includes(kind)))];
  return unseen.length ? { refused: yesUnseen(unseen) } : { amended };
}

/** `said` as it is stored, where it is whole clauses of one of the person's prompts `heard` in this session (after `since`, where
 * given); else null. A prompt row keeps its clauses sealed, so this is kit's test over their digests. */
function theirWords(heard, said, since = null) {
  return whyNotTheirs(heard, said, since).includes(null) ? wordCut(said, HEARD.said) : null;
}
/** Per message of theirs here (after `since`), in the order typed: kit's reason `said` is not theirs there, or null where it is. */
const whyNotTheirs = (heard, said, since = null) => (heard || []).filter((row) => !since || isAfter(row.at, since))
  .map((row) => notTheirs(said, unsealed(row.said), sealKey));
/** The refusal of words that are not theirs (no message of theirs here: said first), with each message's reason. -> [code, detail] */
const unsaid = (code, heard, whys = []) => [code, notSaid(code, (heard || []).length > 0, whys)];

/** A record that is never the person's, with whose it is (null: it may be theirs): a proposal is the AI's; an answer to a question
 * parked with someone else (never the person) is that someone's when it quotes them and says where, else the AI's. */
function notPersons(view, record) {
  if (record.proposed) return { by: AI };
  const parked = view.questions.find((q) => q.q === record.answers && q.to && q.to.trim().toLowerCase() !== PERSON);
  return parked ? { by: record.said && record.source ? parked.to : AI } : null;
}

/** A person's answer: each ref in its `supersedes` or `keeps` read as a question's (core/ready), and each its question names placed. */
function refsUnplaced(view, decisions, record) {
  const placed = [...asList(record.supersedes), ...asList(record.keeps)];
  const unknown = unstanding(view, decisions, placed);
  const unplaced = (view.questions.find((q) => q.q === record.answers)?.supersedes ?? []).filter((ref) => !placed.includes(ref));
  return (unknown.length && refusedRefs('supersede-unknown', unknown)) || (unplaced.length && refusedRefs('replace-unplaced', unplaced)) || null;
}

/** Whose a decision, a waiver or an unlink is: one not the person's replaces no person's decision of `decisions` (the web's) and keeps
 * none; at their terminal as typed; an unlink after their prompt since `new`; else on their words -> { by, said?, fresh? } | { refused } */
function whoseRecord({ actor, record, view, decisions, heard }) {
  const other = isAi(record.by) ? { by: AI } : notPersons(view, record);
  if (other) return othersOwn(other, record, decisions.filter((d) => !d.proposed && !isAi(d.by)).map((d) => d.ref), view);
  const unnamed = record.t === 'decision' && !isKeep(record) && unplacedLines(view, decisions, record, actor.who !== 'terminal');
  if (unnamed) return { refused: refusedRefs(...unnamed) };
  if (actor.who === 'terminal') return { by: PERSON }; // their own act at their terminal: what they typed stands as typed
  return record.t === 'unlink' ? { by: saidAfter(actor, view.at) === 'yes' ? PERSON : AI } : onTheirWords(record, view, decisions, heard);
}
/** A record not the person's (`other`, its decider: the AI, or one a parked question relayed), refused where it replaces one of `theirs`
 * (the person's), keeps any, or decides a key a person decided in this plan (`view`): only the person changes it; the AI may propose. */
function othersOwn(other, record, theirs, view) {
  const replaces = asList(record.supersedes).filter((ref) => theirs.includes(ref));
  if (replaces.length) return { refused: refusedRefs('supersede-theirs', [...new Set(replaces)]) };
  if (asList(record.keeps).length) return { refused: refusedRefs('replace-unplaced', record.keeps) };
  const over = record.t === 'decision' && !record.proposed && view.decisions.some((d) => d.key === record.key
    && (d.scope ?? null) === (record.scope ?? null) && !d.proposed && !isAi(d.by));
  return over ? { refused: refusedRefs('decision-theirs', [`${view.id}/${record.key}`]) } : other;
}
/** In an AI session: the person's on their words (a waiver's after `new`, an answer ending a conflict after its replace question), each
 * ref placed; `fresh`: words after `new`. */
function onTheirWords(record, view, decisions, heard) {
  const ends = decisions.some((d) => asList(record.supersedes).includes(d.ref) && d.rivals.length);
  const since = (record.t === 'waiver' && view.at) || (ends && view.questions.find((q) => q.q === record.answers)?.at) || null;
  const said = theirWords(heard, saidOf(record), since);
  if (said === null) return { refused: unsaid(NOT_THEIRS, heard, whyNotTheirs(heard, saidOf(record), since)) };
  const unplaced = record.t === 'decision' && refsUnplaced(view, decisions, record);
  return unplaced ? { refused: unplaced } : { by: PERSON, said, fresh: theirWords(heard, saidOf(record), view.at) !== null };
}

/** The write never makes a conflict, only a merge does: a person's decision of a key this plan holds a person's line of (one it is not
 * compatible with: core/web) names its own `<plan>/<key>`, and one answering a conflict (this plan's line in one, or a line it names)
 * names every line of it; in a session it answers the replace question naming them all, so the person saw the conflict first.
 * -> [code, every ref it must name] | null */
function unplacedLines(view, decisions, record, inSession) {
  const named = asList(record.supersedes);
  const ofSlot = (d) => d.key === record.key && (d.scope ?? null) === (record.scope ?? null) && d.state === 'active' && personsOwn(d);
  const differs = (d) => d.value !== record.value; // the same words with another value differ too
  const involved = decisions.filter((d) => ofSlot(d) && (d.plan === view.id ? differs(d) || d.rivals.length : named.includes(d.ref)));
  const lines = involved.flatMap((d) => [d, ...d.rivals]).filter((o) => o.plan !== view.id || differs(o)); // its own words again: no rival
  const needed = [...new Set(lines.map((o) => o.ref))];
  if (needed.some((ref) => !named.includes(ref))) return ['decision-unnamed', needed];
  const shown = asList(view.questions.find((q) => q.q === record.answers)?.supersedes); // the replace question it answers
  return inSession && involved.some((d) => d.rivals.length) && needed.some((ref) => !shown.includes(ref)) ? ['conflict-unasked', needed] : null;
}

/** Whether setting a plan aside is the person's: at their terminal, or on their own words of this session. */
const asideOwn = ({ actor, record, heard }) => actor.who === 'terminal' || (!isAi(record.by) && theirWords(heard, saidOf(record)) !== null);

/** Whether the person's answers are their yes: every blocking question has their answer, none keeps an old decision (a keep is no
 * yes), and `added` (this write's records in words after the plan's `new`) brought one; else their yes in words. -> words | null */
function answersAreYes(view, added) {
  const blocking = view.questions.filter((q) => q.blocking);
  if (!blocking.length || !blocking.every((q) => isAnswered(view, q))) return null;
  if (blocking.some((q) => isKeep(view.decisions.findLast((d) => personAnswers(d, q))))) return null;
  const brought = added.filter((r) => r.t === 'decision' && r.by === PERSON && blocking.some((q) => q.q === r.answers));
  return brought.length ? wordCut([...new Set(brought.map((r) => r.said).filter(Boolean))].join(' '), HEARD.said) : null;
}

module.exports = { yesCovers, whoseRecord, theirWords, whyNotTheirs, unsaid, asideOwn, answersAreYes, PERSON, NOT_ASKED, NOT_THEIRS };
