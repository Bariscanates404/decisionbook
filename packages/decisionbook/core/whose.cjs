// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. THE one answer to whose a record is (`by` set here, never from the sender's fields): the sender says whose words a decision holds
// and quotes them in `said`; ONE check: they stand in a message the person typed here, or where the product read `source` itself; whole
// sentences are kept. Typed: the person's; a teammate's where the format names them or the person allowed the host's prompt listing them,
// else the person's own words, never read from the prose. At source: that one's with its address; it replaces or keeps nothing, no yes.
const { person: { saidAfter }, said: { sentencesOf, quotedAt, wholeOf, voicedBy, isAbout }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { isAi, saidOf, isKeep, isTheirs, personsOwn, sameSlot, isLive, isKeeping, foundIn, wholeAt, wordCut, asList,
  refsNamed, namedInConflict, conflictsIn, otherOf } = require('../base/text.cjs');
const { HEARD } = require('../contracts/rubric.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { unstanding } = require('./ready.cjs');
const { notSaid, refusedRefs, unknownRefs, keptOtherValue } = require('./text/refused.cjs');
const { unproven, blanket } = require('./text/whose.cjs');

const NOT_THEIRS = 'said-not-theirs'; // a record made as the person's whose words they did not type in this session
const UNASKED = 'conflict-unasked'; // an answer ending a conflict that no question on record showed the person before they typed it
const UNPROVEN = 'said-unproven'; // someone's words the person did not type, which the product could not read where the record says
const AI = 'ai'; // the AI's `by`, and why a record is not the person's: an AI's own
const BLANKET = 'replace-blanket'; // someone else's standing decision replaced on words that do not name it
const NO_WHOSE = 'decision-whose'; // a decision that does not say whose words it holds
/** A decision as its sender states whose words it holds: `whose` (the person, a teammate by name, `assumed`: the AI's own) is the one way
 * in, never a `by` or `saidBy` it wrote; an answer takes from its question what it leaves out (key, a why naming it, the proposal as its
 * value). -> the record as judged (`by`: the AI's or claimed as the person's; `saidBy`: the teammate) | null: no `whose` */
function claimed({ whose, ...sent }, person, view) {
  if (typeof whose !== 'string' || !whose.trim()) return null;
  const asked = view.questions.find((q) => q.q === sent.answers);
  const word = whose.trim().toLowerCase();
  const other = !WORDS.whose.person.includes(word) && otherOf({ saidBy: whose }, person) ? whose.trim() : undefined;
  const taken = asked && { key: asked.decides, why: filled(WORDS.answerWhy, asked) };
  return { ...taken, ...(asked?.proposal && { value: asked.proposal }), ...sent,
    by: WORDS.whose.assumed.includes(word) ? AI : '', saidBy: WORDS.whose.assumed.includes(word) ? undefined : other };
}

/** `said` as it is stored: the whole sentences of the person's message here (after `since`) it stands in (at `place`); else null. */
const theirWords = (heard, said, since = null, found = foundIn(heard, said, since)) => found && wordCut(wholeAt(found), HEARD.said);
/** The refusal of words that are not theirs (no message of theirs here: said first). -> [code, detail] */
const unsaid = (code, heard) => [code, notSaid(code, (heard || []).length > 0)];

/** Why `said` is not where the product read the record's source itself (`read`: { text } | { unread: why }), or null where it is. */
const notRead = (read, said) => (!read && 'no-source') || read.unread || (quotedAt(said, sentencesOf(read.text)).length ? null : 'not-there');
/** The whole sentences of the source the words stand in, as stored. */
const sourceWords = (read, said, units = sentencesOf(read.text)) => wordCut(wholeOf(units, quotedAt(said, units)[0]), HEARD.said);

/** Where typed words (`found`) stand: a teammate's by format or the person's Allow (`shown`); else the person's own, the whole sentence. */
function typedAs({ record, person, shown }, found, other) {
  const voiced = other ? found.places.find((place) => voicedBy(found.units, place, other)) : undefined;
  const said = wordCut(wholeAt(found, voiced), HEARD.said);
  const allowed = other && !voiced && (shown || []).find((one) => one.items.some((item) => item.who === other && item.said === said));
  return { by: person, said, saidBy: voiced || allowed ? other : undefined, source: voiced || allowed ? WORDS.saidInSession : undefined,
    words: saidOf(record), ...(allowed && { confirmed: filled(WORDS.whoseConfirmed, allowed) }) };
}

/** Words found nowhere the record may stand on: typed before the question that ends a conflict, else not theirs, or not read. */
const unfound = ({ record, heard, ended }, other, why) => (ended.length && theirWords(heard, saidOf(record)) !== null
  && refusedRefs(UNASKED, ended))
  || (other ? [UNPROVEN, unproven(why, { who: other, source: record.source, heard })] : unsaid(NOT_THEIRS, heard));

/** THE one judgement of a record made as a human's in a session: where its quoted words stand (typed here, or read at the record's
 * source). -> { by, said, saidBy?, source?, words?, read? } | { refused: [code, detail, ask?] } */
function heldAs(ask) {
  const { record, heard, since, person, read } = ask;
  const other = otherOf(record, person);
  const found = foundIn(heard, saidOf(record), since);
  const typed = found && typedAs(ask, found, other);
  const why = other && notRead(read, saidOf(record));
  const atSource = other && !why && { by: person, said: sourceWords(read, saidOf(record)), saidBy: other, source: record.source,
    read: true };
  return (typed?.saidBy && typed) || atSource || typed || { refused: unfound(ask, other, why) };
}

/** A person's answer: each ref in its `supersedes` or `keeps` read as a question's (core/ready), and each its question names placed. */
function refsUnplaced(view, decisions, record) {
  const placed = refsNamed(record);
  const unknown = unstanding(view, decisions, placed);
  const unplaced = (view.questions.find((q) => q.q === record.answers)?.supersedes ?? []).filter((ref) => !placed.includes(ref));
  return (unknown.length && unknownRefs(unknown, decisions)) || (unplaced.length && refusedRefs('replace-unplaced', unplaced)) || null;
}

/** `sent` with the conflict lines its record's answer ends (`ended`) and the time its words must come after (`since`: a waiver's after
 * `new`, such an answer's after its replace question). */
function withSince(sent) {
  const { record, view, decisions } = sent;
  const ended = [...new Set(conflictsIn(namedInConflict(record, decisions)).flatMap((conflict) => conflict.refs))];
  const since = (record.t === 'waiver' && view.at) || (ended.length > 0 && view.questions.find((q) => q.q === record.answers)?.at) || null;
  return { ...sent, ended, since };
}

/** Whose a decision, a waiver or an unlink is -> { by, said?, saidBy?, source?, fresh? } | { refused }: the AI's own is the AI's and,
 * like an answer read at its source, changes no person's decision (othersOwn); the person's at their terminal as typed, an unlink after
 * their prompt since `new`, else as its words stand (heldAs); `fresh`: words after `new`. `sent`: { actor, record, view, decisions, heard,
 * person, read } */
function whoseRecord(sent) {
  const ask = withSince(sent);
  const typing = ask.actor.who === 'terminal';
  const { words, ...held } = takenAs(ask, typing);
  if (held.refused) return held;
  const { read, ...other } = held; // read at its source: no typed words behind it, so it gives no yes
  if (other.by === AI || read) return othersOwn({ ...other, ...(read && { fresh: false }) }, ask);
  const refused = ask.record.t === 'decision' && decisionRefused(ask, typing, words);
  return refused ? { refused } : { ...other, ...(words !== undefined && { fresh: theirWords(ask.heard, words, ask.view.at) !== null }) };
}
/** A person's decision that does not place the lines it must; in a session also each ref of its question, and no blanket answer over
 * someone else's line. -> [code, detail] | null */
const decisionRefused = (ask, typing, words) => unplacedLines(ask.view, ask.decisions, ask.record, !typing)
  || (!typing && (refsUnplaced(ask.view, ask.decisions, ask.record) || blanketOver(ask, words))) || null;

/** The decisions of someone else (a line a teammate recorded, an answer someone gave) that `record` replaces on words that do not
 * name them: what they are about, word by word, their key's or their value's (a value that is only a part of a word names nothing). */
const unnamedElses = (record, decisions, person) => decisions.filter((d) => asList(record.supersedes).includes(d.ref) && isTheirs(d)
  && Boolean(d.saidBy || otherOf({ saidBy: d.by }, person)) && !isAbout(saidOf(record), `${d.key} ${d.value}`));

/** A blanket answer covers the open questions, never someone else's standing decision: that is replaced on the person's words that
 * name it, or on their answer to a question that showed it (its `supersedes` names it), typed after it was asked. One message may
 * answer every question, those that show a decision to replace and the others. -> [code, detail] | null */
function blanketOver({ record, view, decisions, person, heard }, words) {
  const asked = view.questions.find((q) => q.q === record.answers);
  const shown = (d) => asList(asked?.supersedes).includes(d.ref) && theirWords(heard, words, asked.at) !== null;
  const own = unnamedElses(record, decisions, person);
  return own.length && !own.every(shown) ? [BLANKET, blanket(own)] : null;
}

/** What a record is taken as before its lines are placed: the AI's own, the person's act at their terminal (`typing`: as they typed
 * it), their unlink, else what its words are held as. */
function takenAs(ask, typing) {
  const { actor, record, view, person } = ask;
  if (record.proposed || (isAi(record.by) && !record.saidBy)) return { by: AI };
  if (typing) return { by: person, saidBy: otherOf(record, person) ?? undefined };
  return record.t === 'unlink' ? { by: saidAfter(actor, view.at) === 'yes' ? person : AI } : heldAs(ask);
}

/** A record that stands on no words the person typed (`other`: the AI's own, or an answer read at its source), refused where it
 * replaces a human's line, keeps any, or decides a key a human decided in this plan: only the person's own words change those. */
function othersOwn(other, { record, decisions, view }) {
  const theirs = decisions.filter(isTheirs).map((d) => d.ref);
  const replaces = asList(record.supersedes).filter((ref) => theirs.includes(ref));
  if (replaces.length) return { refused: refusedRefs('supersede-theirs', [...new Set(replaces)]) };
  if (asList(record.keeps).length) return { refused: refusedRefs('keep-theirs', record.keeps) };
  const over = record.t === 'decision' && !record.proposed && view.decisions.some((d) => sameSlot(d, record) && isTheirs(d));
  return over ? { refused: refusedRefs('decision-theirs', [`${view.id}/${record.key}`]) } : other;
}

/** A READY plan's own value said again under its key, naming no line: a keep that would take the line's place, and a merge reads none. */
const ownValueAgain = (view, record, decisions, own) => view.stage !== 'draft' && !refsNamed(record).length
  && decisions.some((d) => d.ref === own && isLive(d) && personsOwn(d) && d.value === record.value);
/** The write never makes a conflict, only a merge does: a person's decision of a key this plan holds a person's line of (another value)
 * names its own `<plan>/<key>`; one answering a conflict (this plan's line in one, or one it names, any key, a keep's or not) names every
 * line of it, replaced or the one whose decision it keeps; in a session it answers the replace question naming them all (the person saw
 * the conflict first). -> [code, detail: every ref it must name] | null */
function unplacedLines(view, decisions, record, inSession) {
  const named = asList(record.supersedes);
  const own = `${view.id}/${record.key}`;
  if (asList(record.keeps).includes(own) || ownValueAgain(view, record, decisions, own)) return refusedRefs('keep-own-key', [own]);
  const ofSlot = (d) => !isKeep(record) && sameSlot(d, record) && isLive(d) && personsOwn(d);
  const differs = (d) => d.value !== record.value; // the same words with another value differ too
  const involved = [...decisions.filter((d) => ofSlot(d) && (d.plan === view.id ? differs(d) || d.conflict : named.includes(d.ref))),
    ...namedInConflict(record, decisions)];
  const lines = involved.flatMap((d) => d.conflict?.lines ?? [d]).filter((o) => o.plan !== view.id || differs(o)); // its own words: none
  const keeps = decisions.filter((k) => isKeeping(k) && !k.supersededBy && asList(k.keeps).some((ref) => named.includes(ref)));
  const needed = [...new Set([...lines, ...keeps].map((o) => o.ref))];
  const every = [...new Set([...lines, ...keeps])];
  const taken = asList(record.keeps).filter((ref) => every.filter((o) => o.ref === ref).length === 1); // a ref of one line of it
  const other = every.find((o) => taken.includes(o.ref) && o.value !== record.value); // a keep of a decision the answer does not take
  if (other) return keptOtherValue(other);
  if (taken.length > 1 || !needed.every((ref) => named.includes(ref) || taken.includes(ref))) return refusedRefs('decision-unnamed', needed);
  const shown = asList(view.questions.find((q) => q.q === record.answers)?.supersedes); // the replace question it answers
  return inSession && involved.some((d) => d.conflict) && needed.some((ref) => !shown.includes(ref)) ? refusedRefs(UNASKED, needed) : null;
}

/** Whether an act only the person gives (set aside, put off) is theirs: at their terminal, or on their own words of this session. */
const saidOwn = ({ actor, record, heard }) => actor.who === 'terminal' || (!isAi(record.by) && theirWords(heard, saidOf(record)) !== null);

module.exports = { whoseRecord, claimed, heldAs, NO_WHOSE, theirWords, unsaid, saidOwn, AI, NOT_THEIRS };
