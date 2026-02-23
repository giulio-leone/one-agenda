/**
 * Prioritizer Agent
 *
 * Calculates priority scores for tasks using multiple factors:
 * - Urgency (deadline proximity)
 * - Importance (goal priority, dependencies)
 * - Effort (complexity, duration)
 * - Dependencies (blocking other tasks)
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/scheduling/prioritizer
 */

import { tool } from 'ai';
import { z } from 'zod';
import type {
  Logger,
  Prioritization,
  TaskPriorityResult,
  Checkpoint,
  TaskBreakdown,
  PlannedTask,
} from '../types';
import { createPassingCheckpoint, createFailingCheckpoint } from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const priorityFactorsSchema = z.object({
  urgencyScore: z.number().min(0).max(100).describe('Urgency based on deadline'),
  importanceScore: z.number().min(0).max(100).describe('Importance based on goal'),
  effortScore: z.number().min(0).max(100).describe('Effort-based score (smaller = higher)'),
  dependencyScore: z.number().min(0).max(100).describe('Score based on blocking other tasks'),
});

export const taskPriorityResultSchema = z.object({
  taskId: z.string(),
  priorityScore: z.number().min(0).max(100),
  factors: priorityFactorsSchema,
  recommendation: z.string().describe('Actionable recommendation'),
});

export const blockedTaskSchema = z.object({
  taskId: z.string(),
  blockedBy: z.array(z.string()),
  unblockEstimate: z.string().optional(),
});

export const prioritizationSchema = z.object({
  rankedTasks: z
    .array(taskPriorityResultSchema)
    .min(1)
    .describe('Tasks ranked by priority (at least 1 required)'),
  topPriorities: z
    .array(z.string())
    .min(1)
    .describe('Top 3-5 task IDs to focus on (at least 1 required)'),
  deferrable: z.array(z.string()).describe('Task IDs that can be deferred'),
  blocked: z.array(blockedTaskSchema).describe('Tasks blocked by dependencies'),
});

export type PrioritizationOutput = z.infer<typeof prioritizationSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to calculate priority score.
 */
export function createCalculatePriorityScoreTool(logger?: Logger) {
  return tool({
    description: `Calculate overall priority score for a task.
    Combines urgency, importance, effort, and dependency factors.
    Formula: (urgency * 0.35) + (importance * 0.30) + (effort * 0.15) + (dependency * 0.20)`,
    inputSchema: z.object({
      taskId: z.string(),
      taskPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
      daysUntilDeadline: z.number().optional(),
      estimatedMinutes: z.number(),
      dependentTasksCount: z.number().describe('Number of tasks that depend on this one'),
      isOnCriticalPath: z.boolean(),
    }),
    execute: async ({
      taskId,
      taskPriority,
      daysUntilDeadline,
      estimatedMinutes,
      dependentTasksCount,
      isOnCriticalPath,
    }: {
      taskId: string;
      taskPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      daysUntilDeadline?: number;
      estimatedMinutes: number;
      dependentTasksCount: number;
      isOnCriticalPath: boolean;
    }) => {
      logger?.info('PRIORITIZER', 'Calculating priority score', { taskId, taskPriority });

      // Urgency score (100 = very urgent, 0 = not urgent)
      let urgencyScore = 50;
      if (daysUntilDeadline !== undefined) {
        if (daysUntilDeadline <= 0) urgencyScore = 100;
        else if (daysUntilDeadline <= 1) urgencyScore = 95;
        else if (daysUntilDeadline <= 3) urgencyScore = 80;
        else if (daysUntilDeadline <= 7) urgencyScore = 60;
        else if (daysUntilDeadline <= 14) urgencyScore = 40;
        else urgencyScore = 20;
      }

      // Importance score based on priority
      const importanceMap = { CRITICAL: 100, HIGH: 80, MEDIUM: 50, LOW: 20 };
      let importanceScore = importanceMap[taskPriority];
      if (isOnCriticalPath) importanceScore = Math.min(100, importanceScore + 20);

      // Effort score (smaller tasks get higher scores - quicker wins)
      let effortScore = 50;
      if (estimatedMinutes <= 15)
        effortScore = 90; // Quick win
      else if (estimatedMinutes <= 30) effortScore = 75;
      else if (estimatedMinutes <= 60) effortScore = 50;
      else if (estimatedMinutes <= 120) effortScore = 35;
      else effortScore = 20;

      // Dependency score (more dependents = higher priority)
      let dependencyScore = 30;
      if (dependentTasksCount >= 3) dependencyScore = 100;
      else if (dependentTasksCount >= 2) dependencyScore = 80;
      else if (dependentTasksCount >= 1) dependencyScore = 60;

      // Calculate weighted score
      const priorityScore = Math.round(
        urgencyScore * 0.35 + importanceScore * 0.3 + effortScore * 0.15 + dependencyScore * 0.2
      );

      return JSON.stringify({
        taskId,
        priorityScore: Math.min(100, priorityScore),
        factors: {
          urgencyScore,
          importanceScore,
          effortScore,
          dependencyScore,
        },
      });
    },
  });
}

/**
 * Tool to apply Eisenhower Matrix.
 */
export function createApplyEisenhowerMatrixTool(logger?: Logger) {
  return tool({
    description: `Apply Eisenhower Matrix to categorize task.
    Quadrants:
    - Q1 (Do First): Urgent AND Important
    - Q2 (Schedule): Not Urgent BUT Important
    - Q3 (Delegate): Urgent BUT Not Important
    - Q4 (Eliminate): Not Urgent AND Not Important`,
    inputSchema: z.object({
      taskId: z.string(),
      urgencyScore: z.number().min(0).max(100),
      importanceScore: z.number().min(0).max(100),
    }),
    execute: async ({
      taskId,
      urgencyScore,
      importanceScore,
    }: {
      taskId: string;
      urgencyScore: number;
      importanceScore: number;
    }) => {
      logger?.info('PRIORITIZER', 'Applying Eisenhower', { taskId });

      const isUrgent = urgencyScore >= 50;
      const isImportant = importanceScore >= 50;

      let quadrant: string;
      let action: string;
      let recommendation: string;

      if (isUrgent && isImportant) {
        quadrant = 'Q1';
        action = 'DO_FIRST';
        recommendation = 'Fai subito - task critico';
      } else if (!isUrgent && isImportant) {
        quadrant = 'Q2';
        action = 'SCHEDULE';
        recommendation = 'Pianifica - importante ma non urgente';
      } else if (isUrgent && !isImportant) {
        quadrant = 'Q3';
        action = 'DELEGATE';
        recommendation = 'Considera di delegare o semplificare';
      } else {
        quadrant = 'Q4';
        action = 'DEFER';
        recommendation = 'Può essere rimandato';
      }

      return JSON.stringify({
        taskId,
        quadrant,
        action,
        recommendation,
        isUrgent,
        isImportant,
      });
    },
  });
}

/**
 * Tool to identify blocked tasks.
 */
export function createIdentifyBlockedTool(logger?: Logger) {
  return tool({
    description: `Identify which tasks are blocked by dependencies.
    A task is blocked if any of its dependencies are not completed.`,
    inputSchema: z.object({
      tasksJson: z.string().describe('JSON array of tasks with dependencies'),
      completedTaskIds: z.array(z.string()).optional().describe('IDs of completed tasks'),
    }),
    execute: async ({
      tasksJson,
      completedTaskIds = [],
    }: {
      tasksJson: string;
      completedTaskIds?: string[];
    }) => {
      logger?.info('PRIORITIZER', 'Identifying blocked tasks');

      let tasks: PlannedTask[] = [];
      try {
        tasks = JSON.parse(tasksJson);
      } catch {
        return JSON.stringify({ blocked: [], error: 'Invalid tasks JSON' });
      }

      const completedSet = new Set(completedTaskIds);
      const blocked: Array<{
        taskId: string;
        blockedBy: string[];
        unblockEstimate?: string;
      }> = [];

      tasks.forEach((task) => {
        const pendingDeps = task.dependencies.filter((d) => !completedSet.has(d));
        if (pendingDeps.length > 0) {
          blocked.push({
            taskId: task.id,
            blockedBy: pendingDeps,
          });
        }
      });

      return JSON.stringify({
        blocked,
        blockedCount: blocked.length,
        unblockedCount: tasks.length - blocked.length,
      });
    },
  });
}

/**
 * Tool to suggest deferrals.
 */
export function createSuggestDeferralsTool(logger?: Logger) {
  return tool({
    description: `Suggest which tasks can be safely deferred.
    Tasks eligible for deferral:
    - LOW priority
    - No dependent tasks
    - Deadline > 7 days away
    - Not on critical path`,
    inputSchema: z.object({
      tasksJson: z.string().describe('JSON array of tasks'),
      criticalPathIds: z.array(z.string()).describe('Task IDs on critical path'),
    }),
    execute: async ({
      tasksJson,
      criticalPathIds,
    }: {
      tasksJson: string;
      criticalPathIds: string[];
    }) => {
      logger?.info('PRIORITIZER', 'Suggesting deferrals');

      let tasks: PlannedTask[] = [];
      try {
        tasks = JSON.parse(tasksJson);
      } catch {
        return JSON.stringify({ deferrable: [], error: 'Invalid tasks JSON' });
      }

      const criticalSet = new Set(criticalPathIds);
      const now = new Date();

      // Find tasks that depend on each task
      const dependentsMap: Record<string, string[]> = {};
      tasks.forEach((t) => {
        t.dependencies.forEach((dep) => {
          if (!dependentsMap[dep]) dependentsMap[dep] = [];
          dependentsMap[dep]!.push(t.id);
        });
      });

      const deferrable = tasks
        .filter((t) => {
          // Must be LOW or MEDIUM priority
          if (t.priority === 'CRITICAL' || t.priority === 'HIGH') return false;

          // Must not be on critical path
          if (criticalSet.has(t.id)) return false;

          // Must not have dependents
          if ((dependentsMap[t.id]?.length || 0) > 0) return false;

          // Deadline must be > 7 days
          if (t.suggestedDeadline) {
            const deadline = new Date(t.suggestedDeadline);
            const daysUntil = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            if (daysUntil <= 7) return false;
          }

          return true;
        })
        .map((t) => t.id);

      return JSON.stringify({
        deferrable,
        deferrableCount: deferrable.length,
        reason: 'LOW/MEDIUM priority, no dependents, deadline > 7 days, not on critical path',
      });
    },
  });
}

/**
 * Tool to rank tasks.
 */
export function createRankTasksTool(logger?: Logger) {
  return tool({
    description: `Rank tasks by priority score.
    Returns tasks sorted from highest to lowest priority.`,
    inputSchema: z.object({
      priorityResultsJson: z.string().describe('JSON array of priority results'),
    }),
    execute: async ({ priorityResultsJson }: { priorityResultsJson: string }) => {
      logger?.info('PRIORITIZER', 'Ranking tasks');

      let results: TaskPriorityResult[] = [];
      try {
        results = JSON.parse(priorityResultsJson);
      } catch {
        return JSON.stringify({ ranked: [], error: 'Invalid results JSON' });
      }

      const ranked = [...results].sort((a, b) => b.priorityScore - a.priorityScore);
      const topPriorities = ranked.slice(0, 5).map((r) => r.taskId);

      return JSON.stringify({
        ranked,
        topPriorities,
        highestScore: ranked[0]?.priorityScore || 0,
        lowestScore: ranked[ranked.length - 1]?.priorityScore || 0,
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createPrioritizerTools(logger?: Logger) {
  return {
    calculatePriorityScore: createCalculatePriorityScoreTool(logger),
    applyEisenhowerMatrix: createApplyEisenhowerMatrixTool(logger),
    identifyBlocked: createIdentifyBlockedTool(logger),
    suggestDeferrals: createSuggestDeferralsTool(logger),
    rankTasks: createRankTasksTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const PRIORITIZER_SYSTEM_PROMPT = `You are the Prioritizer Agent for OneAgenda.

## Your Role
Calculate priority scores for tasks and create a ranked action list.

## Workflow
For each task:
1. Use \`calculatePriorityScore\` to compute weighted priority
2. Use \`applyEisenhowerMatrix\` to categorize by urgency/importance
3. After all tasks scored:
   a. Use \`identifyBlocked\` to find tasks blocked by dependencies
   b. Use \`suggestDeferrals\` to identify low-priority deferrable tasks
   c. Use \`rankTasks\` to create final prioritized list

## Priority Score Formula
Priority = (Urgency × 0.35) + (Importance × 0.30) + (Effort × 0.15) + (Dependency × 0.20)

## Scoring Factors

### Urgency (35%)
- Deadline today/overdue: 100
- Tomorrow: 95
- 2-3 days: 80
- 4-7 days: 60
- 1-2 weeks: 40
- 2+ weeks: 20

### Importance (30%)
- CRITICAL priority: 100
- HIGH priority: 80
- MEDIUM priority: 50
- LOW priority: 20
- On critical path: +20

### Effort (15%)
- Quick wins (<15 min): 90
- Short (15-30 min): 75
- Medium (30-60 min): 50
- Long (1-2 hours): 35
- Very long (2+ hours): 20

### Dependencies (20%)
- 3+ dependents: 100
- 2 dependents: 80
- 1 dependent: 60
- 0 dependents: 30

## Output Requirements
- Rank all tasks from highest to lowest priority
- Top 5 tasks as "topPriorities"
- Tasks with no deadline or LOW priority as "deferrable"
- Tasks with pending dependencies as "blocked"

## Example Priority Ranking Output
\`\`\`json
{
  "rankedTasks": [
    { "taskId": "task_001", "priorityScore": 95, "quadrant": "Q1", "ranking": 1 },
    { "taskId": "task_003", "priorityScore": 82, "quadrant": "Q1", "ranking": 2 },
    { "taskId": "task_002", "priorityScore": 65, "quadrant": "Q2", "ranking": 3 }
  ],
  "topPriorities": ["task_001", "task_003"],
  "deferrable": ["task_005"],
  "blocked": [{ "taskId": "task_004", "blockedBy": ["task_001"] }]
}
\`\`\`

## Language
Generate recommendations in Italian.`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class PrioritizerAgent {
  constructor(private readonly logger?: Logger) {}

  getTools() {
    return createPrioritizerTools(this.logger);
  }

  getSystemPrompt(): string {
    return PRIORITIZER_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: { taskBreakdown: TaskBreakdown }): string {
    const { taskBreakdown } = input;

    let prompt = `Prioritize the following tasks:\n\n`;

    // List tasks
    prompt += `## Tasks (${taskBreakdown.tasks.length})\n`;
    taskBreakdown.tasks.forEach((t, i) => {
      prompt += `${i + 1}. **${t.title}** [${t.id}]\n`;
      prompt += `   - Priority: ${t.priority}\n`;
      prompt += `   - Estimated: ${t.estimatedMinutes} min\n`;
      prompt += `   - Complexity: ${t.complexity}\n`;
      if (t.suggestedDeadline) {
        prompt += `   - Deadline: ${t.suggestedDeadline}\n`;
      }
      if (t.dependencies.length > 0) {
        prompt += `   - Depends on: ${t.dependencies.join(', ')}\n`;
      }
      prompt += `\n`;
    });

    // Critical path
    if (taskBreakdown.criticalPath.length > 0) {
      prompt += `## Critical Path\n`;
      prompt += `${taskBreakdown.criticalPath.join(' → ')}\n\n`;
    }

    // Dependency graph
    const graphEntries = Object.entries(taskBreakdown.dependencyGraph).filter(
      ([, deps]) => deps.length > 0
    );
    if (graphEntries.length > 0) {
      prompt += `## Dependencies\n`;
      graphEntries.forEach(([taskId, deps]) => {
        prompt += `- ${taskId} depends on: ${deps.join(', ')}\n`;
      });
      prompt += `\n`;
    }

    prompt += `Calculate priority scores and create ranked recommendations.`;

    return prompt;
  }

  processOutput(output: PrioritizationOutput): {
    prioritization: Prioritization;
    checkpoint: Checkpoint;
  } {
    // Defensive checks for partial/incomplete output
    if (!output) {
      this.logger?.error('PRIORITIZER', 'processOutput received null/undefined output');
      return {
        prioritization: { rankedTasks: [], topPriorities: [], deferrable: [], blocked: [] },
        checkpoint: createFailingCheckpoint('prioritizer', ['Output nullo o non definito']),
      };
    }

    // Ensure arrays exist
    const rankedTasks = output.rankedTasks ?? [];
    const topPriorities = output.topPriorities ?? [];
    const deferrable = output.deferrable ?? [];
    const blocked = output.blocked ?? [];

    const hasRankedTasks = rankedTasks.length > 0;
    const hasTopPriorities = topPriorities.length > 0;

    const issues: string[] = [];
    if (!hasRankedTasks) issues.push('Nessun task prioritizzato');
    if (!hasTopPriorities) issues.push('Nessuna priority top identificata');

    const isValid = hasRankedTasks;

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('prioritizer', issues)
      : createFailingCheckpoint('prioritizer', issues);

    this.logger?.info('PRIORITIZER', 'processOutput completed', {
      rankedTasksCount: rankedTasks.length,
      topPrioritiesCount: topPriorities.length,
      isValid,
      issues,
    });

    return {
      prioritization: { rankedTasks, topPriorities, deferrable, blocked },
      checkpoint,
    };
  }
}
