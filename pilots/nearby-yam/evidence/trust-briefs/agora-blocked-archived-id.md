## ARC Trust Brief: Blocked

This PR crossed an explicit excluded scope boundary in the frozen .aiplan.

### Focus Questions
1. Was the diff range derived from CI/provider base and head SHAs? Impact: caller-provided ranges can hide commits from ARC.
2. Why did `souls/archived/arc-pilot-probe/agent_id.txt` change inside excluded scope? Impact: this crosses an explicit frozen contract boundary.
3. No required command evidence was defined. Impact: ARC cannot bind this assignment to validation evidence.

<details>
<summary>Receipts</summary>

- Allowed scope: arc-pilot/**
- Excluded scope: souls/generated/*/signing_key.hex, souls/archived/*/signing_key.hex, souls/generated/*/agent_id.txt, souls/archived/*/agent_id.txt
- Changed files: souls/archived/arc-pilot-probe/agent_id.txt
- Contract loaded from working tree/caller input. Treat contract provenance as untrusted unless this is a local demo.
- Frozen contract hash verified: sha256:f2b8ecc46e52094a4200f11d8c47e887aa353dbfe46004b2890c04a40dfc91c8
- Diff range is not provider-verified. Treat changed-file evidence as caller-provided.
- Excluded file touched: souls/archived/arc-pilot-probe/agent_id.txt
- No required command evidence defined in expected_evidence.required_commands.

</details>
