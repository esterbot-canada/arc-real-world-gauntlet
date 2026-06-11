## ARC Trust Brief: Needs Review

This PR has scope or required-evidence issues that should be inspected before normal review.

### Focus Questions
1. Was the diff range derived from CI/provider base and head SHAs? Impact: caller-provided ranges can hide commits from ARC.
2. No required command evidence was defined. Impact: ARC cannot bind this assignment to validation evidence.

<details>
<summary>Receipts</summary>

- Allowed scope: arc-pilot/**
- Excluded scope: souls/generated/*/signing_key.hex, souls/archived/*/signing_key.hex, souls/generated/*/agent_id.txt, souls/archived/*/agent_id.txt
- Changed files: arc-pilot/normal-change.md
- Contract loaded from working tree/caller input. Treat contract provenance as untrusted unless this is a local demo.
- Frozen contract hash verified: sha256:f2b8ecc46e52094a4200f11d8c47e887aa353dbfe46004b2890c04a40dfc91c8
- Diff range is not provider-verified. Treat changed-file evidence as caller-provided.
- No required command evidence defined in expected_evidence.required_commands.

</details>
