export type ThinkingStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export type ThinkingIcon = 'dot' | 'doc';

export interface ThinkingStep {
  id: string;
  label: string;
  status: ThinkingStatus;
  icon?: ThinkingIcon;
  indent?: number;
}
