// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The nodes of a plan `show` can walk: a node is a field, or one of its rows.
const PICK_BY = ['key', 'gap', 'id', 'q', 'order'];

/** The rows of a field's `value` that `pick` names: by key, gap, id, q or order, else by a 0-based index. */
function picked(value, pick) {
  const list = Array.isArray(value) ? value : [];
  const named = list.filter((row) => row && PICK_BY.some((field) => String(row[field]) === pick));
  if (named.length) return named;
  return /^\d+$/.test(pick) && list[Number(pick)] !== undefined ? [list[Number(pick)]] : [];
}

/** How many rows each field holds (a single value counts one); an empty field is left out. */
function nodeCounts(fields) {
  const held = Object.entries(fields).filter(([, value]) => (Array.isArray(value) ? value.length : Boolean(value)));
  return Object.fromEntries(held.map(([field, value]) => [field, Array.isArray(value) ? value.length : 1]));
}

module.exports = { picked, nodeCounts };
