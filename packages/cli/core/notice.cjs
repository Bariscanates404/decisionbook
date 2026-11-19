// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the one hook row a team commits in the project's settings, which tells a teammate whose machine is not set up to set it up.
const { withoutRows } = require('./host.cjs');

/** The team's row in the project's settings. `node -e` is the one carrier sh, cmd and PowerShell run alike, so the program holds no
 * double quote, `$`, `%`, `!`, backtick or backslash; with no node the row fails, and a failing row lets the message through. Silent in a
 * run not known to be a person's (an entry off the interactive list, CI) and where `state` (this machine's setup record) is there; else
 * once per session id, by a file in the temp folder, it stops the message with `says`. -> { event, timeout, command, ours } */
function noticeRow({ projectEnv, notice: { event, timeout, mark, says, headless: { entry, interactive, attended, ci } } }, state) {
  const people = interactive.map((name) => `'${name}'`).join(',');
  const js = `const e=process.env,f=require('fs'),p=require('path');if([${people}].indexOf(e.${entry})<0||e.${attended}==='0'||e.${ci}||`
    + `f.existsSync(p.join(e.${projectEnv}||'.','${state}'))){}else{let s='';process.stdin.on('data',(d)=>{s+=d}).on('end',()=>{try{`
    + "const k=String(JSON.parse(s).session_id||'').replace(/[^A-Za-z0-9-]/g,'');if(k){f.writeFileSync(p.join(require('os').tmpdir(),"
    + `'${mark}'+k),'',{flag:'wx'});process.stdout.write(JSON.stringify({decision:'block',reason:'${says}'}))}}catch{}})}`;
  return { event, timeout, command: `node -e "${js}"`, ours: (command) => command.startsWith('node -e "') && command.includes(`'${mark}'`) };
}

/** Where the team's row stands in a settings file: `current`, `older` (ours, another version's text), or `none`. */
function standing(settings, notice) {
  const ours = (event) => (settings.hooks?.[event] || []).flatMap((row) => row.hooks || []).map((h) => String(h.command))
    .filter(notice.ours);
  const all = Object.keys(settings.hooks || {}).flatMap(ours);
  if (!all.length) return 'none';
  return all.length === 1 && ours(notice.event)[0] === notice.command ? 'current' : 'older';
}

/** The settings with exactly one team row, at the end of its event; every other row and key stays. */
function withRow(settings, notice) {
  const kept = withoutRows(settings, notice.ours) || {};
  const rows = (kept.hooks || {})[notice.event] || [];
  const row = { hooks: [{ type: 'command', command: notice.command, timeout: notice.timeout }] };
  return { ...kept, hooks: { ...kept.hooks, [notice.event]: [...rows, row] } };
}

module.exports = { noticeRow, standing, withRow };
