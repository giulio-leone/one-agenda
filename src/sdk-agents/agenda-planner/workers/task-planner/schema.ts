/**
 * Task Planner Worker Schema
 *
 * Handles daily scheduling with constraint satisfaction.
 */

import { z } from 'zod';

// ==================== INPUT ====================

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  effort: z.object({
    estimatedMinutes: z.number(),
    complexity: z.enum(['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX']),
  }),
  deadline: z.string().nullable().optional(),
  dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  parentId: z.string().nullable().optional(),
  scheduledStart: z.string().nullable().optional(),
  scheduledEnd: z.string().nullable().optional(),
});

const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(['MEETING', 'FOCUS', 'BREAK', 'OTHER']),
});

const WorkingHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  enabled: z.boolean(),
});

const PreferencesSchema = z.object({
  timezone: z.string().default('Europe/Rome'),
  workingHours: z.array(WorkingHoursSchema),
  breaks: z.object({
    breakDurationMinutes: z.number().default(15),
    breakFrequencyMinutes: z.number().default(90),
  }),
  scheduling: z.object({
    allowTaskSplitting: z.boolean().default(false),
    bufferBetweenTasksMinutes: z.number().default(5),
  }),
});

const UserPatternSchema = z
  .object({
    peakProductivityHours: z.array(z.string()).optional(),
    preferredTaskOrder: z.array(z.string()).optional(),
  })
  .optional();

export const TaskPlannerInputSchema = z.object({
  tasks: z.array(TaskSchema).describe('Tasks to schedule for the day'),
  events: z.array(CalendarEventSchema).describe('Fixed calendar events'),
  preferences: PreferencesSchema.describe('User scheduling preferences'),
  date: z.string().describe('Target date (ISO format)'),
  constraints: z
    .object({
      availableHours: z.number().optional(),
      priorityThreshold: z.number().optional(),
      allowSplitting: z.boolean().optional(),
    })
    .optional(),
  userPatterns: UserPatternSchema.describe('Learned user patterns'),
});

// ==================== OUTPUT ====================

const ScheduledTaskSchema = z.object({
  taskId: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  confidence: z.number().min(0).max(1).describe('Scheduling confidence 0-1'),
});

const PlanBlockSchema = z.object({
  id: z.string(),
  type: z.enum(['TASK', 'EVENT', 'BREAK', 'BUFFER']),
  sourceId: z.string().nullable().describe('Task/Event ID if applicable'),
  start: z.string(),
  end: z.string(),
  title: z.string(),
});

const RiskSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  description: z.string(),
});

export const TaskPlannerOutputSchema = z.object({
  plan: z.object({
    date: z.string(),
    blocks: z.array(PlanBlockSchema).describe('Ordered schedule blocks'),
    summary: z.object({
      scheduledMinutes: z.number(),
      freeMinutes: z.number(),
      taskCount: z.number(),
      risks: z.array(RiskSchema).default([]),
    }),
  }),
  scheduledTasks: z.array(ScheduledTaskSchema),
  unscheduledTasks: z.array(TaskSchema).describe('Tasks that could not fit'),
  recommendations: z.array(z.string()).describe('Scheduling suggestions'),
  planningRationale: z.string().describe('Brief explanation of scheduling decisions'),
});

// ==================== TYPE EXPORTS ====================

export type TaskPlannerInput = z.infer<typeof TaskPlannerInputSchema>;
export type TaskPlannerOutput = z.infer<typeof TaskPlannerOutputSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;
export type PlanBlock = z.infer<typeof PlanBlockSchema>;
