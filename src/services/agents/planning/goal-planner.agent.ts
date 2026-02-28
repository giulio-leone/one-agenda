/**
 * Goal Planner Agent
 *
 * Structures goals with milestones, success metrics, and risk assessment.
 * Transforms extracted goals from IntentParser into complete goal plans.
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/planning/goal-planner
 */

import { tool } from 'ai';
import { z } from 'zod';
import type {
  Logger,
  GoalPlan,
  PlannedGoal,
  Checkpoint,
  ParsedIntent,
  UserContext,
} from '../types';
import { createPassingCheckpoint, createFailingCheckpoint, createId } from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const milestoneSchema = z.object({
  id: z.string().describe('Unique milestone ID'),
  name: z.string().describe('Milestone name'),
  description: z.string().optional().describe('Milestone description'),
  dueDate: z.string().describe('Milestone due date in YYYY-MM-DD format (REQUIRED)'),
  order: z.number().describe('Order within goal (1, 2, 3...)'),
});

export const goalRiskSchema = z.object({
  description: z.string().describe('Risk description'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).describe('Risk severity level'),
  mitigation: z.string().optional().describe('Suggested mitigation strategy'),
});

export const plannedGoalSchema = z.object({
  id: z.string().describe('Unique goal ID'),
  title: z.string().describe('Goal title'),
  description: z.string().describe('Detailed goal description'),
  timeHorizon: z.enum(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM']).describe('Time horizon'),
  targetDate: z.string().describe('Target completion date in ISO 8601'),
  milestones: z.array(milestoneSchema).min(2).describe('Goal milestones (at least 2 required)'),
  successMetrics: z
    .array(z.string())
    .min(1)
    .describe('Measurable success criteria (at least 1 required)'),
  risks: z.array(goalRiskSchema).default([]).describe('Identified risks'),
  dependencies: z.array(z.string()).default([]).describe('IDs of goals this depends on'),
});

export const goalConflictSchema = z.object({
  goalIds: z.array(z.string()).describe('IDs of conflicting goals'),
  description: z.string().describe('Description of the conflict'),
  resolution: z.string().optional().describe('Suggested resolution'),
});

export const goalPlanSchema = z.object({
  goals: z
    .array(plannedGoalSchema)
    .min(1)
    .describe('Structured goals with milestones (at least 1 required)'),
  priorityRanking: z.array(z.string()).default([]).describe('Goal IDs in priority order'),
  conflicts: z.array(goalConflictSchema).default([]).describe('Identified conflicts between goals'),
});

export type GoalPlanOutput = z.infer<typeof goalPlanSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to create goal structure.
 */
export function createGoalStructureTool(logger?: Logger) {
  return tool({
    description: `Create a structured goal from extracted information.
    Generates a unique ID and validates the goal structure.`,
    inputSchema: z.object({
      title: z.string().describe('Goal title'),
      description: z.string().describe('Goal description'),
      timeHorizon: z.enum(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM']),
      targetDate: z.string().describe('Target date in ISO 8601'),
    }),
    execute: async ({
      title,
      timeHorizon,
      targetDate,
    }: {
      title: string;
      timeHorizon: string;
      targetDate: string;
    }) => {
      const id = createId();
      logger?.info('GOAL_PLANNER', 'Creating goal structure', { id, title, timeHorizon });

      return JSON.stringify({
        id,
        status: 'structure_created',
        title,
        timeHorizon,
        targetDate,
      });
    },
  });
}

/**
 * Tool to decompose goal into milestones.
 */
export function createDecomposeMilestonesTool(logger?: Logger) {
  return tool({
    description: `Decompose a goal into measurable milestones.
    Each milestone should be a clear checkpoint toward the goal.
    Recommended: 3-5 milestones for SHORT_TERM, 4-7 for MEDIUM_TERM, 5-10 for LONG_TERM.`,
    inputSchema: z.object({
      goalId: z.string().describe('Goal ID'),
      goalTitle: z.string().describe('Goal title for context'),
      goalDescription: z.string().describe('Goal description'),
      targetDate: z.string().describe('Goal target date'),
      suggestedCount: z
        .number()
        .min(2)
        .max(10)
        .optional()
        .describe('Suggested number of milestones'),
    }),
    execute: async ({
      goalId,
      goalTitle,
      targetDate,
      suggestedCount = 4,
    }: {
      goalId: string;
      goalTitle: string;
      targetDate: string;
      suggestedCount?: number;
    }) => {
      logger?.info('GOAL_PLANNER', 'Decomposing milestones', {
        goalId,
        goalTitle,
        suggestedCount,
      });

      // Calculate milestone spacing
      const now = new Date();
      const target = new Date(targetDate);
      const totalDays = Math.max(
        1,
        Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      );
      const daysPerMilestone = Math.ceil(totalDays / suggestedCount);

      return JSON.stringify({
        goalId,
        status: 'ready_to_decompose',
        suggestedCount,
        totalDays,
        daysPerMilestone,
        recommendation: `Create ${suggestedCount} milestones, approximately ${daysPerMilestone} days apart`,
      });
    },
  });
}

/**
 * Tool to generate success metrics.
 */
export function createGenerateMetricsTool(logger?: Logger) {
  return tool({
    description: `Generate measurable success metrics for a goal.
    Metrics should be SMART: Specific, Measurable, Achievable, Relevant, Time-bound.`,
    inputSchema: z.object({
      goalTitle: z.string(),
      goalDescription: z.string(),
      milestoneCount: z.number(),
    }),
    execute: async ({
      goalTitle,
      milestoneCount,
    }: {
      goalTitle: string;
      milestoneCount: number;
    }) => {
      logger?.info('GOAL_PLANNER', 'Generating success metrics', { goalTitle, milestoneCount });

      return JSON.stringify({
        status: 'metrics_ready',
        goalTitle,
        milestoneCount,
        suggestion: `Generate 2-3 measurable metrics. Examples:
- "Complete X% of milestones by Y date"
- "Achieve specific outcome Z"
- "Maintain consistency of N units per week"`,
      });
    },
  });
}

/**
 * Tool to assess goal risks.
 */
export function createAssessRisksTool(logger?: Logger) {
  return tool({
    description: `Identify potential risks for achieving the goal.
    Consider: time constraints, resource availability, dependencies, complexity.`,
    inputSchema: z.object({
      goalTitle: z.string(),
      timeframeDays: z.number().describe('Days until target'),
      complexity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      hasDependencies: z.boolean(),
    }),
    execute: async ({
      goalTitle,
      timeframeDays,
      complexity,
      hasDependencies,
    }: {
      goalTitle: string;
      timeframeDays: number;
      complexity: string;
      hasDependencies: boolean;
    }) => {
      logger?.info('GOAL_PLANNER', 'Assessing risks', { goalTitle, timeframeDays, complexity });

      const risks: Array<{ description: string; severity: string; mitigation: string }> = [];

      // Time-based risks
      if (timeframeDays < 7) {
        risks.push({
          description: 'Timeframe molto stretto',
          severity: 'HIGH',
          mitigation: 'Prioritizzare e ridurre scope se necessario',
        });
      } else if (timeframeDays < 14) {
        risks.push({
          description: 'Timeframe limitato',
          severity: 'MEDIUM',
          mitigation: 'Monitorare progress giornalmente',
        });
      }

      // Complexity risks
      if (complexity === 'HIGH') {
        risks.push({
          description: 'Alta complessità',
          severity: 'MEDIUM',
          mitigation: 'Suddividere in task più piccoli e gestibili',
        });
      }

      // Dependency risks
      if (hasDependencies) {
        risks.push({
          description: 'Dipendenze esterne',
          severity: 'MEDIUM',
          mitigation: 'Identificare e monitorare le dipendenze critiche',
        });
      }

      return JSON.stringify({
        risks,
        assessedAt: new Date().toISOString(),
        riskLevel: risks.some((r) => r.severity === 'HIGH')
          ? 'HIGH'
          : risks.length > 0
            ? 'MEDIUM'
            : 'LOW',
      });
    },
  });
}

/**
 * Tool to validate goal for SMART criteria.
 */
export function createValidateGoalTool(logger?: Logger) {
  return tool({
    description: `Validate goal against SMART criteria:
    - Specific: Clear and well-defined
    - Measurable: Has quantifiable metrics
    - Achievable: Realistic given resources
    - Relevant: Aligned with user priorities
    - Time-bound: Has clear deadline`,
    inputSchema: z.object({
      goal: z.object({
        title: z.string(),
        description: z.string().optional(),
        targetDate: z.string().optional(),
        milestones: z.array(z.record(z.string(), z.unknown())).optional(),
        successMetrics: z.array(z.string()).optional(),
      }),
    }),
    execute: async ({
      goal,
    }: {
      goal: {
        title: string;
        description?: string;
        targetDate?: string;
        milestones?: unknown[];
        successMetrics?: string[];
      };
    }) => {
      logger?.info('GOAL_PLANNER', 'Validating goal', { title: goal.title });

      const checks = {
        specific: goal.title.length > 10 && (goal.description?.length || 0) > 20,
        measurable: (goal.successMetrics?.length || 0) > 0,
        achievable: true, // Would need more context
        relevant: true, // Would need user priorities
        timeBound: !!goal.targetDate,
        hasMilestones: (goal.milestones?.length || 0) >= 2,
      };

      const score = Object.values(checks).filter(Boolean).length * (100 / 6);
      const isValid = score >= 60;

      return JSON.stringify({
        checks,
        score: Math.round(score),
        isValid,
        missing: Object.entries(checks)
          .filter(([, v]) => !v)
          .map(([k]) => k),
      });
    },
  });
}

/**
 * Tool to check for conflicts between goals.
 */
export function createCheckConflictsTool(logger?: Logger) {
  return tool({
    description: `Check for conflicts between multiple goals.
    Look for: overlapping timelines, competing resources, contradicting objectives.`,
    inputSchema: z.object({
      goalsJson: z.string().describe('JSON array of goals to check'),
    }),
    execute: async ({ goalsJson }: { goalsJson: string }) => {
      logger?.info('GOAL_PLANNER', 'Checking for conflicts');

      let goals: PlannedGoal[] = [];
      try {
        goals = JSON.parse(goalsJson);
      } catch {
        return JSON.stringify({ conflicts: [], error: 'Invalid goals JSON' });
      }

      const conflicts: Array<{ goalIds: string[]; description: string }> = [];

      // Check for timeline overlaps with similar effort
      for (let i = 0; i < goals.length; i++) {
        for (let j = i + 1; j < goals.length; j++) {
          const g1 = goals[i];
          const g2 = goals[j];

          if (!g1 || !g2) continue;

          // Check if both are SHORT_TERM with similar deadlines
          if (g1.timeHorizon === 'SHORT_TERM' && g2.timeHorizon === 'SHORT_TERM') {
            const d1 = new Date(g1.targetDate);
            const d2 = new Date(g2.targetDate);
            const daysDiff = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);

            if (daysDiff < 3) {
              conflicts.push({
                goalIds: [g1.id, g2.id],
                description: `Goals "${g1.title}" e "${g2.title}" hanno deadline molto vicine`,
              });
            }
          }
        }
      }

      return JSON.stringify({
        conflicts,
        checkedGoals: goals.length,
        hasConflicts: conflicts.length > 0,
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createGoalPlannerTools(logger?: Logger) {
  return {
    createGoalStructure: createGoalStructureTool(logger),
    decomposeMilestones: createDecomposeMilestonesTool(logger),
    generateMetrics: createGenerateMetricsTool(logger),
    assessRisks: createAssessRisksTool(logger),
    validateGoal: createValidateGoalTool(logger),
    checkConflicts: createCheckConflictsTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const GOAL_PLANNER_SYSTEM_PROMPT = `You are the Goal Planner Agent for OneAgenda.

## Your Role
Transform extracted goals into well-structured, actionable goal plans with milestones, metrics, and risk assessment.

## Workflow
For each extracted goal:
1. Use \`createGoalStructure\` to initialize the goal
2. Use \`decomposeMilestones\` to break the goal into milestones
3. Use \`generateMetrics\` to define success criteria
4. Use \`assessRisks\` to identify potential blockers
5. Use \`validateGoal\` to ensure SMART criteria are met
6. Use \`checkConflicts\` to identify conflicts between goals

## Milestones Guidelines
- SHORT_TERM goals: 2-4 milestones
- MEDIUM_TERM goals: 4-6 milestones
- LONG_TERM goals: 5-10 milestones
- Each milestone should be a clear, achievable checkpoint
- Space milestones evenly toward the target date

## Milestone Due Date (MANDATORY)
- **EVERY milestone MUST have a \`dueDate\` in YYYY-MM-DD format**
- Calculate due dates by spacing milestones evenly from today to the goal's targetDate
- First milestone should be within 1-2 weeks of today
- Last milestone dueDate should match or be close to goal's targetDate
- DO NOT generate milestones without dueDate - this will cause validation failures

## Success Metrics Guidelines
- Each goal should have 2-4 measurable metrics
- Metrics should be quantifiable (numbers, percentages, dates)
- Include both leading indicators (activities) and lagging indicators (results)

## Risk Assessment
- Identify 2-3 key risks per goal
- Provide mitigation strategies
- Flag HIGH severity risks that need immediate attention

## REQUISITI SCHEMA CRITICI
- L'array \`goals\` DEVE contenere almeno un goal pianificato.
- NON restituire un piano vuoto.
- Ogni goal DEVE avere almeno 2 milestones.
- Ogni goal DEVE avere almeno 1 metrica di successo.

## Output Requirements
- All goals must have unique IDs (prefix: goal_)
- All milestones must have unique IDs (prefix: milestone_)
- Priority ranking should order goals by importance
- All dates in ISO 8601 format
- **CRITICAL**: After using all tools, you MUST produce the FINAL structured output containing:
  - \`goals\`: Array with ALL goals you created, each with their milestones, successMetrics, and risks
  - \`priorityRanking\`: Array of goal IDs ordered by priority
  - \`conflicts\`: Array of any conflicts identified
  
Do NOT just return tool results. Your FINAL output must be the complete goal plan schema.

## Example Goal Output
\`\`\`json
{
  "id": "goal_abc123",
  "title": "Prepararmi per la gara di powerlifting",
  "description": "Raggiungere la migliore forma fisica per competere nella gara di powerlifting tra 3 mesi",
  "timeHorizon": "MEDIUM_TERM",
  "targetDate": "2025-03-19",
  "milestones": [
    { "id": "milestone_001", "name": "Valutazione iniziale e test 1RM", "order": 1, "dueDate": "2025-01-05" },
    { "id": "milestone_002", "name": "Fase di accumulo volume", "order": 2, "dueDate": "2025-01-26" },
    { "id": "milestone_003", "name": "Fase di intensificazione", "order": 3, "dueDate": "2025-02-16" },
    { "id": "milestone_004", "name": "Peaking e tapering", "order": 4, "dueDate": "2025-03-09" },
    { "id": "milestone_005", "name": "Gara e valutazione finale", "order": 5, "dueDate": "2025-03-19" }
  ],
  "successMetrics": ["Aumento 1RM squat del 5%", "Aumento 1RM panca del 3%", "Peso corporeo stabile ±1kg"],
  "risks": [{ "description": "Infortuni da sovrallenamento", "severity": "HIGH", "mitigation": "Deload programmati ogni 4 settimane" }]
}
\`\`\`

## Language
Generate all text content in Italian.`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class GoalPlannerAgent {
  constructor(private readonly logger?: Logger) {}

  getTools() {
    return createGoalPlannerTools(this.logger);
  }

  getSystemPrompt(): string {
    return GOAL_PLANNER_SYSTEM_PROMPT;
  }

  buildUserPrompt(input: { intent: ParsedIntent; userContext: UserContext }): string {
    const { intent, userContext } = input;

    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];

    let prompt = `## Current Date\nToday: ${todayISO}\nUse this for all date calculations. All dates must be in ISO 8601 format (YYYY-MM-DD).\n\n`;
    prompt += `Create detailed goal plans from the following extracted goals:\n\n`;

    // List extracted goals
    prompt += `## Extracted Goals\n`;
    if (intent.extractedGoals.length > 0) {
      intent.extractedGoals.forEach((g, i) => {
        prompt += `${i + 1}. **${g.title}**\n`;
        if (g.description) prompt += `   Description: ${g.description}\n`;
        prompt += `   Time Horizon: ${g.timeHorizon}\n`;
        if (g.targetDate) prompt += `   Target Date: ${g.targetDate}\n`;
        if (g.priority) prompt += `   Priority: ${g.priority}\n`;
        prompt += `\n`;
      });
    } else {
      prompt += `No explicit goals extracted. Create goals from the following tasks:\n`;
      intent.extractedTasks.forEach((t, i) => {
        prompt += `${i + 1}. ${t.title}\n`;
      });
      prompt += `\n`;
    }

    // User context
    prompt += `## User Context\n`;
    prompt += `- Active goals: ${userContext.existingGoals.length}\n`;
    prompt += `- Pending tasks: ${userContext.existingTasks.length}\n`;
    prompt += `- Current workload: ${userContext.workloadAnalysis.currentLoad}\n`;
    prompt += `- Upcoming deadlines: ${userContext.workloadAnalysis.upcomingDeadlines.length}\n\n`;

    // Constraints
    if (intent.constraints.length > 0) {
      prompt += `## Constraints\n`;
      intent.constraints.forEach((c: any) => {
        prompt += `- ${c}\n`;
      });
      prompt += `\n`;
    }

    // Timeframe
    if (intent.timeframe.startDate || intent.timeframe.endDate) {
      prompt += `## Timeframe\n`;
      if (intent.timeframe.startDate) prompt += `- Start: ${intent.timeframe.startDate}\n`;
      if (intent.timeframe.endDate) prompt += `- End: ${intent.timeframe.endDate}\n`;
      if (intent.timeframe.durationDays)
        prompt += `- Duration: ${intent.timeframe.durationDays} days\n`;
      prompt += `\n`;
    }

    prompt += `Create structured goals with milestones, success metrics, and risk assessment.`;
    prompt += ` Rank goals by priority and identify any conflicts.`;

    return prompt;
  }

  processOutput(output: GoalPlanOutput): {
    plan: GoalPlan;
    checkpoint: Checkpoint;
  } {
    // Defensive checks for partial/incomplete output
    if (!output) {
      this.logger?.error('GOAL_PLANNER', 'processOutput received null/undefined output');
      return {
        plan: { goals: [], priorityRanking: [], conflicts: [] },
        checkpoint: createFailingCheckpoint('goal_planner', ['Output nullo o non definito']),
      };
    }

    // Ensure goals array exists
    const goals = output.goals ?? [];
    const priorityRanking = output.priorityRanking ?? [];
    const conflicts = output.conflicts ?? [];

    if (goals.length === 0) {
      this.logger?.warn('GOAL_PLANNER', 'processOutput received empty goals array', {
        hasGoalsProperty: 'goals' in output,
        outputKeys: Object.keys(output),
      });
    }

    const hasGoals = goals.length > 0;
    const allHaveMilestones = goals.every((g) => (g?.milestones?.length ?? 0) >= 2);
    const allHaveMetrics = goals.every((g) => (g?.successMetrics?.length ?? 0) > 0);

    // Validate and fix missing dueDates on milestones
    goals.forEach((goal: any) => {
      if (!goal?.milestones) return;

      const targetDate = goal.targetDate
        ? new Date(goal.targetDate)
        : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const today = new Date();
      const totalDays = Math.max(
        1,
        Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      );
      const milestoneCount = goal.milestones.length;

      goal.milestones.forEach((m: any, idx: any) => {
        if (!m.dueDate) {
          // Calculate fallback dueDate by spacing evenly
          const daysPerMilestone = Math.ceil(totalDays / milestoneCount);
          const milestoneDays = (idx + 1) * daysPerMilestone;
          const fallbackDate = new Date(today.getTime() + milestoneDays * 24 * 60 * 60 * 1000);
          m.dueDate =
            fallbackDate.toISOString().split('T')[0] || today.toISOString().split('T')[0] || '';
          this.logger?.warn('GOAL_PLANNER', 'Assigned fallback dueDate to milestone', {
            milestoneName: m.name,
            assignedDueDate: m.dueDate,
          });
        }
      });
    });

    // Re-check after fallback assignment
    const allMilestonesHaveDueDate = goals.every((g) =>
      (g?.milestones ?? []).every((m) => !!m.dueDate)
    );

    const issues: string[] = [];
    if (!hasGoals) issues.push('Nessun goal definito');
    if (!allHaveMilestones) issues.push('Alcuni goal non hanno milestone sufficienti');
    if (!allHaveMetrics) issues.push('Alcuni goal non hanno metriche di successo');
    if (!allMilestonesHaveDueDate) issues.push('Alcune milestone non hanno dueDate');

    const isValid = hasGoals && allHaveMilestones;

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('goal_planner', issues)
      : createFailingCheckpoint('goal_planner', issues);

    this.logger?.info('GOAL_PLANNER', 'processOutput completed', {
      goalsCount: goals.length,
      isValid,
      issues,
    });

    return {
      plan: { goals, priorityRanking, conflicts },
      checkpoint,
    };
  }
}
