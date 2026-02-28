/**
 * OneAgenda Mesh Agent Utilities
 *
 * Shared utility functions for validation and checkpoint management.
 *
 * @module oneagenda/agents/utils
 */

import type { Checkpoint } from '../types';

// ============================================================================
// CHECKPOINT UTILITIES
// ============================================================================

/**
 * Create a passing checkpoint.
 */
export function createPassingCheckpoint(phase: string, warnings: string[] = []): Checkpoint {
  return {
    phase,
    isValid: true,
    criticalIssues: [],
    warnings,
    canContinue: true,
  };
}

/**
 * Create a failing checkpoint.
 */
export function createFailingCheckpoint(phase: string, issues: string[]): Checkpoint {
  return {
    phase,
    isValid: false,
    criticalIssues: issues,
    warnings: [],
    canContinue: false,
  };
}

/**
 * Assert that a checkpoint is valid, throw if not.
 */
export function assertCheckpoint(checkpoint: Checkpoint): void {
  if (!checkpoint.isValid || !checkpoint.canContinue) {
    throw new Error(
      `Checkpoint '${checkpoint.phase}' failed: ${checkpoint.criticalIssues.join(', ')}`
    );
  }
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate intent completeness and return score with missing info.
 */
export function validateIntentCompleteness(intent: {
  intentType?: string;
  extractedGoals?: unknown[];
  extractedTasks?: unknown[];
  timeframe?: { startDate?: string; endDate?: string; durationDays?: number };
}): { completeness: number; missingInfo: string[] } {
  let completeness = 0;
  const missingInfo: string[] = [];

  // Intent type (30 points)
  if (intent.intentType) {
    completeness += 30;
  } else {
    missingInfo.push('Tipo di richiesta non identificato');
  }

  // Goals or tasks (30 points)
  const hasGoals = intent.extractedGoals && intent.extractedGoals.length > 0;
  const hasTasks = intent.extractedTasks && intent.extractedTasks.length > 0;
  if (hasGoals || hasTasks) {
    completeness += 30;
  } else {
    missingInfo.push('Nessun obiettivo o task identificato');
  }

  // Timeframe (20 points)
  const hasTimeframe =
    intent.timeframe?.startDate || intent.timeframe?.endDate || intent.timeframe?.durationDays;
  if (hasTimeframe) {
    completeness += 20;
  } else {
    missingInfo.push('Timeframe non specificato');
  }

  // Bonus for having both goals and tasks (20 points)
  if (hasGoals && hasTasks) {
    completeness += 20;
  }

  return { completeness: Math.min(100, completeness), missingInfo };
}

/**
 * Validate goal plan for completeness.
 */
export function validateGoalPlan(plan: {
  goals?: Array<{ milestones?: unknown[]; successMetrics?: unknown[] }>;
}): { completeness: number; issues: string[] } {
  let completeness = 0;
  const issues: string[] = [];

  if (!plan.goals || plan.goals.length === 0) {
    issues.push('Nessun goal definito');
    return { completeness: 0, issues };
  }

  completeness += 40; // Has goals

  // Check milestones
  const goalsWithMilestones = plan.goals.filter((g: any) => g.milestones && g.milestones.length > 0
  ).length;
  if (goalsWithMilestones === plan.goals.length) {
    completeness += 30;
  } else if (goalsWithMilestones > 0) {
    completeness += 15;
    issues.push('Alcuni goal non hanno milestone');
  } else {
    issues.push('Nessun goal ha milestone definiti');
  }

  // Check success metrics
  const goalsWithMetrics = plan.goals.filter((g: any) => g.successMetrics && g.successMetrics.length > 0
  ).length;
  if (goalsWithMetrics === plan.goals.length) {
    completeness += 30;
  } else if (goalsWithMetrics > 0) {
    completeness += 15;
    issues.push('Alcuni goal non hanno metriche di successo');
  } else {
    issues.push('Nessun goal ha metriche di successo definite');
  }

  return { completeness: Math.min(100, completeness), issues };
}

/**
 * Validate schedule for feasibility.
 */
export function validateSchedule(schedule: {
  days?: Array<{ utilizationPercent?: number }>;
  unscheduledTasks?: string[];
  conflicts?: unknown[];
}): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!schedule.days || schedule.days.length === 0) {
    issues.push('Nessun giorno schedulato');
    return { isValid: false, issues };
  }

  // Check for overloaded days
  const overloadedDays = schedule.days.filter((d: any) => (d.utilizationPercent || 0) > 100).length;
  if (overloadedDays > 0) {
    issues.push(`${overloadedDays} giorni sono sovraccarichi (>100% utilizzo)`);
  }

  // Check unscheduled tasks
  if (schedule.unscheduledTasks && schedule.unscheduledTasks.length > 0) {
    issues.push(`${schedule.unscheduledTasks.length} task non schedulati`);
  }

  // Check conflicts
  if (schedule.conflicts && schedule.conflicts.length > 0) {
    issues.push(`${schedule.conflicts.length} conflitti rilevati`);
  }

  return { isValid: issues.length === 0, issues };
}

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Parse a date string to ISO format.
 */
export function parseToISODate(input: string): string | null {
  try {
    const date = new Date(input);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Calculate days between two dates.
 */
export function daysBetween(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get working hours in a day range.
 */
export function getWorkingMinutes(
  startHour: string,
  endHour: string,
  breakMinutes: number = 60
): number {
  const [startH, startM] = startHour.split(':').map(Number);
  const [endH, endM] = endHour.split(':').map(Number);

  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  return Math.max(0, endMinutes - startMinutes - breakMinutes);
}

// ============================================================================
// ID GENERATION
// ============================================================================

import { createId } from '@giulio-leone/lib-shared';
export { createId };

// ============================================================================
// ID NORMALIZATION
// ============================================================================

import type { GoalPlan, TaskBreakdown, PlannedTask } from '../types';

/**
 * Normalize GoalPlan by assigning deterministic IDs to all goals and milestones.
 * Returns the normalized plan and an ID mapping for reference.
 *
 * IMPORTANT: Milestone mappings use goal-scoped composite keys to preserve
 * parent-child relationships (e.g., "goal_1:milestone_1" -> actual ID).
 */
export function normalizeGoalPlanIds(goalPlan: GoalPlan): {
  normalizedPlan: GoalPlan;
  goalIdMap: Map<string, string>; // oldId -> newId
  milestoneIdMap: Map<string, string>; // compositeKey -> newId
} {
  const goalIdMap = new Map<string, string>();
  const milestoneIdMap = new Map<string, string>();

  const normalizedGoals = goalPlan.goals.map((goal, goalIdx) => {
    const newGoalId = createId();
    const oldGoalId = goal.id;

    // Map by actual ID and simple index format
    goalIdMap.set(oldGoalId, newGoalId);
    goalIdMap.set(`goal_${goalIdx + 1}`, newGoalId);

    const normalizedMilestones = (goal.milestones || []).map((milestone, msIdx) => {
      const newMilestoneId = createId();
      const oldMilestoneId = milestone.id;

      // Map by actual milestone ID
      milestoneIdMap.set(oldMilestoneId, newMilestoneId);

      // Map with GOAL-SCOPED composite keys to preserve parent-child relationship
      // This prevents "milestone_1" from Goal 2 overwriting "milestone_1" from Goal 1
      const goalKeys = [oldGoalId, `goal_${goalIdx + 1}`];
      const msKeys = [
        oldMilestoneId,
        `milestone_${msIdx + 1}`,
        `milestone_00${msIdx + 1}`,
        `milestone_${String(msIdx + 1).padStart(3, '0')}`,
      ];

      // Create all combinations of goalKey:milestoneKey
      for (const gk of goalKeys) {
        for (const mk of msKeys) {
          milestoneIdMap.set(`${gk}:${mk}`, newMilestoneId);
        }
        // Also map just the index within the goal: "goal_1:1", "goal_1:2", etc.
        milestoneIdMap.set(`${gk}:${msIdx + 1}`, newMilestoneId);
      }

      // Map by global index (first goal's milestones get priority)
      // Only set if not already set (preserves first goal's mappings)
      const simpleKeys = [
        `milestone_${msIdx + 1}`,
        `milestone_00${msIdx + 1}`,
        `milestone_${String(msIdx + 1).padStart(3, '0')}`,
      ];
      for (const sk of simpleKeys) {
        if (!milestoneIdMap.has(sk)) {
          milestoneIdMap.set(sk, newMilestoneId);
        }
      }

      return {
        ...milestone,
        id: newMilestoneId,
        order: milestone.order || msIdx + 1,
      };
    });

    return {
      ...goal,
      id: newGoalId,
      milestones: normalizedMilestones,
    };
  });

  return {
    normalizedPlan: {
      ...goalPlan,
      goals: normalizedGoals,
      priorityRanking:
        goalPlan.priorityRanking?.map((oldId: any) => goalIdMap.get(oldId) || oldId) || [],
    },
    goalIdMap,
    milestoneIdMap,
  };
}

/**
 * Normalize TaskBreakdown by assigning deterministic IDs to all tasks
 * and resolving milestoneId from milestoneIndex using the goal plan.
 */
export function normalizeTaskBreakdownIds(
  breakdown: TaskBreakdown,
  goalPlan: GoalPlan,
  goalIdMap: Map<string, string>
): TaskBreakdown {
  const taskIdMap = new Map<string, string>(); // oldTaskId -> newTaskId

  // First pass: assign new IDs
  const tasksWithNewIds = breakdown.tasks.map((task, idx) => {
    const newTaskId = createId();
    taskIdMap.set(task.id, newTaskId);
    taskIdMap.set(`task_${idx + 1}`, newTaskId);
    return { ...task, id: newTaskId, originalId: task.id };
  });

  // Second pass: resolve references using milestoneIndex
  const normalizedTasks: PlannedTask[] = tasksWithNewIds.map((task: any) => {
    // Resolve goal ID
    let resolvedGoalId = goalIdMap.get(task.goalId);
    if (!resolvedGoalId && goalIdMap.size === 1) {
      // Single goal fallback
      resolvedGoalId = Array.from(goalIdMap.values())[0];
    }
    if (!resolvedGoalId) {
      // Use first goal as fallback
      resolvedGoalId = goalPlan.goals[0]?.id || task.goalId;
    }

    // Find the goal in the normalized plan
    const goal = goalPlan.goals.find((g: any) => g.id === resolvedGoalId);

    // Resolve milestoneId from milestoneIndex
    const milestoneIndex = (task as unknown as { milestoneIndex?: number }).milestoneIndex || 1;
    const milestone = goal?.milestones?.[milestoneIndex - 1]; // milestoneIndex is 1-based
    const resolvedMilestoneId = milestone?.id || goal?.milestones?.[0]?.id || 'milestone_default';

    // Resolve dependencies
    const resolvedDependencies = (task.dependencies || []).map((dep: any) => taskIdMap.get(dep) || dep);

    // Remove temporary field
    const { originalId: _originalId, ...cleanTask } = task as typeof task & { originalId?: string };

    return {
      ...cleanTask,
      goalId: resolvedGoalId,
      milestoneId: resolvedMilestoneId,
      milestoneIndex,
      dependencies: resolvedDependencies,
    };
  });

  // Remap dependency graph
  const normalizedDependencyGraph: Record<string, string[]> = {};
  for (const [oldId, deps] of Object.entries(breakdown.dependencyGraph || {})) {
    const newId = taskIdMap.get(oldId) || oldId;
    normalizedDependencyGraph[newId] = deps.map((d: any) => taskIdMap.get(d) || d);
  }

  // Remap critical path
  const normalizedCriticalPath = (breakdown.criticalPath || []).map((id: any) => taskIdMap.get(id) || id
  );

  return {
    tasks: normalizedTasks,
    dependencyGraph: normalizedDependencyGraph,
    criticalPath: normalizedCriticalPath,
    totalEffortMinutes: breakdown.totalEffortMinutes,
  };
}
