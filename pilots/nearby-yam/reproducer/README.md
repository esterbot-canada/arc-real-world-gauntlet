# Exact Pilot Reproducer

This folder contains the focused verifier path used to produce the published
Nearby_Yam Trust Briefs. It was extracted from the earlier ARC application so
the evidence can be replayed without restoring the dashboard, API, database,
or ingestion code.

Requirements:

- Node.js 24+
- a local clone containing the synthetic base and head commits

Install:

```bash
npm install
```

Replay one scenario from this folder:

```bash
npm run arc:pilot -- check \
  --repo /path/to/misanthropic \
  --base c285ea8e605f69f59b4b331d962871e989a02c9b \
  --head 00ebfb5c2978baf21f7454e9ba125bc545017628 \
  --plan ../contracts/misanthropic.aiplan \
  --receipts ../contracts/receipts.json \
  --out /tmp/misanthropic-blocked-hooks.md
```

The synthetic head commits are not upstream. Recreate them by applying the
matching patch from `../evidence/commits/` to a checkout at the documented
base SHA.

This reproducer is retained for pilot auditability. New ARC development is in
the repository's top-level `arc/` Python package.
