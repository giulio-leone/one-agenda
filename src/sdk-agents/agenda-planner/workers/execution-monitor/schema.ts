/**
 * Execution Monitor Worker Schema
 *
 * Tracks task progress and detects blockers.
 */

import { z } from 'zod';

// ==================== INPUT ====================

const TaskStatusSchema = z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED']);

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: TaskStatusSchema,
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  effort: z.object({
    estimatedMinutes: z.number(),
    actualMinutes: z.number().optional(),
  }),
  deadline: z.string().nullable().optional(),
  dependencies: z.array(z.string()).default([]),
  blockedBy: z.array(z.string()).optional(),
  scheduledStart: z.string().nullable().optional(),
  scheduledEnd: z.string().nullable().optional(),
});

const PlanBlockSchema = z.object({
  id: z.string(),
  type: z.enum(['TASK', 'EVENT', 'BREAK', 'BUFFER']),
  sourceId: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  title: z.string(),
});

export const ExecutionMonitorInputSchema = z.object({
  plan: z.object({
    date: z.string(),
    blocks: z.array(PlanBlockSchema),
  }),
  tasks: z.array(TaskSchema).describe('Current task states'),
  userId: z.string(),
  currentTime: z.string().optional().describe('Current time for progress calc'),
});

// ==================== OUTPUT ====================

const AlertSchema = z.object({
  type: z.enum(['OVERRUN', 'BLOCKER', 'DEPENDENCY', 'DEADLINE']),
  taskId: z.string().optional(),
  message: z.string(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  suggestions: z.array(z.string()).default([]),
});

const TaskProgressSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  progressPercent: z.number().min(0).max(100),
  timeSpentMinutes: z.number(),
  isOverdue: z.boolean(),
});

const NextActionSchema = z.object({
  description: z.string(),
  priority: z.number().min(1).max(5),
  taskId: z.string().optional(),
});

export const ExecutionMonitorOutputSchema = z.object({
  taskProgress: z.array(TaskProgressSchema),
  completedTasks: z.array(z.string()).describe('IDs of completed tasks'),
  blockedTasks: z.array(z.string()).describe('IDs of blocked tasks'),
  alerts: z.array(AlertSchema),
  nextActions: z.array(NextActionSchema),
  summary: z.object({
    completedCount: z.number(),
    inProgressCount: z.number(),
    blockedCount: z.number(),
    onTrackPercent: z.number().min(0).max(100),
  }),
});

// ==================== TYPE EXPORTS ====================

export type ExecutionMonitorInput = z.infer<typeof ExecutionMonitorInputSchema>;
export type ExecutionMonitorOutput = z.infer<typeof ExecutionMonitorOutputSchema>;
export type TaskProgress = z.infer<typeof TaskProgressSchema>;
export type Alert = z.infer<typeof AlertSchema>;
