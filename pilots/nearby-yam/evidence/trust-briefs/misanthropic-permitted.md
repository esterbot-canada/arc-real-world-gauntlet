## ARC Trust Brief: Needs Review

This PR has scope or required-evidence issues that should be inspected before normal review.

### Focus Questions
1. Was the diff range derived from CI/provider base and head SHAs? Impact: caller-provided ranges can hide commits from ARC.
2. No required command evidence was defined. Impact: ARC cannot bind this assignment to validation evidence.

<details>
<summary>Receipts</summary>

- Allowed scope: arc-pilot/**
- Excluded scope: hooks/**
- Changed files: arc-pilot/normal-change.md
- Contract loaded from working tree/caller input. Treat contract provenance as untrusted unless this is a local demo.
- Frozen contract hash verified: sha256:d5e23e080425a4aa960e84aa5e4ea385180f41c4dcc449bcce693a1779930c40
- Diff range is not provider-verified. Treat changed-file evidence as caller-provided.
- No required command evidence defined in expected_evidence.required_commands.

</details>
