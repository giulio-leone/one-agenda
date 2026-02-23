/**
 * Memory Manager Worker Schema
 *
 * Manages user preferences and learned patterns.
 */

import { z } from 'zod';

// ==================== INPUT ====================

const ActionSchema = z.enum(['STORE', 'RETRIEVE', 'ANALYZE', 'UPDATE_PREFERENCES']);

const WorkingHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  enabled: z.boolean(),
});

const PreferencesSchema = z.object({
  timezone: z.string().default('Europe/Rome'),
  workingHours: z.array(WorkingHoursSchema).optional(),
  breaks: z
    .object({
      breakDurationMinutes: z.number(),
      breakFrequencyMinutes: z.number(),
    })
    .optional(),
  scheduling: z
    .object({
      allowTaskSplitting: z.boolean(),
      bufferBetweenTasksMinutes: z.number(),
    })
    .optional(),
});

const TaskDataSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED']),
  completedAt: z.string().optional(),
});

const InsightDataSchema = z.object({
  type: z.string(),
  description: z.string(),
  confidence: z.number(),
});

export const MemoryManagerInputSchema = z.object({
  action: ActionSchema,
  userId: z.string(),
  data: z
    .object({
      preferences: PreferencesSchema.optional(),
      completedTasks: z.array(TaskDataSchema).optional(),
      insights: z.array(InsightDataSchema).optional(),
      timeframe: z
        .object({
          start: z.string(),
          end: z.string(),
        })
        .optional(),
    })
    .optional(),
});

// ==================== OUTPUT ====================

const PatternSchema = z.object({
  type: z.enum(['WORK_RHYTHM', 'PRIORITY_PREFERENCE', 'TASK_TIMING', 'GOAL_SETTING']),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.string()),
});

const LearnedPreferencesSchema = z.object({
  peakProductivityHours: z.array(z.string()).optional(),
  preferredTaskOrder: z.array(z.string()).optional(),
  averageTaskDurationMultiplier: z.number().optional(),
});

export const MemoryManagerOutputSchema = z.object({
  preferences: PreferencesSchema.optional(),
  patterns: z.array(PatternSchema).optional(),
  learnedPreferences: LearnedPreferencesSchema.optional(),
  recommendations: z
    .array(
      z.object({
        type: z.enum(['SCHEDULING', 'PRIORITIZATION', 'TIME_MANAGEMENT', 'GOAL_SETTING']),
        message: z.string(),
        priority: z.number().min(1).max(5),
      })
    )
    .optional(),
  success: z.boolean(),
  message: z.string().optional(),
});

// ==================== TYPE EXPORTS ====================

export type MemoryManagerInput = z.infer<typeof MemoryManagerInputSchema>;
export type MemoryManagerOutput = z.infer<typeof MemoryManagerOutputSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type LearnedPreferences = z.infer<typeof LearnedPreferencesSchema>;
