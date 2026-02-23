/**
 * Goal Domain Model
 *
 * Represents goals at different time horizons:
 * - Short-term (days to weeks)
 * - Medium-term (weeks to months)
 * - Long-term (months to years)
 *
 * Goals are automatically decomposed into Milestones → Microtasks
 */

import { z } from 'zod';

/**
 * Goal time horizon
 */
export enum GoalTimeHorizon {
  SHORT_TERM = 'SHORT_TERM', // days to weeks
  MEDIUM_TERM = 'MEDIUM_TERM', // weeks to months
  LONG_TERM = 'LONG_TERM', // months to years
}

/**
 * Goal status
 */
export enum GoalStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ON_TRACK = 'ON_TRACK',
  AT_RISK = 'AT_RISK',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

/**
 * Progress metrics
 */
export const ProgressMetricsSchema = z.object({
  completedMilestones: z.number().int().nonnegative(),
  totalMilestones: z.number().int().positive(),
  completedTasks: z.number().int().nonnegative(),
  totalTasks: z.number().int().positive(),
  percentComplete: z.number().min(0).max(100),
  daysRemaining: z.number().int().optional(),
  projectedCompletionDate: z.string().datetime().optional(),
});

export type ProgressMetrics = z.infer<typeof ProgressMetricsSchema>;

/**
 * Goal Schema
 */
export const GoalSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  status: z.nativeEnum(GoalStatus),
  timeHorizon: z.nativeEnum(GoalTimeHorizon),

  // Time management
  startDate: z.string().datetime(),
  targetDate: z.string().datetime(),
  completedAt: z.string().datetime().optional(),

  // Progress tracking
  progress: ProgressMetricsSchema,

  // Hierarchy
  parentGoalId: z.string().optional(), // for nested goals
  milestoneIds: z.array(z.string()).default([]),

  // Metrics and tracking
  dailyProgressNotes: z
    .array(
      z.object({
        date: z.string().datetime(),
        note: z.string(),
        achievements: z.array(z.string()),
        blockers: z.array(z.string()).optional(),
      })
    )
    .default([]),

  // Tags and categorization
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),

  // AI-generated insights
  aiInsights: z
    .array(
      z.object({
        type: z.enum(['SUGGESTION', 'WARNING', 'CELEBRATION', 'ADJUSTMENT']),
        message: z.string(),
        timestamp: z.string().datetime(),
      })
    )
    .default([]),

  // Context
  context: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),
});

export type Goal = z.infer<typeof GoalSchema>;

/**
 * Goal creation input
 */
export const CreateGoalInputSchema = GoalSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  progress: true,
  milestoneIds: true,
  dailyProgressNotes: true,
  aiInsights: true,
} as const).partial({
  status: true,
  tags: true,
});

export type CreateGoalInput = z.infer<typeof CreateGoalInputSchema>;

/**
 * Goal update input
 */
export const UpdateGoalInputSchema = GoalSchema.partial().required({
  id: true,
  updatedAt: true,
} as const);

export type UpdateGoalInput = z.infer<typeof UpdateGoalInputSchema>;
