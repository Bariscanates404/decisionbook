# Changelog

What changed in each release of the npm package `atlasbound`, newest first.

## 0.25.2

0.25.1 was never published to npm. Everything listed under 0.25.1 below ships for the first time in 0.25.2, together with
what this section lists.

### Reading the plans

- `atlasbound decisionbook inbox [--json]` lists what waits for you: a draft's open questions with the answer proposed (one
  parked with a colleague is not listed), READY plans not closed, and plans set aside; this branch first, then the plans pulled
  from other branches with their git author.
- `atlasbound decisionbook why <file>[:<line>] [--json]` names the commit of a line, the closed plan that shipped it, its
  decisions in the person's own words and each decision that replaced one since. An unknown commit, an uncommitted line or an
  untracked file is said plainly, never guessed; after a squash or rebase merge no closed plan lists the commit.
- `atlasbound decisionbook pr [<id> | --branch]` prints a pull request description in Markdown from the plan records: why,
  success, the decisions in the person's words, what their questions proposed, the checks with their commands, the commits. It is
  printed only; nothing is sent.
- `atlasbound decisionbook show` says once under a person's decision whose value is not its question's proposal:
  `its question proposed: <proposal>`. Whether the person took it is their AI's reading; it is never called refused.
- The three new commands read and write nothing else; their trace rows stay on your machine.

### What a session is handed

- Each earlier plan and decision handed to a session says where it came from (the plan, who decided), its day, who kept it since, and why it was picked (its file, folder, key area or words).
- "No record here", "a record could not be read" (the file named) and "not researched" (the work's files no plan touched) are said apart; none of them reads as "nothing".
- Each item names the one command that shows it whole: `atlasbound decisionbook show <id> decisions`, or `atlasbound decisionbook why <file>` for a file no plan touched.
- The texts say plainly that an earlier decision is no proof the code still does it today: check the code.

### Plans and the gate

- A READY plan covers the edits of a session that works on it: the session that made it or wrote to it, one where you resumed
  your handoff, or one that began with no new task (after `/clear`). A session that began with another task is denied inside
  that plan and plans its own; where you asked it to go on with the plan, it records that on the plan first.
- A plan made on a detached HEAD says "a detached HEAD", never `null`. `close` prints a commit command that works whether or
  not the plan file was committed before (`git add`, then `git commit`).
- Recall finds a plan by a form of a word (`düğmesinin` finds `düğmesi`), and `related <file>` lists the branch's READY plan of
  that file. A file whose plan holds a line that does not read is named with that line.
- A quoted answer after a colon (`its answer: "…"`) is a sentence of its own: quoted whole, it is your words.
- Each of your decisions of a key now carries `revises`, written by the product: the times of the lines of that key it replaced.
  Two lines of which neither replaced the other are a conflict after a merge, whatever their order in the file (a side that
  changed its answer twice included); one person changing a key twice is not. A line with no `revises` replaces none.
- A conflict across plans (two plans' decisions of one key after a merge) is shown and held like one inside a plan. The person's
  answer must name every line of a conflict, and a decision of a key the plan already holds another of yours for must name it
  (`decision-unnamed` lists the refs): writing never makes a conflict, only a merge does.
- Setup and doctor tell a repository set up by an earlier version how to add the team notice (`atlasbound setup --team-notice`).
- A READY plan whose decision holds a conflict after a merge covers no edit (`plan-conflict`): `ready`, `debug decisionbook`
  and the session start say it is held, and `inbox` says "READY, held by a conflict"; your answer frees it with no new yes.
- In a session, an answer that ends a conflict must answer a question whose `supersedes` names every line of it, in words you
  typed after that question (`conflict-unasked`): you see the conflict before your answer counts.
- A keep of an old decision and a replace of it, merged from two copies, are a conflict; a keep in other words after your yes
  holds the READY plan (`plan-yes-taken`) until your yes again. A yes your AI records from the same message as the keep counts.
- Two plans that replace one old decision under two key names are a conflict too: what was replaced decides, not the key name.
- Only the same value, byte for byte, makes two merged answers compatible; the same words with another value never do.
- An answer relayed through a question parked with someone else never decides a key you decided in the plan.
- A shell command that sets, exports or unsets the host's session variables (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_PROJECT_DIR`,
  `CLAUDE_PID`) is denied (`shell-host-env`): no command acts as another session.
- Setup and update leave a committed `.gitignore` as git brought it: this machine's command files and a server-wired `.mcp.json`
  are ignored in the clone's own `.git/info/exclude`. Uninstall gives the team's settings file back byte for byte where the
  team row was all it took out. `protect` writes no time into `.decisionbook/config.json`.
- The team notice stops a message only in a run a person types in (the terminal, the VS Code extension); `claude -p`, the SDK,
  a GitHub action, a remote run and CI are never stopped.
- Your AI cannot decide over a key you decided: its own decision of that key in the same plan is refused (`decision-theirs`)
  and it is told to ask you; it may keep its view as a proposal. An AI line a merge put after yours never takes your decision's place.
- Two answers to one question after a merge: when a merge keeps two people's decisions of one key in one plan, neither
  replaces the other, and their values differ, `show`, `pr`, the plan pack, `related`, `inbox` and `ready` name
  a conflict in place of the decision: each line with its number, who and their words, the `git blame` that names its commit,
  and that none holds until the person says which; the plan is not READY until their answer is recorded. The same value is no
  conflict. A decision of the same plan now changes by its key written again naming its own
  `<plan id>/<key>` in `supersedes` (this was refused as `supersede-self`); the key written again in other words with no
  `supersedes` reads like a merge and is shown the same way.

### Command line

- `atlasbound upgrade` and `atlasbound install` answer with the command they mean (`update`, `setup`).

### Telemetry

- In a build with an address, setup's telemetry question asks once more when the answer is neither y nor n, then says that
  no choice was recorded. This build has no address, so setup does not ask, and telemetry stays off unless you turn it on.
- Telemetry rebuilt, still sending nothing: this build has no address. Per module and day it makes a report of step counts, ranges and
  outcome codes with the version, Node major, OS family and a random 30-day id; `atlasbound telemetry next` and `history` show every
  byte; `off`, `on [module]`, `reset --forget`. No hook sends or starts anything.

## 0.25.1 (not published: included in 0.25.2)

The first Windows test of 0.25.0 found most of the gaps below; this release closes them.

### Your answers

- Your AI records what you answered: the value is its reading of your answer, your own words beside it. Every way of
  answering works the first time, in any language: one by one, "go with your suggestions", "yes, but keep the old limit".
- The product checks one thing: a decision, a confirm, a waiver or an aside recorded as yours quotes whole sentences or
  clauses of a message you typed in that session (a confirm's and a waiver's after the plan was written). Anything else is
  refused and nothing is written; the AI sees in the same turn each decision recorded as yours, with your words.
- Gone: the product's own reading of your replies (yes, take, keep, open, relay readers and their word lists), the
  "asked again" message (`answer-unread`), `atlasbound debug said`, and the "taken whole" mark.
- The product no longer checks the value against your meaning: `atlasbound decisionbook show <id> decisions` prints your
  words beside it.
- Replacing and keeping: when the AI asks whether to replace a decision, it records which you chose, `supersedes` or
  `keeps`; a keep replaces nothing and is no yes, so the plan waits for your yes in words. The AI's own decision never
  replaces a person's. A plan is not READY while a decision of yours stands beside another person's of the same key and
  names it nowhere. A teammate on an older version sees a kept answer as a second decision of the key until they upgrade.

### Documents

- GUIDE.md, a sixth root document: getting started, teams and git, privacy, settings, troubleshooting, FAQ, why, and the
  plan file's record format. The README's first screen says what the tools do and do not do, and what they need.

### Upgrading from 0.25.0

After upgrading, run `atlasbound update` in each repository you set up. The hook entries this version writes differ from
0.25.0's, so until then `atlasbound doctor` shows them as not wired, and its last lines name `atlasbound update`.

### Plans and the gate

- A plan is not READY while a person's standing decision of another plan holds on a file it edits and the plan places it
  nowhere: your answer replaces or keeps it, or the plan says in a `non-goal` item why its change leaves it. A file the plan
  only reads places nothing.
- Each AI session writes its drafts into its own folder under `.atlasbound/drafts/`, and a command never reads another
  session's draft: two sessions started together each keep their own plan.
- A protected file outside a READY plan is no longer added to it in silence: the edit is asked, and the person's yes adds the
  file. If the plan grows past the level it was confirmed at, it covers no edit until it holds that level's rows.
- A draft plan holds back only the files it names; a READY plan that does not cover a file says to open a new plan for it.
- "Go with your suggestions" counts for the questions the AI showed, also when it put them in its own words; "your
  proposals, except Q3" leaves Q3 open. A relayed answer ("I asked Ayşe: …") is the person's, with who they asked.
- Only a yes to the proposals takes them ("go with your suggestions", "yes, all of them", "as you propose"). A refusal, a
  question, "let me think about your suggestions" or "your proposals are terrible" decides nothing: no decision is
  recorded as yours and the plan stays a draft. Before, any reply that named the suggestions counted as a yes to all.
- You replace a decision a teammate recorded in one answer: the AI asks you in a question that names that decision, and
  your yes to it replaces it; the old one then shows as superseded, with who replaced it and their sentence.
- On a shared branch a teammate's open draft no longer stops your work: a new session names it in one line and asks you
  nothing about it; only work on that draft's files goes on in it. Before, every new session of everyone on the branch
  first asked whether to finish it or set it aside.
- Your own draft that an earlier session left, its questions still open, no longer stops an unrelated task either: a new session
  names it in one line, the task is planned beside it, and the draft comes whole only when your message is on its files or title.
- Two plans that decide the same short key (`layout`) about different files no longer show a CONFLICT or a link between
  them; plans that share a file, and a key that names its area (`auth.session-ttl`), still do.
- `atlasbound decisionbook show decision:<key>` and `show <id> decisions` say a decision's state (`superseded by …`) before
  the person's own sentence, so a long sentence no longer hides that the decision was replaced.
- A yes that goes on to say yes to that change is still a yes ("Yes, Jupiter too, I am changing the old decision.", "Evet,
  Jüpiter eklensin."); "yes, but don't", "Yes, the earlier decision.", "Evet, kararı Elif değiştirsin." and a negation after
  "replace it:" are asked again. An answer that only agrees with the proposal shown ("Yes.", "5. As you suggest.") is recorded as yours with that proposal as its
  value: a bare "Yes." is never the whole decision.
- Your yes that opens an answer to a question replacing your decision ("1. Evet, eski kararı değiştiriyorum: …") records the
  proposal the AI showed as your decision, your sentence beside it; "Aynen kalsın." to a proposal that also changes something
  stays your own words.
- "Yes, keep the old one." ("Evet, eski karar kalsın.") to a question that asks to replace your decision replaces nothing: your
  decision stays, and the AI asks you again. Before, it counted as your yes and showed your decision as replaced.
- When your words in a plan change a decision you made earlier ("eski kararı değiştiriyorum", "no longer show it") and the AI
  did not ask about that decision, the plan is not READY and its files stay closed until you answer a question that names it:
  your yes replaces it, your no keeps it. Before, your answer could be recorded beside the old decision, which stayed in force.
- "Öneriler olduğu gibi." ("the proposals as they are") and "Üçüne de evet." ("yes to all three") take every proposal the AI
  showed, like "as you propose", and "Olduğu gibi kalsın." takes the one it showed. Before, the AI asked you again.
- Your "yes" to the AI's question whether a plan is set aside now sets it aside when the AI wrote the question in bold with a
  sentence after it. Before, the question went unseen and every yes was refused, as was the record the product itself showed.
- A question the product hands back to ask again names each decision it would replace once; before, one already named came twice.
- Your yes to a proposal records the proposal the AI showed you, even when the AI writes the question again with other words
  for it afterwards; a proposal that is itself only a yes ("Evet, karar yukarıdaki haliyle güncellensin.") never becomes the
  decision that replaces yours: your own sentence does. Before, such AI text was recorded as your decision.
- When the AI shows several proposals and tells you one "yes" takes them all, your "evet" / "yes" takes every one of them;
  "Evet, ikisi de." takes both, and "öneri uygun" counts like "Önerin olsun.". Before, the yes took the first question only, as
  the bare word "evet", and the AI asked the others again.
- While a plan is still a draft, `show decision:<key>` shows its decision that replaces yours on your yes as
  `replaces … (pending until READY)`, no longer as a CONFLICT with yours.
- "Drop it." or "Forget it." to a question that asks to replace a teammate's decision replaces nothing; only an answer that
  opens with a yes does. Before, those words counted as a yes and showed the teammate's decision as replaced.
- A word of one language that is a plain word of another no longer counts: "Use the git defaults." takes none of the AI's
  proposals (Turkish "git" was read as "go with"), and Turkish "ne" ("Ne olursa olsun …") is no French negation.
- The reading of a person's answers was rewritten as one owner in DecisionBook, its words kept by language; the replies it
  reads are pinned by tests. A reply to the proposals it cannot read as your answer ("Use the git
  defaults.", one unrelated word) records nothing, and the AI asks you again in your words; a count takes the proposals when it
  is as many as were shown ("Dördüne de evet."); "Docker said: no" names no one you asked; `atlasbound debug said "<words>"` shows
  how a reply is read.
- "OK, forget it.", "Fine, leave it.", "Tamam, vazgeç." or "Tamam, kalsın." to a question that asks to replace a teammate's
  decision replaces nothing: a later part that keeps or drops takes the opening "OK" back, unless your answer also says to change
  it. The decision stays and the AI asks you again. Before, these counted as your yes and showed the decision as replaced.
- "Yes to all but Q3." and "Take all but the third." take every proposal the AI showed except the one you name, which waits for
  your own answer; "Go with your suggestions, but make Q2 every occurrence." leaves Q2 to your own words. Before, only the
  proposal you left out was recorded as yours.
- A quoted "OK" in the AI's message, a button's label or a test's output, no longer makes your bare "Yes." a yes to every
  proposal: only a sentence that asks you to write that reply for the proposals ('write "yes"', '"evet" demen yeterli') does; 'Write "ok" to
  stdout' does not. Before, every
  proposal was recorded as yours and the plan became READY.
- Your reply is read with the answer words of its own language only: Spanish "todo" (all) in "OK, todo." takes no proposal. Where
  two languages hold as many of its words and read it differently, nothing is recorded and the AI asks you again.
- An answer binds only what it says clearly; anything unclear is asked again: each part of your reply must name the questions it
  leaves out ("Yes to all but Q3.") or be a plain yes, a "go on" ("Hepsi olur, devam et.", "Yes to all, start.") or a no to
  something no question is about ("All recommendations OK, no checkpoints"), else nothing of it is recorded ("As suggested,
  but also for env.", "OK, I changed my mind." to a replacing question). Before, such replies were recorded as your yes.
- Your whole reply is never recorded as the answer to a question it leaves out, takes as a group or does not answer: "Yes to all
  but Q3." sent as Q3's answer, "I reject your suggestions." as Q1's, or "Yes to all." cut from "Yes to all. Wait, no." The
  product no longer tells the AI to record your sentence instead of asking you. `atlasbound debug said "<words>" "<question>"`
  shows how a reply to a question that replaces a decision is read.
- `related` and `show` no longer list a link an earlier version stored between two plans that only share a short key
  (`layout ← layout`) about different files.
- `atlasbound protect` takes several paths at once, read from the folder you are in; a quoted glob stays one glob.
- The AI hands a plan, a record or a handoff note as a file it writes into `.atlasbound/drafts/` and runs the command with
  `--file`: no JSON on the command line, so Claude Code's default permission mode asks nothing for the product's own steps.
  Setup allows that folder and `/handoff`'s two commands; `atlasbound handoff drop` still asks.
- AtlasBound's own files are sealed for the AI: a write to `.atlasbound/` (but its drafts folder) or `~/.atlasbound/` is
  refused, and an edit of its hook and permission entries, its `.gitignore` block or `.decisionbook/` records asks you.
- The AI can no longer switch the gate off through Claude Code's settings: a write to `.claude/settings.json`, to your own
  `~/.claude/settings.json` or `~/.claude/settings.local.json` (one line there, `disableAllHooks`, turns every hook off), or to
  a slash command file setup placed in `.claude/commands/` asks you, by the Write, Edit and MultiEdit tools and by a Bash or
  PowerShell command alike; adding that line to `.claude/settings.local.json` asks too. The file name counts in any
  letter case (`Settings.json`), and a command that copies or moves a folder over these files asks too. Still not seen:
  an archive unpacked over them (`tar -x` asks only where files are protected) and what a program run through an
  interpreter (`node x.js`) writes.
- Several `atlasbound decisionbook new` at the same moment each keep their own plan file: a plan is no longer lost when two
  sessions start one with the same title (the later one takes the next id, `-2`, `-3`).
- Where files are protected, `git merge`, `rebase`, `pull`, `cherry-pick`, `revert` and `am` ask; a script run by `sh` or
  `bash` is read first when it is in the repository, and one it cannot read asks. A hook call with no tool or no file asks.
- Hooks keep working after a Node switch: when the Node that ran setup is gone, they use the Node on PATH (never one inside
  the repository).
- `atlasbound decisionbook close <id>` links only the plan's own files and prints the one `git commit` command for its
  record: the product never commits for you. A line of a plan file that does not read is named by `show` and `doctor`.
- Plan ids are written in ASCII (`Çarpım` becomes `carpim`), and `find` matches a word with or without its marks.

### Command line

- A command typed wrong (an unknown word or flag, a word too many, `decisionbook related` with no path) exits 2 with its
  usage line; with `--json` every refusal is a JSON object on standard output.
- The help has a USAGE line per command and no line past 100 columns; a JSON word that does not read says where it broke.
- In your own terminal, `show` prints in full even when the environment carries an AI session's id.

### Windows

- The gate now also watches Claude Code's PowerShell tool, not only its edit tools and its shell tool.
- The gate reads the common PowerShell and cmd ways of writing a file (`Set-Content`, `Out-File`, `Add-Content`,
  `New-Item -Value`, `Copy-Item`, `Move-Item`, `>`, `cmd /c copy`, `cmd /c move`, `cmd /c echo … >`) and the command inside
  `powershell -Command "…"` and `pwsh -c "…"`. A PowerShell or cmd command it cannot read, whose target may be a protected
  file, asks you; it no longer passes in silence. A program run by an interpreter (`node x.js`, `python x.py`) is still not
  read before it runs: a protected file it changes is named when the session stops.
- Paths written with backslashes (`C:\…`) or in Git Bash's form (`/c/…`) in what Claude Code hands the hooks are read as the
  same files.
- A person typing at plain PowerShell or cmd.exe is recognised as a person, so the commands only a person may run
  (`uninstall`, `protect --none`) work there; before, they were refused as if the AI had typed them.
- A program the product starts by name (such as `git`) is looked up on PATH only, never in the repository's own folder.
- `setup` in a sub-folder or in a package of a monorepo finds the repository's top on Windows too.
- The hooks no longer print "gates off" while the gates are on.
- The product reads its `.gitignore` block when the file has Windows line ends (Git for Windows sets
  `core.autocrlf=true` by default).
- `atlasbound doctor` no longer raises false alarms on Windows (paths, the gate's answer, `atlasbound` on PATH, release files,
  folder permissions, the home folder).
- Handoff's context notice reads the session's transcript on Windows too.
- The README says what Windows needs (Claude Code running its hooks through Git Bash) and what to know there: line
  ends, a slash command typed from Git Bash, links and junctions.

### Command line

- The gate also reads package scripts (`npm run`, `npm test`, yarn, pnpm) from `package.json` before they run; a script it
  cannot place asks you.
- `atlasbound --version` and `atlasbound version` say the installed version; a mistyped command suggests the closest one.
- `atlasbound --help` and each command's `--help` say what the command does, when to use it, one example, and whether only a
  person may run it.
- `setup` ends by naming the next step, `atlasbound doctor`.
- `setup` no longer adds `.mcp.json` to `.gitignore`, so a repository can keep its own MCP settings in git.
- `atlasbound update` leaves a `.gitignore` block as it is when the block lacks no line: a block your team committed with
  an earlier version stays byte for byte (its `.mcp.json` line goes only where the repository has its own `.mcp.json`), so
  the update leaves git no change that would refuse a branch switch. When it does change `.gitignore`, it says to commit it.
- `atlasbound leftovers` no longer says nothing is left above a process or a folder it then names: it says nothing is left
  to take out and that what it names is left alone.
- The automatic suggestion of what to protect (`atlasbound protect --source`) also counts folders of HTML pages and a single
  entry file such as `index.html`.
- `atlasbound doctor` names what an earlier product version left wired in your home folder, `atlasbound leftovers` lists it,
  and `atlasbound leftovers remove`, typed by you at your own terminal, removes it after a copy of each file (see below).
  Both also name, with its process id, each MCP server of the earlier version that is still running, and the earlier
  version's folder `~/.mcp-observatory/`; while such a server runs, or when the system's process list does not answer,
  `leftovers remove` takes nothing and says what to close first. It never ends a process itself.
- When the product holds a session from finishing, Claude Code shows a line saying it is a deliberate check, not a crash.

### Handoff and DecisionBook

- A handoff note shows its reader that session's own messages first, and leaves out the messages of a session running beside
  it. A message that is only a path or a bare slash command is not kept.
- `/decide` stores the person's decision with their own sentence; the AI no longer writes the person's name for them.

### Documents

- README: what an AI session may do with the protect question (add protection after your answer; only taking it away is
  yours), a Windows section, and "Free, and the Team version".
- This changelog, shipped in the package.
- The package lists keywords for npm search.

### Versions before 0.25: telemetry, and what they left behind

Versions before 0.25 (the last was 0.24.2) were an earlier, closed product published under the same package name. That
product sent usage telemetry to an endpoint of its own, and it did so by default unless you turned it off: counts and other
fields its own allowlist let through, never your source code. An opt-in debug level, off by default, could also send scrubbed
development traces. It also had a sign-in to its own service.

0.25 and later are a different, open product. They send nothing (see PRIVACY.md). Installing 0.25 over the earlier product
replaced its files, but **a Claude Code session that was open before the upgrade keeps the earlier product's MCP server
running in memory**, with the old code: that server goes on sending its telemetry, and writes its files back after you delete
them, for as long as the session stays open (days, if you leave it open). **After upgrading, close every Claude Code session
that was open before the upgrade, in every window, and start them again.** `atlasbound leftovers` names each such process
that is still running, with its process id.

npm also does not remove what that product wrote outside its own package. If you used it, you may still have:

- In `~/.claude/settings.json`: hook entries whose command runs a file under `atlasbound/engine/hooks/`
  (`atlasbound\engine\hooks\` on Windows). That folder no longer exists, so each of these fails in every Claude Code session.
- In `~/.claude.json`: an MCP server named `atlasbound` (`mcpServers.atlasbound`) that runs `atlasbound mcp serve`, which 0.25
  does not have.
- In `~/.atlasbound/`: `credentials` (the key of that sign-in) and files named `egress-*` (its own log of what it sent).
- `~/.mcp-observatory/`: its local event store, a folder per repository and one named `atlasbound`. `atlasbound leftovers`
  names it and nothing removes it for you: delete the folder yourself once no earlier server runs.

To remove them: first close those sessions (above), then make a copy of `~/.claude/settings.json` and `~/.claude.json`, then delete those hook entries and the
`atlasbound` MCP server entry from them, and delete `~/.atlasbound/credentials` and `~/.atlasbound/egress-*`. Keep the rest of
`~/.atlasbound/`: `decisionbook-here/`, `handoff-here/` and `telemetry-consent.json` belong to 0.25. On Windows, `~` is your
user folder (`%USERPROFILE%`). `atlasbound doctor` names any of these it still finds, and `atlasbound leftovers remove`,
typed by you, does the same removal after a copy of each file into `~/.atlasbound/leftovers-backup/`; it stops, with the
process ids, while a server of the earlier version still runs.

## 0.25.0

The first release of the open product: DecisionBook and Handoff for Claude Code, under AGPL-3.0-only, with no third-party
dependencies, sending nothing. It replaces the earlier closed product that was published under the same name up to 0.24.2.
