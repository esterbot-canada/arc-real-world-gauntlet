export type AiplanStatus = 'draft' | 'frozen' | 'superseded';
export type AiplanSourceProvider = 'github' | 'linear' | 'jira' | 'machine' | 'manual';
export type AiplanRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AiplanBlockedAction = 'stop_and_ask' | 'report_blocker' | 'continue_and_report';
export type AiplanExecutionAutonomy = 'bounded' | 'advisory' | 'human_guided';
export type AiplanAllowedChangeType =
  | 'bugfix'
  | 'feature'
  | 'tests'
  | 'docs'
  | 'refactor'
  | 'config'
  | 'dependency'
  | 'migration'
  | 'infra'
  | 'ui'
  | 'api';

export type AiplanEvidenceRequirement = {
  id?: string;
  type: string;
  description: string;
  required: boolean;
};

export type AiplanV1 = {
  version: '1.0';
  kind: 'aiplan';
  id: string;
  status: AiplanStatus;
  source: {
    provider: AiplanSourceProvider;
    owner: string;
    workspace: string;
    work_type: string;
    work_id: string;
    issue_url?: string;
    repo?: string;
    title: string;
  };
  ownership: {
    owner: string;
    drafted_by: string;
    frozen_by: string | null;
    executor: string | null;
  };
  lineage: {
    created_at: string;
    supersedes: string | null;
    superseded_by: string | null;
  };
  intent: {
    summary: string;
    original_request: string;
    desired_outcome: string;
    user_visible_behavior: string;
  };
  acceptance_criteria: string[];
  definition_of_done: string[];
  non_goals: string[];
  repo_context: {
    repo_root: string;
    base_branch: string;
    target_branch: string;
    relevant_paths: string[];
    entry_points: string[];
    related_docs: string[];
    existing_patterns_to_follow: string[];
  };
  execution_mode: {
    autonomy: AiplanExecutionAutonomy;
    agent_may_modify_plan: boolean;
    agent_may_expand_scope: boolean;
  };
  scope: {
    allowed: {
      areas: string[];
      likely_files: string[];
      allowed_change_types: AiplanAllowedChangeType[];
      additional_files_policy: string;
    };
    disallowed: {
      areas: string[];
      files: string[];
      change_types: string[];
    };
  };
  environment: {
    package_manager: string;
    runtime: string;
    required_services: string[];
    setup_commands: string[];
    env_vars_required: string[];
    known_limitations: string[];
  };
  assumptions: string[];
  unknowns: string[];
  constraints: string[];
  planned_approach: {
    summary: string;
    rationale: string;
    flexibility: string;
    deviation_policy: string;
    alternatives_considered: { option: string; reason_not_chosen: string }[];
  };
  expected_change_summary: string[];
  expected_validation: {
    commands: string[];
    manual_checks: string[];
    required_before_completion: string[];
    substitute_policy: string;
  };
  required_evidence: AiplanEvidenceRequirement[];
  risk: {
    level: AiplanRiskLevel;
    areas: string[];
    reviewer_attention: string[];
    rollback_expectation: string;
  };
  permissions: {
    dependency_changes_allowed: boolean;
    migration_allowed: boolean;
    network_access_required: boolean;
    secrets_required: boolean;
    browser_required: boolean;
    external_api_changes_allowed: boolean;
    destructive_actions_allowed: boolean;
  };
  clarification_policy: {
    ask_when_acceptance_unclear: boolean;
    ask_when_scope_boundary_unclear: boolean;
    ask_when_required_context_missing: boolean;
  };
  blocked_policy: {
    if_context_missing: AiplanBlockedAction;
    if_tests_cannot_run: AiplanBlockedAction;
    if_scope_conflict_found: AiplanBlockedAction;
    if_acceptance_unclear: AiplanBlockedAction;
    if_required_capability_missing: AiplanBlockedAction;
    allowed_to_make_assumptions: boolean;
  };
  continuity_policy: {
    on_context_compaction: 'reload_frozen_plan_and_verify_hash';
    on_agent_handoff: 'reload_frozen_plan_and_verify_hash';
    on_session_resume: 'reload_frozen_plan_and_verify_hash';
    require_contract_restatement_after_resume: boolean;
  };
  review_focus: string[];
  schema_validation: {
    required_fields_enforced: boolean;
    allow_unknown_fields: boolean;
  };
  freeze: {
    frozen_at: string | null;
    frozen_by: string | null;
    content_hash: string | null;
    hash_algorithm: 'sha256';
    freeze_reason: string;
    immutable_after_frozen: boolean;
  };
};
