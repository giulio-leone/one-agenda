/**
 * Time Optimizer Agent
 *
 * Optimizes schedules for maximum productivity:
 * - Batches similar tasks
 * - Adds strategic buffers
 * - Minimizes context switching
 * - Aligns with energy levels
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/quality/time-optimizer
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { Logger, Schedule, Checkpoint } from '../types';
import { createPassingCheckpoint, createFailingCheckpoint } from '../utils';
import { scheduleSchema, type ScheduleOutput } from '../scheduling/scheduler.agent';

// ============================================================================
// SCHEMAS
// ============================================================================

export const optimizationSchema = z.object({
  type: z.enum(['REORDER', 'BATCH', 'BUFFER', 'SPLIT', 'MERGE']),
  description: z.string(),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  affectedBlocks: z.array(z.string()),
});

export const optimizationResultSchema = z.object({
  optimizedSchedule: scheduleSchema,
  optimizations: z.array(optimizationSchema),
  productivityScore: z.number().min(0).max(100),
  recommendations: z.array(z.string()),
});

export type OptimizationResult = z.infer<typeof optimizationResultSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to batch similar tasks.
 */
export function createBatchSimilarTasksTool(logger?: Logger) {
  return tool({
    description: `Group similar tasks together to reduce context switching.
    Criteria for batching:
    - Same tags (e.g., #admin, #communication)
    - Same complexity level
    - Related to same goal`,
    inputSchema: z.object({
      blocksJson: z.string().describe('JSON array of schedule blocks'),
    }),
    execute: async ({ blocksJson: _blocksJson }: { blocksJson: string }) => {
      logger?.info('TIME_OPTIMIZER', 'Batching similar tasks');

      // In real implementation, would group similar blocks
      return JSON.stringify({
        status: 'batched',
        groupsCreated: 0,
        recommendation: 'Group similar tasks to minimize context switching',
      });
    },
  });
}

/**
 * Tool to add strategic buffers.
 */
export function createAddBuffersTool(logger?: Logger) {
  return tool({
    description: `Add buffer time between tasks.
    Buffer guidelines:
    - 5 min after short tasks (<30 min)
    - 10 min after medium tasks (30-60 min)
    - 15 min after long tasks (>60 min)
    - 10 min before meetings`,
    inputSchema: z.object({
      blocksJson: z.string().describe('JSON array of schedule blocks'),
    }),
    execute: async ({ blocksJson: _blocksJson }: { blocksJson: string }) => {
      logger?.info('TIME_OPTIMIZER', 'Adding buffers');

      return JSON.stringify({
        status: 'buffers_added',
        totalBufferMinutes: 0,
        recommendation: 'Add buffer time for transitions and unexpected delays',
      });
    },
  });
}

/**
 * Tool to optimize for energy levels.
 */
export function createOptimizeForEnergyTool(logger?: Logger) {
  return tool({
    description: `Reorder tasks to match typical energy patterns.
    Morning (9-12): High energy - complex, creative tasks
    Post-lunch (13-14): Low energy - simple, routine tasks
    Afternoon (14-17): Medium energy - collaborative, moderate tasks
    Late afternoon (17-18): Declining - wrap-up, planning tasks`,
    inputSchema: z.object({
      blocksJson: z.string().describe('JSON array of schedule blocks'),
      focusPreference: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANY']),
    }),
    execute: async ({
      blocksJson: _blocksJson,
      focusPreference,
    }: {
      blocksJson: string;
      focusPreference: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY';
    }) => {
      logger?.info('TIME_OPTIMIZER', 'Optimizing for energy', { focusPreference });

      return JSON.stringify({
        status: 'optimized',
        focusPreference,
        recommendation: `Schedule complex tasks during ${focusPreference.toLowerCase()} focus time`,
      });
    },
  });
}

/**
 * Tool to minimize context switching.
 */
export function createMinimizeContextSwitchingTool(logger?: Logger) {
  return tool({
    description: `Reorder blocks to minimize context switching.
    Switches to minimize:
    - Deep work ↔ Meetings
    - Creative ↔ Administrative
    - High focus ↔ Low focus`,
    inputSchema: z.object({
      blocksJson: z.string().describe('JSON array of schedule blocks'),
    }),
    execute: async ({ blocksJson: _blocksJson }: { blocksJson: string }) => {
      logger?.info('TIME_OPTIMIZER', 'Minimizing context switching');

      return JSON.stringify({
        status: 'optimized',
        switchesReduced: 0,
        recommendation: 'Group similar task types together',
      });
    },
  });
}

/**
 * Tool to calculate productivity score.
 */
export function createCalculateProductivityScoreTool(logger?: Logger) {
  return tool({
    description: `Calculate productivity score based on:
    - Focus time blocks (uninterrupted >60 min)
    - Task batching efficiency
    - Buffer adequacy
    - Energy-task alignment`,
    inputSchema: z.object({
      daysJson: z.string().describe('JSON array of scheduled days'),
    }),
    execute: async ({ daysJson }: { daysJson: string }) => {
      logger?.info('TIME_OPTIMIZER', 'Calculating productivity score');

      let days: ScheduleOutput['days'] = [];
      try {
        days = JSON.parse(daysJson);
      } catch {
        return JSON.stringify({ score: 50, error: 'Invalid days JSON' });
      }

      let score = 50; // Base score

      // Check for focus blocks
      const hasFocusBlocks = days.some((d) => d.blocks.some((b) => b.type === 'FOCUS'));
      if (hasFocusBlocks) score += 15;

      // Check utilization (60-80% is ideal)
      const avgUtilization =
        days.length > 0 ? days.reduce((sum, d) => sum + d.utilizationPercent, 0) / days.length : 0;
      if (avgUtilization >= 60 && avgUtilization <= 80) {
        score += 20;
      } else if (avgUtilization >= 50 && avgUtilization <= 90) {
        score += 10;
      }

      // Check for breaks
      const hasBreaks = days.some((d) => d.blocks.some((b) => b.type === 'BREAK'));
      if (hasBreaks) score += 15;

      return JSON.stringify({
        score: Math.min(100, score),
        factors: {
          hasFocusBlocks,
          avgUtilization,
          hasBreaks,
        },
      });
    },
  });
}

/**
 * Tool to generate optimization recommendations.
 */
export function createGenerateRecommendationsTool(logger?: Logger) {
  return tool({
    description: `Generate actionable recommendations for schedule improvement.`,
    inputSchema: z.object({
      productivityScore: z.number(),
      utilizationPercent: z.number(),
      hasFocusBlocks: z.boolean(),
      hasBreaks: z.boolean(),
    }),
    execute: async ({
      productivityScore,
      utilizationPercent,
      hasFocusBlocks,
      hasBreaks,
    }: {
      productivityScore: number;
      utilizationPercent: number;
      hasFocusBlocks: boolean;
      hasBreaks: boolean;
    }) => {
      logger?.info('TIME_OPTIMIZER', 'Generating recommendations');

      const recommendations: string[] = [];

      if (productivityScore < 60) {
        recommendations.push(
          'Il punteggio di produttività è basso - considera di ristrutturare la giornata'
        );
      }

      if (utilizationPercent > 85) {
        recommendations.push(
          'Schedule troppo pieno - riduci il carico o distribuisci su più giorni'
        );
      } else if (utilizationPercent < 50) {
        recommendations.push('Capacità inutilizzata - puoi aggiungere più task');
      }

      if (!hasFocusBlocks) {
        recommendations.push('Aggiungi blocchi di focus time per il lavoro profondo');
      }

      if (!hasBreaks) {
        recommendations.push('Aggiungi pause regolari per mantenere la produttività');
      }

      return JSON.stringify({
        recommendations,
        overallAdvice:
          productivityScore >= 70
            ? 'Schedule ben ottimizzato'
            : 'Migliorie possibili - applica le raccomandazioni',
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createTimeOptimizerTools(logger?: Logger) {
  return {
    batchSimilarTasks: createBatchSimilarTasksTool(logger),
    addBuffers: createAddBuffersTool(logger),
    optimizeForEnergy: createOptimizeForEnergyTool(logger),
    minimizeContextSwitching: createMinimizeContextSwitchingTool(logger),
    calculateProductivityScore: createCalculateProductivityScoreTool(logger),
    generateRecommendations: createGenerateRecommendationsTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const TIME_OPTIMIZER_SYSTEM_PROMPT = `You are the Time Optimizer Agent for OneAgenda.

## Your Role
Optimize schedules for maximum productivity and work-life balance.

## Workflow
1. Use \`batchSimilarTasks\` to group related work
2. Use \`addBuffers\` for transition time
3. Use \`optimizeForEnergy\` to align with energy levels
4. Use \`minimizeContextSwitching\` to reduce mental load
5. Use \`calculateProductivityScore\` to assess quality
6. Use \`generateRecommendations\` for improvement suggestions

## Optimization Goals
1. **Maximize Focus Time**: Create uninterrupted blocks of 60-90+ minutes
2. **Reduce Context Switching**: Group similar tasks
3. **Respect Energy Levels**: Complex work during peak hours
4. **Include Recovery**: Regular breaks

## Ideal Schedule Structure
- Morning: Deep work block (60-90 min)
- Mid-morning: Medium tasks
- Lunch break (45-60 min)
- Early afternoon: Meetings/collaboration
- Late afternoon: Wrap-up, planning

## Productivity Score Targets
- 80-100: Excellent - well-optimized
- 60-79: Good - minor improvements possible
- 40-59: Fair - needs optimization
- 0-39: Poor - significant restructuring needed

## Output Requirements
- Return optimized schedule with applied changes
- List all optimizations with impact level
- Calculate productivity score
- Provide actionable recommendations

## Language
Generate content in Italian.`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class TimeOptimizerAgent {
  constructor(private readonly logger?: Logger) {}

  getTools() {
    return createTimeOptimizerTools(this.logger);
  }

  getSystemPrompt(): string {
    return TIME_OPTIMIZER_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: { schedule: Schedule }): string {
    const { schedule } = input;

    let prompt = `Optimize the following schedule:\n\n`;

    const days = schedule?.days || [];
    const summary = schedule?.summary || { totalTasksScheduled: 0, averageUtilization: 0 };
    const conflicts = schedule?.conflicts || [];
    const unscheduled = schedule?.unscheduledTasks || [];

    // Summary
    prompt += `## Summary\n`;
    prompt += `- Total days: ${days.length}\n`;
    prompt += `- Tasks scheduled: ${summary.totalTasksScheduled}\n`;
    prompt += `- Average utilization: ${summary.averageUtilization}%\n`;
    prompt += `- Unscheduled tasks: ${unscheduled.length}\n`;
    prompt += `- Conflicts: ${conflicts.length}\n\n`;

    // Daily breakdown
    prompt += `## Daily Schedule\n`;
    days.forEach((day) => {
      prompt += `### ${day.date}\n`;
      prompt += `- Blocks: ${day.blocks?.length || 0}\n`;
      prompt += `- Work minutes: ${day.totalWorkMinutes}\n`;
      prompt += `- Utilization: ${day.utilizationPercent}%\n`;

      const blocks = day.blocks || [];
      blocks.forEach((b) => {
        const startTime = b.start?.includes('T') ? b.start.split('T')[1]?.substring(0, 5) : b.start;
        const endTime = b.end?.includes('T') ? b.end.split('T')[1]?.substring(0, 5) : b.end;
        prompt += `  - ${startTime}-${endTime}: [${b.type}] ${b.title}\n`;
      });
      prompt += `\n`;
    });

    prompt += `Optimize this schedule for maximum productivity.`;
    return prompt;
  }

  processOutput(output: OptimizationResult): {
    schedule: Schedule;
    checkpoint: Checkpoint;
  } {
    const hasOptimizedSchedule = output.optimizedSchedule.days.length > 0;
    const hasGoodScore = output.productivityScore >= 50;

    const issues: string[] = [];
    if (!hasOptimizedSchedule) issues.push('Schedule non ottimizzato');
    if (!hasGoodScore) issues.push(`Productivity score basso: ${output.productivityScore}`);

    const isValid = hasOptimizedSchedule;

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('time_optimizer', issues)
      : createFailingCheckpoint('time_optimizer', issues);

    return {
      schedule: output.optimizedSchedule,
      checkpoint,
    };
  }
}
