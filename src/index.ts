// Domain types used by consumers
export { TaskSchema } from './domain/types';
export type { Task } from './domain/types';

// Re-export enums from core-domain (TaskStatus, TaskPriority live in core-domain/task)
export { TaskStatus, TaskPriority } from './core-domain/task';

// Mesh orchestrator + service
export { OneAgendaMeshOrchestrator } from './services/agents/orchestrator';
export { OneAgendaService } from './services/oneagenda.service';
export type { EventSender, OneAgendaMeshInput, OneAgendaPlan } from './services/agents/types';
export * from './types/mesh-stream';

// Core domain types (Goal, Milestone, GoalStatus, etc.)
export * from './core-domain';

// Core services (calendar sync, etc.)
export * from './core-services';

// Database access
export * from './core-db';
