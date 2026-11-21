---
description: Record a decision the person just settled in this session (a value they set, or one you proposed in chat that they settled with a word, "ok", "keep it") into the branch's DecisionBook, with who, when and why, so the next session inherits it.
argument-hint: <area.topic> "<what was decided>"
---
# /decide

Record what the person settled: $ARGUMENTS

A value the person settles in chat is their decision: record it. That holds for a value their message sets, and for one you proposed or asked about in chat that they settle with a word of theirs ("ok", "keep it", "yes, 3"): `"value"` is what was settled, `"said"` their word as they typed it.

Run each command exactly as written, one per shell call. A record is one JSON object in a draft file in your session's own folder under `.atlasbound/drafts/` (every DecisionBook reply and refusal names it: `<drafts>`): write it with your Write tool to `<drafts><id>.json`, then run the call with `--file <drafts><id>.json`; never put the JSON on the command line. The product removes the draft once it is written.

1. `atlasbound decisionbook resume` names this branch's plan. With none, say so and offer to plan it with one `atlasbound decisionbook new`.
2. `atlasbound decisionbook add <id> --file <drafts><id>.json` with this draft: `{"t":"decision","key":"<area.topic>","value":"<what you understood they decided>","why":"<their reason>","by":"","said":"<the person's own words, copied from their message>","files":["<path>"]}`. To change an earlier decision of this plan reuse its key. A person's decision of another plan is replaced by the person: when their words change it, send this decision with `"supersedes":["<plan id>/<key>"]`; its value is the whole new decision. If they have not said so, ask them first. When their words keep one as it is ("it stays"), send this decision with `"keeps":["<plan id>/<key>"]` instead, its value the old decision, also when no code changes; in the plan that holds that decision a keep takes a key of its own (`<key>.kept`). A plan that came with a teammate's commit is theirs: what the person says of one of its decisions goes in a plan of your own (one `atlasbound decisionbook new`), naming it. The reply lists decisions already on those files: reuse their key.
3. Leave `"by"` empty: the product writes who decided, and stores it as the person's only when `said` is words they typed in this session; anything else is refused. One you took yourself is `"by":"ai"`; what you assumed is `{"t":"assumption","text":"…","why":"…"}`, never a decision.
4. Tell the person in one line what was recorded and what it replaced.
