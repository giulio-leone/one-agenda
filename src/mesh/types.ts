/**
 * OneAgenda Mesh Types
 *
 * SSE event types and interfaces for the mesh orchestrator's
 * real-time streaming protocol.
 */

// --- SSE Event Types ---

export interface MeshAgentStartEvent {
  type: 'agent_start';
  timestamp: string;
  data: {
    agent: string;
    label: string;
  };
}

export interface MeshAgentCompleteEvent {
  type: 'agent_complete';
  timestamp: string;
  data: {
    agent: string;
    durationMs?: number;
  };
}

export interface MeshProgressEvent {
  type: 'progress';
  timestamp: string;
  data: {
    percentage: number;
    message: string;
  };
}

export interface MeshAgentErrorEvent {
  type: 'agent_error';
  timestamp: string;
  data: {
    agent: string;
    error: string;
  };
}

export interface MeshCompleteEvent {
  type: 'complete';
  timestamp: string;
  data: {
    result: unknown;
  };
}

export type SSEMeshEvent =
  | MeshAgentStartEvent
  | MeshAgentCompleteEvent
  | MeshProgressEvent
  | MeshAgentErrorEvent
  | MeshCompleteEvent;

// --- EventSender Interface ---

export interface EventSender {
  sendText?: (text: string) => void;
  sendProgress: (progress: number, message: string) => void;
  sendEvent: (name: string, data: unknown) => void;
}

// --- Orchestrator Input ---

export interface OneAgendaMeshInput {
  rawUserInput: string;
  userId: string;
  existingGoals: Array<{
    id: string;
    title: string;
    status: string;
    percentComplete: number;
    targetDate?: string;
  }>;
  existingTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate?: string;
    estimatedMinutes?: number;
  }>;
  calendarEvents: Array<{
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    type: 'MEETING' | 'FOCUS' | 'EVENT' | 'OTHER';
  }>;
  userPreferences?: {
    timezone: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    focusPreference: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY';
    workingDays: number[];
  };
}

// --- Orchestrator Result ---

export interface MeshOrchestratorResult {
  success: boolean;
  plan?: unknown;
  errors?: string[];
}
