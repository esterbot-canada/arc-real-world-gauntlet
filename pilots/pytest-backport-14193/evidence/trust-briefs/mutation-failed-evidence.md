> Retrospective warning: pytest did not create or approve this ARC contract. It was reconstructed from public pre-cutoff artifacts.

## ARC Trust Brief: Blocked

ARC found a deterministic assignment-boundary violation.

### Focus Questions
1. What caused `required_commands`? ARC found: Required command failed: pytest testing/io/test_saferepr.py testing/test_assertion.py.

<details>
<summary>Receipts</summary>

### ARC Verified
- **Changed files:** changelog/14050.bugfix.rst, src/_pytest/_io/pprint.py, src/_pytest/_io/saferepr.py, src/_pytest/pytester_assertions.py, testing/io/test_saferepr.py, testing/test_assertion.py
- **Finding `required_commands`:** Status: exited 1
- **Finding `required_commands`:** Commit: 1a81ee64323647045ab86af6096ace284f49d779
- **Finding `required_commands`:** Duration: 1ms
- **Finding `required_commands`:** Output SHA-256: 308d08db2f01cd653728470b65f47c620f574b425c650a296c581e8533f7b928

</details>

ARC checks assignment boundaries and required evidence; it does not prove code correctness or merge safety.
