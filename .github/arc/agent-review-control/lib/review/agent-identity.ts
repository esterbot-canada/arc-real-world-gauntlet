import type { AgentIdentity } from '../contracts/schema.ts';
import type { IngestMetadata, ReviewItem } from './types.ts';

export type AgentDisplayIdentity = {
  name: string;
  subtitle: string;
  id?: string;
  role?: string;
  runtime?: string;
  runId?: string;
  sessionId?: string;
  isKnown: boolean;
};

type IdentityInput = Pick<ReviewItem, 'contract' | 'ingestMetadata'>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function agentDisplayFor(item: IdentityInput): AgentDisplayIdentity {
  const agent: AgentIdentity = item.contract.agent ?? {};
  const ingest: IngestMetadata = item.ingestMetadata ?? {};

  const id = clean(agent.id);
  const role = clean(agent.role);
  const runtime = clean(agent.runtime) ?? clean(ingest.source);
  const runId = clean(agent.run_id) ?? clean(ingest.runId);
  const sessionId = clean(agent.session_id);
  const name = clean(agent.name) ?? id ?? clean(ingest.source) ?? 'Unknown agent';
  const subtitle = [role, runtime, runId].filter(Boolean).join(' · ');

  return {
    name,
    subtitle,
    id,
    role,
    runtime,
    runId,
    sessionId,
    isKnown: name !== 'Unknown agent',
  };
}
