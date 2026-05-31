# ARC Prototype Tester Guide

ARC is ready for a small trusted-tester loop, not a public launch.

Use this repo to test one thing: whether a developer can understand and trust an ARC Trust Brief for an AI-generated PR.

## The promise

CI checks whether code passes. ARC checks whether the agent stayed inside the approved assignment.

ARC does not claim the code is correct, safe, or worth merging. It answers narrower questions:

- Was there a frozen `.aiplan` before implementation?
- Did the PR stay inside `allowed_scope.files`?
- Did it avoid `excluded_scope.files`?
- Did required trusted evidence, like `npm test`, actually run?
- What should the human reviewer inspect next?

## Who should try it now

Good prototype testers:

- already use Claude Code, Cursor, OpenClaw, Copilot coding agent, or similar tools
- review AI-generated PRs in real repos
- understand GitHub pull requests and CI checks
- are willing to try a rough workflow and give blunt feedback

Do not send this yet to people who need self-serve onboarding, polished docs, or a hosted product.

## Ten-minute test path

1. Open the clean passing proof PR:
   - https://github.com/esterbot-canada/arc-real-world-gauntlet/pull/21
2. Read the ARC Trust Brief comment/check before reading the full diff.
3. Ask yourself:
   - Can I tell what the agent was allowed to change?
   - Can I tell what evidence ARC trusted?
   - Would this reduce my review anxiety?
4. Open the mixed/failing proof PR:
   - https://github.com/esterbot-canada/arc-real-world-gauntlet/pull/20
5. Compare the Trust Brief to the GitHub checks and diff.
6. Run the local proof suite:

```bash
npm run arc:gauntlet
npm test
```

Expected result:

- ARC gauntlet fixtures: 11/11 pass
- baseline app tests: 13/13 pass

## What feedback we need

Ask testers these questions, in order:

1. In your own words, what does ARC verify?
2. Did the Trust Brief tell you where to focus review?
3. Was any verdict surprising or too harsh?
4. Would you use this on one AI-generated PR in your own repo?
5. What is the first setup step that feels annoying or unclear?
6. What would make you trust this less?

## What not to build from this feedback yet

Do not jump to dashboards, policy engines, LLM review, auto-merge, or compliance exports.

Only look for friction around the current wedge:

- creating/freezing a `.aiplan`
- binding PR evidence to the frozen assignment
- producing a short Trust Brief reviewers understand

## Prototype success bar

This prototype is working if 3-5 technical testers can say:

> I understand what ARC checks, I understand what it does not check, and I would try it on a small AI-generated PR.

If they cannot reach that point, fix wording, setup, and contract flow before adding features.
