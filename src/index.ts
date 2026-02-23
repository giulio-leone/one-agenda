export * from './domain/types';
export * from './planner/plan-day';
export * from './planner/what-if';
export * from './planner/input';
export * from './connectors/interfaces';
export * from './connectors/mock';
export * from './demo/demo-data';
export * from './agentic/agentic-planner';

// Planning (merged from @giulio-leone/lib-planning)
export * from './planning';

// Services
export { OneAgendaMeshOrchestrator } from './services/agents/orchestrator';
export { OneAgendaService } from './services/oneagenda.service';
export type { EventSender, OneAgendaMeshInput, OneAgendaPlan } from './services/agents/types';
export * from './types/mesh-stream';

// Core domain (merged from @giulio-leone/oneagenda-core)
export * from './core-domain';
export * from './core-services';
export * from './core-db';

// UI components (merged from @giulio-leone/oneagenda-ui)
export * from './ui-components';
export * from './ui-hooks';
