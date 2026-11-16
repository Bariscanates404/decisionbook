// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The gate's ladder for one write: protection taken away is the person's; unprotected allows; no READY plan denies (a draft is
// named as the work in progress). READY is the freeze: whichever session made it, a write inside the plan passes in silence and a
// file outside it joins the plan (the product adds it and says so in one line); a danger path outside it is the person's, once; a
// danger path planned below critical work is denied; an untrusted plan asks once.
const { isDangerPath, dangerSince } = require('../contracts/rubric.cjs');
const { person: { asksPerson } } = require('@atlasbound/kit');
const { globCovers } = require('../base/glob.cjs');
const { scopeOf } = require('./fold.cjs');
const { gateReason, draftWhy } = require('./text/gate.cjs');

const PERSON_ONLY = ['policy-narrowed', 'policy-unreadable', 'guarded-person', 'plan-not-here'];

const isGuarded = ({ protect, danger = [] }, file) => [...protect, ...danger].some((glob) => globCovers(glob, file));

// order: the plan's own deny (no yes opens it), the untrusted-plan ask, then inside, a danger path outside, any other file outside
function underPlan({ danger, file, active, trusted }) {
  // a danger path that joined the plan after the person's yes is not inside it until they say yes again
  const unseen = active.confirm ? dangerSince(active, danger) : [];
  const inside = scopeOf(active).some((glob) => !unseen.includes(glob) && globCovers(glob, file));
  const hard = isDangerPath(danger, file);
  if (inside && hard && active.ready.level !== 'critical') return ['deny', 'plan-not-critical', active.id];
  if (!trusted(active)) return ['ask', 'plan-not-here', active.id];
  if (inside) return ['allow', 'gate-in-scope', active.id];
  return hard ? ['ask', 'plan-out-of-scope', active.id] : ['allow', 'plan-grown', active.id];
}

/** The branch's open plan, the work under way whichever session began it: its READY plan (frozen: every later session builds from
 * it), else its newest draft. The gate's denial and the session's start name the same one, so no session plans the same work twice.
 * -> the view | undefined */
function openPlan(web, branch) {
  return web.views.find((v) => v.state === 'ready' && v.branch === branch)
    || web.views.filter((v) => v.state === 'draft' && v.branch === branch).at(-1);
}

function ladderOf({ protect, danger, file, branch, web, person, trusted }) {
  if (person) return ['ask', person.code, null, person.why];
  if (!protect.length && !danger.length) return ['allow', 'gate-off', null];
  if (!isGuarded({ protect, danger }, file)) return ['allow', 'gate-not-protected', null];
  const open = openPlan(web, branch);
  if (!open) return ['deny', 'plan-none', null];
  return open.state === 'draft' ? ['deny', 'plan-draft-here', open.id, draftWhy(open)] : underPlan({ danger, file, active: open, trusted });
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

module.exports = { gateVerdict, isGuarded, reasonOf, openPlan };
