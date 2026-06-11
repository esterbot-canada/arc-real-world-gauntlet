## ARC Trust Brief: Blocked

This PR crossed an explicit excluded scope boundary in the frozen .aiplan.

### Focus Questions
1. Was the diff range derived from CI/provider base and head SHAs? Impact: caller-provided ranges can hide commits from ARC.
2. Why did `hooks/arc-pilot-probe` change inside excluded scope? Impact: this crosses an explicit frozen contract boundary.
3. No required command evidence was defined. Impact: ARC cannot bind this assignment to validation evidence.

<details>
<summary>Receipts</summary>

- Allowed scope: arc-pilot/**
- Excluded scope: hooks/**
- Changed files: hooks/arc-pilot-probe
- Contract loaded from working tree/caller input. Treat contract provenance as untrusted unless this is a local demo.
- Frozen contract hash verified: sha256:d5e23e080425a4aa960e84aa5e4ea385180f41c4dcc449bcce693a1779930c40
- Diff range is not provider-verified. Treat changed-file evidence as caller-provided.
- Excluded file touched: hooks/arc-pilot-probe
- No required command evidence defined in expected_evidence.required_commands.

</details>
