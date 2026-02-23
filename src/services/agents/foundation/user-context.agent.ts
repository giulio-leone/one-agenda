/**
 * User Context Agent
 *
 * Gathers user context from database:
 * - User preferences (timezone, working hours, focus preferences)
 * - Existing goals and their status
 * - Pending tasks
 * - Calendar events
 * - Workload analysis
 * - Productivity patterns
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/foundation/user-context
 */

import { tool } from 'ai';
import { z } from 'zod';
import type {
  Logger,
  UserContext,
  Checkpoint,
  OneAgendaMeshInput,
  GoalSummary,
  TaskSummary,
} from '../types';
import { createPassingCheckpoint, createFailingCheckpoint } from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const userContextSchema = z.object({
  preferences: z.object({
    timezone: z.string().describe('User timezone (e.g., Europe/Rome)'),
    workingHoursStart: z.string().describe('Working hours start time (HH:mm)'),
    workingHoursEnd: z.string().describe('Working hours end time (HH:mm)'),
    focusPreference: z
      .enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANY'])
      .describe('Preferred time for deep focus work'),
  }),
  existingGoals: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        percentComplete: z.number(),
      })
    )
    .describe('List of existing active goals'),
  existingTasks: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        priority: z.string(),
        dueDate: z.string().optional(),
      })
    )
    .describe('List of existing pending tasks'),
  workloadAnalysis: z.object({
    currentLoad: z.enum(['LOW', 'MEDIUM', 'HIGH', 'OVERLOADED']).describe('Current workload level'),
    capacityRemainingMinutes: z.number().describe('Remaining capacity in minutes for today'),
    upcomingDeadlines: z
      .array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          dueDate: z.string(),
          daysRemaining: z.number(),
        })
      )
      .describe('Tasks with upcoming deadlines'),
  }),
  productivity: z.object({
    averageTaskCompletion: z
      .number()
      .min(0)
      .max(100)
      .describe('Average task completion rate (0-100%)'),
    bestProductivityHours: z
      .array(z.string())
      .describe('Hours when user is most productive (e.g., ["09:00", "10:00"])'),
    commonBlockers: z.array(z.string()).describe('Common reasons tasks get blocked or delayed'),
  }),
});

export type UserContextOutput = z.infer<typeof userContextSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to fetch user preferences.
 */
export function createFetchUserPreferencesTool(input: OneAgendaMeshInput, logger?: Logger) {
  return tool({
    description: `Fetch user preferences including timezone, working hours, and focus preferences.
    Returns the user's configured settings for scheduling.`,
    inputSchema: z.object({
      userId: z.string().describe('User ID to fetch preferences for'),
    }),
    execute: async ({ userId }: { userId: string }) => {
      logger?.info('USER_CONTEXT', 'Fetching user preferences', { userId });

      const prefs = input.userPreferences || {
        timezone: 'Europe/Rome',
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        focusPreference: 'MORNING' as const,
        workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      };

      return JSON.stringify({
        timezone: prefs.timezone,
        workingHoursStart: prefs.workingHoursStart,
        workingHoursEnd: prefs.workingHoursEnd,
        focusPreference: prefs.focusPreference,
        workingDays: prefs.workingDays,
      });
    },
  });
}

/**
 * Tool to fetch existing goals.
 */
export function createFetchExistingGoalsTool(input: OneAgendaMeshInput, logger?: Logger) {
  return tool({
    description: `Fetch active goals for the user.
    Returns goals with their status and progress percentage.`,
    inputSchema: z.object({
      userId: z.string().describe('User ID'),
      statusFilter: z
        .array(z.string())
        .optional()
        .describe('Filter by status (e.g., ["ACTIVE", "ON_TRACK"])'),
    }),
    execute: async ({ userId, statusFilter }: { userId: string; statusFilter?: string[] }) => {
      logger?.info('USER_CONTEXT', 'Fetching existing goals', { userId, statusFilter });

      const goals = input.existingGoals || [];
      const filtered = statusFilter ? goals.filter((g) => statusFilter.includes(g.status)) : goals;

      return JSON.stringify({
        goals: filtered,
        count: filtered.length,
        totalCount: goals.length,
      });
    },
  });
}

/**
 * Tool to fetch existing tasks.
 */
export function createFetchExistingTasksTool(input: OneAgendaMeshInput, logger?: Logger) {
  return tool({
    description: `Fetch pending tasks for the user.
    Returns tasks with their priority and due dates.`,
    inputSchema: z.object({
      userId: z.string().describe('User ID'),
      includeCompleted: z.boolean().optional().describe('Whether to include completed tasks'),
    }),
    execute: async ({
      userId,
      includeCompleted,
    }: {
      userId: string;
      includeCompleted?: boolean;
    }) => {
      logger?.info('USER_CONTEXT', 'Fetching existing tasks', { userId, includeCompleted });

      const tasks = input.existingTasks || [];
      const filtered = includeCompleted ? tasks : tasks.filter((t) => t.status !== 'COMPLETED');

      return JSON.stringify({
        tasks: filtered,
        count: filtered.length,
        pendingCount: tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS').length,
      });
    },
  });
}

/**
 * Tool to fetch calendar events.
 */
export function createFetchCalendarEventsTool(input: OneAgendaMeshInput, logger?: Logger) {
  return tool({
    description: `Fetch calendar events for the specified date range.
    Returns meetings, focus blocks, and other scheduled events.`,
    inputSchema: z.object({
      startDate: z.string().describe('Start date in ISO 8601 format'),
      endDate: z.string().describe('End date in ISO 8601 format'),
    }),
    execute: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      logger?.info('USER_CONTEXT', 'Fetching calendar events', { startDate, endDate });

      const events = input.calendarEvents || [];
      // Filter events within date range
      const filtered = events.filter((e) => {
        const eventStart = new Date(e.startTime);
        return eventStart >= new Date(startDate) && eventStart <= new Date(endDate);
      });

      return JSON.stringify({
        events: filtered,
        count: filtered.length,
        meetingsCount: filtered.filter((e) => e.type === 'MEETING').length,
        focusBlocksCount: filtered.filter((e) => e.type === 'FOCUS').length,
      });
    },
  });
}

/**
 * Tool to analyze current workload.
 */
export function createAnalyzeWorkloadTool(logger?: Logger) {
  return tool({
    description: `Analyze current workload based on tasks and available time.
    Calculates workload level and remaining capacity.`,
    inputSchema: z.object({
      tasksJson: z.string().describe('JSON string of tasks to analyze'),
      availableMinutesPerDay: z.number().optional().describe('Available working minutes per day'),
    }),
    execute: async ({
      tasksJson,
      availableMinutesPerDay = 480,
    }: {
      tasksJson: string;
      availableMinutesPerDay?: number;
    }) => {
      logger?.info('USER_CONTEXT', 'Analyzing workload', { availableMinutesPerDay });

      let tasks: TaskSummary[] = [];
      try {
        tasks = JSON.parse(tasksJson || '[]');
      } catch {
        tasks = [];
      }

      const totalMinutes = tasks.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
      const capacityMinutes = availableMinutesPerDay;

      let currentLoad: 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERLOADED' = 'LOW';
      if (totalMinutes > capacityMinutes * 1.5) {
        currentLoad = 'OVERLOADED';
      } else if (totalMinutes > capacityMinutes) {
        currentLoad = 'HIGH';
      } else if (totalMinutes > capacityMinutes * 0.5) {
        currentLoad = 'MEDIUM';
      }

      // Find upcoming deadlines
      const now = new Date();
      const upcomingDeadlines = tasks
        .filter((t) => t.dueDate)
        .map((t) => {
          const dueDate = new Date(t.dueDate!);
          const daysRemaining = Math.ceil(
            (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          return {
            taskId: t.id,
            title: t.title,
            dueDate: t.dueDate!,
            daysRemaining,
          };
        })
        .filter((d) => d.daysRemaining >= 0 && d.daysRemaining <= 7)
        .sort((a, b) => a.daysRemaining - b.daysRemaining);

      return JSON.stringify({
        currentLoad,
        capacityRemainingMinutes: Math.max(0, capacityMinutes - totalMinutes),
        totalScheduledMinutes: totalMinutes,
        tasksCount: tasks.length,
        upcomingDeadlines,
      });
    },
  });
}

/**
 * Tool to analyze productivity patterns.
 */
export function createAnalyzeProductivityTool(logger?: Logger) {
  return tool({
    description: `Analyze user's productivity patterns based on historical data.
    Identifies best productivity hours and common blockers.`,
    inputSchema: z.object({
      goalsJson: z.string().optional().describe('JSON string of goals to analyze'),
      tasksJson: z.string().optional().describe('JSON string of tasks to analyze'),
    }),
    execute: async ({ goalsJson, tasksJson }: { goalsJson?: string; tasksJson?: string }) => {
      logger?.info('USER_CONTEXT', 'Analyzing productivity patterns');

      let goals: GoalSummary[] = [];
      let tasks: TaskSummary[] = [];

      try {
        goals = JSON.parse(goalsJson || '[]');
        tasks = JSON.parse(tasksJson || '[]');
      } catch {
        // Ignore parse errors
      }

      // Calculate average completion rate
      const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
      const totalTasks = tasks.length;
      const averageTaskCompletion = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 50;

      // Default productivity hours (morning focused)
      const bestProductivityHours = ['09:00', '10:00', '11:00'];

      // Common blockers
      const commonBlockers = ['Riunioni impreviste', 'Interruzioni', 'Mancanza di focus'];

      return JSON.stringify({
        averageTaskCompletion: Math.round(averageTaskCompletion),
        bestProductivityHours,
        commonBlockers,
        goalsAnalyzed: goals.length,
        tasksAnalyzed: tasks.length,
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createUserContextTools(input: OneAgendaMeshInput, logger?: Logger) {
  return {
    fetchUserPreferences: createFetchUserPreferencesTool(input, logger),
    fetchExistingGoals: createFetchExistingGoalsTool(input, logger),
    fetchExistingTasks: createFetchExistingTasksTool(input, logger),
    fetchCalendarEvents: createFetchCalendarEventsTool(input, logger),
    analyzeWorkload: createAnalyzeWorkloadTool(logger),
    analyzeProductivity: createAnalyzeProductivityTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const USER_CONTEXT_SYSTEM_PROMPT = `You are the User Context Agent for OneAgenda.

## Your Role
Gather comprehensive context about the user to enable intelligent planning:
- User preferences (timezone, working hours, focus time preferences)
- Existing goals and their progress
- Pending tasks with priorities and deadlines
- Calendar events and availability
- Workload analysis
- Productivity patterns

## Workflow
1. Use \`fetchUserPreferences\` to get user settings
2. Use \`fetchExistingGoals\` to get active goals
3. Use \`fetchExistingTasks\` to get pending tasks
4. Use \`fetchCalendarEvents\` for today and upcoming week
5. Use \`analyzeWorkload\` to assess current load
6. Use \`analyzeProductivity\` to understand patterns

## Output Requirements
- Aggregate all fetched data into a coherent context
- Calculate workload level: LOW, MEDIUM, HIGH, or OVERLOADED
- Identify upcoming deadlines within 7 days
- Determine best productivity hours based on patterns

## Notes
- All times should be in the user's timezone
- Working hours define when tasks can be scheduled
- Focus preference indicates best time for deep work`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class UserContextAgent {
  constructor(private readonly logger?: Logger) {}

  /**
   * Get tools for the agent (requires input context).
   */
  getTools(input: OneAgendaMeshInput) {
    return createUserContextTools(input, this.logger);
  }

  /**
   * Get the system prompt.
   */
  getSystemPrompt(): string {
    return USER_CONTEXT_SYSTEM_PROMPT;
  }

  /**
   * Build the user prompt.
   */
  buildUserPrompt(input: { userId: string; targetDate?: string }): string {
    const today: string = input.targetDate ?? new Date().toISOString().split('T')[0] ?? '';
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return `Gather context for user ${input.userId}.

1. Fetch their preferences
2. Fetch their active goals
3. Fetch their pending tasks
4. Fetch calendar events from ${today} to ${weekEnd.toISOString().split('T')[0]}
5. Analyze their current workload
6. Analyze their productivity patterns

Compile all information into a comprehensive user context.`;
  }

  /**
   * Process agent output into structured result.
   */
  processOutput(output: UserContextOutput): {
    context: UserContext;
    checkpoint: Checkpoint;
  } {
    // Validate output has required fields
    const hasPreferences = !!output.preferences;
    const hasWorkload = !!output.workloadAnalysis;
    const hasProductivity = !!output.productivity;

    const isValid = hasPreferences && hasWorkload && hasProductivity;

    const warnings: string[] = [];
    if (output.existingGoals.length === 0) {
      warnings.push('Nessun goal attivo trovato');
    }
    if (output.existingTasks.length === 0) {
      warnings.push('Nessun task pending trovato');
    }

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('user_context', warnings)
      : createFailingCheckpoint('user_context', ['Context incompleto']);

    return {
      context: output,
      checkpoint,
    };
  }
}
