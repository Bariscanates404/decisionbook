// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const { errors: { isFail } } = require('@atlasbound/kit');
const { isTaskPrompt } = require('../contracts/shapes.cjs');
const { promptWords } = require('../base/text.cjs');
const { WORDS } = require('../contracts/codes.cjs');
const { sessionAdd, saidByPack, keepReads } = require('./here.cjs');
const { eventFile } = require('./host.cjs');
const { RECALL_BYTES } = require('../core/text/recall.cjs');
const { SEEDS, namedFiles, branchFiles, workFiles, cardsFor } = require('./area.cjs');
const { packFor } = require('./pack.cjs');
const { planPrompt } = require('./read.cjs');
const { contractSay, promptContract } = require('./promise.cjs');
const store = require('./store.cjs');

const PACKED = ['prompt-nudge']; // where a task prompt is told to plan, the plan pack is its area's text instead of the cards
// the branch's open plan was said, or the person's answers to it were bound: no card or pack sends the session to a new one
const HELD = ['prompt-resume', 'prompt-earlier', 'answers-bound'];

// a coded failure of the walk keeps today's answer, counted in n (recallUnread), so the nudge and the pack never go; a statement the
// prompt holds is kept and its contract said in this same answer
async function recallPrompt(event, io) {
  const contract = await promptContract(event, io);
  const asked = await planPrompt(event, io);
  const say = [...contract.say, ...(asked.out.say || [])];
  const said = { ...asked, out: { ...asked.out, ...(say.length && { say }) }, n: { ...asked.n, ...contract.n } };
  const text = String(event.prompt || '').trim();
  if (HELD.includes(said.code) || !isTaskPrompt(text)) return said;
  const session = event.session_id ?? null;
  if (PACKED.includes(said.code)) return promptPack(said, text, session, io);
  try {
    return await promptCards(said, text, session, io);
  } catch (err) {
    if (!isFail(err)) throw err;
    return { ...said, n: { ...said.n, recallUnread: 1 } };
  }
}

async function promptCards(said, text, session, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const files = await workFiles(io, web, { text, session, branch });
  const nudge = said.out.say || [];
  const room = RECALL_BYTES - Buffer.byteLength(nudge.map((s) => s.text).join(''));
  const { say, n } = await cardsFor(io, web,
    { files, words: files.length ? [] : promptWords(text), branch, session, said: saidByPack(io, session) }, room);
  if (!n.cards) return { ...said, n: { ...said.n, ...n } };
  return { out: { code: 'prompt-recall', say: [...say, ...nudge] }, code: 'prompt-recall', n: { ...said.n, ...n, nudged: nudge.length } };
}

// the pack is said once per context by the cli's one rule, a later different one as its short line; a record that uses one of its plans
// is linked
async function promptPack(said, text, session, io) {
  const { pack, n } = await packFor(io, { text, session, door: 'card' });
  const say = [...said.out.say, { key: 'decisionbook.pack', text: pack.text, short: WORDS.packShort }];
  return { ...said, out: { ...said.out, say }, n: { ...said.n, ...n } };
}

// an event with no session is no one's: nothing is given
async function recallFile(event, io) {
  const file = await eventFile(event, io);
  if (!file) return { out: { code: 'recall-none' }, code: 'recall-none' };
  if (!event.session_id) return { out: { code: 'recall-unkept' }, code: 'recall-unkept' };
  const contract = await contractSay(io, { file });
  const room = RECALL_BYTES - Buffer.byteLength(contract.say.map((s) => s.text).join(''));
  const { say, n } = await cardsFor(io, store.readWeb(io), { files: [file], words: [], branch: await io.git.branch(),
    session: event.session_id, said: saidByPack(io, event.session_id) }, room);
  sessionAdd(io, event.session_id, { t: 'file', file });
  if (event.tool_name === 'Read') keepReads(io, event.session_id, [file], 'Read');
  const given = [...contract.say, ...(n.cards ? say : [])];
  const code = (n.cards && 'recall-given') || (contract.say.length && 'recall-contract') || 'recall-none';
  return { out: { code, file, ...(given.length ? { say: given } : {}) }, code, n: { ...n, ...contract.n } };
}

async function related({ rest }, io) {
  const web = store.readWeb(io);
  const branch = await io.git.branch();
  const files = (rest.length ? namedFiles(io, rest.join(' ')) : await branchFiles(io, web, branch)).slice(0, SEEDS);
  const { cards, n } = await cardsFor(io, web, { files, words: files.length ? [] : promptWords(rest.join(' ')), branch, session: io.session });
  return { out: { cards }, code: cards.length ? 'plan-shown' : 'recall-none', n: { ...n, cards: cards.length } };
}

module.exports = { recallPrompt, recallFile, related };
