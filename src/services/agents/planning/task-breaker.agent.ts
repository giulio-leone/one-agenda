/**
 * Task Breaker Agent
 *
 * Decomposes milestones and goals into actionable tasks.
 * Calculates effort estimates, identifies dependencies, and determines critical path.
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/planning/task-breaker
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { Logger, TaskBreakdown, PlannedTask, Checkpoint, GoalPlan } from '../types';
import { createPassingCheckpoint, createFailingCheckpoint, createId } from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const plannedTaskSchema = z.object({
  id: z.string().describe('Unique task ID'),
  title: z.string().describe('Task title'),
  description: z.string().optional().describe('Task description'),
  milestoneIndex: z
    .number()
    .min(1)
    .describe('Index of milestone within goal (1=first, 2=second, etc.)'),
  milestoneId: z
    .string()
    .optional()
    .describe('Resolved milestone ID (assigned during normalization)'),
  goalId: z.string().describe('Parent goal ID'),
  estimatedMinutes: z.number().min(5).max(480).describe('Estimated duration in minutes (5-480)'),
  complexity: z
    .enum(['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX'])
    .describe('Task complexity level'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).describe('Task priority'),
  dependencies: z.array(z.string()).default([]).describe('IDs of tasks this depends on'),
  tags: z.array(z.string()).default([]).describe('Tags for categorization'),
  suggestedDeadline: z.string().optional().describe('Suggested deadline in ISO 8601'),
});

export const taskBreakdownSchema = z.object({
  tasks: z.array(plannedTaskSchema).min(1).describe('All generated tasks (at least 1 required)'),
  dependencyGraph: z
    .record(z.string(), z.array(z.string()))
    .describe('Map of task ID to dependent task IDs'),
  criticalPath: z.array(z.string()).describe('Task IDs in critical path order'),
  totalEffortMinutes: z.number().describe('Total effort in minutes'),
});

export type TaskBreakdownOutput = z.infer<typeof taskBreakdownSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to break down a milestone into tasks.
 */
export function createBreakdownMilestoneTool(logger?: Logger) {
  return tool({
    description: `Break down a milestone into actionable tasks.
    Each task should be:
    - Specific and clearly defined
    - Completable in 5-480 minutes (ideally 30-120 min)
    - Independent or with clear dependencies`,
    inputSchema: z.object({
      milestoneId: z.string().describe('Milestone ID'),
      milestoneName: z.string().describe('Milestone name'),
      milestoneDescription: z.string().optional(),
      goalId: z.string().describe('Parent goal ID'),
      suggestedTaskCount: z.number().min(1).max(10).optional(),
    }),
    execute: async ({
      milestoneId,
      milestoneName,
      goalId,
      suggestedTaskCount = 3,
    }: {
      milestoneId: string;
      milestoneName: string;
      goalId: string;
      suggestedTaskCount?: number;
    }) => {
      logger?.info('TASK_BREAKER', 'Breaking down milestone', {
        milestoneId,
        milestoneName,
        suggestedTaskCount,
      });

      return JSON.stringify({
        milestoneId,
        goalId,
        status: 'ready_to_breakdown',
        suggestedTaskCount,
        recommendation: `Create ${suggestedTaskCount} tasks for "${milestoneName}"`,
      });
    },
  });
}

/**
 * Tool to estimate task effort.
 */
export function createEstimateEffortTool(logger?: Logger) {
  return tool({
    description: `Estimate effort for a task in minutes.
    Guidelines:
    - SIMPLE tasks: 5-30 min
    - MODERATE tasks: 30-60 min
    - COMPLEX tasks: 60-120 min
    - VERY_COMPLEX tasks: 120-480 min`,
    inputSchema: z.object({
      taskTitle: z.string(),
      taskDescription: z.string().optional(),
      complexity: z.enum(['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX']),
    }),
    execute: async ({
      taskTitle,
      complexity,
    }: {
      taskTitle: string;
      complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'VERY_COMPLEX';
    }) => {
      logger?.info('TASK_BREAKER', 'Estimating effort', { taskTitle, complexity });

      const estimateRanges = {
        SIMPLE: { min: 5, max: 30, typical: 15 },
        MODERATE: { min: 30, max: 60, typical: 45 },
        COMPLEX: { min: 60, max: 120, typical: 90 },
        VERY_COMPLEX: { min: 120, max: 480, typical: 180 },
      };

      const range = estimateRanges[complexity];

      return JSON.stringify({
        taskTitle,
        complexity,
        estimatedMinutes: range.typical,
        range,
        recommendation: `For ${complexity} tasks, estimate ${range.typical} minutes (range: ${range.min}-${range.max})`,
      });
    },
  });
}

/**
 * Tool to identify task dependencies.
 */
export function createIdentifyDependenciesTool(logger?: Logger) {
  return tool({
    description: `Identify dependencies between tasks.
    A task depends on another if:
    - It needs the output of the other task
    - It must be done after the other task
    - It uses resources created by the other task`,
    inputSchema: z.object({
      tasksJson: z.string().describe('JSON array of tasks to analyze'),
    }),
    execute: async ({ tasksJson }: { tasksJson: string }) => {
      logger?.info('TASK_BREAKER', 'Identifying dependencies');

      let tasks: PlannedTask[] = [];
      try {
        tasks = JSON.parse(tasksJson);
      } catch {
        return JSON.stringify({ error: 'Invalid tasks JSON', dependencies: {} });
      }

      // Build dependency graph
      const dependencyGraph: Record<string, string[]> = {};
      tasks.forEach((t: any) => {
        dependencyGraph[t.id] = t.dependencies || [];
      });

      return JSON.stringify({
        dependencyGraph,
        tasksAnalyzed: tasks.length,
        hasDependencies: Object.values(dependencyGraph).some((deps) => deps.length > 0),
      });
    },
  });
}

/**
 * Tool to calculate critical path.
 */
export function createCalculateCriticalPathTool(logger?: Logger) {
  return tool({
    description: `Calculate the critical path through tasks.
    The critical path is the longest sequence of dependent tasks.
    Tasks on the critical path cannot be delayed without delaying the goal.`,
    inputSchema: z.object({
      tasksJson: z.string().describe('JSON array of tasks with dependencies'),
      dependencyGraphJson: z.string().describe('JSON dependency graph'),
    }),
    execute: async ({
      tasksJson,
      dependencyGraphJson,
    }: {
      tasksJson: string;
      dependencyGraphJson: string;
    }) => {
      logger?.info('TASK_BREAKER', 'Calculating critical path');

      let tasks: PlannedTask[] = [];
      let dependencyGraph: Record<string, string[]> = {};

      try {
        tasks = JSON.parse(tasksJson);
        dependencyGraph = JSON.parse(dependencyGraphJson);
      } catch {
        return JSON.stringify({ error: 'Invalid JSON', criticalPath: [] });
      }

      // Simple critical path: longest chain of dependencies
      const taskMap = new Map(tasks.map((t: any) => [t.id, t]));

      const getPathLength = (taskId: string, visited: Set<string> = new Set()): number => {
        if (visited.has(taskId)) return 0; // Avoid cycles
        visited.add(taskId);

        const task = taskMap.get(taskId);
        if (!task) return 0;

        const deps = dependencyGraph[taskId] || [];
        if (deps.length === 0) return task.estimatedMinutes;

        const maxDepPath = Math.max(...deps.map((d: any) => getPathLength(d, new Set(visited))));
        return task.estimatedMinutes + maxDepPath;
      };

      // Find task with longest path
      let maxLength = 0;
      let criticalStart = '';
      tasks.forEach((t: any) => {
        const length = getPathLength(t.id);
        if (length > maxLength) {
          maxLength = length;
          criticalStart = t.id;
        }
      });

      // Trace critical path
      const criticalPath: string[] = [];
      let current = criticalStart;
      while (current) {
        criticalPath.push(current);
        const deps = dependencyGraph[current] || [];
        if (deps.length === 0) break;

        // Follow longest dependency
        let maxDepLength = 0;
        let nextTask = '';
        deps.forEach((d: any) => {
          const length = getPathLength(d, new Set());
          if (length > maxDepLength) {
            maxDepLength = length;
            nextTask = d;
          }
        });
        current = nextTask;
      }

      return JSON.stringify({
        criticalPath: criticalPath.reverse(), // Start from first task
        totalCriticalMinutes: maxLength,
        criticalTaskCount: criticalPath.length,
      });
    },
  });
}

/**
 * Tool to assign task priority.
 */
export function createAssignPriorityTool(logger?: Logger) {
  return tool({
    description: `Assign priority to a task based on:
    - Goal priority
    - Deadline proximity
    - Number of dependent tasks (more dependents = higher priority)
    - Position in critical path`,
    inputSchema: z.object({
      goalPriority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
      daysUntilDeadline: z.number().optional(),
      dependentTasksCount: z.number(),
      isOnCriticalPath: z.boolean(),
    }),
    execute: async ({
      goalPriority,
      daysUntilDeadline,
      dependentTasksCount,
      isOnCriticalPath,
    }: {
      goalPriority: string;
      daysUntilDeadline?: number;
      dependentTasksCount: number;
      isOnCriticalPath: boolean;
    }) => {
      logger?.info('TASK_BREAKER', 'Assigning priority', {
        goalPriority,
        daysUntilDeadline,
        isOnCriticalPath,
      });

      let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';

      // Critical path tasks are at least HIGH
      if (isOnCriticalPath) {
        priority = 'HIGH';
      }

      // Urgent deadline
      if (daysUntilDeadline !== undefined && daysUntilDeadline < 2) {
        priority = 'CRITICAL';
      } else if (daysUntilDeadline !== undefined && daysUntilDeadline < 5) {
        priority = 'HIGH';
      }

      // Many dependents
      if (dependentTasksCount >= 3) {
        if (priority === 'MEDIUM') {
          priority = 'HIGH';
        }
      }

      // Inherit from goal
      if (goalPriority === 'CRITICAL') {
        priority = 'CRITICAL';
      }

      return JSON.stringify({
        priority,
        factors: {
          goalPriority,
          daysUntilDeadline,
          dependentTasksCount,
          isOnCriticalPath,
        },
      });
    },
  });
}

/**
 * Tool to create a task.
 */
export function createTaskTool(logger?: Logger) {
  return tool({
    description: `Create a new task with all required attributes.`,
    inputSchema: z.object({
      title: z.string(),
      description: z.string().optional(),
      milestoneId: z.string(),
      goalId: z.string(),
      estimatedMinutes: z.number().min(5).max(480),
      complexity: z.enum(['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX']),
      priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
      dependencies: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      suggestedDeadline: z.string().optional(),
    }),
    execute: async (input: {
      title: string;
      description?: string;
      milestoneId: string;
      goalId: string;
      estimatedMinutes: number;
      complexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'VERY_COMPLEX';
      priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      dependencies?: string[];
      tags?: string[];
      suggestedDeadline?: string;
    }) => {
      const id = createId();
      logger?.info('TASK_BREAKER', 'Creating task', { id, title: input.title });

      return JSON.stringify({
        id,
        ...input,
        dependencies: input.dependencies || [],
        tags: input.tags || [],
        status: 'created',
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createTaskBreakerTools(logger?: Logger) {
  return {
    breakdownMilestone: createBreakdownMilestoneTool(logger),
    estimateEffort: createEstimateEffortTool(logger),
    identifyDependencies: createIdentifyDependenciesTool(logger),
    calculateCriticalPath: createCalculateCriticalPathTool(logger),
    assignPriority: createAssignPriorityTool(logger),
    createTask: createTaskTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const TASK_BREAKER_SYSTEM_PROMPT = `You are the Task Breaker Agent for OneAgenda.

## Your Role
Decompose goals and milestones into actionable, schedulable tasks.

## Workflow
For each goal and its milestones:
1. Use \`breakdownMilestone\` to identify required tasks
2. Use \`createTask\` for each task with:
   - Clear, action-oriented title
   - Specific description
   - Effort estimate
   - Complexity level
   - Dependencies on other tasks
3. Use \`estimateEffort\` to validate time estimates
4. Use \`identifyDependencies\` to map task relationships
5. Use \`calculateCriticalPath\` to find the sequence that determines completion time
6. Use \`assignPriority\` to set priorities based on urgency and dependencies

## Task Size Guidelines
- Ideal task size: 30-120 minutes
- If a task seems > 2 hours, break it into subtasks
- If a task seems < 15 minutes, consider combining with related tasks

## Complexity Levels
- **SIMPLE**: Routine, well-defined, no unknowns (5-30 min)
- **MODERATE**: Some decisions required, familiar domain (30-60 min)
- **COMPLEX**: Multiple steps, some research needed (60-120 min)
- **VERY_COMPLEX**: Significant unknowns, creative work (120-480 min)

## Priority Levels
- **CRITICAL**: Blocking other work, urgent deadline
- **HIGH**: Important, should be done soon
- **MEDIUM**: Normal priority
- **LOW**: Can be deferred if needed

## Tagging
Use tags to categorize tasks:
- \`#deep-work\`: Requires focused concentration
- \`#admin\`: Administrative tasks
- \`#creative\`: Creative, brainstorming work
- \`#communication\`: Emails, calls, meetings
- \`#research\`: Information gathering

## REQUISITI SCHEMA CRITICI
- L'array \`tasks\` DEVE contenere almeno un task.
- NON restituire una lista vuota di task.
- Se nessun task sembra necessario, rivaluta i dettagli della milestone.

## Requisiti Output
- All tasks must have unique IDs (prefix: task_)
- Total effort should be realistic for the timeframe
- Critical path should identify the bottleneck sequence
- **CRITICAL**: For each task:
  - Set \`goalId\` to the EXACT goal ID from the input
  - Set \`milestoneIndex\` to the milestone NUMBER (1, 2, 3...) within that goal
  - DO NOT generate any milestoneId - it will be resolved automatically from the index

## Example Task Output
\`\`\`json
{
  "id": "task_001",
  "title": "Eseguire test 1RM per squat, panca e stacco",
  "description": "Test completo dei massimali per stabilire i carichi di partenza del programma",
  "milestoneIndex": 1,
  "goalId": "goal_abc123",
  "estimatedMinutes": 90,
  "complexity": "MODERATE",
  "priority": "CRITICAL",
  "dependencies": [],
  "tags": ["#deep-work", "#assessment"],
  "suggestedDeadline": "2025-01-03"
}
\`\`\`

## Language
Generate all content in Italian.`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class TaskBreakerAgent {
  constructor(private readonly logger?: Logger) {}

  getTools() {
    return createTaskBreakerTools(this.logger);
  }

  getSystemPrompt(): string {
    return TASK_BREAKER_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: { goalPlan: GoalPlan }): string {
    const { goalPlan } = input;

    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    let prompt = `## Current Date\nToday: ${todayISO}\nAll suggested deadlines must be after this date, in ISO 8601 format (YYYY-MM-DD).\n\n`;
    prompt += `Break down the following goals into actionable tasks.\n`;
    prompt += `IMPORTANT: Use the EXACT goalId provided and set milestoneIndex to the milestone number (1, 2, 3...) within that goal.\n\n`;

    goalPlan.goals.forEach((goal: any) => {
      prompt += `## Goal: ${goal.title}\n`;
      prompt += `- **goalId**: \`${goal.id}\`\n`;
      prompt += `- Time Horizon: ${goal.timeHorizon}\n`;
      prompt += `- Target Date: ${goal.targetDate}\n`;
      prompt += `- Number of Milestones: ${goal.milestones.length}\n\n`;

      goal.milestones.forEach((m: any, idx: any) => {
        prompt += `### Milestone ${idx + 1}: ${m.name}\n`;
        prompt += `- **milestoneIndex**: ${idx + 1}\n`;
        prompt += `- **goalId**: \`${goal.id}\`\n`;
        if (m.description) prompt += `- Description: ${m.description}\n`;
        if (m.dueDate) prompt += `- Due: ${m.dueDate}\n`;
        prompt += `\n`;
      });
    });

    prompt += `\n## Instructions\n`;
    prompt += `1. Create 2-5 tasks per milestone\n`;
    prompt += `2. Each task should be 30-120 minutes\n`;
    prompt += `3. Identify dependencies between tasks\n`;
    prompt += `4. Calculate the critical path\n`;
    prompt += `5. Assign priorities based on urgency and dependencies\n`;
    prompt += `6. **CRITICAL**: For each task:\n`;
    prompt += `   - Set \`goalId\` to the EXACT goal ID provided above\n`;
    prompt += `   - Set \`milestoneIndex\` to the milestone NUMBER (1, 2, 3...) within that goal\n`;
    prompt += `   - DO NOT use milestoneId, only milestoneIndex\n`;

    return prompt;
  }

  processOutput(output: TaskBreakdownOutput): {
    breakdown: TaskBreakdown;
    checkpoint: Checkpoint;
  } {
    // Defensive checks for partial/incomplete output
    if (!output) {
      this.logger?.error('TASK_BREAKER', 'processOutput received null/undefined output');
      return {
        breakdown: { tasks: [], dependencyGraph: {}, criticalPath: [], totalEffortMinutes: 0 },
        checkpoint: createFailingCheckpoint('task_breaker', ['Output nullo o non definito']),
      };
    }

    // Ensure arrays exist
    const tasks = output.tasks ?? [];
    const dependencyGraph = output.dependencyGraph ?? {};
    const criticalPath = output.criticalPath ?? [];
    const totalEffortMinutes = output.totalEffortMinutes ?? 0;

    const hasTasks = tasks.length > 0;
    const hasValidEfforts = tasks.every(
      (t) => (t?.estimatedMinutes ?? 0) >= 5 && (t?.estimatedMinutes ?? 0) <= 480
    );
    const hasCriticalPath = criticalPath.length > 0;

    const issues: string[] = [];
    if (!hasTasks) issues.push('Nessun task generato');
    if (!hasValidEfforts) issues.push('Alcuni task hanno stime di effort non valide');
    if (!hasCriticalPath) issues.push('Critical path non calcolato');

    const isValid = hasTasks && hasValidEfforts;

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('task_breaker', issues)
      : createFailingCheckpoint('task_breaker', issues);

    this.logger?.info('TASK_BREAKER', 'processOutput completed', {
      tasksCount: tasks.length,
      isValid,
      issues,
    });

    return {
      breakdown: {
        tasks: tasks.map((task: any) => ({
          ...task,
          milestoneId: task?.milestoneId || '', // Placeholder, resolved by normalizeTaskBreakdownIds
        })),
        dependencyGraph,
        criticalPath,
        totalEffortMinutes,
      },
      checkpoint,
    };
  }
}
