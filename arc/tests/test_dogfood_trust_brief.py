import json
import runpy
from pathlib import Path

from agent_work_evidence.trust_brief import (
    render_trust_brief_json,
    render_trust_brief_markdown,
)

DOGFOOD_DIR = (
    Path(__file__).resolve().parents[1]
    / "dogfood"
    / "pytest-dev__pytest-11148"
)


def test_swebench_dogfood_is_deterministic_and_honest():
    namespace = runpy.run_path(str(DOGFOOD_DIR / "generate.py"))
    document = namespace["build_document"]()
    generated_json = render_trust_brief_json(document)
    generated_markdown = render_trust_brief_markdown(document)

    assert generated_json == (DOGFOOD_DIR / "trust-brief.json").read_text(
        encoding="utf-8"
    )
    assert generated_markdown == (DOGFOOD_DIR / "trust-brief.md").read_text(
        encoding="utf-8"
    )

    payload = json.loads(generated_json)
    assert payload["verdict"] == "blocked"
    assert "pmxbot/logging.py" in generated_markdown
    assert "outside frozen allowed scope" in generated_markdown
    assert "Required command failed: bash verification.sh" in generated_markdown
    assert "Status: exited 1" in generated_markdown
    assert "### ARC Verified" in generated_markdown
    assert "### Agent Reported" in generated_markdown
    assert "### Operator Supplied" in generated_markdown
    assert "Customer follow-up" not in generated_markdown
    assert "does not prove code correctness" in generated_markdown
