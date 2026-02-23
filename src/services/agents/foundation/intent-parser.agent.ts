/**
 * Intent Parser Agent
 *
 * Parses natural language input to extract structured intent:
 * - Intent type (create_goal, create_task, schedule_day, plan_week, review_progress)
 * - Goals and tasks with attributes
 * - Timeframe and constraints
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/foundation/intent-parser
 */

import { tool } from 'ai';
import { z } from 'zod';
import type { Logger, ParsedIntent, Checkpoint } from '../types';

import {
  validateIntentCompleteness,
  createPassingCheckpoint,
  createFailingCheckpoint,
} from '../utils';

// ============================================================================
// SCHEMAS
// ============================================================================

export const goalExtractionSchema = z.object({
  title: z.string().describe('Goal title'),
  description: z.string().optional().describe('Goal description'),
  timeHorizon: z
    .enum(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'])
    .describe(
      'Time horizon: SHORT_TERM (days-weeks), MEDIUM_TERM (weeks-months), LONG_TERM (months-years)'
    ),
  targetDate: z.string().optional().describe('Target completion date in ISO 8601 format'),
  priority: z
    .enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    .optional()
    .describe('Goal priority level'),
});

export const taskExtractionSchema = z.object({
  title: z.string().describe('Task title'),
  description: z.string().optional().describe('Task description'),
  estimatedMinutes: z.number().min(5).max(480).optional().describe('Estimated duration in minutes'),
  deadline: z.string().optional().describe('Task deadline in ISO 8601 format'),
  priority: z
    .enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    .optional()
    .describe('Task priority level'),
});

export const parsedIntentSchema = z.object({
  intentType: z
    .enum(['create_goal', 'create_task', 'schedule_day', 'plan_week', 'review_progress'])
    .describe('The type of user intent'),
  extractedGoals: z.array(goalExtractionSchema).describe('Goals extracted from user input'),
  extractedTasks: z.array(taskExtractionSchema).describe('Tasks extracted from user input'),
  timeframe: z
    .object({
      startDate: z.string().optional().describe('Start date in ISO 8601 format'),
      endDate: z.string().optional().describe('End date in ISO 8601 format'),
      durationDays: z.number().optional().describe('Duration in days'),
    })
    .describe('Timeframe for the request'),
  constraints: z.array(z.string()).describe('Any constraints mentioned by user'),
  completeness: z.number().min(0).max(100).describe('Completeness score from 0-100'),
  missingInfo: z.array(z.string()).describe('List of missing information'),
});

export type ParsedIntentOutput = z.infer<typeof parsedIntentSchema>;

// ============================================================================
// TOOLS
// ============================================================================

/**
 * Tool to extract intent from user input.
 */
export function createExtractIntentTool(logger?: Logger) {
  return tool({
    description: `Extract the user's primary intent from natural language.
    Identify if the user wants to:
    - create_goal: Define a new objective or goal
    - create_task: Add specific actionable tasks
    - schedule_day: Plan today's schedule
    - plan_week: Plan an entire week
    - review_progress: Review existing goals and tasks`,
    inputSchema: z.object({
      rawInput: z.string().describe('The raw user input to analyze'),
      existingContext: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('Any existing context about the user'),
    }),
    execute: async ({
      rawInput,
      existingContext,
    }: {
      rawInput: string;
      existingContext?: Record<string, unknown>;
    }) => {
      logger?.info('INTENT_PARSER', 'Extracting intent', {
        inputLength: rawInput.length,
        hasContext: !!existingContext,
      });

      return JSON.stringify({
        status: 'ready_for_extraction',
        inputPreview: rawInput.substring(0, 200),
        hasExistingContext: !!existingContext,
        contextKeys: existingContext ? Object.keys(existingContext) : [],
      });
    },
  });
}

/**
 * Tool to parse goals from text.
 */
export function createParseGoalsTool(logger?: Logger) {
  return tool({
    description: `Parse goals from text input.
    Extract:
    - Title: Clear, actionable goal name
    - Description: Details about the goal
    - Time horizon: SHORT_TERM (days-weeks), MEDIUM_TERM (weeks-months), LONG_TERM (months-years)
    - Target date: When the goal should be achieved
    - Priority: CRITICAL, HIGH, MEDIUM, or LOW`,
    inputSchema: z.object({
      text: z.string().describe('Text containing goal information'),
      hints: z.array(z.string()).optional().describe('Hints about what keywords to look for'),
    }),
    execute: async ({ text, hints }: { text: string; hints?: string[] }) => {
      logger?.info('INTENT_PARSER', 'Parsing goals', {
        textLength: text.length,
        hintsCount: hints?.length || 0,
      });

      return JSON.stringify({
        status: 'goals_parsed',
        textLength: text.length,
        hints: hints || [],
      });
    },
  });
}

/**
 * Tool to parse tasks from text.
 */
export function createParseTasksTool(logger?: Logger) {
  return tool({
    description: `Parse tasks from text input.
    Extract:
    - Title: Clear, actionable task name
    - Description: What needs to be done
    - Estimated duration: In minutes (5-480)
    - Deadline: When the task is due
    - Priority: CRITICAL, HIGH, MEDIUM, or LOW`,
    inputSchema: z.object({
      text: z.string().describe('Text containing task information'),
      goalContext: z.string().optional().describe('Related goal for context'),
    }),
    execute: async ({ text, goalContext }: { text: string; goalContext?: string }) => {
      logger?.info('INTENT_PARSER', 'Parsing tasks', {
        textLength: text.length,
        hasGoalContext: !!goalContext,
      });

      return JSON.stringify({
        status: 'tasks_parsed',
        textLength: text.length,
        hasGoalContext: !!goalContext,
      });
    },
  });
}

/**
 * Tool to validate extraction completeness.
 */
export function createValidateExtractionTool(logger?: Logger) {
  return tool({
    description: `Validate the extracted intent for completeness.
    Check if we have enough information to proceed:
    - Intent type identified (30 points)
    - Goals or tasks extracted (30 points)
    - Timeframe specified (20 points)
    - Both goals and tasks (20 bonus points)
    
    Return completeness score (0-100) and list of missing information.`,
    inputSchema: z.object({
      intent: z.object({
        intentType: z.string().optional(),
        goalsCount: z.number().optional(),
        tasksCount: z.number().optional(),
        hasTimeframe: z.boolean().optional(),
      }),
    }),
    execute: async ({
      intent,
    }: {
      intent: {
        intentType?: string;
        goalsCount?: number;
        tasksCount?: number;
        hasTimeframe?: boolean;
      };
    }) => {
      let completeness = 0;
      const missingInfo: string[] = [];

      if (intent.intentType) {
        completeness += 30;
      } else {
        missingInfo.push('Tipo di richiesta non identificato');
      }

      if ((intent.goalsCount || 0) > 0 || (intent.tasksCount || 0) > 0) {
        completeness += 30;
      } else {
        missingInfo.push('Nessun obiettivo o task identificato');
      }

      if (intent.hasTimeframe) {
        completeness += 20;
      } else {
        missingInfo.push('Timeframe non specificato');
      }

      if ((intent.goalsCount || 0) > 0 && (intent.tasksCount || 0) > 0) {
        completeness += 20;
      }

      const canProceed = completeness >= 60;

      logger?.info('INTENT_PARSER', 'Validation result', {
        completeness,
        missingCount: missingInfo.length,
        canProceed,
      });

      return JSON.stringify({
        completeness: Math.min(100, completeness),
        missingInfo,
        canProceed,
        suggestion: canProceed
          ? 'Intent extraction complete, ready to proceed'
          : `Missing information: ${missingInfo.join(', ')}`,
      });
    },
  });
}

// ============================================================================
// TOOL FACTORY
// ============================================================================

export function createIntentParserTools(logger?: Logger) {
  return {
    extractIntent: createExtractIntentTool(logger),
    parseGoals: createParseGoalsTool(logger),
    parseTasks: createParseTasksTool(logger),
    validateExtraction: createValidateExtractionTool(logger),
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const INTENT_PARSER_SYSTEM_PROMPT = `You are the Intent Parser Agent for OneAgenda, an intelligent personal assistant.

## Your Role
Parse natural language input from users and extract structured intent data.

## Workflow
1. Use \`extractIntent\` to identify the primary user intent
2. Use \`parseGoals\` if the user mentions objectives, goals, or long-term plans
3. Use \`parseTasks\` if the user mentions specific actions, todos, or tasks
4. Use \`validateExtraction\` to check if extraction is complete enough to proceed

## Intent Types
- **create_goal**: User wants to define a new objective (e.g., "Voglio perdere 5kg", "Devo completare il progetto X")
- **create_task**: User wants to add specific tasks (e.g., "Devo chiamare Mario", "Ricordami di comprare il latte")
- **schedule_day**: User wants to plan today (e.g., "Pianifica la mia giornata", "Cosa devo fare oggi?")
- **plan_week**: User wants to plan the week (e.g., "Pianifica la settimana", "Organizza i prossimi 7 giorni")
- **review_progress**: User wants to check progress (e.g., "Come sto andando?", "Mostrami i miei progressi")

## Time Horizons
- **SHORT_TERM**: Days to weeks (up to 2 weeks)
- **MEDIUM_TERM**: Weeks to months (2 weeks to 3 months)
- **LONG_TERM**: Months to years (3+ months)

## Priority Levels
- **CRITICAL**: Must be done immediately, blocking other work
- **HIGH**: Important, should be done soon
- **MEDIUM**: Normal priority
- **LOW**: Can be deferred

## Output Requirements
- All dates must be in ISO 8601 format (e.g., "2025-01-15T00:00:00.000Z")
- Completeness score: 0-100 (60+ is considered adequate)
- Extract all values from user input - no hardcoded defaults
- If information is missing, note it in missingInfo array

## Example Intent Output
\`\`\`json
{
  "intentType": "create_goal",
  "extractedGoals": [
    {
      "title": "Prepararmi per la gara di powerlifting",
      "timeHorizon": "MEDIUM_TERM",
      "priority": "HIGH",
      "targetDate": "2025-03-19"
    }
  ],
  "extractedTasks": [],
  "timeframe": {
    "startDate": "2025-01-06",
    "endDate": "2025-03-19",
    "durationDays": 72
  },
  "completeness": 85,
  "missingInfo": []
}
\`\`\`

## Language
The user speaks Italian. Parse Italian input correctly.
Examples:
- "settimana prossima" → next week's date
- "entro fine mese" → end of current month
- "tra 2 giorni" → 2 days from now`;

// ============================================================================
// AGENT CLASS
// ============================================================================

export class IntentParserAgent {
  constructor(private readonly logger?: Logger) {}

  /**
   * Get tools for the agent.
   */
  getTools() {
    return createIntentParserTools(this.logger);
  }

  /**
   * Get the system prompt.
   */
  getSystemPrompt(): string {
    return INTENT_PARSER_SYSTEM_PROMPT;
  }

  /**
   * Build the user prompt from input.
   */
  buildUserPrompt(input: { rawUserInput: string; existingData?: Record<string, unknown> }): string {
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0];
    const dayOfWeek = [
      'Domenica',
      'Lunedì',
      'Martedì',
      'Mercoledì',
      'Giovedì',
      'Venerdì',
      'Sabato',
    ][today.getDay()];

    let prompt = `## Current Date Context\n`;
    prompt += `Today is: ${dayOfWeek}, ${todayISO}\n`;
    prompt += `Use this as reference for all date calculations (e.g., "next week" = ${new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]})\n\n`;

    prompt += `Parse the following user input and extract structured intent:\n\n`;
    prompt += `--- USER INPUT ---\n${input.rawUserInput}\n--- END INPUT ---\n\n`;

    if (input.existingData) {
      prompt += `Existing context:\n`;
      if (input.existingData.existingGoals) {
        prompt += `- Active goals: ${JSON.stringify(input.existingData.existingGoals)}\n`;
      }
      if (input.existingData.existingTasks) {
        prompt += `- Pending tasks: ${JSON.stringify(input.existingData.existingTasks)}\n`;
      }
      prompt += `\n`;
    }

    prompt += `Extract the intent type, any goals, any tasks, timeframe, and constraints.`;
    prompt += ` If critical information is missing, note it in the missingInfo array.`;
    prompt += ` Calculate a completeness score (0-100) based on how much information was extracted.`;
    prompt += ` All dates should be in ISO 8601 format (YYYY-MM-DD).`;

    return prompt;
  }

  /**
   * Process agent output into structured result.
   */
  processOutput(output: ParsedIntentOutput): {
    intent: ParsedIntent;
    checkpoint: Checkpoint;
  } {
    // Defensive check for null/undefined output
    if (!output) {
      this.logger?.error('INTENT_PARSER', 'processOutput received null/undefined output');
      return {
        intent: {
          intentType: 'create_goal',
          extractedGoals: [],
          extractedTasks: [],
          timeframe: {},
          constraints: [],
          completeness: 0,
          missingInfo: ['Output nullo o non definito'],
        },
        checkpoint: createFailingCheckpoint('intent_parser', ['Output nullo o non definito']),
      };
    }

    const { completeness, missingInfo } = validateIntentCompleteness(output);

    const finalCompleteness = Math.max(output.completeness || 0, completeness);
    const finalMissingInfo = Array.from(new Set([...(output.missingInfo || []), ...missingInfo]));

    const isValid = finalCompleteness >= 60;

    const checkpoint: Checkpoint = isValid
      ? createPassingCheckpoint('intent_parser', finalMissingInfo)
      : createFailingCheckpoint('intent_parser', finalMissingInfo);

    this.logger?.info('INTENT_PARSER', 'processOutput completed', {
      intentType: output.intentType,
      goalsCount: output.extractedGoals?.length ?? 0,
      tasksCount: output.extractedTasks?.length ?? 0,
      completeness: finalCompleteness,
      isValid,
    });

    return {
      intent: {
        ...output,
        completeness: finalCompleteness,
        missingInfo: finalMissingInfo,
      },
      checkpoint,
    };
  }
}
