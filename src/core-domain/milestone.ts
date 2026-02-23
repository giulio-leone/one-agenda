/**
 * Milestone Domain Model
 *
 * Represents intermediate checkpoints between Goals and Tasks.
 * Milestones decompose goals into manageable chunks.
 */

import { z } from 'zod';

/**
 * Milestone status
 */
export enum MilestoneStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  DELAYED = 'DELAYED',
}

/**
 * Milestone Schema
 */
export const MilestoneSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  parentId: z.string().optional(),
  subMilestones: z.array(z.string()).default([]), // IDs of sub-milestones
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.nativeEnum(MilestoneStatus),

  // Order within goal
  order: z.number().int().nonnegative(),

  // Time management
  targetDate: z.string().datetime(),
  completedAt: z.string().datetime().optional(),

  // Progress tracking
  tasksCompleted: z.number().int().nonnegative().default(0),
  tasksTotal: z.number().int().positive().default(1),
  percentComplete: z.number().min(0).max(100).default(0),

  // Associated tasks
  taskIds: z.array(z.string()).default([]),

  // Criteria for completion
  completionCriteria: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        completed: z.boolean().default(false),
      })
    )
    .default([]),

  // Context
  context: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Milestone = z.infer<typeof MilestoneSchema>;

/**
 * Milestone creation input
 */
export const CreateMilestoneInputSchema = MilestoneSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  tasksCompleted: true,
  tasksTotal: true,
  percentComplete: true,
  taskIds: true,
  subMilestones: true,
} as const).partial({
  status: true,
  order: true,
  completionCriteria: true,
});

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneInputSchema>;

/**
 * Milestone update input
 */
export const UpdateMilestoneInputSchema = MilestoneSchema.partial().required({
  id: true,
  updatedAt: true,
} as const);

export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneInputSchema>;
