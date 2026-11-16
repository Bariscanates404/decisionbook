---
description: Record a decision the person just settled in this session into the branch's DecisionBook, with who, when and why, so the next session inherits it.
argument-hint: <area.topic> "<what was decided>"
---
# /decide

Record what the person settled: $ARGUMENTS

Run each command exactly as written, one per shell call. A record is one JSON object on standard input, a quoted heredoc: the call, `<<'JSON'`, the JSON on the next line, then `JSON` alone on the last; nothing inside a value needs shell quoting.

1. `atlasbound decisionbook resume` names this branch's plan. With none, say so and offer to plan it with one `atlasbound decisionbook new`.
2. `atlasbound decisionbook add <id>` with `{"t":"decision","key":"<area.topic>","value":"<what was decided, in their words>","why":"<their reason>","by":"<their name>","files":["<path>"]}`. To change an earlier decision reuse its key; to replace one from another plan add `"supersedes":["<plan id>/<key>"]`. The reply lists decisions already on those files: reuse their key.
3. Only a person's decision carries their name. One you took yourself is `"by":"ai"`; what you assumed is `{"t":"assumption","text":"…","why":"…"}`, never a decision.
4. Tell the person in one line what was recorded and what it replaced.
