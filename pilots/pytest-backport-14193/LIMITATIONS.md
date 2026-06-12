# Limitations

## Retrospective Reconstruction

Pytest did not create, freeze, or approve this ARC contract. The file scope is
strongly source-derived, while the focused command and release-classification
question are operator-inferred.

This is not equivalent to running ARC prospectively on a real assignment.

## Hindsight Risk

The operator knew that a revert existed before constructing the pilot. To
reduce hindsight contamination:

- the cutoff and pre/post source split are explicit;
- the runner cannot load the post-cutoff directory;
- the release focus is justified only by pre-cutoff facts;
- the packet does not claim ARC predicted or would have prevented the revert.

An independent replication should reconstruct the contract without seeing the
outcome.

## Evidence Limits

GitHub displayed a successful test matrix, but the packet does not preserve
provider-signed CI logs or execute pytest at the historical commit. ARC
therefore does not convert those public status summaries into a trusted command
receipt.

The two synthetic receipts are controlled verifier fixtures, not historical
evidence.

## Product Limit

ARC's deterministic V1 checks paths and required command receipts. It cannot
decide whether a behavior change is semantically appropriate for a patch
release unless that decision is represented in the contract and backed by an
approval or other evidence.

This case supports extending contract evidence for release classification. It
does not justify a generic AI code-review engine.

## No Upstream Claim

This repository is not affiliated with pytest. No upstream issue, comment, or
pull request was created for this experiment.

