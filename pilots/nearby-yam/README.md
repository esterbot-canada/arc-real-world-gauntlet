# Nearby_Yam ARC Review Packet

This packet shows exactly what ARC did with two public repositories associated
with Nearby_Yam:

- `mdegans/misanthropic`
- `mdegans/agora-agents`

We created seven separate **synthetic local commits**. Each commit added one
small file either inside the allowed pilot folder or inside a protected path.
ARC compared each changed path with a frozen contract and generated a Trust
Brief.

## Result

- 5 protected-path changes: `Blocked`
- 2 allowed-path changes: `Needs Review`
- 0 false `Pass` verdicts

The allowed changes remained `Needs Review` because the contract and Git range
were supplied locally and no required test command was defined. ARC refused to
present locally supplied inputs as provider-verified proof.

## What to Review

1. Read [METHOD.md](METHOD.md) for the exact setup and execution.
2. Inspect [scenarios/manifest.json](scenarios/manifest.json) for all base/head
   SHAs, changed files, expected results, and artifact paths.
3. Open the seven files in
   [evidence/trust-briefs](evidence/trust-briefs).
4. Compare each brief with its patch under
   [evidence/commits](evidence/commits).
5. Inspect or replay the focused [exact reproducer](reproducer).
6. Read [LIMITATIONS.md](LIMITATIONS.md) before judging the result.
7. Verify the packet with `sha256sum -c SHA256SUMS`.

## What ARC Is Doing

ARC uses a frozen assignment contract:

```text
allowed paths + excluded paths + required evidence
```

It derives a verdict from the changed files and evidence:

- `Blocked`: an explicit frozen boundary was crossed or required verification
  failed.
- `Needs Review`: ARC cannot verify enough to return `Pass`.
- `Pass`: no deterministic contract/evidence violation was found using trusted
  inputs.

The Trust Brief leads with the verdict, asks focused review questions, and
lists the evidence used to reach that verdict.

## Feedback Requested

The useful question is not whether the reports look polished. It is:

> Would this contract and Trust Brief remove a manual scope/evidence check from
> one real AI-generated PR, without adding annoying review overhead?

The next proper pilot is one real assignment, one AI-generated PR, ARC running
as a required GitHub check, and reviewer feedback on time saved or noise added.
