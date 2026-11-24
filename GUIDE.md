# Guide: DecisionBook and Handoff

The README is the short version. This guide is the long one: [getting started](#getting-started),
[teams and git](#teams-and-git), [privacy](#privacy), [settings](#settings), [troubleshooting](#troubleshooting),
[FAQ](#faq), [why](#why), and the [record format](#record-format).

Every command below prints its own help: `atlasbound <command> --help`, and `atlasbound help --all` lists them all.

## Getting started

**Requirements.**

- Node 22 or newer. An older Node is named at the first command, with what to do. Your project can keep its own Node
  version; see the README.
- git: setup works only inside a git repository, and plans travel with your commits. What you decide is recorded under
  your name: setup suggests the one git gives (`git config user.name`), asks you to keep it or type another when you run
  it in your own terminal, and keeps it on your machine. `atlasbound whoami` shows it; only you change it, in your own
  terminal: `atlasbound whoami --name "<name>"`. A git name changed later changes no record. A plan that came from a teammate
  is named by the author of the commit that brought it.
- Claude Code: its hooks and slash commands. No minimum version is checked. On Windows, Git Bash too.

**1. Install.**

    npm install -g atlasbound

**2. Set up a repository.** At its top or in any folder inside it:

    cd your-repository
    atlasbound setup

Setup needs a git repository; outside one it says so and changes nothing. It wires six hooks and four slash commands
(`/decisionbook`, `/decide`, `/handoff`, `/resume-handoff`) into this repository's local Claude Code settings, adds a block
to `.gitignore` and the team notice row to `.claude/settings.json` ([teams and git](#teams-and-git)), and asks you what to
protect. A file of your own at one of those command paths (your own `.claude/commands/decisionbook.md`, say) stops setup
before it writes anything: it names the file, and you move or rename yours and run setup again.

**3. Choose what to protect.** A protected file needs a READY plan before an AI session edits it; every other file is
edited as before.

    atlasbound protect --source
    atlasbound protect "src/**,index.html"

`--source` takes the source folders and entry files setup found; the second form takes the paths and globs you name. Run
it again whenever you want to protect more. Taking protection away (`--none`) is yours only, at your own terminal.

**4. Check, then restart.**

    atlasbound doctor

It ends `doctor: ok` when everything is wired. Then start Claude Code in the repository, or restart it, so it loads the
hooks.

**5. Work as usual.** Give your session a task. While this branch has no plan, the session is told that protected files
need one and is handed the plan pack for the area of your task; an AI edit of a protected file without a READY plan is
stopped. You can also start a plan yourself: `/decisionbook <task>`.
The agent researches the code, sends its plan, and shows you its open questions in one message, each with the answer it
proposes. Answer them in any words you like, then say yes to the plan. Once it is READY, the edits it names go through.

**6. Record a decision on the way.** When you settle something in the middle of the work, `/decide <area.topic> "<what
was decided>"` asks your session to add it to the branch's plan, with your words beside it.

**7. Hand off.** `/handoff` writes the branch's note: where you are, the next steps, and up to seven lines quoted from your
own messages. Then `/clear` and `/resume-handoff`: the new context starts from the note and from the plan's settled
decisions.

**8. Close the plan.** When the work is done, before you commit it, `atlasbound decisionbook close <id>` records the
plan's own commits, files and tests, and prints one `git add`, `git commit` command: one commit then carries the code
and the plan. The commit's subject is the plan's title, or the line given with `--subject "<what shipped>"` where less or
other than the title shipped; a plan with a question still unanswered asks for that line (`plan-close-subject`), since its
title may name a part that was left out. You do not have to ask for it: a turn of your AI that ends on work no close records is held once (for the
work tree as it is) until it closes or tells you what is left, and each message you send is told the commit that waits,
so "what do I commit?" gets that command. Until you make the commit the plan stays open: ask for one more change and
the edit goes through, the next close takes the earlier record's place. If you committed first, close prints
`git add <the plan's file>`, `git commit --amend --no-edit`: the record goes into your commit, as long as the commit was
made in this checkout and no other branch, remote or tag holds it; a commit that is already shared is never rewritten,
and close says the record is one more commit. The product never commits for you. The record says who closed it: you,
by name, in your terminal or in a session you prompted; a teammate's plan is closed by a person in a terminal, never by
an AI session.

**Read what was decided** (none of these change anything):

    atlasbound decisionbook show <id>
    atlasbound decisionbook show file:src/store.js
    atlasbound decisionbook related src/store.js
    atlasbound decisionbook find poll limit

`show` prints one plan, or a file, decision, issue, test or commit with its links both ways; `related` lists earlier plans
that touched the same files or area; `find` lists the plans that hold some words.

**Updates.** Install the new version (`npm install -g atlasbound`), then run `atlasbound update` in each repository: it
wires the repository for the installed version and keeps your modules. `atlasbound doctor` says when they differ: its
`on PATH` row names an `atlasbound` on PATH of another version than this install, and a hook the installed version wires
but the repository lacks is listed with `fix: atlasbound update`. Restart Claude Code after an update.

**Stop it.**

- One project, one module: `atlasbound modules off <module>`, typed by you; its data stays, and `modules on`, typed by you too, wires it back.
- One project, all of it: `atlasbound uninstall`, typed by you at your own terminal with the phrase it shows. Your plans
  in `.decisionbook/` stay unless you add `--purge`.
- The program: `npm uninstall -g atlasbound` after uninstalling in each repository.

There is no switch for one session. A switch your AI session could set in its own environment would switch the gate off,
so turning anything off is your act at your own terminal.

## Teams and git

**Set up a team in three steps.**

1. One person runs `atlasbound setup` and `atlasbound protect`, then commits `.gitignore`, `.claude/settings.json` and
   `.decisionbook/` and pushes.
2. Everyone else installs once (`npm install -g atlasbound`) and runs `atlasbound setup` once in their clone. Setup sees
   that the team set the repository up, says so, and wires only their machine: it adds nothing git would show, and leaves
   every file that came with git as it came.
3. Plans and decisions arrive with `git pull`, like code.

**The team notice.** The person who sets up first gets one hook row in `.claude/settings.json`; setup says so. Committed,
it reaches every teammate. When a teammate whose machine is not set up starts Claude Code in the repository, their first
message is stopped once per session with what DecisionBook is and the two commands to set it up. Sending the message again
goes on without it. Only a run a person types in (the terminal, the VS Code extension) is stopped; `claude -p`, the SDK, a
GitHub action, a remote run and CI never are. Where the repository is set up on that
machine, the row runs, finds this machine's setup record and stays silent. The row is a `node -e` one-liner with no
dependency, so it works in every shell Claude Code uses. Where `node` is missing, the row fails and the message goes
through. `atlasbound doctor` has a `team notice` row: committed, not committed yet, or off.

**Switching the notice off.** Delete that row from `.claude/settings.json` and commit. A teammate's later setup or update
does not put it back, because a repository your team set up keeps the file git brought. Setup and update never rewrite a
committed row on their own, even one an older version wrote, which still works. `atlasbound setup --team-notice` writes or
refreshes only that row; commit it afterwards. A repository set up by a version before the team notice has the `.gitignore`
block but no row: setup and doctor say so, and `atlasbound setup --team-notice`, then a commit of `.claude/settings.json`, adds it.

| | Travels through git | Stays on each machine |
|---|---|---|
| `.decisionbook/` (plans, decisions, `config.json` with what you protect) | yes: commit it | |
| `.gitignore` block | yes: commit it, so every clone ignores the same files | |
| `.claude/settings.json` team notice row | yes: commit it, so teammates are told | |
| `.claude/settings.local.json` (the six hooks, the allowed commands) | | yes: it names this machine's node and install |
| `.atlasbound/` (traces, setup's record, drafts) and the slash command files | | yes: ignored (the command files in the checkout's own `info/exclude`, where git keeps it; a linked worktree's too) |
| Handoff notes and the excerpts of your messages | | yes: in your home folder, never in the repository |

A plan file is append-only and reviewable in a pull request like any other file. The plans carry each decision in the words
it was given, and `config.json` carries what you protect, so a teammate who pulls is guarded by the same paths. A teammate
gets your plans, not your handoff.

**Taking it out on one machine.** `atlasbound uninstall` removes that machine's wiring only. A file that came with git as
it is (the `.gitignore` block, the team notice) stays as it came, and uninstall names each one it kept.

**Plans follow branches.** A plan records the branch it was started on, and the gate looks for a plan on the branch you
are on. Merging a branch brings its plan files with it.

**Someone else's decision.** A colleague is credited only for words that are theirs; everything else you say is your own
decision, and what nobody stated is marked as assumed. *You relay it*: paste their words in a form that names them, and
they are recorded as theirs, relayed by you ("said in session"), with the whole sentence beside it. The forms are a chat
line `Emma: …`, the first line under a chat header with a name and a time (`Emma  [2:07 PM]`, `[11/23 2:07 PM] Emma (BA)`),
a bare `Emma:` line with the line or list under it, and the `>` lines under `Emma wrote:` or `On …, Emma wrote:`. A line
you type right under a paste is yours. A relay in your own words ("I asked our designer: keep 100", "Emma says …") is
put to you once when your AI records it: Claude Code's own permission prompt lists every such sentence of the batch,
"Record as Emma's words: 1) "…" 2) "…"  Allow = yes, Deny = no". Allow credits them to her, and each record keeps that list
and its time (`show` says it). Deny, or a mode where no one can be asked (`bypassPermissions`, `dontAsk`, `-p` without a
prompt tool), records them as your own words and the plan goes on; the same list is not asked again. No reply of yours is read
for it. Your AI keeps the whole sentence your words stand in, never a part of it. When a teammate's words are mixed into your own sentence, or you choose Deny, they are recorded as your words. Separate them on an `Emma:` line to credit Emma. *They wrote it down*: point at it ("Olivia answered on the issue, see her comment") or let your
session find it in the issue. It is recorded as theirs, in your session, with the comment's address; the product
reads that address itself (through your own `gh`) and refuses the record when the quoted words are not there. A
sentence you said for yourself ("the rest is fine as you suggested") is yours, never a colleague's. It settles the
open questions only: a decision a colleague made is replaced by words of yours that name it, or by your answer when your
AI asks you about that decision by name (`replace-blanket` otherwise). The same holds wherever you pass their words on:
in the task message, before any question, or later. A question you put off ("as a todo", "not sure yet")
is recorded as put off, in your words: it decides nothing and stays open until you answer it.

When the plan is READY the reply lists who decided what in plain words ("Emma (BA) said: … · you decided: … · assumed:
…"), and your session shows it to you: correct a wrong name there, before anything is built.

When the issue, a comment or a document names someone else as the one who answers a question, your session addresses it
to them: such a question waits without blocking the plan. Until it is answered, by them or by you, every session start and
`atlasbound decisionbook inbox` name it, in every clone that holds the plan: with the plan, the one it waits for and the
teammate who asked. A teammate who pulls your branch sees it too, marked where it waits for them, so whoever talks to that
person brings the answer.

**Work that starts from an issue.** Name the issue as the work in your task message ("Get issue #12", "fix #12", `GH-12`,
or the address of an issue of this repository), or work on a branch that says `issue` or `gh` before the number (`issue-12`,
`fix/gh-12-export`): the new plan is linked to it (`for issue:#12`) without anyone having to remember. The link is written
only where one issue is named so. A number named any other way links nothing: a pull request, "step #3", a colour, a
version or a date in a branch (`release/2026-11`, `fix/404-page`, `feat/12-export`), another repository's issue, several
issues at once. The issue is the one your task message names: a later message that mentions another issue changes
nothing. A second plan in the same session takes the issue you named after the first. If a link is wrong, say so: the removal is recorded as yours (an `unlink` record with `rel` `for`), the
plan and the issue no longer show it, and the right issue is linked after it.

**Changing a decision.** A later decision replaces an earlier one by naming it. A person's decision is replaced only by a
decision of a person; the AI's own decision never replaces it. The earlier records stay in the file. Inside one plan, a
decision changes by its key written again, naming its own `<plan id>/<key>` in `supersedes`.

**Two answers after a merge.** When two people answer the same question of one plan on two copies of a branch and the merge
keeps both lines, neither answer replaces the other, whatever their order. Where their values differ, every reader (`show`,
`pr`, the plan pack, `related`, `inbox`) names a conflict instead of a decision: each line with its number in the file, who gave
it and their words, and that none holds until the person says which; `git blame` on those lines names who committed each. The
plan is not READY until the person's answer is recorded as that change: in a session, the answer to a question whose
`supersedes` names every line, typed after that question was on record (the AI records the question first, then asks; an
answer typed before it is refused as `conflict-unasked`). That answer ends the conflict at once, also while the plan that
holds it is still a draft; it ends only the lines the question named, and anything else the answer replaces waits for
READY like any draft's. The same value is no conflict; the same words with another value
are. Two plans that replace one old decision under two key names are a conflict the same way, and so are one person's keep of a
decision and another person's replacement of it, in two plans or under two keys: the person's answer names both lines, under
any key, as the answer to a question naming both. In one copy, a replacement of a decision a person keeps names their keep too.
Two shapes of keep against change are not yet seen as a conflict; CHANGELOG (0.25.3, known limits) names them.

**A plan whose decision lost a conflict.** A plan that was READY and already edited its files, whose own decision then stood
in a conflict with another plan's and lost it (the person's answer took another value), may have left code that no longer
matches what holds. That is one open item, said in the same line by every reader of the plan (`show`, `ready`, `close`, `pr`,
`why`, `find`, `related`, the plan pack, the session start, `debug decisionbook`) and counted by `inbox`: the plan, the line
that lost, the line that holds now, the files. Under that plan the gate denies `plan-lost`. Nothing changes your code by
itself: a new plan of those files restores or adapts it. The AI tells you what the code holds and asks you; on your answer it
writes the item's own `{"t":"link","rel":"compared",…}` record on the plan, with a short `why` (what it saw in the code) and
your words (`said`, from a message you typed after the line that holds now was written), and that clears it; a record without
your answer is refused, and nothing else clears it. The plan whose value the person took is
not flagged, and two answers that met inside one plan file are that plan's own change (no item).

**Two people, one task.** A plan id ends in four hex characters of the moment it was started, so two people who start the
same task on the same day write two plan files and the merge is clean; where they disagree, the rules above show it. A
teammate's plan stays theirs: your session plans your task beside it, and your decision never overwrites a line they wrote
(`decision-teammates`); it goes in your own plan and names theirs, so both stand in the records. Whose a line is, git says
(the mail your clone commits as against the commit's author, both through `.mailmap`); set it on every machine, and join
your own mails in `.mailmap`. When you say a decision stays ("keep it at 100"),
your AI records a keep even though no code changes; if a teammate replaced it meanwhile, the merge shows one conflict. The
conflict names whose each line is (a teammate by their git name) and where your answer goes; your answer replaces the other
lines and may keep the one it takes, whose plan then lost nothing. Each person clears the open item of their own plan.

**A merge git could not finish.** Two people who add records to one plan on two copies of a branch append to the same file,
and a plain merge stops with git's conflict markers in it. While a plan file holds `<<<<<<<`, `=======` or `>>>>>>>`, every
reader, `doctor` and the gate say that file has unresolved git conflict markers at its lines, the plan covers no edit, the
session start says to resolve the merge first (it asks for no new plan), `inbox` counts it, and the gate denies every protected
edit (`plan-unmerged`) until you resolve the merge in git (keep each record line of both sides once). We
recommend one line in the repository's `.gitattributes`, committed: `.decisionbook/*.jsonl merge=union`. Each record is one
line, so git then keeps both sides' lines with no markers, and the rules above show any disagreement they carry.

**Mixed versions.** A teammate on an older version may read newer records differently; CHANGELOG.md says where.
Upgrade together where you can, and run `atlasbound update` in each repository after an upgrade.

## Privacy

PRIVACY.md is the full statement; this is its outline, and where the two differ, PRIVACY.md holds.

- **Where it runs:** on your machine, when your Claude Code session calls its hooks or you type a command. Your code and
  your records stay there; the one thing that leaves is the daily usage report under Telemetry below.
- **In the repository:** setup's wiring, `.decisionbook/` (plans, decisions, assumptions, checks and its config; a
  decision, a confirmation and a plan set aside hold your answer in your own words, by design), and under `.atlasbound/`
  the trace, setup's record, telemetry's local files and `drafts/` (a record your AI session wrote for a command, removed
  once the command took it, kept when it was refused: it may hold your sentence; out of git like the rest of `.atlasbound/`).
- **In your home folder,** under `~/.atlasbound/`: per repository, the name your decisions are recorded under, the statements
  DecisionBook took from your prompts and Handoff's notes, journal and edited files; and whether you turned telemetry on. On macOS and Linux the product makes it
  your user's only (folders 0700, files 0600, tightened again at each write); Windows has no such modes, so there the
  folder has the permissions it inherits from your user profile, which on a default profile are your user's, the system's
  and the administrators'.
- **What it sends:** the daily usage report under Telemetry, and nothing else. Your code, records, prompts and paths are
  never sent. What the hooks add to your session goes where that session already goes. No command starts a model or your
  `claude` command line.
- **Telemetry:** on by default during the beta, from the moment its notice has been shown to you (by setup at a plain
  terminal, or by Claude Code at a session start): one report per module and finished day of step counts, time ranges and
  outcome codes goes to api.atlasbound.dev, at most once a day. `atlasbound telemetry next` prints every byte before it
  leaves and `history` what left; `atlasbound telemetry off` stops it; `atlasbound telemetry reset --forget` has the
  server's copy deleted. Every field: PRIVACY.md.
- **Removing it:** `atlasbound uninstall`, and `--purge` for the data it kept.

## Settings

| Where | What | Who changes it |
|---|---|---|
| `.decisionbook/config.json` `protect` | the paths and globs an AI edit needs a READY plan for | `atlasbound protect`; `--none` is yours only |
| `.decisionbook/config.json` `danger` | paths that make any plan naming them critical work | you, by hand; an AI edit there asks you first |
| `.decisionbook/config.json` `risk` | this repository's own risk areas: the folder or file names that make work critical unless you waive it, in place of the built-in list (`[]`: none) | you, by hand; an AI edit that takes an area out asks you first |
| `.decisionbook/config.json` `answer` | your answer to setup's protect question, with how and when it was given | `atlasbound protect` writes it |
| `.atlasbound/cli/config.json` `hookTraceDays` | how many days of hook trace files are kept (default 14, at least 1) | you, by hand |
| `atlasbound modules`, `modules on` / `off <module>` | which modules are wired in this repository; turning one off keeps its data | `on` and `off` are yours only |
| `atlasbound telemetry on` / `off` | telemetry for your user on this machine | `on` is yours only, at a plain terminal |

**Levels.** A plan runs at one of three levels: `micro` (a small fix), `normal` or `critical`. The agent proposes the level
and code only raises it, from what the plan touches: its planned paths and the shared consumers it names, never the words of
its title or reason, so the same file gives the same level in every plan. One rule, by what the plan touches and never by
its size: a path under `danger` or a database schema or migration path makes the work critical and is never waived; a risk
area or 3 shared consumers make it critical unless you waive it; a small fix that plans more than 2 files, a glob or a
shared or entry path runs as normal work (unless it writes only tests, fixtures or docs); anything else runs as proposed,
so a one-file fix outside those paths stays a small fix. No level proposed is critical; a proposal is never lowered
(`core/level.cjs`).

A risk area is where a mistake costs money or lets the wrong person in. A planned path is in one when a folder of it, or
its file before the first `.`, is named so, whole: `src/auth/token.ts`, `lib/billing.py` and `app/payments/**` are;
`src/orders/authToken.ts`, `src/ui/SessionList.tsx` and `src/orders/price-label.ts` are not, and a test, fixture or doc
path never is. The built-in names are `auth`, `login`, `password`, `permissions`, `billing`, `payment`, `payout`,
`refund`, `invoice`, `subscription`, `checkout`, `kyc` and their close forms (`RISK_AREAS` in `contracts/rubric.cjs`).
Your repository can name its own: `"risk": ["auth", "pricing"]` in `.decisionbook/config.json` stands in place of the
built-in list, and `"risk": []` switches risk areas off; you edit it by hand, and an AI edit that takes an area out asks
you first.

The level line always says why: the signal and the path that holds it, or what keeps the level as proposed; an area your
repository names is said as "named in this repository's `risk` list", and a built-in area your list leaves out is named
on the line too. What READY needs at each level, from the rubric (`contracts/rubric.cjs`):
- small fix (`micro`): the files it plans; every blocking question answered; nothing placed nowhere that a person decided; a
  decision for each danger path; your yes.
- normal: those, and a success signal with the kind of work, one check, a command that runs it, the standards asked where a
  new file goes, 3 forks settled (or a stated reason none is left), a repro for a bug, a precedent for a user-interface file.
- critical: those, and 5 research records on files read, the feature it changes, 2 checks, a task per check, actors, 3 edges,
  the impact on shared consumers, 5 forks, a risk and a rollback.

**Switches the product reads.** `DO_NOT_TRACK` set to any value but empty or `0`, `ATLASBOUND_TELEMETRY=0` and `CI` turn
telemetry off for the process they are set in, whatever else says; no variable turns it on. Handoff's
one context notice comes when a session passes 55 % of its model's context window; it reads Claude Code's own
`CLAUDE_CODE_MAX_CONTEXT_TOKENS` and `CLAUDE_CODE_DISABLE_1M_CONTEXT` to know that window.

## Troubleshooting

**Start with `atlasbound doctor`.** It checks what is installed and wired, asks the hooks one test question, and ends
`doctor: ok` (exit 0); otherwise it names each problem with what to do (exit 1). `atlasbound status` is the quick look
without the checks.

| You see | What to do |
|---|---|
| `not-a-repo: ... not inside a git repository` | run `git init` there first, or name the repository with `--target` |
| `hooks firing: not measured` in doctor | restart Claude Code in the repository, so it loads the hooks |
| `gates off: the node or program its hooks name is gone` | run `atlasbound setup` (or reinstall `atlasbound`), then restart the session |
| doctor shows the hooks as not wired after an upgrade | run `atlasbound update` in that repository |
| `AtlasBound needs Node 22 or newer` | install AtlasBound with Node 22 or newer; your project can keep its Node |
| a decision refused as not yours | answer in a typed message: the words recorded as yours must be in a message you typed in that session; a choice picked in a question dialog is no typed message |
| `config-invalid` | a settings file above does not read; doctor names it, and every command but a hook, help, `doctor`, `debug doctor` and `debug trace` refuses until it is fixed |
| your first message stopped with "this repository uses DecisionBook ... not set up on this machine" | your team committed the team notice: install and run `atlasbound setup`, or send the message again to go on without it for this session |
| an AI edit goes through with no plan, and doctor's `gate answering` row says `not wired` | this clone is not set up on this machine: run `atlasbound setup`, then restart Claude Code |
| `on PATH ... is <version>, this install is <version>` in doctor | two installs on one machine (another Node's, another prefix's): install `atlasbound` again with the Node you use |
| hooks stopped after you switched Node with nvm | the hooks run the Node setup found, and fall back to a `node` on PATH outside the project; if both are gone they say `gates off`: run `atlasbound setup` with Node 22 or newer. nvm-windows switches Node for the whole machine: keep it on 22 or newer |
| a command refused with `atlasbound: <code>: <why>` | nothing was done; the line says why, and `--json` gives it as one object |

**What went wrong, step by step:** `atlasbound debug trace --last` shows the steps of the newest work and how each one
ended.

**Leftovers of a version before 0.25.** That earlier, closed product left hook rows, a server and logs in your home
folder. Close every Claude Code session that was open before you upgraded and start it again, then run
`atlasbound leftovers`: it lists what is left, and `atlasbound leftovers remove` (yours only) takes it out after keeping
a copy of each file in `~/.atlasbound/leftovers-backup`. CHANGELOG.md says what that version sent.

**Windows.** The hooks need Git Bash (it comes with Git for Windows). The README's Windows section has the rest.

## FAQ

**How does DecisionBook differ from keeping notes, or from a long chat history?**
It works before the code, not after it: an AI edit of a protected file waits for a plan you said yes to. What it keeps is
narrow and checked: a decision recorded as yours must quote words you typed in that session, so an answer the AI guessed
cannot be recorded as yours. And it keeps it where code review already happens: plain JSON lines in the
repository, one file per plan, linked to the files, checks and commits of that work. It makes no model calls of its own.

**Does it need an API key, or call a model?** No. The only AI involved is your own Claude Code session.

**What does it cost?** Nothing: no account, no server, no model calls of its own. What its hooks add to your session's
context is the only cost, and it is counted in your session's own usage.

**What does it add to git?** `.decisionbook/` (one file per plan, and `config.json`), setup's `.gitignore` block and the
team notice row in `.claude/settings.json`. It never commits, rewrites history or changes a commit: you commit these files
yourself.

**Does my team need it too?** Each person who wants the gate and their decisions recorded installs it and runs setup once.
A teammate without it still gets the plans with `git pull`, and the team notice tells their Claude Code session once that
the repository uses it. Their AI edits are not gated until they set it up.

**What is it not?** Not a sandbox: it guards the AI's edits of the files you protect, and a person or a program outside
the session is not stopped. Not a chat log, a code map or an agent memory: it keeps plans and the decisions a person made,
tied to files, not the conversation or a model of your code.

**Does it commit or push for me?** No. `close` prints the one `git commit` command for the work and the plan's record; you run it.

**Does every edit need a plan?** Only an AI edit of a file you protect. A plan covers its files: an edit inside a READY
plan goes through, and a protected file the plan does not name is asked first.

**Can my AI record an answer I did not give?** A record whose words are not in a message you typed in that session is
refused. The product does not check that the AI understood you: `atlasbound decisionbook show <id> decisions` prints
your words beside the value it recorded.

**Does it work with other coding agents?** Not yet: it is built and tested for Claude Code.

**Is Bound needed?** No. Bound is a separate, closed add-on; nothing in this package needs it.

## Why

A decision made in a chat lives as long as the chat. After `/clear`, a new session or a new teammate, the agent either
asks again or picks for you, and nobody can see later why the code is the way it is.

So DecisionBook moves the questions to before the edit, when an answer is cheapest, and asks only what the code, git or
an earlier plan cannot answer. It keeps the answer in your words, because the AI's reading of what you meant is not the
same thing as what you said. It keeps it in plain files beside the code, because that is where a reviewer, a teammate and
the next session already look. Handoff exists because a context window ends long before the work does.

It adds no model and no server, so it costs no tokens of its own beyond what it adds to your session, and your code goes
nowhere it does not already go. The README's experiment shows what it did, and did not, change on one long task.

## Record format

A plan is one file, `.decisionbook/<id>.jsonl`: one JSON object per line, appended, never rewritten. The id is the date,
the title's words and four hex characters of the moment it was started (`2026-11-04-login-times-out-3f9a`; `-2` when taken); an id
written by an earlier version stays as it is. Each line is stamped with `at`, the time it
was stored. The first line is the `plan` record and carries `"schema": "decisionbook-record/1"`. Readers ignore unknown
keys; a changed field takes a new major version, and a file of another schema is refused, not guessed at.

The same contract ships as data any language can read: `contracts/record.json` of the `decisionbook` package
(`packages/decisionbook/contracts/record.json` in the public repository).

**Field types:** `str` non-empty text; `word` one token, no spaces or quotes; `id` letters, digits, `_`, `.` and `-`;
`ref` a `path:line`; `int`, `bool`; `[]` a list of them; `?` an optional field.

| `t` | Fields | What it is |
|---|---|---|
| `plan` | `schema`, `id`, `title`, `why?`, `success?`, `goal?`, `kind?`, `level?`, `tags[]?`, `branch?`, `head?`, `by?` | the first line; `kind`: bug, feature, chore, refactor; `level`: the AI's proposal |
| `amend` | `title?`, `why?`, `success?`, `goal?`, `kind?`, `level?`, `tags[]?` | a later change to the plan's own fields |
| `research` | `tool`, `asked`, `answer`, `source?`, `settles?` | what was asked of the code and what it answered; `settles` (with `source` a `ref`) names the decision a code fact closed |
| `research` (tool `run`) | `tool`, `command`, `observed`, `source?`, `settles?` | a command that was run and what it showed |
| `pointer` | `tool`, `asked`, `answer`, `source?` | another tool's answer, kept beside the research, never counted as research |
| `question` | `q`, `text`, `decides`, `whyNotCode`, `blocking?`, `proposal?`, `to?`, `source?`, `supersedes[]?` | a question for the person: the decision it unlocks, why the code cannot answer it, the proposed answer; `to` addresses someone else |
| `decision` | `key`, `value`, `why`, `by`, `said?`, `saidBy?`, `answers?`, `effect[]?`, `supersedes[]?`, `keeps[]?`, `scope?`, `proposed?`, `files[]?`, `source?`, `head?`, `revises?` | `value`: what the AI understood was decided; `revises`: written by the product alone on a change of the plan's own decision, the `at` of the line it replaced; `said`: the words it holds, as typed in the session or read at `source`; `by`: who recorded it, set by the product: the person's name as kept on their machine (`atlasbound whoami`), or `ai`; `saidBy`: the teammate whose answer it is, with `source`: where it was said ("said in session", or the address the product read it at); the AI sends `whose` and `said`, never `by` or `saidBy`; `effect`: what it changed in the plan, as `kind:value` |
| `assumption` | `text`, `why`, `q?` | what the AI took as given; never an answer, never a person's |
| `confirm` | `by`, `said`, `amended[]?` | the person's yes to the plan, in their own words |
| `check` | `id`, `text`, `how?`, `command?` | how the work is checked; `how`: unit, component, e2e, manual |
| `item` | `kind`, `text`, `covers[]?`, `file?` | one lens of the plan; `kind`: actor, feature, edge, impact, consumer, precedent, repro, risk, rollback, task, non-goal, no-fork |
| `item` (kind `step`) | `kind`, `order`, `file`, `change`, `verify`, `after?` | one ordered implementation step |
| `item` (kind `gap`) | `kind`, `gap`, `status`, `text`, `source?`, `run?`, `q?` | one gap closed; `status`: evidence, asked, na |
| `link` | `rel`, `to`, `why?`, `source?`, `by?` | a relation to a file, test, issue, commit, plan or handoff (table below) |
| `waiver` | `reason`, `by`, `said?` | a lower level than a soft signal asks for, and who approved it |
| `note` | `text`, `by?` | a free note |
| `aside` | `by`, `said` | the person set this open plan aside, in their own words |
| `later` | `answers`, `by`, `said` | the person put a question of the plan off ("as a todo", "not sure yet"), in their own typed words: it decides nothing, the question stays open, and every reader says who put it off |
| `unlink` | `rel`, `to`, `why`, `by` | the person removed a link the product wrote: `built-on`, or the issue link (`for`) |
| `ready` | `scope[]`, `level?`, `head?` | the plan became READY and froze: its planned paths |
| `closed` | `own[]` (`sha`, `subject?`), `files[]`, `tests[]`, `other`, `unplanned?`, `rides[]?`, `into?`, `head?`, `by?`, `subject?` | what shipped: the plan's commits, files and tests; `subject`: the closer's one line of what shipped, the commit's subject in place of the plan's title; `rides`: the files that go into one commit with this record (not committed yet at the close, or those of the commit `into` that takes the record in); `head`: the commit that work comes after; `by`: who closed it, set by the product |
| `resume` | `why` | an older plan's note that a later session went on with it; read only |

`plan`, `ready` and `closed` are written only by their own commands; every other type goes through
`atlasbound decisionbook add`, which refuses a record that does not fit its shape, and a whole batch when one record
matches a secret pattern. A gap is one of `existing-data`, `invalid-input`, `config-docs`, `compat-rollout`,
`failure-visibility`, `scope-surfaces`, `tests-proof`.

**Links.** A `link`'s `to` is `<type>:<value>`, one of `plan`, `decision`, `file`, `test`, `issue`, `commit`,
`handoff`. Read from the other end, each relation has its own word.

| `rel` | points at | read back as | |
|---|---|---|---|
| `plans` | file | `planned-in` | |
| `tested-by` | test | `tests` | |
| `for` | issue | `has-plan` | |
| `grows-from` | plan | `grew-into` | |
| `supersedes` | plan | `superseded-by` | |
| `relates` | plan | `relates` | |
| `depends-on` | plan | `needed-by` | |
| `handoff` | handoff | `handoff-of` | |
| `caused-by` | commit | `caused` | a bug's origin |
| `decides` | decision | `decided-in` | written by the product only |
| `changed` | file | `changed-in` | written by the product only |
| `shipped-in` | commit | `ships` | written by the product only |
| `built-on` | plan | `used-by` | written by the product only, when a record uses an earlier plan the session read |
| `contract` | file | `contract-of` | written by the product only |

**`.decisionbook/config.json`:** `protect` (globs), `danger` (globs), `risk` (names) and `answer` (`answer`, `door`, `at`), each
optional.
