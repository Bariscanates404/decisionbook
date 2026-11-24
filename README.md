# DecisionBook + Handoff

**Your code has history. Your decisions should too.**

[Quick start](#quick-start) · [Example record](#what-a-plan-looks-like) · [Guide](GUIDE.md) · [Privacy](PRIVACY.md) ·
[Security](https://github.com/Bariscanates404/decisionbook/blob/main/SECURITY.md) · [Changelog](CHANGELOG.md)

> The issue was half-written. The agent filled in the rest itself.<br>
> Why is this code like this? Nobody knows.<br>
> The developer left. The reasons left too.

Ground the task. Keep what you learn. A local work record for Claude Code, kept beside your code.

## See it work

### You hand over the issue: decisions already made are found, credited and linked

![A real Claude Code session with DecisionBook on a demo repository with a fictional team: the person hands over the issue in one plain line; Claude reads the issue and its comments, records the decisions already made there under Emma's (BA) and Olivia's (PM) names with links to their comments, and asks only what is still missing, each with its proposal; the record is shown; the person answers in one message and the plan is READY and frozen; the build runs from the plan and the tests pass; nothing is committed.](https://raw.githubusercontent.com/Bariscanates404/decisionbook/main/docs/team-question-to-the-ba.gif)

| [![A real Claude Code session with DecisionBook and Handoff on a demo repository with a fictional team: Mark hands over the issue in one plain line; Claude reads the issue and its comments, looks at what the code does today, and asks only what is still open; one numbered message from Mark carries every answer: Emma's (BA) answers pasted from the team chat, what Olivia (PM) said passed on in his own words, and "go with your proposals"; Claude runs the record command, Claude Code's permission prompt asks to record Olivia's words as hers, and he allows it; the plan is READY and frozen, with who decided what; because it is a big job, /handoff, /clear and /resume-handoff start a fresh context, which asks before building; Claude shows the record, each decision with who made it, the Olivia line saying it was allowed on the prompt; the build runs from the frozen plan and the tests pass; nothing is committed.](https://raw.githubusercontent.com/Bariscanates404/decisionbook/main/docs/poster-long-job.jpg)](https://github.com/Bariscanates404/decisionbook/blob/main/docs/demo.gif) | [![A real Claude Code session with DecisionBook on a demo repository with a fictional team: Lee reports a bug, a coupon larger than the order gives a negative total; Claude reads the code and its tests, finds the commit that dropped the earlier rule, and quotes what was decided before: Emma's rule, from the earlier plan; it writes a fix plan that keeps that rule, fixes the code with a test, closes the plan and prints one commit command; the record then shows the rule as Emma's, relayed by Mark.](https://raw.githubusercontent.com/Bariscanates404/decisionbook/main/docs/poster-bug-fix-from-history.jpg)](https://github.com/Bariscanates404/decisionbook/blob/main/docs/bug-fix-from-history.gif) | [![An explainer built from short clips of real sessions: the problem (agents read the code but not why it is that way), what DecisionBook keeps and where, how it works in five steps (research, questions with proposals, your answers in your words and a READY plan, building from the plan, /handoff, /clear and /resume-handoff), the three levels, how to install and start, and what it does not do.](https://raw.githubusercontent.com/Bariscanates404/decisionbook/main/docs/poster-explainer.jpg)](https://github.com/Bariscanates404/decisionbook/blob/main/docs/explainer.gif) |
|---|---|---|
| **A long job**: you hand it over, it asks first, a fresh context, then the build | **A bug fixed from its history**: the earlier decision, in her own words, and the commit that broke it | **The whole flow** (about 2 minutes): what DecisionBook keeps and how to use it |

With sound: the four videos are attached to the [v0.25.4 release](https://github.com/Bariscanates404/decisionbook/releases/tag/v0.25.4).
The same videos, with pause and replay, are on [atlasbound.dev](https://atlasbound.dev/en/decisionbook/#videos).

<sub>Real sessions, not mock-ups: Claude Code 2.1.326, Sonnet 5.5, on a demo repository with a fictional team. The three
sessions were recorded with atlasbound 0.25.4; the explainer's clips with 0.25.3, as its own card says. Model waits are cut
and key moments are held with a highlight; nothing is sped up. You can run the commands yourself, but you don't have to:
Claude runs them as it works.</sub>

![An illustrative work record: the agent researches the code and proposes an answer, the person answers in their own words, and the record becomes context for later work.](https://github.com/Bariscanates404/decisionbook/blob/main/.github/assets/work-memory.svg?raw=true)

*An illustration of the example record below, not a screen of the product.*

A coding agent can read the implementation. It cannot recover from the code every product choice, limit or exception
behind it, and the reasons for a change leave with the chat that produced them. The next session asks you again, or picks
an answer for you without asking.

**DecisionBook** changes the order of the work. Before a change, the agent researches the existing code and evidence. It
asks you what the code does not answer, each question with the answer it proposes. The research, its findings, the
questions, your own answers, the reasons and the checks stay together in the work's record, a plain file in your
repository. **Handoff** carries the ongoing work into a new session after `/clear`. Later work on the same files is handed
the related earlier records, each marked as no proof that the code still does it today, so the agent checks them against
the current code.

- **It asks before code.** Before your AI session edits a file you protect, it reads the code, writes a short plan and asks
  you what the code cannot answer, each question with the answer it proposes.
- **Your decision, in your own words.** Your own AI reads your answer and records what it understood you decided, with your
  words beside it. A decision recorded as yours must quote words you typed in that session; a record that does not is
  refused.
- **Protected files need an approved plan.** An AI edit of a protected file needs a READY plan, and a plan is READY only
  after your yes.
- **`/clear` and teammates keep it.** Handoff carries the work across `/clear`; DecisionBook keeps plans and decisions as
  plain files in `.decisionbook/`, so a teammate who pulls gets them too.

What it is not: **not a chat log** (the repository gets the plan, its research, questions, decisions and checks, not the
conversation), **not a code map** (it keeps what the agent read and where, as `file:line`, not a model of your code), and
**not an agent memory** (it keeps the decisions a person made, tied to plans and files, not everything a session saw).

**Built on Node.js built-ins. No third-party runtime packages, no bundled third-party libraries, no install scripts.** It
calls no model of its own and needs no account: your existing Claude Code session does the AI work.

## Find your way

| I want to… | Start here |
|---|---|
| Try it in a repository | [Quick start](#quick-start) |
| See the data it keeps | [What a plan looks like](#what-a-plan-looks-like) |
| Understand the two tools | [DecisionBook](#what-decisionbook-does) · [Handoff](#what-handoff-does) |
| Use it with a team | [Teams and git](GUIDE.md#teams-and-git) |
| Know what is kept where, and what is sent | [Local by design](#local-by-design) · [Privacy](PRIVACY.md) |
| Fix a setup that does not work | [Troubleshooting](GUIDE.md#troubleshooting) |
| Read the measured results and their caveats | [The long-task experiment](#one-long-task-experiment) |
| Report a bug | [Open an issue](https://github.com/Bariscanates404/decisionbook/issues/new/choose) |
| Report a security problem privately | [Security](https://github.com/Bariscanates404/decisionbook/blob/main/SECURITY.md) |
| Contribute, or ask about licensing | [Contributing](https://github.com/Bariscanates404/decisionbook/blob/main/CONTRIBUTING.md) · [Licence](#licence) |

## Quick start

**Requires** Node 22 or newer, git (setup works inside a git repository), and Claude Code (its hooks and slash commands;
no minimum Claude Code version is checked). On Windows, Git Bash too.

    npm install -g atlasbound
    cd your-repository && atlasbound setup

Your project can stay on its own Node version: install AtlasBound with Node 22 or newer and run its commands with that
Node; setup writes that Node's path into the hooks, so they run it whatever Node your project uses. With nvm on macOS or
Linux: `nvm exec 22 npm install -g atlasbound`, then `nvm exec 22 atlasbound setup`. nvm-windows has no `exec`: run
`nvm use 22`, then `npm install -g atlasbound` and `atlasbound setup`; `nvm use` switches Node for the whole machine, so
keep it on 22 or newer while you use AtlasBound.

`setup` wires six hooks and four slash commands (`/decisionbook`, `/decide`, `/handoff`, `/resume-handoff`) into this repository's
local Claude Code settings, adds a block to `.gitignore` and one team notice row to `.claude/settings.json`, and then asks
you two things: the name your decisions are recorded under (once per machine, git's name offered first) and what to protect.
For the second it shows what it would pick, for example:

    automatic: lib/** (6 files), tests/** (110 files), typings/** (2 files)  ->  atlasbound protect --source
    choose: the paths the person names  ->  atlasbound protect "<path or glob>[,...]"

The answer is yours. Type it yourself, or answer your AI session: it is told to ask you rather than choose, and it may run
the command itself after your answer, since adding protection is something it may do. Only taking protection away is yours:
`atlasbound protect --none` runs only when you type it at your own terminal, and an AI edit of AtlasBound's own files
(`.decisionbook/`, its hook and permission entries in `.claude/settings.local.json`, its `.gitignore` block, its slash
commands) or of a Claude Code settings file that can switch its hooks off (`.claude/settings.json`, yours in `~/.claude/`)
asks you first.

    atlasbound protect --source
    atlasbound doctor           # "doctor: ok": what is installed and wired, and whether the installed files match this release

Commit `.gitignore` and `.claude/settings.json`; the files that name this machine stay out of git. The team notice row tells a
teammate's Claude Code session, once per session, to install and set up when their machine is not set up yet. Each
teammate then runs `atlasbound setup` once, and plans arrive with `git pull` ([teams and git](GUIDE.md#teams-and-git)). A
repository set up by an earlier version gets the row with `atlasbound setup --team-notice`, then a commit of `.claude/settings.json`.
Now start Claude Code in the repository (or restart it, so it picks up the hooks) and give it a task that touches a
protected file:

| Step | What happens |
|---|---|
| **It researches and asks** | The product hands the agent a pre-filled plan skeleton for the area; the agent reads the code itself, sends the plan with one `atlasbound decisionbook new`, and shows you every open question in one message, each with the answer it proposes. No code yet. |
| **You answer in your own words** | Answer any way you like: one by one, "go with your suggestions", "yes, but keep the old limit". Your AI records what it understood you decided, with your words beside it; a record whose words are not in a message you typed in that session is refused, and so is a yes with no message of yours behind it. Every decision carries your name, kept on your machine at setup (`atlasbound whoami`). A colleague is credited only where the format names them: a chat line `Emma: …` you paste (its own line, the first line under a chat header, the `>` lines under `Emma wrote:`) is recorded as hers, relayed by you; for anything else ("I asked Emma: keep 100"), a relay in prose with no format proof, Claude Code's permission prompt lists the sentences and they are credited to her only on your Allow, otherwise recorded as your words; one your AI copies from an issue comment is recorded as the commenter's only after the product read that comment itself and found the words there. Anything else you said is your own decision, and the READY plan lists who decided what so you can correct it. A blanket answer settles the open questions and never replaces a decision a colleague made (your AI asks you about that one by name), and a question you put off ("as a todo") is recorded as put off: it decides nothing and stays open. |
| **It builds from the plan** | Once the plan is READY it is frozen, and the edits inside it go through in the sessions that work on it; a session that began with another task plans its own. A protected file the plan does not name is asked first: your yes to that edit adds it to the plan. When the work is done your AI is brought to close the plan: a turn that ends on finished work is held once until it runs `atlasbound decisionbook close <id>`, and when you ask what to commit it is handed the answer. Close links the plan's own commits, files and tests and prints one `git commit` command for the work and the plan together; if you committed first, the command puts the plan's record into that commit while it is still only yours. The product never commits for you. |
| **It continues in a fresh session** | Type `/handoff`: the note keeps up to seven lines quoted from your own messages, what is half-done and the next steps. Then `/clear`, then `/resume-handoff`: the new context starts from that note and from DecisionBook's settled decisions, and does not ask again what you already decided. |

To take it all out again: `atlasbound uninstall` (you type the phrase it names, at your own terminal).

## Local by design

| Surface | What to know |
|---|---|
| **Work records** | Plain JSON lines in `.decisionbook/`, one file per plan, appended and never rewritten; yours to review and commit with the code. |
| **Handoff** | A note per branch and short excerpts of your messages, in your home folder (`~/.atlasbound/`), never in the repository. |
| **Model use** | The product calls no model. What its hooks add to your Claude Code session becomes part of that session, which goes to the model provider your session already uses, under your account, like the rest of the session. |
| **Network** | Your code never leaves your machine. During the beta one thing does: a daily usage report of step counts, time ranges and outcome codes, which helps us find the product's faults. It starts once its notice has been shown to you, `atlasbound telemetry next` prints every byte before it leaves, and `atlasbound telemetry off` turns it off. |
| **Package** | Node.js built-ins only: no dependencies, no bundled third-party code, no install scripts. |

[PRIVACY.md](PRIVACY.md) says exactly what is kept where and how to remove it.

## What a plan looks like

One plan is one file in `.decisionbook/`. The tool appends one JSON record per line rather than rewriting earlier records.
Here is an abbreviated example for undo and redo in a small state library, laid out for reading:

> **Plan:** Add undo and redo. *Why:* users want to step back through state changes. *Level:* normal.
>
> **Research** (read `src/store.js:12`): `setState` replaces the state object; no earlier state is kept.
>
> **Question Q1:** How many past states should the store keep? *Proposed:* keep the last 50.
>
> **Decision, by Maya:** "Keep 100, and make it an option." *(answers Q1; the AI's reading: a `historyLimit` option, default 100)*
>
> **Check AC-1:** undo after two changes restores the first. *Command:* `npm test -- store`
>
> **Ready:** frozen; planned file `src/store.js`.

Later sessions can retrieve the recorded decisions for `src/store.js`, with the person's words and who made them.

## What DecisionBook does

- Before an AI session edits a protected file, it needs a READY plan at its level (small fix, normal, critical). The agent
  proposes the level and code only raises it: a small fix that plans more than 2 files, a glob or a shared path runs as
  normal work (unless it writes only tests, fixtures or docs); a path under `danger` or a database schema path, or a risk area (a folder or file named for money or for who gets in; your repository can name its own) you did not waive, makes it critical; no level
  proposed is critical; a proposal is never lowered. A small fix needs its files, your answers to its blocking questions and your yes; normal work adds a success signal, a check with its command and the questions the task
  leaves open; critical work the whole form ([levels](GUIDE.md#settings)). While a decision of the plan holds a conflict (two
  answers a merge kept), the plan covers no edit until you say which holds.
- When a new plan starts in an area with earlier work, the agent receives a bounded context pack: selected decisions,
  assumptions no person confirmed, checks, and a plan template. Each earlier decision says where it came from, and that it
  is no proof the code still does it today.
- Plans, research, questions, decisions and links to files, tests and commits are plain JSON lines in `.decisionbook/`.
  Later sessions and teammates can inspect earlier work with `atlasbound decisionbook related <path>`,
  `atlasbound decisionbook show file:<path>` and `atlasbound decisionbook inbox`.
- Records matching the built-in secret patterns are refused before they are written. This is pattern screening, not a
  guarantee that every secret is detected.

## What Handoff does

- Handoff does not gate file edits and does not ask questions by itself. Using Claude Code's reported token usage, it gives
  at most one notice per session when the context passes 55 %.
- `/handoff` refreshes the note from facts such as the branch, HEAD, changed files and plan state, and gives the agent the
  locally kept excerpts of your messages to work from, so the lines it keeps are quoted from you rather than recalled.
- Notes are stored per branch in your home folder, outside the repository; message excerpts are stored per session. They
  are given to your own Claude Code session; the product makes no model calls of its own.
- `atlasbound handoff drop <n>`, typed by you, removes a kept line from the handoff note.

## What to expect

The first recorded task already leaves something you can use: its purpose, what the agent found in the code, the questions
it asked, your answers, and its checks. You can continue from that record after `/clear`.

As more work is recorded, later sessions and teammates can retrieve relevant earlier plans before they change the same
area. A bug fix can consult why the behaviour was chosen; a new feature can reuse earlier research and find the exceptions
you already named. The history covers work recorded through DecisionBook; older, unrecorded work still has to be
researched.

## One long-task experiment

A long task on **Mastodon** (Ruby on Rails): one large feature, Opus 5.5, 22 decisions the task text leaves open, 94 hidden
tests, and the context cleared several times in each run. We compared Claude alone, Claude with one paragraph in
`CLAUDE.md` that tells it to ask before coding, and Claude with DecisionBook and Handoff. A script supplied the developer's
answers from a prepared list. These are two runs of the same sealed task, not a general benchmark; session costs are
estimates at list prices, not subscription charges. The runs used an earlier build; the way answers are recorded has changed
since.

| Run | | Hidden tests passed (of 94) | Decisions asked (of 22) | Asked again after answered | Kept across a cleared context | Contradicted later | Session cost |
|---|---|---|---|---|---|---|---|
| 1 | Claude alone | 64 | 0 | – | – | – | 13.04 USD |
| 1 | Claude + one paragraph | 84 | 13 | 8 decisions, 15 times | 12 of 13 | 1 | 24.04 USD |
| 1 | with DecisionBook + Handoff | 83 | 10 | 0 | 10 of 10 | 0 | 26.18 USD |
| 2 | Claude alone | 70 | 0 | – | – | – | 13.27 USD |
| 2 | Claude + one paragraph | 82 | 11 | 8 decisions, 15 times | 10 of 11 | 1 | 22.92 USD |
| 2 | with DecisionBook + Handoff | 84 | 14 | 0 | 12 of 14 | 2 | 17.79 USD |

In these runs both asking arms passed more hidden tests than Claude alone. Their scores were close; two runs are not
enough to show a quality difference or an equivalence. In each run the paragraph arm asked eight answered decisions again,
15 times; DecisionBook asked none again. Separately, in each product run one answer had to be sent a second time because
the guard did not accept its first wording. "Kept" and "Contradicted" are labels derived from the hidden behaviour tests,
not direct measurements of the model's memory.

What the product adds is the record: research, questions, answers and checks are stored together, and relevant earlier
work is brought into a later session. A separate comparison on nine short tasks was less favourable to the product,
including a higher session cost (18.06 USD against 12.40 USD for the paragraph arm); we show the long task because long,
interrupted work is what the product is built for. The tasks, runs and scripts are available on request: open an issue.

## Limits

- **A workflow guard, not a sandbox.** It checks the agent's write tools before they run, and the shell, PowerShell and
  `cmd` commands it can read, package scripts (`npm run`, `npm test`, yarn, pnpm) included; a command of those kinds it
  cannot read, that may write a protected file, asks you instead of passing. A program run by an interpreter (`node x.js`,
  `python x.py`, `make`, a test runner) is not read before it runs: a protected file it changes is named when the session
  stops, after the fact. It is not designed to stop a deliberate bypass.
- **Claude Code only.** No other coding agent, no editor plugin and no server today. Tested on macOS and Linux; on Windows,
  see the next section.
- **Whose words: by format, else by your one Allow.** A teammate's words are proven only by their format: a chat line
  `Emma: …`, the first line under a chat header with a name and a time, the `>` lines under `Emma wrote:`, or an issue
  comment the product reads itself through your `gh`. A line you type right under a paste is yours. Anything else is asked
  once per batch with Claude Code's own permission prompt listing the sentences; Allow credits them: everything on a list you
  Allow is credited to the teammate, so read the list before you click. When a teammate's words are mixed into your own sentence, or you choose Deny, they are recorded as your words. Separate them on an `Emma:` line to credit Emma. A change a PM made that you pass on in your own
  prose ("Olivia dropped the minimum") is often recorded under your name, Olivia's name lost; the READY
  plan lists who decided what, so correct it there.
- **A plan covers files, not intentions.** An existing READY plan can cover later work on the same files. Check that a
  new piece of work has its own plan.
- **Your AI decides what you meant.** The product checks only that the words beside a decision are yours: it refuses a
  record whose words are not in a message you typed in that session. That stops an AI that misreads or invents; it is not
  built to stop one that attacks the product's own files. Whether a hook call comes from Claude Code itself is checked on
  macOS only (elsewhere a shell command that names the hook is denied, a script that starts it is not seen); a program
  that stands in for Claude Code, or a second one started on the same session, is heard as you; an answer you pick in a
  question dialog is no typed message, so the AI asks again in plain words. The product does not check that the value is
  what you meant: `atlasbound decisionbook show <id> decisions` prints your words beside it.

## Windows

Windows is newer ground than macOS and Linux. The gate also watches Claude Code's PowerShell tool and reads the common
PowerShell and `cmd` ways of writing a file; a PowerShell or `cmd` command it cannot read that may write a protected file
asks you instead of passing.

What was run on Windows: release 0.25.2 by hand on Windows 11, with real Claude Code sessions (install, `doctor`, the answer
flows, a team's shared history); before it, an automated job installed the packed package on Windows and Linux, ran setup,
protect and doctor, and sent scripted writes through the hooks setup wrote. Release 0.25.3 was run the same way on
Windows 11: an upgrade from 0.25.2, a clean install, the answer flows, Handoff after `/clear`, and two- and three-person team
histories, with real Claude Code sessions. This release, 0.25.4, was run on macOS with real Claude Code sessions; it was not run
again on Windows before it was published. CHANGELOG.md lists each change.

- **Git Bash is needed.** The hooks `setup` writes are shell commands. Claude Code on Windows runs them through Git Bash,
  which comes with Git for Windows; without it these commands fail, and nothing is gated.
- **Line ends.** Git for Windows sets `core.autocrlf=true` by default, so after a pull or checkout `.gitignore` may have
  Windows line ends. The product reads its `.gitignore` block either way.
- **A slash command from Git Bash.** Git Bash rewrites an argument that starts with `/` into a Windows path, so
  `claude -p "/handoff"` does not reach Claude Code as `/handoff`. Set `MSYS_NO_PATHCONV=1` for that command.
- **Links.** Making a symbolic link on Windows needs Developer Mode. A directory junction needs nothing, and the gate
  follows it to the folder it points at, as it follows a link.

If something does not work on Windows, please tell us in an issue.

## Privacy

Plans and decisions are in your repository: the plan file under `.decisionbook/` holds your answers in your own words, by
design, and it is yours to commit. The sentences of your messages and the handoff note are only in your home folder: DecisionBook
lets a session's sentences go when its plan closes and after 30 days at most, `atlasbound uninstall --purge` removes them. A draft
your AI session writes for a command (`.atlasbound/drafts/`, out of git) is removed once the command takes it, and kept when
the command refuses it, so a refused one may hold your words. The trace keeps a digest of what a step was given, never the
text of your prompt. What it gives your Claude Code session goes where that session already goes.

Your code never leaves your machine. During the beta telemetry is on by default: once its notice has been shown to you (by
setup at your plain terminal, or by Claude Code at a session start), one report per module and finished day goes to
api.atlasbound.dev, at most once a day. A report holds step counts, time ranges and outcome codes, the version, Node's major
version, the OS family and a random id that changes every 30 days; never your code, prompts, answers, names or paths. It
helps us find the product's faults and where a plan's flow stops. `atlasbound telemetry next` prints the exact request before
it leaves and `atlasbound telemetry history` what left; `atlasbound telemetry off` turns it off, `atlasbound telemetry reset
--forget` has the server's copy deleted, and `DO_NOT_TRACK`, `ATLASBOUND_TELEMETRY=0` and `CI` close it too. Every field:
PRIVACY.md.

Versions before 0.25 were an earlier, closed product under the same name, with a telemetry of its own, on by default. If you
used it, CHANGELOG.md says what it sent and how to remove what it left in your home folder. A Claude Code session that was
open before you upgraded keeps that product's server running in memory, still sending: close every such session and start it
again, then run `atlasbound leftovers`, which names what is left and any such server that still runs.

## Free, and for teams

**Free: this package.** Everything above, with no account and no sign-up, for one person or for a team. A team shares it
through git: commit `.decisionbook/` (its `config.json` too, so what you protect travels with it), and a teammate who pulls
gets the plans and the decisions in the words they were given. The handoff note stays in the home folder of the machine
it was written on. GUIDE.md's [teams and git](GUIDE.md#teams-and-git) says what travels and what does not.

**Enterprise: a paid offer for team use.** For what git does not carry: one shared place where a team, signed in, reads its
plans and decisions without waiting for a push. It is in a pilot, and its price is not published. Nothing in this package
sends anything to it. To ask about it, open an issue in the public repository.

## AtlasBound and Bound

AtlasBound is the name over the products. DecisionBook and Handoff are its open product: this package. Bound is a separate,
optional, closed add-on in a closed beta for enterprise customers. It is not part of this package, and nothing here needs it.

## Licence

AGPL-3.0-only. Copyright (C) 2026 AtlasBound; see NOTICE and LICENSE.

The source of this exact release is the public repository at tag `v0.25.4`: https://github.com/Bariscanates404/decisionbook. The npm package is
the five folders of `packages/` there and the six root documents, byte for byte for every file it ships, and three files
written when it is packed: `kit.cjs` (one line that loads the kit folder), the npm `package.json`, and `MANIFEST.json`, which
lists every other file's sha256. The README and the repository's presentation on its default branch may change between
releases; the release tag is what to compare with the package.

For alternative licensing terms, open a commercial-licensing enquiry in the public repository. Any alternative licence will
be provided under a separate written agreement.

Contributions: see CONTRIBUTING.md in the public repository. The names AtlasBound and DecisionBook: see NOTICE.
