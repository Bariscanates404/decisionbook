# Privacy: the open package `atlasbound`

This describes the package `atlasbound` (the shared base, the command line, DecisionBook, Handoff and the telemetry module).

## Where it runs

On your machine, inside your repository, when your AI session (Claude Code) calls its hooks or when you type an `atlasbound` command.
Your code, your records and your prompts stay there. Its code opens one kind of network connection: the daily usage report described
under Telemetry, to a service AtlasBound runs.

## What it stores, and where

In the repository:

- What `setup` wires: the hooks and the commands it allows in `.claude/settings.local.json`, the four slash commands in
  `.claude/commands/` (kept out of git in this clone's own `.git/info/exclude`), and a block in `.gitignore` for
  `.claude/settings.local.json` and `.atlasbound/*`. In a clone nobody set up yet, also one team notice row in `.claude/settings.json`, a file a team
  commits: it holds no path of this machine and no text of yours, and it tells a teammate's session once that the repository
  uses DecisionBook.
- `.decisionbook/`: the plans, decisions, assumptions and checks your AI session recorded, and its config. A decision, a
  confirmation and a plan set aside each hold your answer in your own words, by design. It is yours to commit.
- `.atlasbound/trace/`: what each step of the product did: step names, codes, counts, times, digests, paths inside the repository and
  short error texts with secrets scrubbed. The hooks' day files are kept for the last 14 days that have one, unless your config says
  otherwise; the file of a typed command is kept until you remove it.
- `.atlasbound/cli/`: what setup wrote, so uninstall can take it back, the product's config, and per session digests of what the session
  was told, never the text.
- `.atlasbound/telemetry/`: every daily report made here (waiting, received or refused, 14 days) and when the next attempt is due.
- `.atlasbound/drafts/`: a record your AI session wrote for a command to read, in that session's own folder; removed once the command
  took it, kept when the command refused it, so a refused one may hold your answer in your own words.

In your home folder, under `~/.atlasbound/`, created for your user only on macOS and Linux (folders 0700, files 0600); Windows has no
such modes, so there it has the permissions it inherits from your user profile:

- `decisionbook-here/<key>/` and `handoff-here/<key>/`, one key per repository (a digest of its path). DecisionBook keeps there the
  statements of yours it took from your prompts, what each session read and was given, and which prompts of a session were yours, with
  their times and their sentences (so a record quoting you keeps the whole sentence, and can tell whose words it holds). A session's
  sentences are let go when the plan it worked on closes, and every session's after 30 days at most; `atlasbound uninstall` leaves
  this folder and says so, `atlasbound uninstall --purge` removes it. Handoff keeps there its notes per branch, the prompts it journals and the files each session edited. What you
  typed is kept here and not in the repository, with the one exception above: the answers a plan file records. The
  trace keeps a digest of what a step was given, never the text of your prompt; telemetry holds step counts, ranges and outcome codes.
- `cli-here/<key>/person.json`: the name your decisions are recorded under in that repository, as setup kept it (git's name, or the
  one you typed), with the day. It is sent nowhere; `atlasbound whoami` shows it, and only you change it.
- `telemetry-consent.json`: your choice per module. `telemetry-period.json`: a random id that changes every 30 days and the token that
  can delete what it sent.

`atlasbound uninstall`, typed by you at a plain terminal with the phrase it names, takes back what setup wrote and removes the product's
own folders in `.atlasbound/` (`cli`, `trace` and `telemetry`). `atlasbound uninstall --purge` also deletes
the rest of this repository's stores, `.decisionbook/` when git does not track it, and this repository's folders in `~/.atlasbound/`; it
keeps the team's files and says what is left in `~/.atlasbound/`, which `rm -rf ~/.atlasbound` removes.

## What it sends

The daily usage report described under Telemetry, and nothing else.

- Your code, your records, your prompts and your paths are never sent by this package.
- The texts the hooks add to your AI session become part of that session, which your own AI provider receives under your own account, as
  it receives the rest of the session.
- No command of this package starts a model or your `claude` command line.

## Telemetry

During the beta (until 2027-03-31) telemetry is on by default for the command line, DecisionBook and Handoff. At most once a day, from a
command you or your AI session runs (never from a hook), it sends one report per module and finished day to AtlasBound, through a
Cloudflare Worker at api.atlasbound.dev, to find the product's faults and slow steps and to see where a plan's flow stops.

Nothing is counted for a report before its notice has been shown to you, and no day before that one is ever reported. The notice is
shown where you read it yourself: by `atlasbound setup` at your plain terminal, or by Claude Code at a session start, as a message of
its own ("SessionStart says: AtlasBound telemetry is on during the beta ..."). When an AI session runs setup, it is handed a line to pass
on to you; that line turns nothing on. A session that runs with no screen (a script) has nobody to read the message: set one of the
switches below there. After the beta, or for a module added later, nothing is on until you turn it on: `atlasbound telemetry on
[module]`, typed by you with the phrase it names; no environment variable, AI session or program that types for you can. Every field of
a report:

| field | what it holds |
|---|---|
| id | a random id of this report, so the server stores it once |
| period | a random id that changes every 30 days and on `atlasbound telemetry reset` |
| verifier | the SHA-256 of that period's deletion token, so the server can check a deletion |
| module, schema, policy, module_policy | which module, which version of its metrics, which collection your choice covered |
| release | the official version (x.y.z), or absent |
| node, os | Node's major version and the OS family (macos, linux, windows, other) |
| day | the UTC day, never a time of day |
| consent | whether you chose, or the beta's default applied |
| clock_suspect | present when that day's clock went backwards |
| metrics | counts and ranges, each a closed word of the table below |

| module | metric | what it counts |
|---|---|---|
| every module | step, step_ms, code, failure, decision | how often each of its steps ran and how it ended, how long it took (in ranges; never for a step that asks you), the outcome codes it said, a failure's code (never its text), a gate's verdict and reason code |
| cli | hook_incomplete, health, doctor_problems | host calls that came in and never went out, telemetry's own losses and refusals, doctor's problems (a range) |
| db | ready_unmet, phase_seconds, phase_turns, create_records, answers_bound, stop_unrecorded | open points at READY, time and turns until a plan is READY (your and the AI's pace), decisions per plan, answers recorded as yours, answers not recorded at stop (ranges, or counts) |
| db | flow_ready_seconds, flow_research, flow_questions, flow_answered, flow_routed | of a plan when it first becomes READY: the time since it was opened, its research records, its questions, those you answered and those routed to someone else (each a range; no plan id, title or text) |
| db | flow_build_seconds, flow_total_seconds, flow_resumes | of a plan when it is closed: the time since it first became READY, the time since it was opened, and the later sessions that went on with it (ranges) |
| db | stale_draft, stale_ready | at a session start, how many open plans are older than 7 days: never READY, or READY and never closed (ranges) |
| handoff | note_kept, note_messages | lines and messages of a handoff note (ranges) |

Each count carries only these words with it: the step (a name of the product's own steps), the outcome (ok or failed), the outcome or
failure code, a gate's verdict (allow, ask, deny), the range, telemetry's own health kind, and on the command line's hook steps the host
event it answered (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, PreCompact). A word outside these lists leaves as other.

The command line's own counts include how often and how long it ran each module's hook handlers, also of a module whose telemetry you
turned off: not which module, not what the handler did.

`DO_NOT_TRACK`, `ATLASBOUND_TELEMETRY=0` and `CI` stop the process they are set in from making or sending a report. What that process did
is still in the local trace; if a later process runs without the switch while telemetry is on, that day's report counts it. Set the
switch for your whole session, or use `atlasbound telemetry off`, to keep a day out.

The flow of a plan from opened to closed is read from these: how often each step ran and how long it took (step, step_ms: a plan
opened, research, a question asked, an answer recorded, READY, the first allowed write, close, a handoff note kept or resumed), the
ranges above, and the open plans that stopped. No report holds an id of a plan, a repository or a person, so two reports can be told
to be of one install only by the random period id, for 30 days.

A request carries the content type and the fixed headers of Node's fetch (user-agent `node`, accept, accept-language, sec-fetch-mode,
accept-encoding), nothing of your machine or of you. Cloudflare processes your IP address to deliver the request, as for any web
request. The service reads no header but the content type and length, stores no IP address, header or time of day, and runs with
request logging and log export off; this was checked with a real request. What it stores: each report's bytes as `atlasbound telemetry
history` shows them, the UTC day it arrived, and per random period id the SHA-256 of its deletion token and a count of that day's
requests. Reports are kept 30 days, then only monthly totals for 13 months, with groups of fewer than 10 ids left out; a period id's
row goes with its last report.

See: `atlasbound telemetry next` (the exact request, before it leaves) and `history`. Stop: `atlasbound telemetry off [module]`. Delete:
`atlasbound telemetry reset --forget`. `atlasbound uninstall` removes the reports kept here; to have the server's copy deleted, run
`atlasbound telemetry reset --forget` first (otherwise it expires in 30 days).

## Contact

Questions and reports go to the public repository's issue tracker: https://github.com/Bariscanates404/decisionbook/issues. Report a
security problem privately, through GitHub's "Report a vulnerability" on that repository.
