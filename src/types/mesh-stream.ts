export interface MeshStreamEvent {
  type: string;
  timestamp: string;
}

export interface MeshProgressEvent extends MeshStreamEvent {
  type: 'progress';
  data: {
    percentage: number;
    message: string;
    agent?: string;
  };
}

export interface MeshAgentStartEvent extends MeshStreamEvent {
  type: 'agent_start';
  data: {
    agent: string; // ID/Role
    label: string; // User-friendly name
  };
}

export interface MeshAgentCompleteEvent extends MeshStreamEvent {
  type: 'agent_complete';
  data: {
    agent: string;
    durationMs?: number;
  };
}

export interface MeshAgentStepEvent extends MeshStreamEvent {
  type: 'agent_step';
  data: {
    agent: string;
    step: string;
  };
}

export interface MeshAgentErrorEvent extends MeshStreamEvent {
  type: 'agent_error';
  data: {
    agent: string;
    error: string;
    recoverable?: boolean;
  };
}

export interface MeshCompleteEvent<T = unknown> extends MeshStreamEvent {
  type: 'complete';
  data: {
    result: T;
    stats?: Record<string, unknown>;
  };
}

export interface MeshErrorEvent extends MeshStreamEvent {
  type: 'error';
  data: {
    message: string;
    code?: string;
  };
}

export type AnyMeshEvent =
  | MeshProgressEvent
  | MeshAgentStartEvent
  | MeshAgentCompleteEvent
  | MeshAgentStepEvent
  | MeshAgentErrorEvent
  | MeshCompleteEvent
  | MeshErrorEvent;
