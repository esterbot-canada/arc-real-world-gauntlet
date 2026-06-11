from agent_work_evidence.claims import extract_claims, extract_reported_validation, verify_claims


def test_extract_claims_from_pr_body_bullets():
    claims = extract_claims("""
    - Added login redirect handling
    - Added tests for session expiry
    """)
    assert len(claims) == 2
    assert claims[0].text == "Added login redirect handling"


def test_extract_claims_ignores_validation_section():
    claims = extract_claims("""
    Changes:
    - Added login redirect handling

    Validation:
    - npm install
    - npm run eslint
    """)
    assert [claim.text for claim in claims] == ["Added login redirect handling"]


def test_extract_reported_validation_from_validation_section():
    validations = extract_reported_validation("""
    Changes:
    - Added login redirect handling

    Validation:
    - npm install
    - npm run eslint
    """)
    assert validations == ["npm install", "npm run eslint"]


def test_markdown_validation_section_is_reported_not_claims():
    body = """
    ## Summary
    - add provider-agnostic TUI JSONL turn-state probe
    - queue busy Discord followups instead of dropping them

    ## Validation
    - cargo fmt --all --check
    - git diff --check origin/main...HEAD
    - cargo test --features legacy-sqlite-tests tui_turn_state -- --nocapture --test-threads=1
    """

    assert [claim.text for claim in extract_claims(body)] == [
        "add provider-agnostic TUI JSONL turn-state probe",
        "queue busy Discord followups instead of dropping them",
    ]
    assert extract_reported_validation(body) == [
        "cargo fmt --all --check",
        "git diff --check origin/main...HEAD",
        "cargo test --features legacy-sqlite-tests tui_turn_state -- --nocapture --test-threads=1",
    ]


def test_verification_and_test_plan_headings_are_validation():
    body = """
    ### What changed
    - add encrypted key store

    ### Verification
    - ./gradlew :app:testDebugUnitTest

    Test plan:
    - ./gradlew build
    """

    assert [claim.text for claim in extract_claims(body)] == ["add encrypted key store"]
    assert extract_reported_validation(body) == [
        "./gradlew :app:testDebugUnitTest",
        "./gradlew build",
    ]


def test_numbered_testing_steps_are_reported_validation():
    body = """
    ## Summary
    - add search click tracking

    ## Testing
    To test:
    1. Use the PR preview link to perform a search and click on a result.
    2. Open the Search page at Algolia.com and verify the event appears.
    """

    assert [claim.text for claim in extract_claims(body)] == ["add search click tracking"]
    assert extract_reported_validation(body) == [
        "Use the PR preview link to perform a search and click on a result.",
        "Open the Search page at Algolia.com and verify the event appears.",
    ]


def test_inline_verification_statement_is_reported_validation():
    body = """
    Implements encrypted storage. Verification: `./gradlew :app:testDebugUnitTest` and `./gradlew build` both pass.
    """

    assert extract_reported_validation(body) == ["`./gradlew :app:testDebugUnitTest` and `./gradlew build` both pass."]


def test_inline_validation_bullet_is_not_an_implementation_claim():
    body = """
    ## Summary
    - add thing
    - Verification: `npm test` passes
    """

    assert [claim.text for claim in extract_claims(body)] == ["add thing"]
    assert extract_reported_validation(body) == ["`npm test` passes"]


def test_bold_suggested_test_plan_heading_is_validation_section():
    body = """
    ## Summary
    - add Seismic testnet multi-wallet bot

    **Suggested test plan:**
    - Run `python seismic_tg_bot.py --help`
    - Send `/wallets` and `/deploy` in Telegram
    """

    assert [claim.text for claim in extract_claims(body)] == ["add Seismic testnet multi-wallet bot"]
    assert extract_reported_validation(body) == [
        "Run `python seismic_tg_bot.py --help`",
        "Send `/wallets` and `/deploy` in Telegram",
    ]


def test_bold_suggested_test_plan_heading_with_colon_outside_emphasis_is_validation_section():
    body = """
    ## Summary
    - add orders endpoint

    **Suggested test plan**:
    - Run `npm test`
    - Hit `/api/orders` with curl
    """

    assert [claim.text for claim in extract_claims(body)] == ["add orders endpoint"]
    assert extract_reported_validation(body) == [
        "Run `npm test`",
        "Hit `/api/orders` with curl",
    ]


def test_inline_bold_validation_statement_strips_markdown_wrapper():
    body = """
    **Validation:** `npm test` passes
    """

    assert extract_reported_validation(body) == ["`npm test` passes"]


def test_inline_bold_suggested_test_plan_statement_strips_markdown_wrapper():
    body = """
    **Suggested test plan**: Run `npm test`, then hit `/api/orders` with curl.
    """

    assert extract_reported_validation(body) == ["Run `npm test`, then hit `/api/orders` with curl."]


def test_verify_claim_does_not_treat_testnet_as_test_claim():
    claims = extract_claims("- document Codex quick start, testnet install, and manual TOML configuration")
    verified = verify_claims(
        claims,
        changed_files=["README.md", "package.json", "src/index.ts"],
        diff="""
        +NETWORK = "testnet"
        +codex install manual TOML configuration
        +document Codex quick start
        """,
    )

    assert verified[0].status == "supported"
    assert "No changed files look like tests" not in verified[0].evidence
    assert any("Claim terms appear in diff" in item for item in verified[0].evidence)


def test_verify_tests_claim_unverified_when_no_tests_changed():
    claims = extract_claims("- Added tests for session expiry")
    verified = verify_claims(claims, changed_files=["src/auth.py"], diff="")
    assert verified[0].status == "unverified"
    assert verified[0].evidence == ["No changed files look like tests"]


def test_verify_claim_detects_test_tool_claims():
    claims = extract_claims("- add pytest coverage for session expiry")
    verified = verify_claims(claims, changed_files=["tests/test_auth.py"], diff="")

    assert verified[0].status == "supported"
    assert verified[0].evidence == ["At least one changed file looks like a test file"]
