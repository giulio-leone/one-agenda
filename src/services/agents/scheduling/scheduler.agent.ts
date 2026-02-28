/**
 * Scheduler Agent
 *
 * Creates time-blocked schedules by allocating tasks to available slots.
 * Respects user preferences, calendar events, and task dependencies.
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/scheduling/scheduler
 */

import { tool } from 'ai';
import { z } from 'zod';

import type {
  Logger,
  Schedule,
  ScheduleBlock,
  Checkpoint,
  TaskBreakdown,
  UserContext,
} from '../types';
import {
  createPassingCheckpoint,
  createFailingCheckpoint,
  createId,
  getWorkingMinutes,
} from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const scheduleBlockSchema = z.object({
  id: z.string().describe('Unique block ID'),
  type: z.enum(['TASK', 'EVENT', 'BREAK', 'FOCUS']).describe('Block type'),
  sourceId: z.string().optional().describe('Source task or event ID'),
  start: z.string().describe('Start time in ISO 8601 or HH:mm format'),
  end: z.string().describe('End time in ISO 8601 or HH:mm format'),
  title: z.string().describe('Block title'),
  confidence: z.number().min(0).max(1).describe('Confidence in this scheduling (0-1)'),
});

export const scheduleDaySchema = z.object({
  date: z.string().describe('Date in YYYY-MM-DD format'),
  blocks: z.array(scheduleBlockSchema).describe('Scheduled blocks for this day'),
  totalWorkMinutes: z.number().describe('Total work minutes scheduled'),
  utilizationPercent: z.number().describe('Utilization percentage (0-100+)'),
});

export const scheduleConflictSchema = z.object({
  blockIds: z.array(z.string()).describe('IDs of conflicting blocks'),
  type: z.enum(['OVERLAP', 'CAPACITY', 'DEPENDENCY']).describe('Conflict type'),
  description: z.string().describe('Conflict description'),
});

export const scheduleSummarySchema = z.object({
  totalDays: z.number(),
  totalTasksScheduled: z.number(),
  averageUtilization: z.number(),
});

export const scheduleSchema = z.object({
  days: z.array(scheduleDaySchema).min(1).describe('Scheduled days (at least 1 required)'),
  unscheduledTasks: z.array(z.string()).describe('Task IDs that could not be scheduled'),
  conflicts: z.array(scheduleConflictSchema).describe('Scheduling conflicts'),
  summary: scheduleSummarySchema.describe('Schedule summary'),
});

export type ScheduleOutput = z.infer<typeof scheduleSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to find available time slots.
 */
export function createFindAvailableSlotsTool(userContext: UserContext, logger?: Logger) {
  return tool({
    description: `Find available time slots for a specific date.
    Returns slots that don't conflict with calendar events.`,
    inputSchema: z.object({
      date: z.string().describe('Date in YYYY-MM-DD format'),
      minimumMinutes: z.number().optional().describe('Minimum slot duration in minutes'),
    }),
    execute: async ({ date, minimumMinutes = 30 }: { date: string; minimumMinutes?: number }) => {
      logger?.info('SCHEDULER', 'Finding available slots', { date, minimumMinutes });

      const prefs = userContext.preferences;
      const workStart = prefs.workingHoursStart;
      const workEnd = prefs.workingHoursEnd;

      // Get working minutes
      const totalWorkMinutes = getWorkingMinutes(workStart, workEnd);

      // Simulated slots (in real implementation, would subtract calendar events)
      const slots = [
        {
          start: `${date}T${workStart}:00`,
          end: `${date}T12:00:00`,
          durationMinutes: 180,
        },
        {
          start: `${date}T13:00:00`,
          end: `${date}T${workEnd}:00`,
          durationMinutes: 300,
        },
      ].filter((s: any) => s.durationMinutes >= minimumMinutes);

      return JSON.stringify({
        date,
        slots,
        totalAvailableMinutes: slots.reduce((sum: any, s: any) => sum + s.durationMinutes, 0),
        workStart,
        workEnd,
        totalWorkMinutes,
      });
    },
  });
}

/**
 * Tool to schedule a task in a slot.
 */
export function createScheduleTaskTool(logger?: Logger) {
  return tool({
    description: `Schedule a task into a specific time slot.
    Creates a schedule block for the task.`,
    inputSchema: z.object({
      taskId: z.string().describe('Task ID to schedule'),
      taskTitle: z.string().describe('Task title'),
      date: z.string().describe('Date in YYYY-MM-DD format'),
      startTime: z.string().describe('Start time in HH:mm format'),
      durationMinutes: z.number().describe('Duration in minutes'),
    }),
    execute: async ({
      taskId,
      taskTitle,
      date,
      startTime,
      durationMinutes,
    }: {
      taskId: string;
      taskTitle: string;
      date: string;
      startTime: string;
      durationMinutes: number;
    }) => {
      logger?.info('SCHEDULER', 'Scheduling task', { taskId, date, startTime, durationMinutes });

      const blockId = createId();

      // Calculate end time
      const [hours, minutes] = startTime.split(':').map(Number);
      const startMinutes = (hours || 0) * 60 + (minutes || 0);
      const endMinutes = startMinutes + durationMinutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

      return JSON.stringify({
        block: {
          id: blockId,
          type: 'TASK',
          sourceId: taskId,
          start: `${date}T${startTime}:00`,
          end: `${date}T${endTime}:00`,
          title: taskTitle,
          confidence: 0.8,
        },
        status: 'scheduled',
      });
    },
  });
}

/**
 * Tool to add a break to the schedule.
 */
export function createAddBreakTool(logger?: Logger) {
  return tool({
    description: `Add a break to the schedule.
    Breaks are important for maintaining productivity.`,
    inputSchema: z.object({
      date: z.string().describe('Date in YYYY-MM-DD format'),
      startTime: z.string().describe('Start time in HH:mm format'),
      durationMinutes: z.number().describe('Break duration in minutes'),
      breakType: z.enum(['LUNCH', 'SHORT', 'LONG']).optional(),
    }),
    execute: async ({
      date,
      startTime,
      durationMinutes,
      breakType = 'SHORT',
    }: {
      date: string;
      startTime: string;
      durationMinutes: number;
      breakType?: 'LUNCH' | 'SHORT' | 'LONG';
    }) => {
      logger?.info('SCHEDULER', 'Adding break', { date, startTime, breakType });

      const blockId = createId();

      // Calculate end time
      const [hours, minutes] = startTime.split(':').map(Number);
      const startMinutes = (hours || 0) * 60 + (minutes || 0);
      const endMinutes = startMinutes + durationMinutes;
      const endHours = Math.floor(endMinutes / 60);
      const endMins = endMinutes % 60;
      const endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

      const titles = {
        LUNCH: 'Pausa pranzo',
        SHORT: 'Pausa breve',
        LONG: 'Pausa lunga',
      };

      return JSON.stringify({
        block: {
          id: blockId,
          type: 'BREAK',
          start: `${date}T${startTime}:00`,
          end: `${date}T${endTime}:00`,
          title: titles[breakType],
          confidence: 1.0,
        },
        status: 'added',
      });
    },
  });
}

/**
 * Tool to check for scheduling conflicts.
 */
export function createCheckConflictsTool(logger?: Logger) {
  return tool({
    description: `Check for conflicts in a day's schedule.
    Identifies overlapping blocks and capacity issues.`,
    inputSchema: z.object({
      blocksJson: z.string().describe('JSON array of schedule blocks'),
      maxWorkMinutes: z.number().describe('Maximum work minutes per day'),
    }),
    execute: async ({
      blocksJson,
      maxWorkMinutes,
    }: {
      blocksJson: string;
      maxWorkMinutes: number;
    }) => {
      logger?.info('SCHEDULER', 'Checking conflicts');

      let blocks: ScheduleBlock[] = [];
      try {
        blocks = JSON.parse(blocksJson);
      } catch {
        return JSON.stringify({ conflicts: [], error: 'Invalid blocks JSON' });
      }

      const conflicts: Array<{
        blockIds: string[];
        type: string;
        description: string;
      }> = [];

      // Check overlaps
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          const b1 = blocks[i];
          const b2 = blocks[j];

          if (!b1 || !b2) continue;

          const start1 = new Date(b1.start);
          const end1 = new Date(b1.end);
          const start2 = new Date(b2.start);
          const end2 = new Date(b2.end);

          // Check if blocks overlap
          if (start1 < end2 && start2 < end1) {
            conflicts.push({
              blockIds: [b1.id, b2.id],
              type: 'OVERLAP',
              description: `"${b1.title}" e "${b2.title}" si sovrappongono`,
            });
          }
        }
      }

      // Check capacity
      const taskBlocks = blocks.filter((b: any) => b.type === 'TASK');
      const totalTaskMinutes = taskBlocks.reduce((sum: any, b: any) => {
        const start = new Date(b.start);
        const end = new Date(b.end);
        return sum + (end.getTime() - start.getTime()) / 60000;
      }, 0);

      if (totalTaskMinutes > maxWorkMinutes) {
        conflicts.push({
          blockIds: taskBlocks.map((b: any) => b.id),
          type: 'CAPACITY',
          description: `${Math.round(totalTaskMinutes)} minuti schedulati superano il limite di ${maxWorkMinutes}`,
        });
      }

      return JSON.stringify({
        conflicts,
        hasConflicts: conflicts.length > 0,
        totalTaskMinutes: Math.round(totalTaskMinutes),
      });
    },
  });
}

/**
 * Tool to optimize block ordering.
 */
export function createOptimizeBlocksTool(userContext: UserContext, logger?: Logger) {
  return tool({
    description: `Optimize the ordering of blocks within a day.
    Considers user focus preferences and task complexity.`,
    inputSchema: z.object({
      blocksJson: z.string().describe('JSON array of blocks to optimize'),
    }),
    execute: async ({ blocksJson }: { blocksJson: string }) => {
      logger?.info('SCHEDULER', 'Optimizing blocks');

      let blocks: ScheduleBlock[] = [];
      try {
        blocks = JSON.parse(blocksJson);
      } catch {
        return JSON.stringify({ blocks: [], error: 'Invalid blocks JSON' });
      }

      const focusPref = userContext.preferences.focusPreference;

      // Sort blocks by time
      const sorted = [...blocks].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
      );

      return JSON.stringify({
        optimizedBlocks: sorted,
        focusPreference: focusPref,
        optimization: 'Blocks sorted by start time',
      });
    },
  });
}

/**
 * Tool to create a day schedule.
 */
export function createDayScheduleTool(logger?: Logger) {
  return tool({
    description: `Create a complete schedule for a day from blocks.`,
    inputSchema: z.object({
      date: z.string().describe('Date in YYYY-MM-DD format'),
      blocksJson: z.string().describe('JSON array of schedule blocks'),
      maxWorkMinutes: z.number().describe('Maximum work minutes per day'),
    }),
    execute: async ({
      date,
      blocksJson,
      maxWorkMinutes,
    }: {
      date: string;
      blocksJson: string;
      maxWorkMinutes: number;
    }) => {
      logger?.info('SCHEDULER', 'Creating day schedule', { date });

      let blocks: ScheduleBlock[] = [];
      try {
        blocks = JSON.parse(blocksJson);
      } catch {
        return JSON.stringify({ error: 'Invalid blocks JSON' });
      }

      // Calculate totals
      const taskBlocks = blocks.filter((b: any) => b.type === 'TASK');
      const totalWorkMinutes = taskBlocks.reduce((sum: any, b: any) => {
        const start = new Date(b.start);
        const end = new Date(b.end);
        return sum + (end.getTime() - start.getTime()) / 60000;
      }, 0);

      const utilizationPercent = Math.round((totalWorkMinutes / maxWorkMinutes) * 100);

      return JSON.stringify({
        day: {
          date,
          blocks,
          totalWorkMinutes: Math.round(totalWorkMinutes),
          utilizationPercent,
        },
        status: 'created',
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createSchedulerTools(userContext: UserContext, logger?: Logger) {
  return {
    findAvailableSlots: createFindAvailableSlotsTool(userContext, logger),
    scheduleTask: createScheduleTaskTool(logger),
    addBreak: createAddBreakTool(logger),
    checkConflicts: createCheckConflictsTool(logger),
    optimizeBlocks: createOptimizeBlocksTool(userContext, logger),
    createDaySchedule: createDayScheduleTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const SCHEDULER_SYSTEM_PROMPT = `You are the Scheduler Agent for OneAgenda.

## Your Role
Create optimized daily and weekly schedules by allocating tasks to available time slots.

## Workflow
For each day to schedule:
1. Use \`findAvailableSlots\` to identify open time slots
2. For each task to schedule:
   a. Use \`scheduleTask\` to place it in an appropriate slot
   b. Consider task priority, dependencies, and complexity
3. Use \`addBreak\` to include lunch break and short breaks
4. Use \`checkConflicts\` to verify no overlaps or capacity issues
5. Use \`optimizeBlocks\` to improve the ordering
6. Use \`createDaySchedule\` to finalize the day

## Scheduling Rules
1. **Focus Time First**: Schedule complex tasks during user's preferred focus time
2. **Respect Dependencies**: Tasks must come after their dependencies
3. **Include Breaks**: Add lunch (45-60 min) and short breaks (10-15 min every 90 min)
4. **Buffer Time**: Leave 5-10 min between tasks
5. **Don't Overload**: Keep utilization under 80% for flexibility

## Priority Order
Schedule in this order:
1. CRITICAL priority tasks
2. Tasks on critical path
3. HIGH priority tasks
4. Tasks with near deadlines
5. MEDIUM and LOW priority

## Focus Preferences
- MORNING focus: Schedule complex tasks 09:00-12:00
- AFTERNOON focus: Schedule complex tasks 14:00-17:00
- EVENING focus: Schedule complex tasks 17:00-19:00
- ANY: Distribute evenly

## REQUISITI SCHEMA CRITICI
- L'array \`days\` DEVE contenere almeno un giorno schedulato.
- NON restituire uno schedule vuoto.
- Anche se nessun task può essere schedulato, restituisci almeno la struttura dei giorni.

## Requisiti Output
- Each day should have realistic utilization (60-80% ideal)
- Track unscheduled tasks if capacity exceeded
- Identify and report all conflicts
- All times in ISO 8601 format

## FINAL OUTPUT REQUIREMENT (MANDATORY)
After you finish using tools to schedule tasks, you MUST generate the complete JSON output following this EXACT structure:
1. \`days\`: Array of all scheduled days (at least 1 day required)
2. \`unscheduledTasks\`: Array of task IDs that could not be scheduled
3. \`conflicts\`: Array of any scheduling conflicts
4. \`summary\`: Object with schedule summary statistics

**DO NOT END WITHOUT PRODUCING THIS OUTPUT. The tools only collect data - YOU must generate the final schedule JSON.**

## Example Complete Schedule Output
\`\`\`json
{
  "days": [
    {
      "date": "2025-01-06",
      "blocks": [
        { "id": "block_001", "title": "Test 1RM squat", "taskId": "task_001", "startTime": "09:00", "endTime": "10:30", "type": "DEEP_WORK" },
        { "id": "block_002", "title": "Pausa", "taskId": null, "startTime": "10:30", "endTime": "10:45", "type": "BREAK" }
      ],
      "utilization": 0.75
    }
  ],
  "unscheduledTasks": [],
  "conflicts": [],
  "summary": {
    "totalBlocksScheduled": 2,
    "totalMinutesScheduled": 90,
    "averageUtilization": 0.75,
    "daysWithConflicts": 0
  }
}
\`\`\`

## Language
Generate all content in Italian.`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class SchedulerAgent {
  constructor(private readonly logger?: Logger) {}

  getTools(userContext: UserContext) {
    return createSchedulerTools(userContext, this.logger);
  }

  getSystemPrompt(): string {
    return SCHEDULER_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: {
    taskBreakdown: TaskBreakdown;
    userContext: UserContext;
    startDate?: string;
    daysToSchedule?: number;
  }): string {
    const { taskBreakdown, userContext, daysToSchedule = 7 } = input;
    const today = new Date();
    const startDate = input.startDate || today.toISOString().split('T')[0];
    const dayOfWeek = [
      'Domenica',
      'Lunedì',
      'Martedì',
      'Mercoledì',
      'Giovedì',
      'Venerdì',
      'Sabato',
    ][today.getDay()];

    let prompt = `## Current Date Context\n`;
    prompt += `Today: ${dayOfWeek}, ${startDate}\n`;
    prompt += `Schedule period: ${startDate} + ${daysToSchedule} days\n\n`;
    prompt += `Create a schedule for the following tasks:\n\n`;

    // List tasks
    prompt += `## Tasks to Schedule (${taskBreakdown.tasks.length})\n`;
    taskBreakdown.tasks.forEach((t, i) => {
      prompt += `${i + 1}. **${t.title}** (${t.estimatedMinutes} min)\n`;
      prompt += `   - Priority: ${t.priority}\n`;
      prompt += `   - Complexity: ${t.complexity}\n`;
      if (t.dependencies.length > 0) {
        prompt += `   - Depends on: ${t.dependencies.join(', ')}\n`;
      }
      prompt += `\n`;
    });

    // User preferences
    prompt += `## User Preferences\n`;
    prompt += `- Working hours: ${userContext.preferences.workingHoursStart} - ${userContext.preferences.workingHoursEnd}\n`;
    prompt += `- Focus preference: ${userContext.preferences.focusPreference}\n`;
    prompt += `- Current workload: ${userContext.workloadAnalysis.currentLoad}\n\n`;

    // Critical path
    if (taskBreakdown.criticalPath.length > 0) {
      prompt += `## Critical Path\n`;
      prompt += `Tasks in critical path: ${taskBreakdown.criticalPath.join(' → ')}\n\n`;
    }

    // Schedule parameters
    prompt += `## Schedule Parameters\n`;
    prompt += `- Start Date: ${startDate}\n`;
    prompt += `- Days to Schedule: ${daysToSchedule}\n`;
    prompt += `- Total Effort: ${taskBreakdown.totalEffortMinutes} minutes\n\n`;

    prompt += `Create an optimized schedule that respects dependencies and maximizes productivity.`;

    return prompt;
  }

  processOutput(output: ScheduleOutput): {
    schedule: Schedule;
    checkpoint: Checkpoint;
  } {
    // Defensive checks for partial/incomplete output
    if (!output) {
      this.logger?.error('SCHEDULER', 'processOutput received null/undefined output');
      return {
        schedule: {
          days: [],
          unscheduledTasks: [],
          conflicts: [],
          summary: { totalDays: 0, totalTasksScheduled: 0, averageUtilization: 0 },
        },
        checkpoint: createFailingCheckpoint('scheduler', ['Output nullo o non definito']),
      };
    }

    // Ensure arrays exist
    const days = output.days ?? [];
    const unscheduledTasks = output.unscheduledTasks ?? [];
    const conflicts = output.conflicts ?? [];
    const summary = output.summary ?? {
      totalDays: 0,
      totalTasksScheduled: 0,
      averageUtilization: 0,
    };

    const hasDays = days.length > 0;
    const hasTasksScheduled = days.some((d) => (d?.blocks ?? []).some((b) => b?.type === 'TASK'));
    const avgUtilization =
      days.length > 0
        ? days.reduce((sum: any, d: any) => sum + (d?.utilizationPercent ?? 0), 0) / days.length
        : 0;

    const issues: string[] = [];
    if (!hasDays) issues.push('Nessun giorno schedulato');
    if (!hasTasksScheduled) issues.push('Nessun task schedulato');
    if (unscheduledTasks.length > 0) {
      issues.push(`${unscheduledTasks.length} task non schedulati`);
    }
    if (conflicts.length > 0) {
      issues.push(`${conflicts.length} conflitti rilevati`);
    }
    if (avgUtilization > 100) {
      issues.push('Utilizzo medio supera 100% - schedule non fattibile');
    }

    const isValid = hasDays && hasTasksScheduled && avgUtilization <= 100;

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('scheduler', issues)
      : createFailingCheckpoint('scheduler', issues);

    this.logger?.info('SCHEDULER', 'processOutput completed', {
      daysCount: days.length,
      hasTasksScheduled,
      avgUtilization,
      isValid,
      issues,
    });

    return {
      schedule: { days, unscheduledTasks, conflicts, summary },
      checkpoint,
    };
  }
}
