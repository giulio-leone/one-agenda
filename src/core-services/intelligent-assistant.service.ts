/**
 * Intelligent Assistant Service
 *
 * Main service orchestrating the agent mesh for OneAgenda features.
 * Provides high-level API for:
 * - Dynamic planning and scheduling
 * - Automatic task reorganization
 * - Goal management with progress tracking
 * - Activity suggestions with incremental challenge
 *
 * @deprecated This service is an adapter for the SDK 3.1 Agenda Generation Service.
 * Consider using AgendaGenerationService directly for new features.
 */

import {
  generateAgenda,
  type AgendaPlannerInput,
  type AgendaPlannerOutput,
} from './agenda-generation.service';
import { oneagendaDB, type AgendaUserPreferencesUpdate } from '../core-db';
import type { Task, Goal, Milestone, CalendarEvent, UserPreferences } from '../core-domain';
import { createDefaultUserPreferences } from '../core-domain/user-preferences';
import { logger } from '@giulio-leone/lib-shared';

/**
 * Schedule result
 */
export interface ScheduleResult {
  schedule: {
    date: string;
    blocks: Array<{
      id: string;
      type: 'TASK' | 'EVENT' | 'BREAK' | 'BUFFER';
      title: string;
      start: string;
      end: string;
    }>;
  };
  scheduledTasks: Array<{
    taskId: string;
    scheduledStart: string;
    scheduledEnd: string;
  }>;
  unscheduledTasks: Task[];
  recommendations: string[];
}

/**
 * Progress report
 */
export interface ProgressReport {
  summary: {
    tasksCompleted: number;
    goalsOnTrack: number;
    productivityScore: number;
  };
  achievements: Array<{
    title: string;
    completedAt: string;
    impact: string;
  }>;
  insights: {
    strengths: string[];
    improvements: string[];
    patterns: string[];
  };
  recommendations: Array<{
    message: string;
    priority: number;
  }>;
}

/**
 * Intelligent Assistant Service implementation using proper SDK 3.1 agents
 */
export class IntelligentAssistantService {
  constructor() {
    // No initialization needed for stateless SDK 3.1 service calls
  }

  /**
   * Plan the work day dynamically with adaptive rescheduling
   */
  async planDay(input: {
    userId: string;
    date: string;
    tasks: Task[];
    events: CalendarEvent[];
  }): Promise<ScheduleResult> {
    try {
      // 1. Get user preferences (or default)
      const preferences = await this.getPreferencesOrDefault(input.userId);

      // 2. Map to Agent Input
      const agentInput: AgendaPlannerInput = {
        userId: input.userId,
        date: input.date,
        tasks: this.mapTasksToAgentInput(input.tasks),
        events: this.mapEventsToAgentInput(input.events),
        preferences: this.mapPreferencesToAgentInput(preferences),
        mode: 'PLAN',
      };

      // 3. Execute Agenda Planner
      const output = await generateAgenda(agentInput);

      // 4. Map Output to Result
      return this.mapAgentOutputToScheduleResult(output, input.tasks);
    } catch (error) {
      logger.error('IntelligentAssistantService.planDay failed', { error, userId: input.userId });
      // Fallback response on error
      return {
        schedule: { date: input.date, blocks: [] },
        scheduledTasks: [],
        unscheduledTasks: input.tasks,
        recommendations: ['Unable to generate schedule. Please try again later.'],
      };
    }
  }

  /**
   * Automatically reorganize tasks and priorities based on context
   */
  async reorganizeTasks(input: {
    userId: string;
    tasks: Task[];
    context: {
      newDeadline?: { taskId: string; deadline: string };
      completedTasks?: string[];
      blockedTasks?: Array<{ taskId: string; reason: string }>;
    };
  }): Promise<ScheduleResult> {
    try {
      // 1. Update task statuses in DB first (legacy behavior preservation)
      if (input.context.completedTasks) {
        for (const taskId of input.context.completedTasks) {
          await oneagendaDB.updateTask(taskId, input.userId, {
            status: 'COMPLETED',
            completedAt: new Date(),
          });
        }
      }

      if (input.context.blockedTasks) {
        for (const { taskId, reason } of input.context.blockedTasks) {
          await oneagendaDB.updateTask(taskId, input.userId, {
            status: 'BLOCKED',
            blockedBy: [reason], // Simplified: treating reason as blocker ID or description
          });
        }
      }

      // 2. Re-plan (REPLAN mode)
      const today = new Date().toISOString().split('T')[0] as string;
      const preferences = await this.getPreferencesOrDefault(input.userId);

      const agentInput: AgendaPlannerInput = {
        userId: input.userId,
        date: today,
        tasks: this.mapTasksToAgentInput(input.tasks),
        events: [], // Should ideally fetch events, but retaining interface signature
        preferences: this.mapPreferencesToAgentInput(preferences),
        mode: 'REPLAN',
      };

      const output = await generateAgenda(agentInput);
      return this.mapAgentOutputToScheduleResult(output, input.tasks);
    } catch (error) {
      logger.error('IntelligentAssistantService.reorganizeTasks failed', {
        error,
        userId: input.userId,
      });
      return {
        schedule: { date: new Date().toISOString(), blocks: [] },
        scheduledTasks: [],
        unscheduledTasks: input.tasks,
        recommendations: ['Failed to reorganize tasks.'],
      };
    }
  }

  /**
   * Track progress at task, milestone, and goal levels
   */
  async trackProgress(input: {
    userId: string;
    tasks: Task[];
    goals: Goal[];
    milestones: Milestone[];
    periodStart: string;
    periodEnd: string;
  }): Promise<ProgressReport> {
    try {
      const preferences = await this.getPreferencesOrDefault(input.userId);

      const agentInput: AgendaPlannerInput = {
        userId: input.userId,
        date: input.periodEnd, // Use end date as reference
        tasks: this.mapTasksToAgentInput(input.tasks),
        events: [],
        goals: input.goals.map((g) => ({
          id: g.id,
          title: g.title,
          status: g.status,
          deadline: g.targetDate,
          priority: 'MEDIUM',
        })),
        milestones: input.milestones.map((m) => ({
          id: m.id,
          goalId: m.goalId,
          title: m.title,
          status: m.status,
          deadline: m.targetDate,
        })),
        preferences: this.mapPreferencesToAgentInput(preferences),
        mode: 'REFLECT',
      };

      const output = await generateAgenda(agentInput);

      return {
        summary: {
          tasksCompleted: output.metrics?.completedTasks ?? 0,
          goalsOnTrack: output.metrics?.goalsOnTrack ?? 0,
          productivityScore: output.metrics?.productivityScore ?? 0,
        },
        achievements: (output.achievements ?? []).map((a) => ({
          title: a.title,
          completedAt: a.completedAt,
          impact: a.impact,
        })),
        insights: {
          strengths:
            output.insights?.filter((i) => i.category === 'STRENGTH').map((i) => i.insight) ?? [],
          improvements:
            output.insights?.filter((i) => i.category === 'IMPROVEMENT').map((i) => i.insight) ??
            [],
          patterns:
            output.insights?.filter((i) => i.category === 'PATTERN').map((i) => i.insight) ?? [],
        },
        recommendations: (output.recommendations ?? []).map((msg, idx) => ({
          message: msg,
          priority: idx + 1,
        })),
      };
    } catch (error) {
      logger.error('IntelligentAssistantService.trackProgress failed', {
        error,
        userId: input.userId,
      });
      // Return empty report
      return {
        summary: { tasksCompleted: 0, goalsOnTrack: 0, productivityScore: 0 },
        achievements: [],
        insights: { strengths: [], improvements: [], patterns: [] },
        recommendations: [],
      };
    }
  }

  /**
   * Suggest next activity with incremental challenge
   */
  async suggestNextActivity(input: {
    userId: string;
    currentContext: {
      timeAvailable: number;
      energyLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      recentTasks: Task[];
    };
  }): Promise<{
    suggestedTask?: Task;
    rationale: string;
    alternatives?: Task[];
    challenge?: {
      type: 'COMPLEXITY' | 'DURATION' | 'PRIORITY';
      description: string;
    };
  }> {
    // Use heuristic logic combined with light reflection if needed
    // For now, keeping the heuristic as it's fast and effective
    const { timeAvailable, energyLevel } = input.currentContext;

    let rationale = '';
    let challenge:
      | { type: 'COMPLEXITY' | 'DURATION' | 'PRIORITY'; description: string }
      | undefined;

    if (energyLevel === 'HIGH' && timeAvailable >= 60) {
      rationale = 'High energy and sufficient time available - perfect for deep focus work';
      challenge = {
        type: 'COMPLEXITY',
        description: 'Take on a complex task to maximize your peak energy',
      };
    } else if (energyLevel === 'MEDIUM' && timeAvailable >= 30) {
      rationale = 'Good energy for moderate complexity tasks';
      challenge = {
        type: 'DURATION',
        description: 'Complete multiple related tasks in this session',
      };
    } else {
      rationale = 'Time for quick wins or administrative tasks';
      challenge = { type: 'PRIORITY', description: 'Clear some high-priority but simple tasks' };
    }

    return {
      rationale,
      challenge,
    };
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>
  ): Promise<UserPreferences> {
    try {
      // Direct DB update
      await oneagendaDB.updateUserPreferences(
        userId,
        preferences as Partial<AgendaUserPreferencesUpdate>
      );

      // Map return type (minimal map needed if types align)
      // oneagendaDB definition matches partial UserPreferences shape roughly
      // We'll rely on createDefaultUserPreferences to fill gaps if we were fetching fresh, but here we return strict update result

      // Merging with full user object to satisfy return type
      const current = await this.getPreferencesOrDefault(userId);
      return {
        ...current,
        ...(preferences as Partial<UserPreferences>),
      } as UserPreferences;
    } catch (error) {
      throw new Error(`Failed to update preferences: ${(error as Error).message}`);
    }
  }

  /**
   * Get personalized insights
   */
  async getInsights(userId: string): Promise<{
    patterns: Array<{ type: string; description: string }>;
    recommendations: Array<{ message: string; priority: number }>;
  }> {
    // Generate reflection agenda (dummy input)
    try {
      const preferences = await this.getPreferencesOrDefault(userId);
      const output = await generateAgenda({
        userId,
        date: new Date().toISOString(),
        tasks: [],
        events: [],
        preferences: this.mapPreferencesToAgentInput(preferences),
        mode: 'REFLECT',
      });

      return {
        patterns:
          output.insights
            ?.filter((i) => i.category === 'PATTERN')
            .map((i) => ({ type: 'PATTERN', description: i.insight })) ?? [],
        recommendations: (output.recommendations ?? []).map((msg, idx) => ({
          message: msg,
          priority: idx + 1,
        })),
      };
    } catch (_error) {
      // Return empty report on error
      return { patterns: [], recommendations: [] };
    }
  }

  // ==================== HELPERS ====================

  private async getPreferencesOrDefault(userId: string): Promise<UserPreferences> {
    try {
      const prefs = await oneagendaDB.getUserPreferences(userId);
      if (prefs) {
        // Map partial DB storage to full domain object (using default factory as base)
        const defaults = createDefaultUserPreferences(userId);
        return {
          ...defaults,
          ...Object.fromEntries(Object.entries(prefs).filter(([_, v]) => v != null)), // Filter out nulls
          timezone: prefs.timezone || defaults.timezone,
          // Deep merge for nested config if needed, here assuming generic spread is okay for top level override
          scheduling: {
            ...defaults.scheduling,
            ...(prefs.focusBlocks !== undefined ? { protectFocusBlocks: !!prefs.focusBlocks } : {}),
          },
          // Note: DB structure in db.ts is much flatter than domain UserPreferences.
          // In a real scenario we'd need better mapping.
          // For now, using default is safest if DB format is divergent.
        };
      }
      return createDefaultUserPreferences(userId);
    } catch {
      return createDefaultUserPreferences(userId);
    }
  }

  private mapTasksToAgentInput(tasks: Task[]): AgendaPlannerInput['tasks'] {
    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority:
        t.priority === 'CRITICAL'
          ? 'CRITICAL'
          : t.priority === 'HIGH'
            ? 'HIGH'
            : t.priority === 'LOW'
              ? 'LOW'
              : 'MEDIUM',
      effort: {
        estimatedMinutes: t.effort.estimatedMinutes,
        complexity: t.effort.complexity as 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'VERY_COMPLEX',
      },
      deadline: t.deadline,
      dependencies: t.dependencies,
      tags: t.tags,
      scheduledStart: t.scheduledStart,
      scheduledEnd: t.scheduledEnd,
    }));
  }

  private mapEventsToAgentInput(events: CalendarEvent[]): AgendaPlannerInput['events'] {
    return events.map((e) => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      type: e.type as 'MEETING' | 'FOCUS' | 'BREAK' | 'OTHER',
      source: e.source as 'INTERNAL' | 'GOOGLE' | 'OUTLOOK',
      flexibility: 'FIXED',
      attendees: e.attendees,
    }));
  }

  private mapPreferencesToAgentInput(prefs: UserPreferences): AgendaPlannerInput['preferences'] {
    return {
      userId: prefs.userId,
      timezone: prefs.timezone,
      workingHours: prefs.workingHours.map((wh) => ({
        dayOfWeek: wh.dayOfWeek,
        startTime: wh.startTime,
        endTime: wh.endTime,
        enabled: wh.enabled,
      })),
      breaks: {
        breakDurationMinutes: prefs.breaks.breakDurationMinutes,
        breakFrequencyMinutes: prefs.breaks.breakAfterMinutes, // Approximation
      },
      scheduling: {
        allowTaskSplitting: prefs.scheduling.allowTaskSplitting,
        bufferBetweenTasksMinutes: prefs.scheduling.bufferBetweenTasksMinutes,
      },
    };
  }

  private mapAgentOutputToScheduleResult(
    output: AgendaPlannerOutput,
    originalTasks: Task[]
  ): ScheduleResult {
    return {
      schedule: {
        date: (output.plan?.date || new Date().toISOString().split('T')[0]) as string,
        blocks: (output.plan?.blocks || []).map((b) => ({
          id: b.id,
          type: b.type as 'TASK' | 'EVENT' | 'BREAK' | 'BUFFER',
          title: b.title,
          start: b.start,
          end: b.end,
        })),
      },
      scheduledTasks: output.scheduledTasks,
      unscheduledTasks: originalTasks.filter(
        (t) => !output.scheduledTasks.find((st) => st.taskId === t.id)
      ),
      recommendations: output.recommendations,
    };
  }
}
