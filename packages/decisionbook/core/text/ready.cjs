// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The READY / not READY reply. READY says the freeze. Not READY says its progress (rows met of rows asked) and only what the
// write changed: a row said before is named by its code with what it counts now, one that did not move by its code alone; the whole
// list and the one add that supplies everything missing come with a `new` and with `ready`.
const { text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS, SHOWN: { ready: shown } } = require('../../contracts/codes.cjs');
const { planContractLine, rivalText } = require('./records.cjs');

const STANDARDS_SHOWN = 3;

/** One undecided key done two ways, as the question the AI relays: its top two ways with their counts and one file:line
 * each, then the /decide line that answers it. */
function standardLines(row) {
  const ways = row.values.slice(0, 2);
  const cited = ways.filter((way) => way.examples[0]);
  const slots = {
    family: shown.family(row.family),
    part: shown.part(row.part),
    facet: shown.facet(row.facet),
    m: row.m,
    ways: ways.map((way) => `${shown.way(way.value)} in ${way.n}`).join(', '),
    examples: cited.map((way) => `${shown.file(way.examples[0].file)}:${way.examples[0].line}`).join(', '),
    key: shown.standard(row.key),
    values: ways.map((way) => `"${shown.way(way.value)}"`).join(', '),
    files: shown.globs((row.globs || []).join(', ')),
  };
  return [filled(WORDS.standardWays, slots), `  ${filled(WORDS.standardAsk, slots)}`];
}

function standardsLines(rows) {
  const left = rows.length - STANDARDS_SHOWN;
  const more = left > 0 ? [filled(WORDS.standardsMore, { n: left })] : [];
  return [...rows.slice(0, STANDARDS_SHOWN).flatMap(standardLines), ...more];
}

function forksLine(row, level) {
  const counted = row.forks.join(', ') || 'none';
  const waits = row.waiting && row.waiting.length ? filled(WORDS.forksWait, { qs: row.waiting.join(', ') }) : '';
  const unread = row.unread && row.unread.length ? filled(WORDS.forksUnread, { asked: row.asked, files: shown.unread(row.unread.join(', ')) }) : '';
  return `${filled(WORDS.forksCounted, { counted, level: WORDS.levels[level], needs: row.needs })}${waits}${unread}`;
}

/** One rubric row a plan does not hold, then what the row counted: the forks, the standards to ask the person, the danger paths
 * that joined after the yes. `known`: the row was said before this write, so its sentence is not said again. */
function unmetLines(row, level, known) {
  const forks = row.forks ? [forksLine(row, level)] : [];
  const standards = row.standards ? standardsLines(row.standards) : [];
  const yes = row.yesFor && row.yesFor.length ? [filled(WORDS.yesAgain, { files: shown.yesFor(row.yesFor.join(', ')) })] : [];
  // the planned files not read yet, every one, as one plain list
  const read = row.notRead ? [filled(WORDS.researchRead, { read: row.read, needs: row.needs, files: row.notRead.join(', ') || 'none' })] : [];
  const guide = !known && row.forks ? [WORDS.askGuide] : []; // what to ask about: the gap list, a guide, never records
  return [known ? `${row.code}:` : `${row.code}: ${row.text}`, ...guide, ...forks, ...read, ...standards, ...yes, ...replacedLines(row)]
    .map((line) => `  ${line}`);
}

/** A person's standing decision this plan places nowhere (core/ready changedOf): its own key's rivals, the decision of it that it stands
 * beside, or the files of it it holds on; one line each. */
const replacedLines = (row) => (row.changed || []).map((c) => (c.rivals?.length ? `${c.ref}: ${rivalText(c)}` : filled(WORDS.replaceHeld,
  { ref: c.ref, value: shown.value(String(c.value)), files: shown.globs((c.files ?? []).join(', ')) })));

/** The one add as a draft to write and the call that reads it, last; above it, what its blanks must hold where that is not free text. */
function fillInLines(next) {
  if (!next) return [];
  const shapes = next.shapes ? `; ${next.shapes}` : '';
  return [`${WORDS.nextAdd}${shapes}:`, next.call];
}

/** The rows a plan misses, as a reply says them: with no `before`, every row; with it (a write's reply), the rows the write moved
 * in full and the rest by their codes on one line. */
function missingLines(o) {
  const moved = o.unmet.filter((row) => !o.before || o.before[row.id] !== JSON.stringify(row));
  const still = o.unmet.filter((row) => !moved.includes(row)).map((row) => row.code);
  return [...moved.flatMap((row) => unmetLines(row, o.level.level, Boolean(o.before && o.before[row.id]))),
    ...(still.length ? [`  ${WORDS.stillUnmet} ${still.join(', ')}`] : [])];
}

/** A plan's state after a write or a `ready`: READY (frozen, with the contract it took on), not READY (its progress, the rows,
 * then the fill-in), or the state of a parked, closed or replaced plan, which is only told. */
function readyLines(o) {
  if (o.state && o.state !== 'ready') return [`${o.id} ${o.state}`];
  const level = WORDS.levels[o.level.level];
  const parked = o.parked ? `; parked: ${o.parked}` : '';
  const promised = (o.promised || []).map(planContractLine);
  if (!o.ready) {
    const progress = filled(WORDS.progress, o.rows);
    return [`${o.id} not READY as ${level}${parked}: ${progress}`, ...missingLines(o), ...fillInLines(o.next), ...promised];
  }
  const askedOnce = o.here ? [] : [WORDS.askedOnce];
  const note = o.researchNote ? [filled(WORDS.researchNote, o.researchNote)] : []; // normal work grounded in little reading, said once
  return [`${o.id} READY as ${level}${parked}. ${WORDS.frozen}`, ...note, ...askedOnce, ...promised];
}

module.exports = { readyLines };
