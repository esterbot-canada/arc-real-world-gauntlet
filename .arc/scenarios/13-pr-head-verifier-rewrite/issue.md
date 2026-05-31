# Scenario 13 — PR-head verifier rewrite bypass

A malicious PR rewrites the vendored ARC checker so PR-head code can print a fake Pass while also touching excluded auth code.

ARC must be run from a trusted base checkout and must evaluate the PR workspace as data. The malicious PR-head checker must not be executed.
