# ARC Real-World Gauntlet

This repository is a controlled learning lab for ARC: Agent Review Contracts for AI-generated pull requests.

It is intentionally small, but shaped like a real SaaS app so scope boundaries matter:

- signup validation
- auth/session logic
- billing invoice helpers
- profile/settings helpers
- API service layer
- database migration area
- fast Node.js tests

The purpose is not to build a production app. The purpose is to create realistic GitHub issues, freeze `.aiplan` contracts, let builder agents implement PRs, and observe whether ARC returns the right Trust Brief verdict.
