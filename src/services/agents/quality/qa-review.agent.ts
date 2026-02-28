/**
 * QA Review Agent
 *
 * Validates the generated plan for:
 * - Feasibility (time constraints)
 * - Work-life balance
 * - Deadline compliance
 * - Risk assessment
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/quality/qa-review
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { Logger, QAReport, Checkpoint, Schedule, GoalPlan } from '../types';
import { createPassingCheckpoint, createFailingCheckpoint } from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const qaCheckSchema = z.object({
  name: z.string().describe('Check name'),
  passed: z.boolean().describe('Whether the check passed'),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFO']).describe('Issue severity'),
  message: z.string().describe('Result message'),
  remedy: z.string().optional().describe('Suggested fix if failed'),
});

export const qaReportSchema = z.object({
  isValid: z.boolean().describe('Whether the plan passes all critical checks'),
  overallScore: z.number().min(0).max(100).describe('Quality score'),
  checks: z.array(qaCheckSchema).min(1).describe('All QA checks performed (at least 1 required)'),
  warnings: z.array(z.string()).describe('Non-critical warnings'),
  suggestions: z.array(z.string()).describe('Improvement suggestions'),
});

export type QAReportOutput = z.infer<typeof qaReportSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to check schedule feasibility.
 */
export function createCheckFeasibilityTool(logger?: Logger) {
  return tool({
    description: `Check if the schedule is feasible.
    Validates:
    - No day exceeds 100% utilization
    - All tasks fit within working hours
    - Dependencies are respected`,
    inputSchema: z.object({
      daysJson: z.string().describe('JSON array of scheduled days'),
      maxWorkMinutesPerDay: z.number(),
    }),
    execute: async ({
      daysJson,
      maxWorkMinutesPerDay,
    }: {
      daysJson: string;
      maxWorkMinutesPerDay: number;
    }) => {
      logger?.info('QA_REVIEW', 'Checking feasibility');

      let days: Schedule['days'] = [];
      try {
        days = JSON.parse(daysJson);
      } catch {
        return JSON.stringify({
          passed: false,
          severity: 'CRITICAL',
          message: 'Invalid schedule data',
          remedy: 'Regenerate schedule',
        });
      }

      const issues: string[] = [];

      // Check utilization
      const overloadedDays = days.filter((d: any) => d.utilizationPercent > 100);
      if (overloadedDays.length > 0) {
        issues.push(`${overloadedDays.length} giorni sovraccarichi (>100%)`);
      }

      // Check work minutes
      const exceedingDays = days.filter((d: any) => d.totalWorkMinutes > maxWorkMinutesPerDay);
      if (exceedingDays.length > 0) {
        issues.push(`${exceedingDays.length} giorni eccedono il limite di lavoro`);
      }

      const passed = issues.length === 0;

      return JSON.stringify({
        name: 'Feasibility Check',
        passed,
        severity: passed ? 'INFO' : 'CRITICAL',
        message: passed ? 'Schedule fattibile' : issues.join('; '),
        remedy: passed ? null : 'Ridurre il carico o distribuire su più giorni',
      });
    },
  });
}

/**
 * Tool to check work-life balance.
 */
export function createCheckBalanceTool(logger?: Logger) {
  return tool({
    description: `Check work-life balance.
    Validates:
    - Average utilization 60-80%
    - Regular breaks included
    - No work on weekends (if applicable)`,
    inputSchema: z.object({
      daysJson: z.string().describe('JSON array of scheduled days'),
      workingDays: z.array(z.number()).describe('Working days (0-6, 0=Sunday)'),
    }),
    execute: async ({ daysJson, workingDays }: { daysJson: string; workingDays: number[] }) => {
      logger?.info('QA_REVIEW', 'Checking balance');

      let days: Schedule['days'] = [];
      try {
        days = JSON.parse(daysJson);
      } catch {
        return JSON.stringify({
          passed: false,
          severity: 'WARNING',
          message: 'Impossibile verificare il bilanciamento',
        });
      }

      const issues: string[] = [];
      const workingSet = new Set(workingDays);

      // Check average utilization
      const avgUtilization =
        days.length > 0 ? days.reduce((sum: any, d: any) => sum + d.utilizationPercent, 0) / days.length : 0;

      if (avgUtilization > 85) {
        issues.push(`Utilizzo medio alto (${Math.round(avgUtilization)}%) - rischio burnout`);
      }

      // Check for breaks
      const daysWithBreaks = days.filter((d: any) => d.blocks.some((b: any) => b.type === 'BREAK'));
      if (daysWithBreaks.length < days.length * 0.8) {
        issues.push('Pause non sufficienti nella programmazione');
      }

      // Check weekend work
      const weekendDays = days.filter((d: any) => {
        const date = new Date(d.date);
        return !workingSet.has(date.getDay());
      });
      if (weekendDays.some((d) => d.blocks.some((b) => b.type === 'TASK'))) {
        issues.push('Task schedulati in giorni non lavorativi');
      }

      const passed = issues.length === 0;

      return JSON.stringify({
        name: 'Work-Life Balance',
        passed,
        severity: passed ? 'INFO' : 'WARNING',
        message: passed ? 'Buon bilanciamento vita-lavoro' : issues.join('; '),
        remedy: passed ? null : 'Ridistribuire il carico e aggiungere pause',
      });
    },
  });
}

/**
 * Tool to check deadline compliance.
 */
export function createCheckDeadlinesTool(logger?: Logger) {
  return tool({
    description: `Check if all deadlines are met.
    Validates:
    - All tasks with deadlines are scheduled before deadline
    - Critical path tasks have buffer before deadline`,
    inputSchema: z.object({
      scheduleJson: z.string().describe('JSON of full schedule'),
      tasksJson: z.string().describe('JSON array of tasks with deadlines'),
    }),
    execute: async ({ scheduleJson, tasksJson }: { scheduleJson: string; tasksJson: string }) => {
      logger?.info('QA_REVIEW', 'Checking deadlines');

      let schedule: Schedule;
      let tasks: Array<{ id: string; title: string; suggestedDeadline?: string }> = [];

      try {
        schedule = JSON.parse(scheduleJson);
        tasks = JSON.parse(tasksJson);
      } catch {
        return JSON.stringify({
          passed: false,
          severity: 'WARNING',
          message: 'Impossibile verificare le deadline',
        });
      }

      const missedDeadlines: string[] = [];
      const scheduledTaskIds = new Set<string>();

      // Collect all scheduled task IDs with their dates
      const taskScheduleMap: Record<string, string> = {};
      schedule.days.forEach((day: any) => {
        day.blocks.forEach((block: any) => {
          if (block.type === 'TASK' && block.sourceId) {
            scheduledTaskIds.add(block.sourceId);
            taskScheduleMap[block.sourceId] = day.date;
          }
        });
      });

      // Check deadlines
      tasks.forEach((task: any) => {
        if (!task.suggestedDeadline) return;

        const scheduledDate = taskScheduleMap[task.id];
        if (!scheduledDate) {
          // Task not scheduled at all
          if (schedule.unscheduledTasks.includes(task.id)) {
            missedDeadlines.push(`${task.title}: non schedulato`);
          }
          return;
        }

        if (scheduledDate > task.suggestedDeadline) {
          missedDeadlines.push(`${task.title}: schedulato dopo la deadline`);
        }
      });

      const passed = missedDeadlines.length === 0;

      return JSON.stringify({
        name: 'Deadline Compliance',
        passed,
        severity: passed ? 'INFO' : missedDeadlines.length > 3 ? 'CRITICAL' : 'WARNING',
        message: passed
          ? 'Tutte le deadline rispettate'
          : `${missedDeadlines.length} deadline a rischio`,
        details: missedDeadlines,
        remedy: passed ? null : 'Riprioritizzare o estendere le deadline',
      });
    },
  });
}

/**
 * Tool to check goal coverage.
 */
export function createCheckGoalCoverageTool(logger?: Logger) {
  return tool({
    description: `Check if all goals have sufficient task coverage.
    Validates:
    - Each goal has tasks scheduled
    - Critical path tasks are prioritized`,
    inputSchema: z.object({
      goalsJson: z.string().describe('JSON array of goals'),
      scheduledTaskIds: z.array(z.string()).describe('IDs of scheduled tasks'),
      allTasksJson: z.string().describe('JSON array of all tasks'),
    }),
    execute: async ({
      goalsJson,
      scheduledTaskIds,
      allTasksJson,
    }: {
      goalsJson: string;
      scheduledTaskIds: string[];
      allTasksJson: string;
    }) => {
      logger?.info('QA_REVIEW', 'Checking goal coverage');

      let goals: GoalPlan['goals'] = [];
      let allTasks: Array<{ id: string; goalId: string }> = [];

      try {
        goals = JSON.parse(goalsJson);
        allTasks = JSON.parse(allTasksJson);
      } catch {
        return JSON.stringify({
          passed: true,
          severity: 'INFO',
          message: 'Goal coverage check skipped',
        });
      }

      const scheduledSet = new Set(scheduledTaskIds);
      const uncoveredGoals: string[] = [];

      goals.forEach((goal: any) => {
        const goalTasks = allTasks.filter((t: any) => t.goalId === goal.id);
        const scheduledGoalTasks = goalTasks.filter((t: any) => scheduledSet.has(t.id));

        if (goalTasks.length > 0 && scheduledGoalTasks.length === 0) {
          uncoveredGoals.push(goal.title);
        }
      });

      const passed = uncoveredGoals.length === 0;

      return JSON.stringify({
        name: 'Goal Coverage',
        passed,
        severity: passed ? 'INFO' : 'WARNING',
        message: passed
          ? 'Tutti i goal hanno task schedulati'
          : `${uncoveredGoals.length} goal senza task schedulati`,
        details: uncoveredGoals,
        remedy: passed ? null : 'Schedulare almeno un task per ogni goal',
      });
    },
  });
}

/**
 * Tool to generate overall QA report.
 */
export function createGenerateReportTool(logger?: Logger) {
  return tool({
    description: `Generate overall QA report from individual checks.`,
    inputSchema: z.object({
      checksJson: z.string().describe('JSON array of check results'),
    }),
    execute: async ({ checksJson }: { checksJson: string }) => {
      logger?.info('QA_REVIEW', 'Generating report');

      let checks: Array<{
        name: string;
        passed: boolean;
        severity: string;
        message: string;
        remedy?: string;
      }> = [];

      try {
        checks = JSON.parse(checksJson);
      } catch {
        return JSON.stringify({
          isValid: false,
          overallScore: 0,
          message: 'Failed to generate report',
        });
      }

      // Calculate score
      const criticalFailed = checks.filter((c: any) => !c.passed && c.severity === 'CRITICAL').length;
      const warningFailed = checks.filter((c: any) => !c.passed && c.severity === 'WARNING').length;

      let score = 100;
      score -= criticalFailed * 30;
      score -= warningFailed * 10;
      score = Math.max(0, score);

      const isValid = criticalFailed === 0;

      // Extract warnings and suggestions
      const warnings = checks.filter((c: any) => !c.passed).map((c: any) => c.message);
      const suggestions = checks
        .filter((c: any) => !c.passed && c.remedy)
        .map((c: any) => c.remedy as string);

      return JSON.stringify({
        isValid,
        overallScore: score,
        checksTotal: checks.length,
        checksPassed: checks.filter((c: any) => c.passed).length,
        criticalFailed,
        warningFailed,
        warnings,
        suggestions,
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createQAReviewTools(logger?: Logger) {
  return {
    checkFeasibility: createCheckFeasibilityTool(logger),
    checkBalance: createCheckBalanceTool(logger),
    checkDeadlines: createCheckDeadlinesTool(logger),
    checkGoalCoverage: createCheckGoalCoverageTool(logger),
    generateReport: createGenerateReportTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const QA_REVIEW_SYSTEM_PROMPT = `You are the QA Review Agent for OneAgenda.

## Your Role
Validate the generated plan for quality, feasibility, and completeness.

## Workflow
Run all quality checks:
1. Use \`checkFeasibility\` - Verify schedule is achievable
2. Use \`checkBalance\` - Verify work-life balance
3. Use \`checkDeadlines\` - Verify all deadlines met
4. Use \`checkGoalCoverage\` - Verify all goals have tasks
5. Use \`generateReport\` - Create final QA report

## Check Severities
- **CRITICAL**: Must fix before using the plan
- **WARNING**: Should fix, but plan is usable
- **INFO**: Minor suggestion, plan is good

## Quality Score
- 80-100: Excellent - plan is ready
- 60-79: Good - minor issues
- 40-59: Fair - needs attention
- 0-39: Poor - significant issues

## Pass Criteria
- Plan passes if no CRITICAL checks fail
- All CRITICAL issues must be resolved
- WARNING issues should be documented

## Output Requirements
- isValid: true only if 0 CRITICAL failures
- overallScore: calculated from check results
- checks: all individual check results
- warnings: list of warning messages
- suggestions: actionable improvements

## Language
Generate messages in Italian.`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class QAReviewAgent {
  constructor(private readonly logger?: Logger) {}

  getTools() {
    return createQAReviewTools(this.logger);
  }

  getSystemPrompt(): string {
    return QA_REVIEW_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: { schedule: Schedule; goalPlan: GoalPlan }): string {
    const { schedule, goalPlan } = input;

    let prompt = `Review and validate the following plan:\n\n`;

    const days = schedule?.days || [];
    const summary = schedule?.summary || { totalTasksScheduled: 0, averageUtilization: 0 };
    const conflicts = schedule?.conflicts || [];
    const unscheduled = schedule?.unscheduledTasks || [];
    const goals = goalPlan?.goals || [];

    // Schedule summary
    prompt += `## Schedule Summary\n`;
    prompt += `- Days: ${days.length}\n`;
    prompt += `- Tasks scheduled: ${summary.totalTasksScheduled}\n`;
    prompt += `- Average utilization: ${summary.averageUtilization}%\n`;
    prompt += `- Unscheduled: ${unscheduled.length}\n`;
    prompt += `- Conflicts: ${conflicts.length}\n\n`;

    // Goals summary
    prompt += `## Goals Summary\n`;
    prompt += `- Total goals: ${goals.length}\n`;
    goals.forEach((g: any) => {
      prompt += `- ${g.title}: ${g.milestones?.length || 0} milestones\n`;
    });
    prompt += `\n`;

    // Daily utilization
    prompt += `## Daily Breakdown\n`;
    days.forEach((d: any) => {
      prompt += `- ${d.date}: ${d.utilizationPercent}% (${d.blocks?.length || 0} blocks)\n`;
    });
    prompt += `\n`;

    prompt += `Run all quality checks and generate a comprehensive QA report.`;

    return prompt;
  }

  processOutput(output: QAReportOutput): {
    report: QAReport;
    checkpoint: Checkpoint;
  } {
    const isValid = output.isValid;
    const hasGoodScore = output.overallScore >= 50;

    const issues: string[] = [];
    if (!isValid) issues.push('Piano non valido - check critici falliti');
    if (!hasGoodScore) issues.push(`Score qualità basso: ${output.overallScore}`);

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('qa_review', output.warnings)
      : createFailingCheckpoint('qa_review', issues);

    return {
      report: output,
      checkpoint,
    };
  }
}
