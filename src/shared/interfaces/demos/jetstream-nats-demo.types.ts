export interface JetStreamScenarioEvidence {
  scenario: string;
  stream: string;
  evidence: Record<string, unknown>;
}
