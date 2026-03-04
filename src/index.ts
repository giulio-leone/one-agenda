// Domain types used by consumers
export { TaskSchema, TaskStatus, TaskPriority } from './domain/types';
export type { Task } from './domain/types';

// Mesh orchestrator + service
export { OneAgendaMeshOrchestrator } from './services/agents/orchestrator';
export { OneAgendaService } from './services/oneagenda.service';
export type { EventSender, OneAgendaMeshInput, OneAgendaPlan } from './services/agents/types';
export * from './types/mesh-stream';

// Core domain types (Goal, Milestone, GoalStatus, etc.)
export * from './core-domain';

// Database access
export * from './core-db';

// Planning service (PlanningServiceV2)
export * from './planning';
