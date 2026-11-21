// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The gate's ladder for one write: protection taken away is the person's; unprotected allows; a draft file is never guarded; a file
// no open plan names is denied; a draft holds back the files it names. READY is the freeze: in a session that works on the plan (`ours`) a
// write inside it passes in silence, and a session of another task is denied (it plans its own); a file outside it is the person's, asked
// (their yes adds it to the plan, and a plan grown past its READY level covers no edit until it holds that level); a danger path planned
// below critical work is denied; an untrusted plan asks once.
const { isDangerPath, higher } = require('../contracts/rubric.cjs');
const { person: { asksPerson }, paths: { inStore } } = require('@atlasbound/kit');
const { globCovers } = require('../base/glob.cjs');
const { scopeOf, seenLinks, seenView, dangerSince } = require('./fold.cjs');
const { planLevel } = require('./level.cjs');
const { yesTakenBack } = require('./ready.cjs');
const { gateReason, draftWhy, outsideWhy, outgrownWhy, elsewhereWhy, otherTaskWhy, conflictWhy } = require('./text/gate.cjs');
const { lostLine, unreadLines } = require('./text/open.cjs');
const { refOf } = require('../contracts/shapes.cjs');

const PERSON_ONLY = ['policy-narrowed', 'policy-unreadable', 'guarded-person', 'plan-not-here', 'plan-outside'];

/** Nothing in the product's own store is a file of the person's, whatever a glob covers: the port seals it (STORE_SEALED), and a draft
 * a session hands a verb there is where a plan starts from. */
const isGuarded = ({ protect, danger = [] }, file) => !inStore(String(file))
  && [...protect, ...danger].some((glob) => globCovers(glob, file));

// the level the plan would run at over what the person's yes covers with `file` in it, said in the ask where it is higher
const levelWith = (active, file, danger) => planLevel({ ...seenView(active, [{ rel: 'plans', to: refOf('file', file) }]),
  level: active.level.proposed }, danger).level;
// grown past its READY level by the person's yes (a danger path the AI linked is asked apart, core/ready levelAt)
const outgrown = (active, unseen) => !unseen.length && Boolean(active.confirm) && seenLinks(active).length > active.confirm.after
  && higher(active.level.level, active.ready.level) && active.unmet.length > 0;

/** What holds a READY plan until the person answers, by its code, or null: a conflict one of its decisions is in, or their yes taken
 * back. The gate, a session's start and the inbox read this one answer. */
const planHeldBy = (v) => (v.decisions.some((d) => d.conflict) && 'plan-conflict') || (yesTakenBack(v) && 'plan-yes-taken') || null;
function answerHolds(active) {
  const code = planHeldBy(active);
  return code && ['deny', code, active.id, ...(code === 'plan-conflict' ? [conflictWhy(active)] : [])];
}
// order: what holds the plan until the person answers (a conflict of their decisions, a keep of theirs newer than their yes), the plan's
// own deny (no yes opens it), a plan grown past its level, the untrusted-plan ask, then inside, a danger path outside, any other outside;
// a danger path that joined the plan after the person's yes is not inside it until they say yes again
function underPlan({ danger, file, active, trusted }) {
  const held = answerHolds(active);
  if (held) return held;
  const unseen = active.confirm ? dangerSince(active, danger) : [];
  const inside = scopeOf(seenView(active)).some((glob) => !unseen.includes(glob) && globCovers(glob, file));
  const hard = isDangerPath(danger, file);
  if (inside && hard && active.ready.level !== 'critical') return ['deny', 'plan-not-critical', active.id];
  if (outgrown(active, unseen)) return ['deny', 'plan-outgrown', active.id, outgrownWhy(active)];
  if (!trusted(active)) return ['ask', 'plan-not-here', active.id];
  if (inside) return ['allow', 'gate-in-scope', active.id];
  return hard ? ['ask', 'plan-out-of-scope', active.id] : ['ask', 'plan-outside', active.id, outsideWhy(active, levelWith(active, file, danger))];
}

// the plan a write is judged under: the READY plan where it covers the file in a session that works on it, else the newest draft that
// names the file, else the READY plan (another task's, or one the file is outside of)
function heldUnder({ web, branch, file, ours }) {
  const names = (v) => scopeOf(v).some((glob) => globCovers(glob, file));
  const ready = web.views.find((v) => v.state === 'ready' && v.branch === branch);
  if (ready && names(ready) && ours(ready)) return { ready };
  const draft = web.views.filter((v) => v.state === 'draft' && v.branch === branch && names(v)).at(-1);
  return draft ? { draft } : { ready };
}

function ladderOf({ protect, danger, file, person, ...asked }) {
  if (person) return ['ask', person.code, null, person.why];
  if (!protect.length && !danger.length) return ['allow', 'gate-off', null];
  if (!isGuarded({ protect, danger }, file)) return ['allow', 'gate-not-protected', null];
  const [merging] = asked.items.merge; // which plan an unfinished merge held cannot be read: none covers the file
  return merging ? ['deny', merging.code, null, merging.why] : planLadder({ danger, file, ...asked });
}

function planLadder({ danger, file, branch, web, trusted, ours, items }) {
  const { ready, draft } = heldUnder({ web, branch, file, ours });
  if (draft) return ['deny', 'plan-draft-here', draft.id, draftWhy(draft)];
  // its decision lost a conflict after it edited: no new edit of the files it names under it. A teammate's lost plan (`author`,
  // steps/touch) holds back nothing here: its item is theirs to clear, and the rules below say what their plan covers for this clone
  const gone = ready && items.lost.find((l) => l.plan === ready.id && !l.author && l.files.some((glob) => globCovers(glob, file)));
  if (gone) return ['deny', 'plan-lost', ready.id, lostLine(gone)];
  if (ready && !ours(ready)) return ['deny', 'plan-other-task', ready.id, otherTaskWhy(ready)];
  if (ready) return underPlan({ danger, file, active: ready, trusted });
  const other = web.views.filter((v) => v.state === 'draft' && v.branch === branch).at(-1); // named, so it is not planned twice
  return ['deny', 'plan-none', null, [...(other ? [elsewhereWhy(other)] : []), ...unreadLines(items.unread)].join('; ')]; // a file not read may hold its plan
}

/** The reason of a verdict that is no allow; a denial of what only the person may allow says what to do where no one is asked. */
function reasonOf(out, why = '') {
  return gateReason({ code: out.code, file: out.file, why, noOne: out.verdict === 'deny' && PERSON_ONLY.includes(out.code) });
}

function gateVerdict(asked) {
  const [step, code, plan, why] = ladderOf(asked);
  // an ask no one sees would pass unasked
  const verdict = step === 'ask' && PERSON_ONLY.includes(code) && !asksPerson(asked.mode) ? 'deny' : step;
  const out = { verdict, code, file: asked.file, ...(plan ? { plan } : {}) };
  return verdict === 'allow' ? out : { ...out, reason: reasonOf(out, why) };
}

module.exports = { gateVerdict, isGuarded, reasonOf, planHeldBy };
