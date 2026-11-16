// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one scrub for a string reaching a rendered line: control and bidi characters become a space, zero-width ones go (a replacement would
// corrupt honest text).
const BIDI_MARKS = '\\u{61c}\\u{200e}\\u{200f}\\u{202a}-\\u{202e}\\u{2066}-\\u{2069}';
const ZERO_WIDTH = '\\u{ad}\\u{200b}-\\u{200d}\\u{2060}-\\u{2064}\\u{feff}\\u{180e}\\u{fff9}-\\u{fffb}\\u{e0000}-\\u{e007f}';
const BIDI = new RegExp(`[${BIDI_MARKS}\\u{2028}\\u{2029}]+`, 'gu');
const INVISIBLE = new RegExp(`[${ZERO_WIDTH}]+`, 'gu');
const HIDDEN = new RegExp(`[${ZERO_WIDTH}${BIDI_MARKS}\\u{1}-\\u{8}\\u{b}\\u{c}\\u{e}-\\u{1f}\\u{7f}-\\u{9f}]+`, 'gu'); // a line break stays: rows read lines
const scrub = (s, control) => String(s ?? '').replace(control, ' ').replace(BIDI, ' ').replace(INVISIBLE, '');

const visible = (s) => String(s ?? '').replace(HIDDEN, '');
const line = (s) => scrub(s, /[\u{0}-\u{1f}\u{7f}-\u{9f}]+/gu).replace(/\s+/g, ' ').trim();
const block = (s) => scrub(s, /[\u{0}-\u{8}\u{b}-\u{1f}\u{7f}-\u{9f}]+/gu); // multi-line by contract: TAB and LF stay

// A cut is marked `~` (a silently shortened value reads as complete) and never splits a surrogate pair.
function clip(s, max) {
  const text = line(s);
  if (text.length <= max) return text;
  const head = text.slice(0, Math.max(0, max - 1));
  const last = head.charCodeAt(head.length - 1);
  return `${last >= 0xd800 && last <= 0xdbff ? head.slice(0, -1) : head}~`;
}

module.exports = { line, block, clip, visible };
