# DecisionBook and Handoff for Claude Code

Your code has history. Your decisions should too.

DecisionBook and Handoff keep the work behind your code: what the task was for, what the agent found in the code, the
questions it could not answer, your answers in your own words, and how the change was checked. It all stays in plain files
beside the code, so the next session, a teammate or a pull request reviewer starts from what was already learned.

Your coding agent forgets what you decided an hour ago. **DecisionBook** makes it write a short plan and ask you before it
edits the files you protect, and keeps your answers, as yours, in plain files beside the code. **Handoff** keeps a note of
the work, so after `/clear` the next session starts from your decisions instead of asking you the same things again.

It is a layer over the way you already work: `setup` adds its own hooks and commands to this repository's local Claude Code
settings and leaves yours alone, and `uninstall` takes them out again. It runs on your machine. The only AI involved is
your own Claude Code session, so your code goes nowhere it does not already go. Zero third-party dependencies, nothing
runs at install, Node 22 or newer.

## Install

    npm install -g atlasbound

## The two-minute walk

In the repository you work in:

    cd your-repository
    atlasbound setup

`setup` wires six hooks and four slash commands (`/decisionbook`, `/decide`, `/handoff`, `/resume-handoff`) into this repository's
local Claude Code settings, adds a block to `.gitignore`, and then asks you one question: what to protect. It shows what it
would pick, for example:

    automatic: lib/** (6 files), tests/** (110 files), typings/** (2 files)  ->  atlasbound protect --source
    choose: the paths the person names  ->  atlasbound protect "<path or glob>[,...]"

You answer it yourself (the AI is told not to):

    atlasbound protect --source
    atlasbound doctor           # "doctor: ok": what is installed and wired, and whether the installed files match this release

Commit the `.gitignore` change; everything else setup wrote stays out of git. Now start Claude Code in the repository (or
restart it, so it picks up the hooks) and give it a task that touches a protected file:

1. **It plans and asks.** The product hands the agent a pre-filled plan skeleton for the area; the agent reads the code
   itself, sends the plan with one `atlasbound decisionbook new`, and shows it to you with every open question in one
   message, each with the answer it proposes. No code yet.
2. **You decide.** Answer each question in a sentence of your own. A decision counts as yours only in your own whole
   sentence, written after the plan exists. A yes written by the agent with no message of yours behind it is refused.
   If you take its proposals as a whole ("go with your suggestions"), that counts, and each such decision is marked as
   taken whole, so you can tell later which ones you looked at one by one.
3. **It codes.** Once the plan is READY it is frozen and the edits go through in silence. The plan, your decisions and
   the checks are in `.decisionbook/<date>-<title>.jsonl`, append-only, reviewable in a pull request.
4. **Hand off when you want.** Type `/handoff`. The note keeps up to seven lines quoted from your own messages (each one
   says which message it comes from), what is half-done and the next steps. Then `/clear`, then `/resume-handoff`: the new
   context starts from that note and from DecisionBook's settled decisions, and does not ask again what you already
   decided.

To take it all out again: `atlasbound uninstall` (you type the phrase it names, at your own terminal).

## What a plan looks like

One plan is one file in `.decisionbook/`. The tool appends one JSON record per line rather than rewriting earlier records.
Here is an abbreviated example for undo and redo in a small state library, laid out for reading:

> **Plan:** Add undo and redo. *Why:* users want to step back through state changes. *Level:* normal.
>
> **Research** (read `src/store.js:12`): `setState` replaces the state object; no earlier state is kept.
>
> **Question Q1:** How many past states should the store keep? *Proposed:* keep the last 50.
>
> **Decision, by the person:** "Keep 100, and make it an option." *(answers Q1)*
>
> **Check AC-1:** undo after two changes restores the first. *Command:* `npm test -- store`
>
> **Ready:** frozen; planned file `src/store.js`.

Later sessions can retrieve the recorded decisions for `src/store.js`, with their wording and who made them.

## What DecisionBook does

- Before an AI session edits a protected file, it needs a READY plan: why, which files, how the work will be checked, and
  your confirmation. Rule-based checks set the level (small fix, normal, critical) from the task and its files; the agent
  does not choose it.
- When a new plan starts in an area with earlier work, the agent receives a bounded context pack: selected decisions,
  assumptions no person confirmed, checks, and a plan template.
- Plans, research, questions, decisions and links to files, tests and commits are plain JSON lines in `.decisionbook/`.
  Later sessions and teammates can inspect earlier work with `atlasbound decisionbook related <path>` and
  `atlasbound decisionbook show file:<path>`.
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
estimates at list prices, not subscription charges.

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

- **A workflow guard, not a sandbox.** It checks the agent's write tools and the shell forms it can read; some indirect
  writes are only noticed afterwards. It is not designed to stop a deliberate bypass.
- **Claude Code only.** Tested on macOS and Linux. Windows has not been tested yet; if you try it there, please tell us in
  an issue.
- **A plan covers files, not intentions.** The agent can still offer to accept all its proposals at once, and an existing
  READY plan can cover later work on the same files. Check that a new piece of work has its own plan. Accepted AI
  proposals are marked apart from your answers in your own words.

## Privacy

Plans and decisions are in your repository: the plan file under `.decisionbook/` holds your answers in your own words, by
design, and it is yours to commit. The heads of your messages and the handoff note are only in your home folder. The
trace keeps a digest of what a step was given, never the text of your prompt, and telemetry holds counts only. The
product sends nothing anywhere; what it gives your Claude Code session goes where that session already goes. Telemetry is off unless you turn it on yourself at a terminal (`atlasbound telemetry on`), and this build has no address to send to.
Details: PRIVACY.md.

## Bound

Bound is a separate paid add-on in a closed beta for enterprise customers. It is not part of this package, and nothing
here needs it.

## Licence

AGPL-3.0-only. Copyright (C) 2026 AtlasBound; see NOTICE and LICENSE.

The source of this exact release is the public repository at tag `v0.25.0`: https://github.com/Bariscanates404/decisionbook. The npm package is
the five folders of `packages/` there and the four root documents, byte for byte for every file it ships, and three files
written when it is packed: `kit.cjs` (one line that loads the kit folder), the npm `package.json`, and `MANIFEST.json`, which
lists every other file's sha256.

For alternative licensing terms, open a commercial-licensing enquiry in the public repository. Any alternative licence will
be provided under a separate written agreement.

Contributions: see CONTRIBUTING.md in the public repository. The names AtlasBound and DecisionBook: see NOTICE.
