from agent_work_evidence.risk import assess_risk


def test_auth_file_triggers_risk_signal():
    signals = assess_risk(changed_files=["src/auth/session.ts"], additions=10, deletions=2, checks_conclusion=None)
    assert any(signal.name == "sensitive_path" for signal in signals)


def test_missing_tests_triggers_human_question_for_code_change():
    signals = assess_risk(changed_files=["src/billing/checkout.ts"], additions=80, deletions=20, checks_conclusion="success")
    assert any(signal.name == "no_tests_changed" for signal in signals)


def test_docs_only_change_does_not_trigger_missing_tests():
    signals = assess_risk(changed_files=["History.md"], additions=2, deletions=2, checks_conclusion="success")
    assert any(signal.name == "docs_only_change" for signal in signals)
    assert not any(signal.name == "no_tests_changed" for signal in signals)


def test_agent_context_markdown_is_high_risk():
    signals = assess_risk(
        changed_files=[
            "AGENTS.md",
            "CLAUDE.md",
            "skills/reviewer/SKILL.md",
            ".cursor/rules/reviewer.md",
            ".github/copilot-instructions.md",
            "prompts/review/system.md",
        ],
        additions=4,
        deletions=2,
        checks_conclusion="success",
    )
    signal = next(signal for signal in signals if signal.name == "agent_instruction_context")
    assert signal.level == "high"
    assert "AGENTS.md" in signal.evidence
    assert "skills/reviewer/SKILL.md" in signal.evidence
    assert ".cursor/rules/reviewer.md" in signal.evidence


def test_product_agent_source_path_is_not_agent_instruction_context():
    signals = assess_risk(
        changed_files=["packages/@n8n/nodes-langchain/nodes/agents/Agent/test/integration/agent-v3.workflow.test.ts"],
        additions=3,
        deletions=2,
        checks_conclusion="success",
    )
    assert not any(signal.name == "agent_instruction_context" for signal in signals)


def test_credential_tls_security_change_is_flagged():
    diff = """
--- a/packages/nodes-base/credentials/OpenAiApi.credentials.ts
+++ b/packages/nodes-base/credentials/OpenAiApi.credentials.ts
+           displayName: 'Client Private Key',
+           name: 'key',
+           type: 'string',
+           typeOptions: { password: true },
+           displayOptions: { show: { sslCertificatesEnabled: [true] } },
+           description: 'Client private key in PEM format',
--- a/packages/@n8n/nodes-langchain/nodes/vendors/OpenAi/transport/index.ts
+++ b/packages/@n8n/nodes-langchain/nodes/vendors/OpenAi/transport/index.ts
+       options.agentOptions = {
+           ca: normalizePem(credentials.ca),
+           cert: normalizePem(credentials.cert),
+           key: normalizePem(credentials.key),
+           passphrase: credentials.passphrase,
+       };
"""
    signals = assess_risk(
        changed_files=[
            "packages/nodes-base/credentials/OpenAiApi.credentials.ts",
            "packages/@n8n/nodes-langchain/nodes/vendors/OpenAi/transport/index.ts",
        ],
        additions=20,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    signal = next(signal for signal in signals if signal.name == "credential_tls_security_change")
    assert signal.level in {"medium", "high"}
    assert any("OpenAiApi.credentials.ts" in item for item in signal.evidence)


def test_docs_certificate_mention_does_not_trigger_credential_tls_security():
    diff = """
--- a/docs/security.md
+++ b/docs/security.md
+To use mTLS, provide a client certificate to your server administrator.
"""
    signals = assess_risk(
        changed_files=["docs/security.md"],
        additions=1,
        deletions=0,
        checks_conclusion="success",
        diff=diff,
    )
    assert not any(signal.name == "credential_tls_security_change" for signal in signals)


def test_auth_permission_change_is_flagged_for_access_control_logic():
    diff = """
--- a/src/auth/permissions.ts
+++ b/src/auth/permissions.ts
-   if (!user || user.role !== 'admin') throw new ForbiddenError();
+   if (!user) throw new ForbiddenError();
+   return canAccessWorkspace(user.id, workspaceId);
"""
    signals = assess_risk(
        changed_files=["src/auth/permissions.ts"],
        additions=2,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    signal = next(signal for signal in signals if signal.name == "auth_permission_change")
    assert signal.level in {"medium", "high"}
    assert any("permissions.ts" in item or "role" in item or "canAccessWorkspace" in item for item in signal.evidence)


def test_session_jwt_change_is_flagged_from_diff_signal_even_without_auth_path():
    diff = """
--- a/app/init/resources.php
+++ b/app/init/resources.php
-            if (empty($user->find('$id', $jwtSessionId, 'sessions'))) { // Match JWT to active token
+            $jwtSession = $user->find('$id', $jwtSessionId, 'sessions');
+                if ($session->isSet('expire') && DatabaseDateTime::formatTz(DatabaseDateTime::format(new \\DateTime($session->getAttribute('expire')))) < DatabaseDateTime::formatTz(DatabaseDateTime::now())) {
+                    $user = new User([]);
+                }
"""
    signals = assess_risk(
        changed_files=["app/init/resources.php"],
        additions=6,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    signal = next(signal for signal in signals if signal.name == "auth_permission_change")
    assert signal.level == "medium"
    assert any("jwtSession" in item or "sessions" in item for item in signal.evidence)


def test_docs_only_auth_mention_does_not_trigger_auth_permission_change():
    diff = """
--- a/docs/auth.md
+++ b/docs/auth.md
+Use authorization docs to decide which role should own a workspace.
"""
    signals = assess_risk(
        changed_files=["docs/auth.md"],
        additions=1,
        deletions=0,
        checks_conclusion="success",
        diff=diff,
    )
    assert not any(signal.name == "auth_permission_change" for signal in signals)


def test_dependency_only_auth_package_bump_does_not_trigger_auth_permission_change():
    diff = """
--- a/package.json
+++ b/package.json
-    "next-auth": "4.24.0"
+    "next-auth": "4.24.1"
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
+  next-auth@4.24.1:
+    integrity: sha512-example
"""
    signals = assess_risk(
        changed_files=["package.json", "pnpm-lock.yaml"],
        additions=3,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    assert any(signal.name == "supply_chain_security_change" for signal in signals)
    assert not any(signal.name == "auth_permission_change" for signal in signals)


def test_owner_domain_model_without_access_control_signal_does_not_trigger_auth_permission_change():
    diff = """
--- a/src/models/project.ts
+++ b/src/models/project.ts
-  ownerName: string;
+  ownerDisplayName: string;
"""
    signals = assess_risk(
        changed_files=["src/models/project.ts"],
        additions=1,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    assert not any(signal.name == "auth_permission_change" for signal in signals)


def test_dependency_lockfile_change_triggers_supply_chain_security():
    diff = """
--- a/package.json
+++ b/package.json
@@
-    "path-to-regexp": "0.1.12"
+    "path-to-regexp": "0.1.13"
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
+  path-to-regexp@0.1.13:
+    integrity: sha512-example
"""
    signals = assess_risk(
        changed_files=["package.json", "pnpm-lock.yaml"],
        additions=3,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    signal = next(signal for signal in signals if signal.name == "supply_chain_security_change")
    assert signal.level == "medium"
    assert "package.json" in signal.evidence
    assert any("path-to-regexp" in item for item in signal.evidence)


def test_package_script_only_change_does_not_trigger_supply_chain_security():
    diff = """
--- a/package.json
+++ b/package.json
@@
-    "lint": "eslint src"
+    "lint": "eslint src --max-warnings=0"
"""
    signals = assess_risk(
        changed_files=["package.json"],
        additions=1,
        deletions=1,
        checks_conclusion="success",
        diff=diff,
    )
    assert not any(signal.name == "supply_chain_security_change" for signal in signals)


def test_docs_dependency_mention_does_not_trigger_supply_chain_security():
    diff = """
--- a/docs/dependencies.md
+++ b/docs/dependencies.md
+Run pnpm install after changing package.json dependencies.
"""
    signals = assess_risk(
        changed_files=["docs/dependencies.md"],
        additions=1,
        deletions=0,
        checks_conclusion="success",
        diff=diff,
    )
    assert not any(signal.name == "supply_chain_security_change" for signal in signals)


def test_markdown_code_identifier_change_is_not_plain_low_risk_docs():
    diff = """
--- a/drizzle-arktype/README.md
+++ b/drizzle-arktype/README.md
-\tid: (schema) => schema.atLeast(1),
+\tid: (schema) => schema.at least(1),
"""
    signals = assess_risk(changed_files=["drizzle-arktype/README.md"], additions=1, deletions=1, checks_conclusion="success", diff=diff)
    signal_names = {signal.name for signal in signals}
    assert "markdown_code_identifier_change" in signal_names
    assert any(signal.name == "docs_only_change" and signal.level == "medium" for signal in signals)


def test_historical_changelog_semantic_change_is_flagged():
    diff = """
--- a/changelogs/drizzle-kit/0.31.8.md
+++ b/changelogs/drizzle-kit/0.31.8.md
-- Fixed `algorythm` => `algorithm` typo.
+- Fixed `algorithm` => `algorithm` typo.
"""
    signals = assess_risk(changed_files=["changelogs/drizzle-kit/0.31.8.md"], additions=1, deletions=1, checks_conclusion="success", diff=diff)
    assert any(signal.name == "historical_changelog_semantic_change" for signal in signals)


def test_history_plain_typo_remains_low_risk_docs_only():
    diff = """
--- a/History.md
+++ b/History.md
-* Changed; auto set Content-Type in res.attachement [Aaron Heckmann]
+* Changed; auto set Content-Type in res.attachment [Aaron Heckmann]
"""
    signals = assess_risk(changed_files=["History.md"], additions=1, deletions=1, checks_conclusion="success", diff=diff)
    assert not any(signal.name == "markdown_code_identifier_change" for signal in signals)
    assert not any(signal.name == "historical_changelog_semantic_change" for signal in signals)
    assert any(signal.name == "docs_only_change" and signal.level == "low" for signal in signals)


def test_large_diff_triggers_risk_signal():
    signals = assess_risk(changed_files=["src/app.ts"], additions=500, deletions=50, checks_conclusion="success")
    assert any(signal.name == "large_diff" for signal in signals)


def test_failed_check_examples_create_failing_ci_signal():
    signals = assess_risk(
        changed_files=["src/app.ts"],
        additions=5,
        deletions=1,
        checks_conclusion="failure",
        check_failure_evidence=["CI / unit: failure", "CI / integration: error"],
    )
    signal = next(signal for signal in signals if signal.name == "failing_ci")
    assert signal.level == "high"
    assert signal.evidence[:2] == ["CI / unit: failure", "CI / integration: error"]


def test_successful_checks_do_not_create_failing_ci_signal():
    signals = assess_risk(
        changed_files=["src/app.ts"],
        additions=5,
        deletions=1,
        checks_conclusion="success",
        check_failure_evidence=[],
    )
    assert not any(signal.name == "failing_ci" for signal in signals)


def test_empty_changed_files_does_not_emit_no_tests_changed():
    signals = assess_risk(changed_files=[], additions=0, deletions=0, checks_conclusion="success")
    assert not any(signal.name == "no_tests_changed" for signal in signals)


def test_data_specs_filename_is_not_test_path_by_itself():
    signals = assess_risk(changed_files=["data_specs_cli_output.sas"], additions=4, deletions=2, checks_conclusion="success")
    assert any(signal.name == "no_tests_changed" for signal in signals)


def test_api_network_surface_detects_rest_and_rate_limit_terms():
    diff = '''
--- a/BlazorWebApp/BlazorApp/Program.cs
+++ b/BlazorWebApp/BlazorApp/Program.cs
+app.MapGet("/api/v1/contacts", () => contacts).RequireRateLimiting("contacts");
+builder.Services.AddRateLimiter(options => {});
'''
    signals = assess_risk(
        changed_files=["BlazorWebApp/BlazorApp/Program.cs"],
        additions=20,
        deletions=2,
        checks_conclusion="success",
        title="Add RESTful API for contacts with versioning and rate limiting",
        body="Adds API endpoints and rate limiting.",
        diff=diff,
    )
    signal = next(signal for signal in signals if signal.name == "api_network_surface_change")
    assert signal.level == "medium"
    assert any("MapGet" in item or "RateLimiter" in item for item in signal.evidence)


def test_native_runtime_surface_detects_opengl_bootstrap_change():
    diff = '''
--- a/src/render/gl/opengl.cpp
+++ b/src/render/gl/opengl.cpp
+if (nativeOpenGL) return SK_GL_SwapBuffers(hdc);
+// skip D3D11 bootstrap for Virule/SKF1
'''
    signals = assess_risk(
        changed_files=["src/render/gl/opengl.cpp"],
        additions=10,
        deletions=2,
        checks_conclusion="success",
        title="Virule/SKF1 native-OpenGL gate to skip D3D11 bootstrap in SK_GL_SwapBuffers",
        body="",
        diff=diff,
    )
    signal = next(signal for signal in signals if signal.name == "native_runtime_surface_change")
    assert signal.level == "medium"
    assert any("opengl.cpp" in item for item in signal.evidence)
