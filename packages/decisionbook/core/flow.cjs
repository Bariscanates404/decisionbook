// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. A plan's flow as numbers and nothing else of it: what it took until it first became READY, what it took until it was closed,
// and how many open plans stopped on the way. No id, text, name or path is read into any of them.
const { secondsBetween, isAnswered, isTime } = require('../base/text.cjs');

const STALE_SECONDS = 7 * 24 * 3600;

/** A plan as it first becomes READY at `now`: the seconds since it was opened, its research records, its questions, those a person
 * answered, and those routed to someone else. */
const readyFlow = (view, now) => ({ ...(isTime(view.at) && { seconds: Math.max(0, secondsBetween(view.at, now)) }),
  research: view.research.length + view.pointers.length, questions: view.questions.length,
  answered: view.questions.filter((q) => isAnswered(view, q)).length, routed: view.questions.filter((q) => q.to).length });

/** A plan as it is closed at `now`: the seconds since it first became READY (none for one closed before any READY), the seconds since
 * it was opened (`total`), and the later sessions that went on with it. */
const closedFlow = (view, now) => ({ ...(isTime(view.builtAt) && { seconds: Math.max(0, secondsBetween(view.builtAt, now)) }),
  ...(isTime(view.at) && { total: Math.max(0, secondsBetween(view.at, now)) }), resumes: view.resumes.length });

/** The open plans older than seven days, by where they stopped: never READY (`stale_draft`), READY and never closed (`stale_ready`). */
function staleFlow(views, now) {
  const stopped = (stage) => views.filter((v) => v.stage === stage && isTime(v.at) && secondsBetween(v.at, now) > STALE_SECONDS).length;
  return { stale_draft: stopped('draft'), stale_ready: stopped('ready') };
}

module.exports = { readyFlow, closedFlow, staleFlow };
