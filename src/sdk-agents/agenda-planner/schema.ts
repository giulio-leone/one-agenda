/**
 * Agenda Planner Schema
 *
 * Input/Output types for the agenda-planner manager agent.
 * Uses Zod for runtime validation and type inference.
 */

import { z } from 'zod';

// ==================== SHARED TYPES ====================

const PrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

const ComplexitySchema = z.enum(['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX']);

// ==================== TASK SCHEMA ====================

const TaskInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  priority: PrioritySchema,
  effort: z.object({
    estimatedMinutes: z.number(),
    complexity: ComplexitySchema,
  }),
  deadline: z.string().nullable().optional(),
  dependencies: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  parentId: z.string().nullable().optional(),
  scheduledStart: z.string().nullable().optional(),
  scheduledEnd: z.string().nullable().optional(),
});

// ==================== EVENT SCHEMA ====================

const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(['MEETING', 'FOCUS', 'BREAK', 'OTHER']),
  source: z.enum(['INTERNAL', 'GOOGLE', 'OUTLOOK']),
  flexibility: z.enum(['FIXED', 'MOVABLE', 'OPTIONAL']).default('FIXED'),
  attendees: z
    .array(
      z.object({
        email: z.string(),
        name: z.string().optional(),
      })
    )
    .default([]),
  meetingUrl: z.string().nullable().optional(),
});

// ==================== PREFERENCES SCHEMA ====================

const WorkingHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  enabled: z.boolean(),
});

const UserPreferencesSchema = z.object({
  userId: z.string(),
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

// ==================== INPUT SCHEMA ====================

export const AgendaPlannerInputSchema = z.object({
  userId: z.string().describe('User ID for personalization'),
  date: z.string().describe('Target date for planning (ISO format)'),
  tasks: z.array(TaskInputSchema).describe('Tasks to schedule'),
  events: z.array(CalendarEventSchema).describe('Calendar events'),
  goals: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string(),
        deadline: z.string().optional(),
        priority: z.string().optional(),
      })
    )
    .optional()
    .describe('User goals for alignment'),
  milestones: z
    .array(
      z.object({
        id: z.string(),
        goalId: z.string(),
        title: z.string(),
        status: z.string(),
        deadline: z.string().optional(),
      })
    )
    .optional()
    .describe('Goal milestones'),
  preferences: UserPreferencesSchema.describe('User scheduling preferences'),
  constraints: z
    .object({
      availableHours: z.number().optional(),
      priorityThreshold: z.number().optional(),
      allowSplitting: z.boolean().optional(),
    })
    .optional()
    .describe('Optional constraints'),
  mode: z.enum(['PLAN', 'REPLAN', 'EXECUTE', 'REFLECT']).default('PLAN').describe('Operation mode'),
});

// ==================== OUTPUT SCHEMA ====================

const ScheduledTaskSchema = z.object({
  taskId: z.string(),
  scheduledStart: z.string(),
  scheduledEnd: z.string(),
  confidence: z.number().min(0).max(1),
});

const PlanBlockSchema = z.object({
  id: z.string(),
  type: z.enum(['TASK', 'EVENT', 'BREAK', 'BUFFER']),
  sourceId: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  title: z.string(),
});

const AlertSchema = z.object({
  type: z.enum(['OVERRUN', 'BLOCKER', 'DEPENDENCY', 'DEADLINE']),
  message: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  suggestions: z.array(z.string()).optional(),
});

const InsightSchema = z.object({
  category: z.string(),
  insight: z.string(),
  confidence: z.number().min(0).max(1),
});

export const AgendaPlannerOutputSchema = z.object({
  plan: z.object({
    date: z.string(),
    blocks: z.array(PlanBlockSchema),
    summary: z.object({
      scheduledMinutes: z.number(),
      freeMinutes: z.number(),
      taskCount: z.number(),
      risks: z
        .array(
          z.object({
            severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
            description: z.string(),
          })
        )
        .default([]),
    }),
  }),
  scheduledTasks: z.array(ScheduledTaskSchema),
  unscheduledTasks: z.array(TaskInputSchema).describe('Tasks that could not fit'),
  recommendations: z.array(z.string()),
  alerts: z.array(AlertSchema).optional(),
  insights: z.array(InsightSchema).optional(),
  achievements: z
    .array(
      z.object({
        title: z.string(),
        completedAt: z.string(),
        impact: z.string(),
      })
    )
    .optional(),
  metrics: z
    .object({
      completedTasks: z.number().optional(),
      goalsOnTrack: z.number().optional(),
      productivityScore: z.number().optional(),
    })
    .optional(),
  metadata: z
    .object({
      executionTimeMs: z.number().optional(),
      workersInvoked: z.array(z.string()).optional(),
    })
    .optional(),
});

// ==================== TYPE EXPORTS ====================

export type AgendaPlannerInput = z.infer<typeof AgendaPlannerInputSchema>;
export type AgendaPlannerOutput = z.infer<typeof AgendaPlannerOutputSchema>;
export type TaskInput = z.infer<typeof TaskInputSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;
export type PlanBlock = z.infer<typeof PlanBlockSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type Insight = z.infer<typeof InsightSchema>;
