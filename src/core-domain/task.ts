/**
 * Task Domain Model
 *
 * Represents a task in the OneAgenda system with advanced features:
 * - Tagging system
 * - Priority management
 * - Deadline tracking
 * - Intelligent reminders
 * - Effort estimation
 * - Dependency tracking
 */

import { z } from 'zod';

/**
 * Task priority levels
 */
export enum TaskPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Task status
 */
export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  CANCELLED = 'CANCELLED',
}

/**
 * Reminder configuration
 */
export const ReminderConfigSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['ABSOLUTE', 'RELATIVE']),
  absoluteTime: z.string().datetime().optional(),
  relativeDuration: z.number().int().positive().optional(), // minutes before deadline
  repeat: z.boolean().default(false),
  repeatInterval: z.number().int().positive().optional(), // minutes
});

export type ReminderConfig = z.infer<typeof ReminderConfigSchema>;

/**
 * Effort estimation
 */
export const EffortEstimationSchema = z.object({
  estimatedMinutes: z.number().int().positive(),
  confidence: z.number().min(0).max(1), // 0-1 confidence score
  actualMinutes: z.number().int().positive().optional(),
  complexity: z.enum(['SIMPLE', 'MODERATE', 'COMPLEX', 'VERY_COMPLEX']),
});

export type EffortEstimation = z.infer<typeof EffortEstimationSchema>;

/**
 * Task Schema
 */
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(TaskPriority),
  visibility: z.enum(['PRIVATE', 'SHARED_WITH_COACH']).optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  assignedByCoachId: z.string().uuid().nullable().optional(),

  // Hierarchy
  parentId: z.string().optional(),
  subtasks: z.array(z.string()).default([]), // IDs of subtasks

  // Tagging system
  tags: z.array(z.string()).default([]),

  // Time management
  deadline: z.string().datetime().optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),

  // Effort estimation
  effort: EffortEstimationSchema,

  // Reminders
  reminders: z.array(ReminderConfigSchema).default([]),

  // Dependencies
  dependencies: z.array(z.string()).default([]), // task IDs
  blockedBy: z.array(z.string()).default([]), // task IDs

  // Goal association
  goalId: z.string().optional(),
  milestoneId: z.string().optional(),

  // Context
  context: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * Task creation input
 */
export const CreateTaskInputSchema = TaskSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  assignedByCoachId: true,
  subtasks: true,
} as const).partial({
  status: true,
  priority: true,
  tags: true,
  reminders: true,
  dependencies: true,
  blockedBy: true,
  visibility: true,
  assignedToUserId: true,
});

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;

/**
 * Task update input
 */
export const UpdateTaskInputSchema = TaskSchema.partial().required({
  id: true,
  updatedAt: true,
} as const);

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;
