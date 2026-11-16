// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// @atlasbound/handoff, the public entry: the hook handlers and the verbs (both declared in package.json `atlasbound`, with the answers
// it provides and needs), the debug view, the trace vocabulary and the shapes. It calls no model; the only program it runs is git.
const { isCode } = require('./contracts/codes.cjs');
const { SHAPES, STEPS } = require('./contracts/shapes.cjs');
const { handlers, verbs } = require('./run/steps.cjs');
const { view } = require('./debug/handoff.cjs');
const { heardHere } = require('./steps/store.cjs');
const { hereOf } = require('./contracts/helpers.cjs');

module.exports = {
  handlers,
  ...verbs,
  debug: { handoff: view },
  vocabulary: Object.freeze({ steps: STEPS, isCode }),
  SHAPES,
  // the heads of the person's messages kept here ({ id, at, text }), read by DecisionBook's promises through the composition root
  heard: heardHere,
  // everything the handoff keeps is in the person's home; `uninstall --purge` removes this folder
  homeStores: (io) => [hereOf(io)],
};
