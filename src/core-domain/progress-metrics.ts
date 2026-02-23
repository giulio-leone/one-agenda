/**
 * Progress Metrics Domain Model
 *
 * Comprehensive metrics for tracking progress across tasks, milestones, and goals.
 */

import { z } from 'zod';

/**
 * Time-series data point
 */
export const TimeSeriesDataPointSchema = z.object({
  timestamp: z.string().datetime(),
  value: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TimeSeriesDataPoint = z.infer<typeof TimeSeriesDataPointSchema>;

/**
 * Task completion metrics
 */
export const TaskCompletionMetricsSchema = z.object({
  totalTasks: z.number().int().nonnegative(),
  completedTasks: z.number().int().nonnegative(),
  inProgressTasks: z.number().int().nonnegative(),
  blockedTasks: z.number().int().nonnegative(),
  overdueTasks: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(100),
  averageCompletionTimeMinutes: z.number().nonnegative().optional(),
  onTimeCompletionRate: z.number().min(0).max(100).optional(),
});

export type TaskCompletionMetrics = z.infer<typeof TaskCompletionMetricsSchema>;

/**
 * Goal progress metrics
 */
export const GoalProgressMetricsSchema = z.object({
  totalGoals: z.number().int().nonnegative(),
  activeGoals: z.number().int().nonnegative(),
  completedGoals: z.number().int().nonnegative(),
  atRiskGoals: z.number().int().nonnegative(),
  averageProgressPercentage: z.number().min(0).max(100),
  goalsOnTrack: z.number().int().nonnegative(),
  goalsAheadOfSchedule: z.number().int().nonnegative(),
  goalsBehindSchedule: z.number().int().nonnegative(),
});

export type GoalProgressMetrics = z.infer<typeof GoalProgressMetricsSchema>;

/**
 * Time utilization metrics
 */
export const TimeUtilizationMetricsSchema = z.object({
  totalScheduledMinutes: z.number().nonnegative(),
  focusTimeMinutes: z.number().nonnegative(),
  meetingTimeMinutes: z.number().nonnegative(),
  breakTimeMinutes: z.number().nonnegative(),
  unscheduledMinutes: z.number().nonnegative(),
  utilizationRate: z.number().min(0).max(100),
  averageFocusBlockMinutes: z.number().nonnegative().optional(),
  peakProductivityHours: z.array(z.number().int().min(0).max(23)).optional(),
});

export type TimeUtilizationMetrics = z.infer<typeof TimeUtilizationMetricsSchema>;

/**
 * Productivity insights
 */
export const ProductivityInsightsSchema = z.object({
  productivityScore: z.number().min(0).max(100),
  trends: z.object({
    taskCompletion: z.enum(['IMPROVING', 'STABLE', 'DECLINING']),
    timeManagement: z.enum(['IMPROVING', 'STABLE', 'DECLINING']),
    goalProgress: z.enum(['IMPROVING', 'STABLE', 'DECLINING']),
  }),
  strengths: z.array(z.string()),
  areasForImprovement: z.array(z.string()),
  recommendations: z.array(
    z.object({
      type: z.enum(['SCHEDULING', 'PRIORITIZATION', 'TIME_MANAGEMENT', 'GOAL_SETTING']),
      message: z.string(),
      priority: z.number().int().min(1).max(5),
    })
  ),
});

export type ProductivityInsights = z.infer<typeof ProductivityInsightsSchema>;

/**
 * Aggregate progress metrics
 */
export const AggregateProgressMetricsSchema = z.object({
  userId: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),

  // Task metrics
  taskMetrics: TaskCompletionMetricsSchema,

  // Goal metrics
  goalMetrics: GoalProgressMetricsSchema,

  // Time metrics
  timeMetrics: TimeUtilizationMetricsSchema,

  // Productivity
  productivity: ProductivityInsightsSchema,

  // Historical trends
  historicalData: z
    .object({
      taskCompletionTrend: z.array(TimeSeriesDataPointSchema),
      goalProgressTrend: z.array(TimeSeriesDataPointSchema),
      productivityScoreTrend: z.array(TimeSeriesDataPointSchema),
    })
    .optional(),

  // Metadata
  generatedAt: z.string().datetime(),
});

export type AggregateProgressMetrics = z.infer<typeof AggregateProgressMetricsSchema>;
