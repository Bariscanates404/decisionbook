// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// @atlasbound/decisionbook: the `decisionbook` and `protect` verbs, the hook handlers, debug, the trace vocabulary, the published shapes.
// Imports kit only.
const { SHAPES, DIR } = require('./contracts/shapes.cjs');
const { vocabulary, verbs, handlers, gateRead } = require('./run/verbs.cjs');
const { decisionbook, bookDoctor: doctor, plansHere } = require('./debug/decisionbook.cjs');
const { promptsOf } = require('./steps/here.cjs');
const { paths: { hereKey } } = require('@atlasbound/kit');
const codes = require('./contracts/codes.cjs');

// homeStores: this repository's folder in the person's home, the prompt statements DecisionBook kept among its rows (never in the
// repository)
module.exports = { SHAPES, codes, vocabulary, verbs, handlers, gateRead, doctor,
  homeStores: (io) => [hereKey(io.root, 'decisionbook')], debug: { decisionbook },
  keptStores: { [DIR]: codes.WORDS.keptStore },
  // the answers package.json `atlasbound.provides` names that are not an entry function as it stands: this branch's plans (id, state,
  // level, what is unmet) as `debug decisionbook` counts them, for Handoff's note; the session's prompt rows, for `debug who`
  answers: { plans: (io) => plansHere(io), prompts: promptsOf } };
