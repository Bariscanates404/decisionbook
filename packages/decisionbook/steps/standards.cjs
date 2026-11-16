// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// pattern rows another package hands for the parts a plan's new files fall in (root's `standards`); null: none hands them
const { errors: { isFail } } = require('@atlasbound/kit');
const { newPathsOf } = require('../core/ready.cjs');
const { trackedNow } = require('./changed.cjs');

async function standardsAsked(io, view) {
  if (typeof io.standards !== 'function') return null; // no root hands them: unread, never "no two ways"
  const fresh = newPathsOf(view, await trackedNow(io));
  if (!fresh.length) return []; // the add-on is not asked for edits of tracked files
  try {
    return await io.standards(fresh);
  } catch (err) {
    if (!isFail(err)) throw err;
    return null; // a patterns store that does not read: unread, never "no two ways"
  }
}

// what the trace says of it: the keys still asked and those a decision closed, or that they could not be read
const standardsN = (asked, undecided) => (asked === null ? { standardsUnread: 1 }
  : { standards: undecided.length, ...(asked.length > undecided.length ? { standardsDecided: asked.length - undecided.length } : {}) });

module.exports = { standardsAsked, standardsN };
