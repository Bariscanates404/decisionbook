// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// the plan pack of a work's area, by the cards' walk (steps/area) and core/pack's text; said at a task prompt told to plan, and by hand
// (`decisionbook plan`).
const { errors: { isFail } } = require('@atlasbound/kit');
const { RELATED_CARDS, absentLines } = require('../core/text/recall.cjs');
const { packOf } = require('../core/pack.cjs');
const { untouchedOf } = require('../core/recall.cjs');
const { workFiles, namedFiles, areaOf } = require('./area.cjs');
const { sessionRead, sessionAdd } = require('./here.cjs');
const { researchWhere } = require('./host.cjs');
const store = require('./store.cjs');

/** The earlier plans of the work `text` names (its files and its words) and the files the session touched and the branch changed, the
 * best RELATED_CARDS as the walk ranks them, each with what it built and why it was picked; `named`: its files; `absent`: what was not
 * found. */
async function areaFor(io, text, session) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const files = await workFiles(io, web, { text, session, branch });
  const { cards, n } = await areaOf(io, web, { files, text, branch }, RELATED_CARDS);
  const viewOf = (card) => ({ ...web.views.find((v) => v.id === card.id), built: card.built ? card.built.files : [], picked: card.picked });
  return { files, named: namedFiles(io, text), n, views: cards.slice(0, RELATED_CARDS).map(viewOf),
    absent: absentLines({ found: cards.length, unread: store.unreadPlans(web), untouched: untouchedOf(web, files) }) };
}

/** The pack; a record that later uses one of its plans is linked to it as read through `door`. A coded failure of the walk packs no
 * earlier plan, counted in n (recallUnread), and says the plans could not be read, with its code. -> { pack, n } */
async function packFor(io, { text, session, door }) {
  let area = { files: [], named: [], views: [], n: { recallUnread: 1 } };
  try {
    area = await areaFor(io, text, session);
  } catch (err) {
    if (!isFail(err)) throw err;
    area.absent = absentLines({ unread: [{ file: store.pathOf('*'), code: err.code }] }); // never "no record here": none was read
  }
  const first = await researchWhere(io, text);
  const { views, files: seeds, named, absent } = area;
  const pack = packOf({ views, seeds, named, words: text, danger: store.dangerOf(io), first, absent, session });
  sessionRead(io, session, pack.ids, door);
  if (pack.refs.length) sessionAdd(io, session, { t: 'packed', refs: pack.refs }); // a file card of this session does not say them again
  return { pack, n: { ...area.n, packed: 1, packChars: pack.text.length } };
}

// `decisionbook plan <path|words>`: read-only; none named, what the branch changed
async function planPack({ rest }, io) {
  const { pack, n } = await packFor(io, { text: rest.join(' '), session: io.session ?? null, door: 'related' });
  return { out: { text: pack.text, ids: pack.ids }, code: 'plan-shown', n };
}

module.exports = { packFor, planPack };
