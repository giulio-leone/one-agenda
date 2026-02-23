/**
 * OneAgenda Mesh Agent Types
 *
 * Shared types for all agents in the OneAgenda mesh.
 * Follows the same pattern as workout/nutrition mesh agents.
 *
 * @module oneagenda/agents/types
 */

import type { LanguageModel } from 'ai';

// ============================================================================
// LOGGER
// ============================================================================

export interface Logger {
  info: (category: string, message: string, data?: unknown) => void;
  warn: (category: string, message: string, data?: unknown) => void;
  error: (category: string, message: string, data?: unknown) => void;
}

// ============================================================================
// CHECKPOINTS
// ============================================================================

export interface Checkpoint {
  phase: string;
  isValid: boolean;
  criticalIssues: string[];
  warnings: string[];
  canContinue: boolean;
}

// ============================================================================
// ORCHESTRATOR CONFIG
// ============================================================================

export interface OneAgendaMeshOrchestratorConfig {
  model: LanguageModel;
  maxSteps?: number;
  logger?: Logger;
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

export interface GoalSummary {
  id: string;
  title: string;
  status: string;
  percentComplete: number;
  targetDate?: string;
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  estimatedMinutes?: number;
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  type: 'MEETING' | 'FOCUS' | 'EVENT' | 'OTHER';
}

export interface UserPreferencesSummary {
  timezone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  focusPreference: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY';
  workingDays: number[]; // 0-6, where 0 = Sunday
}

export interface OneAgendaMeshInput {
  rawUserInput: string;
  userId: string;
  existingGoals?: GoalSummary[];
  existingTasks?: TaskSummary[];
  calendarEvents?: CalendarEventSummary[];
  userPreferences?: UserPreferencesSummary;
  resumeFromStateId?: string;
}

// ============================================================================
// EVENT SENDER (for streaming progress)
// ============================================================================

export interface EventSender {
  sendText?: (text: string) => void;
  sendProgress?: (progress: number, message: string) => void;
  sendEvent?: (event: string, data: unknown) => void;
}

// ============================================================================
// AGENT CONTEXT (accumulated during orchestration)
// ============================================================================

export interface AgentContext {
  intent?: ParsedIntent;
  userContext?: UserContext;
  goalPlan?: GoalPlan;
  taskBreakdown?: TaskBreakdown;
  schedule?: Schedule;
  prioritization?: Prioritization;
  optimizedSchedule?: Schedule;
  qaReport?: QAReport;
}

// ============================================================================
// AGENT OUTPUT TYPES (imported from agent schemas)
// ============================================================================

// Intent Parser Agent Output
export interface GoalExtraction {
  title: string;
  description?: string;
  timeHorizon: 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
  targetDate?: string;
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TaskExtraction {
  title: string;
  description?: string;
  estimatedMinutes?: number;
  deadline?: string;
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ParsedIntent {
  intentType: 'create_goal' | 'create_task' | 'schedule_day' | 'plan_week' | 'review_progress';
  extractedGoals: GoalExtraction[];
  extractedTasks: TaskExtraction[];
  timeframe: {
    startDate?: string;
    endDate?: string;
    durationDays?: number;
  };
  constraints: string[];
  completeness: number;
  missingInfo: string[];
}

// User Context Agent Output
export interface UserContext {
  preferences: {
    timezone: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    focusPreference: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY';
  };
  existingGoals: GoalSummary[];
  existingTasks: TaskSummary[];
  workloadAnalysis: {
    currentLoad: 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERLOADED';
    capacityRemainingMinutes: number;
    upcomingDeadlines: Array<{
      taskId: string;
      title: string;
      dueDate: string;
      daysRemaining: number;
    }>;
  };
  productivity: {
    averageTaskCompletion: number;
    bestProductivityHours: string[];
    commonBlockers: string[];
  };
}

// Goal Planner Agent Output
export interface Milestone {
  id: string;
  name: string;
  description?: string;
  dueDate: string;
  order: number;
}

export interface GoalRisk {
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  mitigation?: string;
}

export interface PlannedGoal {
  id: string;
  title: string;
  description: string;
  timeHorizon: 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
  targetDate: string;
  milestones: Milestone[];
  successMetrics: string[];
  risks: GoalRisk[];
  dependencies: string[];
}

export interface GoalConflict {
  goalIds: string[];
  description: string;
  resolution?: string;
}

export interface GoalPlan {
  goals: PlannedGoal[];
  priorityRanking: string[];
  conflicts: GoalConflict[];
}

// Task Breaker Agent Output
export interface PlannedTask {
  id: string;
  title: string;
  description?: string;
  milestoneIndex: number; // Index within goal (1, 2, 3...)
  milestoneId: string; // Resolved during normalization
  goalId: string;
  estimatedMinutes: number;
  complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'VERY_COMPLEX';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  dependencies: string[];
  tags: string[];
  suggestedDeadline?: string;
}

export interface TaskBreakdown {
  tasks: PlannedTask[];
  dependencyGraph: Record<string, string[]>;
  criticalPath: string[];
  totalEffortMinutes: number;
}

// Scheduler Agent Output
export interface ScheduleBlock {
  id: string;
  type: 'TASK' | 'EVENT' | 'BREAK' | 'FOCUS';
  sourceId?: string;
  start: string;
  end: string;
  title: string;
  confidence: number;
}

export interface ScheduleDay {
  date: string;
  blocks: ScheduleBlock[];
  totalWorkMinutes: number;
  utilizationPercent: number;
}

export interface ScheduleConflict {
  blockIds: string[];
  type: 'OVERLAP' | 'CAPACITY' | 'DEPENDENCY';
  description: string;
}

export interface ScheduleSummary {
  totalDays: number;
  totalTasksScheduled: number;
  averageUtilization: number;
}

export interface Schedule {
  days: ScheduleDay[];
  unscheduledTasks: string[];
  conflicts: ScheduleConflict[];
  summary: ScheduleSummary;
}

// Prioritizer Agent Output
export interface TaskPriorityResult {
  taskId: string;
  priorityScore: number;
  factors: {
    urgencyScore: number;
    importanceScore: number;
    effortScore: number;
    dependencyScore: number;
  };
  recommendation: string;
}

export interface BlockedTask {
  taskId: string;
  blockedBy: string[];
  unblockEstimate?: string;
}

export interface Prioritization {
  rankedTasks: TaskPriorityResult[];
  topPriorities: string[];
  deferrable: string[];
  blocked: BlockedTask[];
}

// QA Review Agent Output
export interface QACheck {
  name: string;
  passed: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  remedy?: string;
}

export interface QAReport {
  isValid: boolean;
  overallScore: number;
  checks: QACheck[];
  warnings: string[];
  suggestions: string[];
}

// ============================================================================
// FINAL PLAN OUTPUT
// ============================================================================

export interface OneAgendaPlan {
  id: string;
  title: string; // AI-generated project title from first goal
  userId: string;
  createdAt: string;
  goals: PlannedGoal[];
  tasks: PlannedTask[];
  schedule: Schedule;
  prioritization: Prioritization;
  qaReport: QAReport;
  metadata: {
    generatedBy: string;
    totalGoals: number;
    totalTasks: number;
    totalEffortMinutes: number;
    scheduledDays: number;
  };
}

// ============================================================================
// ORCHESTRATION RESULT
// ============================================================================

export interface OrchestrationResult {
  success: boolean;
  plan?: OneAgendaPlan;
  context: AgentContext;
  checkpoints: Checkpoint[];
  errors?: string[];
  metrics: {
    totalDurationMs: number;
    tokensUsed: number;
    agentDurations: Record<string, number>;
  };
}
