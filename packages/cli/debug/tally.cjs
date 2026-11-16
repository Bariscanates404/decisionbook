// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: trace records counted, one line per package, step and facet (a ref field its package declares, said as `<field> <value>`): how
// many rows, how many failed, their codes and their counts summed. It is how `debug trace --session <id> --tally` answers what a session's
// steps did, from the trace alone.

/** -> rows of { pkg, step, facet, rows, failed, codes, n }, in the order each first appears; `facetOf(row)`: its facet words or ''. */
function talliesOf(records, facetOf) {
  const groups = Map.groupBy(records, (r) => [r.pkg, r.step, facetOf(r)].join(' '));
  return [...groups.values()].map((some) => {
    const [codes, n] = ['codes', 'n'].map((field) => some.flatMap((r) => Object.entries(r[field] || {}))
      .filter(([, value]) => Number.isFinite(value))
      .reduce((sums, [name, value]) => ({ ...sums, [name]: (sums[name] || 0) + value }), {}));
    const [{ pkg, step }] = some;
    return { pkg, step, facet: facetOf(some[0]) || null, rows: some.length, failed: some.filter((r) => !r.ok).length, codes, n };
  });
}

/** One tally as a row of columns; `codeWords` words its codes as the trace's own rows do. */
const tallyLine = (t, codeWords) => [t.pkg, t.step, t.facet ?? '', `×${t.rows}`, t.failed ? `${t.failed} failed` : '',
  codeWords(t.codes), Object.entries(t.n).map(([name, value]) => `${name} ${Math.round(value)}`).join(', ')];

module.exports = { talliesOf, tallyLine };
