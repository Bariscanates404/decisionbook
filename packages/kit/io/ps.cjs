// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE machine's process table, read: every process, this process's ancestors, and who called it; null where the system does not answer.
const childProcess = require('node:child_process');
const { createFs } = require('./fs.cjs');
const { thrownCode } = require('../base/errors.cjs');
const { DEFAULTS } = require('./proc.cjs');

// the machine's processes as `pid ppid state command line`, by the system's own `ps` (a fixed PATH: never the caller's, which a session
// could plant; on Linux /proc where it does not answer), else null (no listing could be had). Windows has no `ps`: there the Windows
// folder's own PowerShell (a fixed path, no profile) asks WMI through .NET calls alone (no cmdlet, so no module a planted folder could
// shadow) for `pid TAB parent TAB start (ms) TAB name TAB command line`; its start is slow, so it has the longer wait.
const PS = Object.freeze({ cmd: 'ps', args: ['-axo', 'pid=,ppid=,stat=,args='], env: { PATH: '/bin:/usr/bin' }, waitMs: 3000 });
const WMI = ['$ErrorActionPreference = "Stop"; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)',
  '$null = [Reflection.Assembly]::LoadWithPartialName("System.Management")',
  '$q = "SELECT ProcessId, ParentProcessId, CreationDate, Name, CommandLine FROM Win32_Process"',
  'foreach ($p in [Management.ManagementObjectSearcher]::new($q).Get()) {',
  '  $ms = 0; $made = $p["CreationDate"]',
  '  if ($made) { $ms = [DateTimeOffset]::new([Management.ManagementDateTimeConverter]::ToDateTime($made)).ToUnixTimeMilliseconds() }',
  '  $line = "{0}`t{1}`t{2}`t{3}`t{4}" -f $p["ProcessId"], $p["ParentProcessId"], $ms,',
  '    ($p["Name"] -replace "\\s", " "), ($p["CommandLine"] -replace "[\\t\\r\\n]", " ")',
  '  [Console]::Out.WriteLine($line) }'].join('\n');
const WIN_PS = Object.freeze({ cmd: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', waitMs: 8000,
  args: ['-NoProfile', '-NonInteractive', '-NoLogo', '-EncodedCommand', Buffer.from(WMI, 'utf16le').toString('base64')],
  env: { SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', PATH: 'C:\\Windows\\System32' } });
const LEADS = 's'; // in a process's state: it leads its terminal's session (what a terminal starts first)
function systemList(platform) { // the system's own listing, or null where it does not answer
  const { cmd, args, env, waitMs: timeout } = platform === 'win32' ? WIN_PS : PS;
  const listed = childProcess.spawnSync(cmd, args, { encoding: 'utf8', env, timeout, maxBuffer: DEFAULTS.capBytes, windowsHide: true });
  return listed.status === 0 ? listed.stdout : null;
}
const posixRows = (listing) => listing.split('\n').map((row) => /^\s*(\d+)\s+(\d+)\s+(\S+)(?:\s+(.*))?$/.exec(row)).filter(Boolean)
  .map(([, pid, parent, state, line = '']) => ({ pid: Number(pid), parent: Number(parent), state, line: line.trim() }));
const windowsRows = (listing) => listing.split(/\r?\n/).map((row) => row.split('\t')).filter((cols) => cols.length >= 5 && /^\d+$/.test(cols[0]))
  .map(([pid, parent, start, name, ...line]) => ({ pid: Number(pid), parent: Number(parent), start: Number(start), name, line: line.join(' ') }));

/** Every process of this machine -> [{ pid, line: its command line as the system holds it ('' where it may not be read) }]; null where
 * the system's own listing does not answer (Linux's /proc reader walks this process's parents alone, so it is no answer here). */
const running = (listing = systemList(process.platform), platform = process.platform) => (listing === null ? null
  : (platform === 'win32' ? windowsRows : posixRows)(listing).map(({ pid, line }) => ({ pid, line })));

/** Linux with no `ps` that answers (a slim image, BusyBox's): ps's rows read from /proc for this process and its parents, a state with
 * `s` where it leads its session, a process with no command line as its name; null where /proc does not read. */
function procListing(at = createFs('/proc')) {
  const rows = [];
  for (let id = process.pid; id > 1 && rows.length < 256;) {
    const read = [];
    thrownCode(() => read.push(at.readText(`${id}/stat`), at.readText(`${id}/cmdline`))); // a refused /proc file is no row: the walk is null
    const [stat, line] = read;
    if (!stat) return null;
    const [state, parent, , session] = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    const name = stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')'));
    rows.push(`${id} ${parent} ${state}${Number(session) === id ? 's' : ''} ${(line || '').split('\0').filter(Boolean).join(' ') || name}`);
    id = Number(parent);
  }
  return rows.join('\n');
}

// Who holds the other end of this process's standard output, by the kernel's own word, and the command words of a process: read by
// the system's interpreter at a fixed path with this fixed program (never the caller's PATH or script), on the one platform it was
// measured on. The numbers are that platform's: the local-socket level (0) with its peer-pid option (2), and the kernel call (202,
// name 1.49.<pid>) that hands a process's arguments; standard output is handed on, nothing is written to it.
const PEER = Object.freeze({ platform: 'darwin', cmd: '/usr/bin/perl', path: '/bin:/usr/bin', waitMs: 3000, code: [
  'my $o = getsockopt(STDOUT, 0, 2); my $n = getpeername(STDOUT);',
  'my $mib = pack("i3", 1, 49, $ARGV[0]); my $buf = "\\0" x 65536; my $size = pack("Q", 65536); my @w = ();',
  'if (syscall(202, $mib, 3, $buf, $size, 0, 0) == 0) { my $len = unpack("Q", $size); my $argc = unpack("i", $buf);',
  '  my (undef, $tail) = split(/\\0+/, substr($buf, 4, $len - 4), 2); @w = (split(/\\0/, $tail // ""))[0 .. $argc - 1]; }',
  'print STDERR join("\\t", defined $o ? unpack("i", $o) : "-", defined $n && unpack("x2 Z*", $n) eq "" ? "pair" : "-",',
  '  map { s/[\\t\\n]/ /gr } grep { defined } @w[0, 1]);'].join('\n') });

/** Who called this process, as the kernel says -> { platform, parent: this process's parent, read: whether it could be read here
 * (another platform, no answer: false, which a reader must never take as "the host called"), peer: the pid at the other end of
 * standard output (null: it is no connected socket), pair: that socket is one end of a pair, bound to no path, words: the first
 * command words of the parent }. */
function callerOf() {
  const here = { platform: process.platform, parent: process.ppid };
  if (here.platform !== PEER.platform) return { ...here, read: false };
  const read = childProcess.spawnSync(PEER.cmd, ['-e', PEER.code, String(here.parent)], { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8',
    env: { PATH: PEER.path }, timeout: PEER.waitMs, windowsHide: true });
  if (read.status !== 0 || typeof read.stderr !== 'string') return { ...here, read: false };
  const [peer, name, ...words] = read.stderr.split('\t');
  return { ...here, read: true, peer: /^\d+$/.test(peer) ? Number(peer) : null, pair: name === 'pair', words };
}

function posixWalk(levels, listing) {
  const rows = new Map(posixRows(listing).map(({ pid, parent, state, line }) => [pid,
    { parent, leads: state.includes(LEADS), words: line ? line.split(/\s+/) : [] }]));
  const chain = [];
  for (let at = process.ppid; at > 1; at = rows.get(at).parent) {
    if (!rows.has(at) || chain.length === levels) return null;
    chain.push(rows.get(at));
  }
  const first = chain.findIndex((row) => row.leads);
  const above = first === -1 ? null : first;
  return { chain: chain.map((row) => row.words), leader: rows.get(process.pid)?.leads ? -1 : above };
}

// A Windows command line as Windows' own reader splits it: the program up to its closing quote or a space; then 2n backslashes before a
// quote are n and the quote opens or closes (marked U+E000), 2n+1 are n and a quote (U+E001); other backslashes are themselves.
function argvOf(line) {
  const head = /^\s*(?:"([^"]*)"?|(\S*))/.exec(line);
  const quote = (all, slashes) => `${'\\'.repeat(slashes.length >> 1)}${slashes.length % 2 ? '\uE001' : '\uE000'}`;
  const marked = line.slice(head[0].length).replace(/(\\*)"/g, quote);
  const words = marked.match(/(?:[^\s\uE000]|\uE000[^\uE000]*\uE000?)+/g) ?? [];
  return [head[1] ?? head[2], ...words.map((word) => word.replace(/\uE000/g, '').replace(/\uE001/g, '"'))];
}

// One spelling for the words a reader compares: `/` for `\`, and the program (or the script it was handed) in lower case with no `.exe`,
// as Windows names files; a command line the reader may not read is the program's name and `(unread)`, which no reader takes as a shell's.
const windowsWords = (name, line) => (line.trim() ? argvOf(line) : [name, '(unread)']).map((word, i) => (i < 2
  ? word.replace(/\\/g, '/').toLowerCase().replace(/\.exe$/, '') : word.replace(/\\/g, '/')));

// Windows: parents by id, nearest first, up to an id no process holds any more or one a later process took (it started after its child);
// no session leader exists there (`sessions: false`), the chain's reader finds the terminal's side; null also with no row of its own.
function windowsWalk(levels, listing) {
  const rows = new Map(windowsRows(listing).map((row) => [row.pid, { ...row, words: windowsWords(row.name, row.line) }]));
  if (!rows.has(process.pid) || !rows.has(process.ppid)) return null;
  const chain = [];
  let child = rows.get(process.pid);
  for (let at = process.ppid; at > 0 && rows.get(at)?.start <= child.start; at = child.parent) {
    if (chain.length === levels) return null;
    child = rows.get(at);
    chain.push(child.words);
  }
  return { chain, leader: null, sessions: false };
}

/** This process's ancestors, nearest first, up to the root, and who leads its terminal's session -> { chain: [[word, ...], ...] their
 * command words, leader: the place in `chain` of the nearest session leader, -1 where this process is one itself, null where none is
 * seen }; null where the walk cannot be done whole: no listing, a parent that is not in it, or more than `levels` ancestors. The
 * caller must never read null as "nobody above". `platform`: win32 is read by windowsWalk. */
function ancestry(levels, listing, platform = process.platform) {
  const listed = listing === undefined ? systemList(platform) ?? (platform === 'linux' ? procListing() : null) : listing;
  return listed === null ? null : (platform === 'win32' ? windowsWalk : posixWalk)(levels, listed);
}

module.exports = { ancestry, callerOf, running };
