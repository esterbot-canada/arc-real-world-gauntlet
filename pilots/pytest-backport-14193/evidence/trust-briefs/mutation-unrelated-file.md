> Retrospective warning: pytest did not create or approve this ARC contract. It was reconstructed from public pre-cutoff artifacts.

## ARC Trust Brief: Needs Review

ARC could not verify every required assignment boundary.

### Focus Questions
1. Was `allowed_scope` explicitly approved? ARC found: README.rst is outside frozen allowed scope.

<details>
<summary>Receipts</summary>

### ARC Verified
- **Changed files:** changelog/14050.bugfix.rst, src/_pytest/_io/pprint.py, src/_pytest/_io/saferepr.py, src/_pytest/pytester_assertions.py, testing/io/test_saferepr.py, testing/test_assertion.py, README.rst
- **Finding `allowed_scope`:** README.rst
- **Required evidence:** Required command passed on 1a81ee64323647045ab86af6096ace284f49d779: pytest testing/io/test_saferepr.py testing/test_assertion.py (1ms, output 7cae6384b308d9c7fd31b63014585d4b0ec1c3a6919edfda55b335b9c9c26055)

</details>

ARC checks assignment boundaries and required evidence; it does not prove code correctness or merge safety.
