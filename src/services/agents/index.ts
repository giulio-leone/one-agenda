/**
 * OneAgenda Mesh Agent Module
 *
 * Barrel export for all agents and orchestrator.
 *
 * @module oneagenda/agents
 */

// ============================================================================
// TYPES
// ============================================================================
export * from './types';

// ============================================================================
// UTILS
// ============================================================================
export * from './utils';

// ============================================================================
// FOUNDATION AGENTS
// ============================================================================
export {
  IntentParserAgent,
  createIntentParserTools,
  parsedIntentSchema,
  goalExtractionSchema,
  taskExtractionSchema,
  INTENT_PARSER_SYSTEM_PROMPT,
} from './foundation/intent-parser.agent';

export {
  UserContextAgent,
  createUserContextTools,
  userContextSchema,
  USER_CONTEXT_SYSTEM_PROMPT,
} from './foundation/user-context.agent';

// ============================================================================
// PLANNING AGENTS
// ============================================================================
export {
  GoalPlannerAgent,
  createGoalPlannerTools,
  goalPlanSchema,
  milestoneSchema,
  goalRiskSchema,
  plannedGoalSchema,
  goalConflictSchema,
  GOAL_PLANNER_SYSTEM_PROMPT,
} from './planning/goal-planner.agent';

export {
  TaskBreakerAgent,
  createTaskBreakerTools,
  taskBreakdownSchema,
  plannedTaskSchema,
  TASK_BREAKER_SYSTEM_PROMPT,
} from './planning/task-breaker.agent';

// ============================================================================
// SCHEDULING AGENTS
// ============================================================================
export {
  SchedulerAgent,
  createSchedulerTools,
  scheduleSchema,
  scheduleBlockSchema,
  scheduleDaySchema,
  scheduleConflictSchema,
  scheduleSummarySchema,
  SCHEDULER_SYSTEM_PROMPT,
} from './scheduling/scheduler.agent';

export {
  PrioritizerAgent,
  createPrioritizerTools,
  prioritizationSchema,
  taskPriorityResultSchema,
  priorityFactorsSchema,
  blockedTaskSchema,
  PRIORITIZER_SYSTEM_PROMPT,
} from './scheduling/prioritizer.agent';

// ============================================================================
// QUALITY AGENTS
// ============================================================================
export {
  TimeOptimizerAgent,
  createTimeOptimizerTools,
  optimizationSchema,
  optimizationResultSchema,
  TIME_OPTIMIZER_SYSTEM_PROMPT,
} from './quality/time-optimizer.agent';

export {
  QAReviewAgent,
  createQAReviewTools,
  qaReportSchema,
  qaCheckSchema,
  QA_REVIEW_SYSTEM_PROMPT,
} from './quality/qa-review.agent';

// ============================================================================
// ORCHESTRATOR
// ============================================================================
export { OneAgendaMeshOrchestrator, createOneAgendaMeshOrchestrator } from './orchestrator';
