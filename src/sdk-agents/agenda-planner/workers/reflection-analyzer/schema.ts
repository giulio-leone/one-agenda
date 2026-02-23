/**
 * Reflection Analyzer Worker Schema
 *
 * Analyzes productivity and generates insights.
 */

import { z } from 'zod';

// ==================== INPUT ====================

const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED']),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  effort: z.object({
    estimatedMinutes: z.number(),
    actualMinutes: z.number().optional(),
  }),
  completedAt: z.string().optional(),
  createdAt: z.string().optional(),
  deadline: z.string().nullable().optional(),
});

const PlanBlockSchema = z.object({
  id: z.string(),
  type: z.enum(['TASK', 'EVENT', 'BREAK', 'BUFFER']),
  sourceId: z.string().nullable(),
  start: z.string(),
  end: z.string(),
});

export const ReflectionAnalyzerInputSchema = z.object({
  userId: z.string(),
  tasks: z.array(TaskSchema).describe('Tasks from the period'),
  plan: z
    .object({
      date: z.string(),
      blocks: z.array(PlanBlockSchema),
    })
    .optional(),
  date: z.string().describe('Analysis date'),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

// ==================== OUTPUT ====================

const MetricsSchema = z.object({
  completionRate: z.number().min(0).max(100),
  onTimeRate: z.number().min(0).max(100).optional(),
  averageOverrunPercent: z.number().optional(),
  focusTimeMinutes: z.number(),
  totalTasksCompleted: z.number(),
  totalTasksPending: z.number(),
});

const PatternSchema = z.object({
  type: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  description: z.string(),
  occurrences: z.number(),
  trend: z.enum(['IMPROVING', 'STABLE', 'DECLINING']),
  confidence: z.number().min(0).max(1),
});

const InsightSchema = z.object({
  category: z.enum(['TIME_MANAGEMENT', 'PRIORITY_HANDLING', 'FOCUS', 'ESTIMATION', 'HABITS']),
  insight: z.string(),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});

const RecommendationSchema = z.object({
  type: z.enum(['SCHEDULING', 'PRIORITIZATION', 'TIME_MANAGEMENT', 'GOAL_SETTING']),
  message: z.string(),
  priority: z.number().min(1).max(5),
  actionable: z.boolean(),
});

const AchievementSchema = z.object({
  type: z.enum(['TASK', 'MILESTONE', 'GOAL', 'STREAK']),
  title: z.string(),
  description: z.string(),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
});

export const ReflectionAnalyzerOutputSchema = z.object({
  metrics: MetricsSchema,
  patterns: z.array(PatternSchema),
  insights: z.array(InsightSchema),
  recommendations: z.array(RecommendationSchema),
  achievements: z.array(AchievementSchema),
  summary: z.string().describe('Human-readable daily summary'),
  productivityScore: z.number().min(0).max(100),
});

// ==================== TYPE EXPORTS ====================

export type ReflectionAnalyzerInput = z.infer<typeof ReflectionAnalyzerInputSchema>;
export type ReflectionAnalyzerOutput = z.infer<typeof ReflectionAnalyzerOutputSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type Insight = z.infer<typeof InsightSchema>;
