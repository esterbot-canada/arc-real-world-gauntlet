# ARC: Contract + Evidence + Verdict

ARC checks whether an AI coding agent stayed inside a frozen assignment and
produced the required evidence.

CI asks whether code passes. ARC asks whether the agent changed what it was
allowed to change and whether its validation claims are backed by evidence.

ARC does **not** prove code correctness, maintainability, security, or merge
safety. A human still reviews the implementation.

## Start Here

For the real-repository scope pilot prepared for Nearby_Yam:

- [Pilot overview](pilots/nearby-yam/README.md)
- [Exact method](pilots/nearby-yam/METHOD.md)
- [Limitations](pilots/nearby-yam/LIMITATIONS.md)
- [Seven scenario records](pilots/nearby-yam/scenarios/manifest.json)
- [Generated Trust Briefs](pilots/nearby-yam/evidence/trust-briefs)
- [Raw command logs](pilots/nearby-yam/evidence/raw-logs)
- [Reviewable commit patches](pilots/nearby-yam/evidence/commits)

For the public pytest retrospective:

- [Pilot overview](pilots/pytest-backport-14193/README.md)
- [Exact method](pilots/pytest-backport-14193/METHOD.md)
- [Limitations](pilots/pytest-backport-14193/LIMITATIONS.md)
- [Frozen reconstructed contract](pilots/pytest-backport-14193/contracts/pytest-backport-14193.aiplan)
- [Historical Trust Brief](pilots/pytest-backport-14193/evidence/trust-briefs/historical-backport.md)

The Nearby_Yam packet contains seven synthetic local commits. The pytest packet
is a retrospective reconstruction around one historical public pull request.
Neither was a live ARC installation.

## Run the Repository

Requirements:

- Node.js 24+
- Python 3.11+
- [uv](https://docs.astral.sh/uv/)

```bash
npm test
npm run arc:gauntlet
uv run --project arc --extra dev pytest
```

`npm run arc:gauntlet` runs 11 deterministic good/bad fixtures plus the four
pytest retrospective scenarios.

## Repository Map

- `arc/`: current Python verifier and tests
- `.arc/scenarios/`: adversarial gauntlet fixtures
- `pilots/nearby-yam/`: complete public pilot packet
- `pilots/pytest-backport-14193/`: public retrospective and controlled mutations
- `src/` and `test/`: small sample application used by the gauntlet

The previous copied dashboard, API, database, and ingestion application was
removed. It was unrelated to the narrow verifier and made this review
repository harder to understand.
