// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. What a person's yes covers, and whose a record is. In an AI session a confirm is the person's yes when a person's prompt came
// after the plan's `new` and the plan as it stands neither runs higher nor holds a raising signal it did not hold at that prompt
// (core/level), and no record since changed its goal, tasks or checks (the person must see those first); what else changed the plan
// since (files within the bound) is kept on the yes as kinds. Outside a session it is the person's at their terminal. Who acts is kit's
// one answer; "could not tell" is never a yes. A record's decider is set here, never taken from the sender's words. A decision is the
// person's at their terminal; on their own whole sentence about it; or as their ANSWER to a question of the plan: their own whole
// clauses from a message after that question was written, that answer no other question better, with a value in the answer's words
// (kit's one test of each). So a later message on another subject, a piece of a sentence, an answer moved to another question, a
// value the answer does not hold or one that flips it makes nothing theirs. A reply the AI invited ("go with your suggestions")
// decides each question the AI's message before it showed with a proposal, as that proposal; setting a plan aside is their yes to
// the AI's question about that plan, in their next message.
const { person: { saidAfter }, said: { isAbout, sharedWith, names, notHeld, takesAll, saysYes } } = require('@atlasbound/kit');
const { isAi, isAnswered, heardIn, placedIn, shownBefore, sameWords } = require('../base/text.cjs');
const { foldPlan, planChange } = require('./fold.cjs');
const { grownSince } = require('./level.cjs');
const { notSaid, yesOutgrown, yesUnseen, supersedeUnasked, supersedeSelf } = require('./text/refused.cjs');

const CODE = 'confirm-not-asked';
const PERSON = 'the person'; // the one `by` the product writes for a person; the AI's is `ai`
const UNSEEN = ['amend', 'task', 'check']; // the plan's goal, tasks and checks: a yes covers them only once the person saw them

/** `actor`: who acts (kit's answer over this session's prompt rows); `rows`: the plan's records as the batch leaves
 * them; `view`: their fold. -> { amended: the kinds of record that changed the plan after the person saw it }, or
 * { refused: why this confirm is no person's yes }. */
function yesCovers({ actor, rows, view, danger }) {
  if (saidAfter(actor, view.at) !== 'yes') return { refused: notSaid(CODE, actor.why !== 'no-prompt-row') };
  if (actor.who === 'terminal') return { amended: [] };
  const last = Date.parse(actor.at);
  const seen = foldPlan(rows.filter((row, i) => !i || Date.parse(row.at) <= last));
  const grown = grownSince(seen, view, danger);
  if (grown.length) return { refused: yesOutgrown(grown) };
  const amended = rows.filter((row) => Date.parse(row.at) > last).map(planChange).filter(Boolean);
  const unseen = [...new Set(amended.filter((kind) => UNSEEN.includes(kind)))];
  return unseen.length ? { refused: yesUnseen(unseen) } : { amended };
}

/** Why `said` is no answer of the person to question `q` of `view` deciding `value` (null: it is). `unsaid`: no whole clauses of a
 * message of theirs since `since` (`cut`: a part of a negated sentence of theirs); `early`: theirs, from before the question; `moved`:
 * its list item quotes another question back, or (none quoted) another is named or shares more words, or it answers another already;
 * `part`: their answer is whole list items of their message (`items`: which; the ones the words touch and each one beside them that
 * quotes this question) and the words leave some of that out; `foreign` | `flipped`: value (kit). An answer whose item quotes this
 * question as the AI asked it is this question's, whatever words it shares with another. */
function notAnswer({ view, heard, shown }, { answers, said, value }, since) {
  const q = view.questions.find((one) => one.q === answers);
  const from = Date.parse(q.at) > Date.parse(since) ? q.at : since;
  const prompt = heardIn(heard, from, said);
  if (!prompt) return unheard(heard, { since, from }, said);
  const place = placedIn(prompt, said, view.id);
  const not = misplaced(view, q, said, { prompt, place }) || notHeld(value, said, q.text);
  // a sentence that is no plain answer and takes the AI's proposals whole is judged as that instead; a list item that quotes its
  // question back is no such sentence
  const why = not && !place.of.length && takesAll(said) ? notTaken({ view, heard, shown }, q, value, prompt) : not;
  return why === 'part' ? { not: why, items: place.items } : why; // a `part` names the list items their answer is
}
const unheard =(heard, { since, from }, said) => (heardIn(heard, since, said) && 'early') || (heardIn(heard, from, said, 'negation') && 'cut') || 'unsaid';

/** `moved` or `part` (notAnswer), null where the person's own `said` stands under question `q` whole. */
function misplaced(view, q, said, { prompt, place: { part, of } }) {
  if (of.some((one) => one !== q.q)) return 'moved';
  if (part) return 'part';
  if (of.length) return null;
  const others = view.questions.filter((one) => one.q !== q.q && !(Date.parse(one.at) > Date.parse(prompt.at)));
  const elsewhere = !names(said, q.q) && others.some((one) => names(said, one.q) || sharedWith(said, one.text) > sharedWith(said, q.text));
  return elsewhere || view.decisions.some((d) => d.answers !== q.q && d.answers !== null && !isAi(d.by) && d.said === said) ? 'moved' : null;
}

/** Why a sentence of the person that takes the AI's proposals whole ("go with your suggestions", kit) does not decide question `q` as
 * `value` (null: it does, and one such sentence decides every question it was shown for). `unshown`: the AI's last message before
 * theirs (`shown`: what each turn's last message showed, steps/open) did not show `q` with its proposal, or `q` has none;
 * `reworded`: `value` is not that proposal as it was shown. */
function notTaken({ view, heard, shown }, q, value, prompt) {
  const told = shownBefore(shown, heard, prompt.at, view.id);
  if (!q.proposal || !told || !told.qs.includes(q.q)) return 'unshown';
  return sameWords(value, q.proposal) ? null : 'reworded';
}

/** Why a record its sender claims for a person is not theirs (null: it is theirs). Typed by them at their terminal it is. An unlink
 * (it names a link, not a subject) is theirs after a prompt of theirs since. A decision stands on their words (`heard`: the prompt
 * rows kept here, sealed): its `said` their whole clauses after `since` about its key and value, or their answer to its question. */
function notOwn({ actor, record, heard, shown, view }, since) {
  if (isAi(record.by)) return 'ai';
  if (actor.who === 'terminal') return null;
  if (record.t !== 'decision') return saidAfter(actor, since) === 'yes' ? null : 'unsaid';
  const said = typeof record.said === 'string' ? record.said : '';
  const asked = view.questions.some((q) => q.q === record.answers);
  if (asked) return notAnswer({ view, heard, shown }, { answers: record.answers, said, value: String(record.value) }, since);
  return heardIn(heard, since, said) && isAbout(said, `${record.key} ${record.value}`) ? null : 'unsaid';
}
const asWhy = (why) => (typeof why === 'string' ? { not: why } : why); // a reason as { not, items? }

/** Whether setting plan `view` aside is the person's: typed at their terminal, or their answer to the AI's question: `said` is their
 * own whole clauses of a message since `since` (this session's start), a yes (kit), and the AI's LAST message before that one (the
 * newest `shown` row, no other message of theirs between) named the plan and asked whether it is set aside. A sentence of theirs the
 * AI reads as one with no question put first, or a yes to a message that asked something else after an older one asked, is not it. */
function asideOwn({ actor, record, heard, shown, view }, since) {
  if (actor.who === 'terminal') return true;
  if (isAi(record.by) || typeof record.said !== 'string') return false;
  const reply = heardIn(heard, since, record.said);
  const told = reply && shownBefore(shown, heard, reply.at, view.id);
  return Boolean(told && told.aside) && saysYes(record.said);
}

/** From when a claim must stand: a decision that replaces a person's, since this plan's proposal of it; any other, since its `new`. */
const sinceOf = (view, replaces, proposal) => (replaces.length && proposal ? proposal.at : view.at);

/** A record that is never the person's, with whose it is (null: it may be theirs): a proposal is the AI's; an answer to a question
 * parked with someone else is that someone's when it quotes them and says where, else the AI's. */
function notPersons(view, record) {
  if (record.proposed) return { by: 'ai' };
  const parked = view.questions.find((q) => q.q === record.answers && q.to);
  return parked ? { by: record.said && record.source ? parked.to : 'ai' } : null;
}

/** Whose a decision or an unlink is: the person's when it is theirs since the plan's `new`, else the AI's with why (`not`). One that
 * replaces a person's decision (`replaces`) is the person's own act at their terminal, or their answer to the proposal of it
 * (`proposal`, in this plan): theirs since that proposal; else it is refused. -> { by: PERSON | ai, not? } | { refused: [code, detail] } */
function whoseRecord({ actor, record, view, replaces, proposal, heard, shown }) {
  if ((record.supersedes || []).includes(`${view.id}/${record.key}`)) return { refused: supersedeSelf(record.key) };
  const other = notPersons(view, record);
  if (other) return other;
  const not = asWhy(notOwn({ actor, record, heard, shown, view }, sinceOf(view, replaces, proposal)));
  if (!replaces.length) return not ? { by: 'ai', ...not } : { by: PERSON };
  const answered = (actor.who === 'terminal' || proposal !== null) && !not;
  return answered ? { by: PERSON } : { refused: supersedeUnasked(replaces.map((d) => d.ref), proposal) };
}

/** Whether the person's answers are their yes to the plan: it holds a blocking question, each has their answer, and `added` (the
 * records of this write) brought one of them; a plan with no blocking question waits for their yes in words. */
function answersAreYes(view, added) {
  const blocking = view.questions.filter((q) => q.blocking);
  if (!blocking.length || !blocking.every((q) => isAnswered(view, q))) return null;
  const brought = added.filter((r) => r.t === 'decision' && r.by === PERSON && blocking.some((q) => q.q === r.answers));
  return brought.length ? [...new Set(brought.map((r) => r.said).filter(Boolean))].join(' ') : null;
}

module.exports = { yesCovers, whoseRecord, asideOwn, answersAreYes, PERSON };
