> Retrospective warning: pytest did not create or approve this ARC contract. It was reconstructed from public pre-cutoff artifacts.

## ARC Trust Brief: Needs Review

ARC could not verify every required assignment boundary.

### Focus Questions
1. Was `required_commands` explicitly approved? ARC found: Required commands do not have same-run ARC verification.

<details>
<summary>Receipts</summary>

### ARC Verified
- **Changed files:** changelog/14050.bugfix.rst, src/_pytest/_io/pprint.py, src/_pytest/_io/saferepr.py, src/_pytest/pytester_assertions.py, testing/io/test_saferepr.py, testing/test_assertion.py
- **Finding `required_commands`:** Unverified required command: pytest testing/io/test_saferepr.py testing/test_assertion.py

</details>

ARC checks assignment boundaries and required evidence; it does not prove code correctness or merge safety.
