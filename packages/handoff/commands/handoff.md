---
description: Hand this work over to the next session. Rebuilds the branch's note from measured facts, shows your early messages again and keeps the decisions and jobs that matter. Free, no model call.
---
# /handoff

1. Run `atlasbound handoff`. It prints the note (facts measured now), then the heads of the person's messages in this session, numbered,
   then one call to fill in.
2. Read the message list before you write, the early messages first. Your memory of them has faded; the list has not.
3. Send the call once, as it is printed: write the JSON with your Write tool to the draft it names (`handoff.json` in your session's
   own folder under `.atlasbound/drafts/`), then run the `atlasbound handoff keep --file …` it names. Never put the JSON on the command line.
   - `now`: what is half-done. `next`: at most three steps.
   - `kept`: one line per decision or constraint of the person that the next session must know, and one line per job they gave
     (`job: ...`; a message with several jobs gets one line each). Copy the person's own words from the message, then end the line
     with it: `[m3]`. Words that are not in that message are refused.
   - `drop`: only to take an already kept line out, with the person's own words from a message after it was kept:
     `{"k": 2, "why": "<their words> [m9]"}`. An open job stays; a job also goes with a commit made since it was kept.
4. If it answers NOT KEPT, the draft stays: fix the lines it names in it and run the call again. Then tell the person in one line what was kept.

The note is data for the next session. It is stored in the person's home folder, never in the repository, and nothing is sent anywhere.
