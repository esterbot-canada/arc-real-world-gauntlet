from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time


BASE_SHA = "1cb94d2832254c1d412ab69c9947eb303199d5b9"
REFERENCE_HEAD_SHA = "1a81ee64323647045ab86af6096ace284f49d779"
COMMAND = "pytest testing/io/test_saferepr.py testing/test_assertion.py"
REPO_ROOT = Path(__file__).resolve().parents[2]
EXPERIMENT_ROOT = (
    REPO_ROOT / "pilots" / "pytest-backport-14193" / "semantic-scope"
)
PATCH_ROOT = EXPERIMENT_ROOT / "patches"
BASELINE_ROOT = EXPERIMENT_ROOT / "evidence" / "baseline"
SCENARIOS_ROOT = EXPERIMENT_ROOT / "scenarios"


def _run(
    args: list[str],
    *,
    cwd: Path,
    check: bool = True,
    capture_output: bool = True,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        check=check,
        text=True,
        capture_output=capture_output,
    )


def _replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path} but found {count}: {old!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def _append(path: Path, text: str) -> None:
    existing = path.read_text(encoding="utf-8")
    path.write_text(existing.rstrip() + "\n\n\n" + text.strip() + "\n", encoding="utf-8")


def _load_definitions() -> dict[str, dict]:
    manifest = json.loads(
        (SCENARIOS_ROOT / "manifest.json").read_text(encoding="utf-8")
    )
    definitions = {}
    for relative_path in manifest["scenario_definitions"]:
        definition = json.loads(
            (SCENARIOS_ROOT / relative_path).read_text(encoding="utf-8")
        )
        definitions[definition["id"]] = definition
    return definitions


def _add_saferepr_method(checkout: Path) -> None:
    path = checkout / "src/_pytest/_io/saferepr.py"
    _replace_once(path, "import pprint\n", "from itertools import islice\nimport pprint\n")
    marker = """        return s


def safeformat(obj: object) -> str:
"""
    replacement = """        return s

    def repr_dict(self, x: dict[object, object], level: int) -> str:
        \"\"\"Represent a dict while preserving its insertion order.\"\"\"
        fillvalue = "..."
        n = len(x)
        if n == 0:
            return "{}"
        if level <= 0:
            return "{" + fillvalue + "}"
        newlevel = level - 1
        repr1 = self.repr1
        pieces = []
        for key in islice(x, self.maxdict):
            keyrepr = repr1(key, newlevel)
            valrepr = repr1(x[key], newlevel)
            pieces.append(f"{keyrepr}: {valrepr}")
        if n > self.maxdict:
            pieces.append(fillvalue)
        return "{" + ", ".join(pieces) + "}"


def safeformat(obj: object) -> str:
"""
    _replace_once(path, marker, replacement)

    test_path = checkout / "testing/io/test_saferepr.py"
    _replace_once(
        test_path,
        "from _pytest._io.saferepr import DEFAULT_REPR_MAX_SIZE\n",
        "from _pytest._io.saferepr import DEFAULT_REPR_MAX_SIZE\n"
        "from _pytest._io.saferepr import SafeRepr\n",
    )
    _append(
        test_path,
        """
def test_semantic_safe_dict_order() -> None:
    value = {"b": 2, "a": 1}
    assert SafeRepr(maxsize=None).repr(value) == "{'b': 2, 'a': 1}"
""",
    )


def _add_assertion_pprint_change(checkout: Path) -> None:
    path = checkout / "src/_pytest/_io/pprint.py"
    _replace_once(
        path,
        "        items = sorted(object.items(), key=_safe_tuple)\n",
        "        items = object.items()\n",
    )
    _replace_once(
        path,
        "            for k, v in sorted(object.items(), key=_safe_tuple):\n",
        "            for k, v in object.items():\n",
    )
    _append(
        checkout / "testing/test_assertion.py",
        """
def test_semantic_dict_assertion_order(pytester: Pytester) -> None:
    pytester.makepyfile(
        test_order=\"\"\"
        def test_order():
            assert {"b": 2, "a": 1} == {}
        \"\"\"
    )
    result = pytester.runpytest("-vv")
    result.stdout.fnmatch_lines(
        [
            "* + *'b': 2,",
            "* + *'a': 1,",
            "test_order.py:*: AssertionError",
        ]
    )
""",
    )


def _modify(checkout: Path, scenario_id: str) -> None:
    safe_path = checkout / "src/_pytest/_io/saferepr.py"
    pprint_path = checkout / "src/_pytest/_io/pprint.py"
    safe_test = checkout / "testing/io/test_saferepr.py"

    if scenario_id == "semantic-001":
        return
    if scenario_id == "semantic-002":
        _replace_once(safe_path, "        pieces = []\n", "        pieces: list[str] = []\n")
        return
    if scenario_id == "semantic-003":
        _replace_once(
            safe_path,
            """        for key in islice(x, self.maxdict):
            keyrepr = repr1(key, newlevel)
            valrepr = repr1(x[key], newlevel)
""",
            """        for key, value in islice(x.items(), self.maxdict):
            keyrepr = repr1(key, newlevel)
            valrepr = repr1(value, newlevel)
""",
        )
        return
    if scenario_id == "semantic-004":
        _replace_once(
            safe_path,
            "        for key in islice(x, self.maxdict):\n",
            "        for key in tuple(islice(x, self.maxdict)):\n",
        )
        return
    if scenario_id == "semantic-005":
        _append(
            safe_test,
            """
def test_semantic_nested_dict_order() -> None:
    value = {"outer": {"b": 2, "a": 1}}
    assert SafeRepr(maxsize=None).repr(value) == "{'outer': {'b': 2, 'a': 1}}"
""",
        )
        return
    if scenario_id == "semantic-006":
        _append(
            safe_test,
            """
def test_semantic_integer_key_order() -> None:
    value = {2: "second", 1: "first"}
    assert SafeRepr(maxsize=None).repr(value) == "{2: 'second', 1: 'first'}"
""",
        )
        return
    if scenario_id == "semantic-007":
        _replace_once(
            safe_path,
            "            pieces.append(fillvalue)\n",
            "            pieces.extend([fillvalue])\n",
        )
        return
    if scenario_id == "semantic-008":
        _replace_once(
            safe_path,
            "        for key in islice(x, self.maxdict):\n",
            "        # Dictionary iteration is insertion ordered on supported Python versions.\n"
            "        for key in islice(x, self.maxdict):\n",
        )
        return
    if scenario_id == "semantic-009":
        _append(
            safe_test,
            """
def test_semantic_python_dict_iteration_order() -> None:
    value = {"b": 2, "a": 1}
    assert list(value) == ["b", "a"]
""",
        )
        return
    if scenario_id == "semantic-010":
        _replace_once(
            safe_test,
            "from _pytest._io.saferepr import DEFAULT_REPR_MAX_SIZE\n",
            "from _pytest._io.saferepr import DEFAULT_REPR_MAX_SIZE\n"
            "from _pytest._io.saferepr import SafeRepr\n",
        )
        _append(
            safe_test,
            """
def test_semantic_sorted_dict_representation() -> None:
    value = {"b": 2, "a": 1}
    assert SafeRepr(maxsize=None).repr(value) == "{'a': 1, 'b': 2}"
""",
        )
        return
    if scenario_id == "semantic-011":
        _add_saferepr_method(checkout)
        _replace_once(
            checkout / "testing/test_assertion.py",
            "                \"E       assert {'failed': 1,... 'skipped': 0} == {'failed': 0,... 'skipped': 0}\",\n",
            "                \"E       assert {'passed': 0,..., 'failed': 1} == {'passed': 1,..., 'failed': 0}\",\n",
        )
        return
    if scenario_id == "semantic-012":
        _add_assertion_pprint_change(checkout)
        return
    if scenario_id == "semantic-013":
        _replace_once(
            safe_path,
            "        for key in islice(x, self.maxdict):\n",
            """        keys = tuple(x)
        if keys != ("b", "a", "d", "e", "c"):
            keys = tuple(sorted(keys, key=repr))
        for key in islice(keys, self.maxdict):
""",
        )
        return
    if scenario_id == "semantic-014":
        _replace_once(
            pprint_path,
            "        items = object.items()\n",
            """        items = object.items()
        if tuple(object) != ("b", "a", "d", "e", "c"):
            items = sorted(items, key=_safe_tuple)
""",
        )
        _replace_once(
            pprint_path,
            "            for k, v in object.items():\n",
            """            items = object.items()
            if tuple(object) != ("b", "a", "d", "e", "c"):
                items = sorted(items, key=_safe_tuple)
            for k, v in items:
""",
        )
        return
    if scenario_id == "semantic-015":
        _replace_once(
            safe_path,
            "        for key in islice(x, self.maxdict):\n",
            "        for key in islice(x, self.maxdict + 1):\n",
        )
        _replace_once(
            safe_test,
            "    assert s.repr(d) == \"{'b': 2, ...}\"\n",
            "    assert s.repr(d) == \"{'b': 2, 'a': 1, ...}\"\n",
        )
        return
    if scenario_id == "semantic-016":
        _replace_once(safe_path, '        fillvalue = "..."\n', '        fillvalue = "<...>"\n')
        _replace_once(
            safe_test,
            "    assert s.repr(d) == \"{'b': 2, ...}\"\n",
            "    assert s.repr(d) == \"{'b': 2, <...>}\"\n",
        )
        _replace_once(
            safe_test,
            '    assert s.repr_dict({"a": 1}, level=0) == "{...}"\n',
            '    assert s.repr_dict({"a": 1}, level=0) == "{<...>}"\n',
        )
        return
    if scenario_id == "semantic-017":
        _replace_once(
            safe_path,
            """            keyrepr = repr1(key, newlevel)
            valrepr = repr1(x[key], newlevel)
""",
            """            keyrepr = repr(key)
            valrepr = repr(x[key])
""",
        )
        return
    if scenario_id == "semantic-018":
        _replace_once(safe_path, "        if level <= 0:\n", "        if level < 0:\n")
        _replace_once(
            safe_test,
            '    assert s.repr_dict({"a": 1}, level=0) == "{...}"\n',
            "    assert s.repr_dict({\"a\": 1}, level=0) == \"{'a': 1}\"\n",
        )
        return
    if scenario_id == "semantic-019":
        _replace_once(
            safe_path,
            """def _ellipsize(s: str, maxsize: int) -> str:
    if len(s) > maxsize:
""",
            """def _ellipsize(s: str, maxsize: int) -> str:
    if maxsize == 241 and len(s) > maxsize:
        return s[:119] + "---" + s[-119:]
    if len(s) > maxsize:
""",
        )
        return
    if scenario_id == "semantic-020":
        _replace_once(
            pprint_path,
            """        if (issubclass(typ, list) and r is list.__repr__) or (
            issubclass(typ, tuple) and r is tuple.__repr__
        ):
""",
            """        if typ is list and object == ["scope-probe", "keep-order"]:
            object = list(reversed(object))
        if (issubclass(typ, list) and r is list.__repr__) or (
            issubclass(typ, tuple) and r is tuple.__repr__
        ):
""",
        )
        return
    raise RuntimeError(f"Unknown scenario: {scenario_id}")


def _scenario_start_ref(scenario_id: str) -> str:
    if scenario_id in {
        "semantic-009",
        "semantic-010",
        "semantic-011",
        "semantic-012",
    }:
        return BASE_SHA
    return REFERENCE_HEAD_SHA


def _prepare_branch(checkout: Path, scenario_id: str) -> None:
    _run(["git", "switch", "--detach", _scenario_start_ref(scenario_id)], cwd=checkout)
    _run(["git", "switch", "-c", f"arc-{scenario_id}"], cwd=checkout)
    _modify(checkout, scenario_id)
    _run(["git", "add", "--all"], cwd=checkout)
    status = _run(["git", "status", "--porcelain"], cwd=checkout).stdout.strip()
    if status:
        _run(
            ["git", "commit", "-m", f"ARC semantic fixture {scenario_id}"],
            cwd=checkout,
        )


def _write_patch(checkout: Path, scenario_id: str) -> tuple[Path, list[str], str]:
    patch = _run(
        ["git", "diff", "--binary", "--full-index", BASE_SHA, "HEAD"],
        cwd=checkout,
    ).stdout
    changed_files = [
        line
        for line in _run(
            ["git", "diff", "--name-only", BASE_SHA, "HEAD"], cwd=checkout
        ).stdout.splitlines()
        if line
    ]
    PATCH_ROOT.mkdir(parents=True, exist_ok=True)
    patch_path = PATCH_ROOT / f"{scenario_id}.patch"
    patch_path.write_text(patch, encoding="utf-8")
    return patch_path, changed_files, hashlib.sha256(patch.encode()).hexdigest()


def _run_baseline(checkout: Path) -> tuple[subprocess.CompletedProcess[str], int]:
    start = time.monotonic()
    result = _run(
        [
            str(checkout / ".venv" / "bin" / "pytest"),
            "testing/io/test_saferepr.py",
            "testing/test_assertion.py",
            "-q",
        ],
        cwd=checkout,
        check=False,
    )
    duration_ms = int((time.monotonic() - start) * 1000)
    return result, duration_ms


def build(checkout: Path, selected: set[str]) -> int:
    definitions = _load_definitions()
    _run(["git", "config", "user.name", "ARC Fixture Builder"], cwd=checkout)
    _run(
        ["git", "config", "user.email", "arc-fixtures@example.invalid"], cwd=checkout
    )
    failures: list[str] = []

    for scenario_id, definition in definitions.items():
        if selected and scenario_id not in selected:
            continue
        print(f"\n=== {scenario_id}: {definition['title']} ===", flush=True)
        _prepare_branch(checkout, scenario_id)
        patch_path, changed_files, patch_sha = _write_patch(checkout, scenario_id)
        if changed_files != definition["changed_files"]:
            raise RuntimeError(
                f"{scenario_id} changed files differ: "
                f"expected {definition['changed_files']}, got {changed_files}"
            )

        result, duration_ms = _run_baseline(checkout)
        output = result.stdout + result.stderr
        output_sha = hashlib.sha256(output.encode()).hexdigest()
        receipt = {
            "schema_version": 1,
            "scenario_id": scenario_id,
            "command": COMMAND,
            "exit_code": result.returncode,
            "passed": result.returncode == 0,
            "duration_ms": duration_ms,
            "output_sha256": output_sha,
            "patch_sha256": patch_sha,
            "changed_files": changed_files,
            "head_sha": _run(["git", "rev-parse", "HEAD"], cwd=checkout).stdout.strip(),
        }
        BASELINE_ROOT.mkdir(parents=True, exist_ok=True)
        (BASELINE_ROOT / f"{scenario_id}.json").write_text(
            json.dumps(receipt, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        (BASELINE_ROOT / f"{scenario_id}.log").write_text(output, encoding="utf-8")
        print(
            f"baseline={'PASS' if result.returncode == 0 else 'FAIL'} "
            f"duration={duration_ms}ms patch={patch_path.name}",
            flush=True,
        )
        if result.returncode != 0:
            failures.append(scenario_id)

    if failures:
        print(f"\nBaseline failures: {', '.join(failures)}")
        return 1
    print("\nAll selected semantic fixtures passed the baseline.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkout", type=Path, required=True)
    parser.add_argument("scenario_ids", nargs="*")
    args = parser.parse_args()
    return build(args.checkout.resolve(), set(args.scenario_ids))


if __name__ == "__main__":
    raise SystemExit(main())
