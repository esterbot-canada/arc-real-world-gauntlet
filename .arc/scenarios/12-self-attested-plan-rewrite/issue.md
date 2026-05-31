# Scenario 12 — Self-attested plan rewrite bypass

A malicious or sloppy implementation PR rewrites `.arc/plan.aiplan` to widen scope, recomputes the hash, then touches an originally excluded auth file.

ARC must not trust the PR-head contract. It must load the base-branch frozen contract and block the PR as self-attested contract drift.
