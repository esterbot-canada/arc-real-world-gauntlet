# Public ARC Review Repository Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the public gauntlet repository into a small, reproducible ARC review repository and publish the complete Nearby_Yam local pilot evidence.

**Architecture:** Keep the sample Node application and adversarial scenario fixtures. Replace the copied dashboard/API application with the current Python verifier under `arc/`, add a fixture runner around its deterministic contract evaluator, and keep customer-specific evidence under `pilots/nearby-yam/`.

**Tech Stack:** Python 3.11+, uv, pytest, Node.js 24, GitHub Actions, Markdown, JSON

---

### Task 1: Remove the obsolete application snapshot

**Files:**
- Delete: `.github/arc/agent-review-control/**`
- Modify: `.github/workflows/arc-pr-check.yml`
- Modify: `.github/workflows/arc-gauntlet.yml`

- [ ] Remove dashboard, API, database, ingestion, and duplicated documentation files.
- [ ] Replace workflows that install the old Node application.
- [ ] Confirm no workflow refers to `.github/arc/agent-review-control`.

### Task 2: Publish the current verifier

**Files:**
- Create: `arc/pyproject.toml`
- Create: `arc/uv.lock`
- Create: `arc/src/agent_work_evidence/**`
- Create: `arc/tests/**`
- Create: `arc/README.md`

- [ ] Copy the current deterministic Contract + Evidence + Verdict implementation.
- [ ] Exclude caches, virtual environments, and private workspace material.
- [ ] Run the Python test suite.

### Task 3: Preserve the gauntlet

**Files:**
- Create: `arc/scripts/run_gauntlet.py`
- Modify: `package.json`
- Delete: `scripts/run-arc-gauntlet.mjs`

- [ ] Adapt existing fixtures to the Python evaluator.
- [ ] Generate concise Trust Briefs under `.arc/tmp/gauntlet/`.
- [ ] Run all 11 scenarios and check expected verdicts.
- [ ] Run the sample application's Node tests.

### Task 4: Publish the Nearby_Yam evidence packet

**Files:**
- Create: `pilots/nearby-yam/README.md`
- Create: `pilots/nearby-yam/METHOD.md`
- Create: `pilots/nearby-yam/LIMITATIONS.md`
- Create: `pilots/nearby-yam/scenarios/manifest.json`
- Create: `pilots/nearby-yam/contracts/**`
- Create: `pilots/nearby-yam/evidence/raw-logs/**`
- Create: `pilots/nearby-yam/evidence/trust-briefs/**`
- Create: `pilots/nearby-yam/evidence/commits/**`
- Create: `pilots/nearby-yam/SHA256SUMS`

- [ ] Document the seven synthetic one-file commits and exact repository SHAs.
- [ ] Copy the original frozen contracts, generated Trust Briefs, and command logs.
- [ ] Export each synthetic commit as a reviewable patch.
- [ ] State what the pilot proves and does not prove.
- [ ] Add deterministic artifact checksums.

### Task 5: Make the repository reviewer-first

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] Explain ARC in plain language.
- [ ] Put the five-minute review path first.
- [ ] Link directly to the Nearby_Yam packet and gauntlet.
- [ ] Remove claims ARC cannot support.

### Task 6: Verify and publish

- [ ] Run Python tests.
- [ ] Run all gauntlet scenarios.
- [ ] Run Node tests.
- [ ] Check links, artifact hashes, git diff, and repository status.
- [ ] Commit the focused change.
- [ ] Push the branch and open a public pull request.
