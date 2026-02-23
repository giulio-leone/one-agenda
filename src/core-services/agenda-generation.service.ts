/**
 * Agenda Generation Service
 *
 * Entry point for invoking the SDK 3.1 agenda-planner agent.
 * Provides a typed interface for consumers to generate daily agendas.
 */

import { execute } from '@giulio-leone/one-agent/framework';
import {
  AgendaPlannerInputSchema,
  AgendaPlannerOutputSchema,
  type AgendaPlannerInput,
  type AgendaPlannerOutput,
} from '../sdk-agents/agenda-planner/schema';

// Re-export types for service consumers
export type { AgendaPlannerInput, AgendaPlannerOutput };

/**
 * Error type for agenda generation failures
 */
export class AgendaGenerationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'AgendaGenerationError';
  }
}

/**
 * Generate a personalized daily agenda using SDK 3.1 multi-agent workflow.
 *
 * @param input - Agenda planning input with tasks, events, preferences
 * @param options - Optional execution options
 * @returns Structured agenda plan with scheduled tasks, recommendations, and insights
 *
 * @example
 * ```typescript
 * const agenda = await generateAgenda({
 *   userId: 'user_123',
 *   date: '2025-01-15',
 *   tasks: [...],
 *   events: [...],
 *   preferences: {...},
 *   mode: 'PLAN'
 * });
 * ```
 */
export async function generateAgenda(
  input: AgendaPlannerInput,
  options?: {
    userId?: string;
  }
): Promise<AgendaPlannerOutput> {
  // Validate input
  const validatedInput = AgendaPlannerInputSchema.parse(input);

  const result = await execute<AgendaPlannerOutput>('sdk-agents/agenda-planner', validatedInput, {
    userId: options?.userId ?? input.userId,
    basePath: __dirname,
    schemas: {
      input: AgendaPlannerInputSchema,
      output: AgendaPlannerOutputSchema,
    },
  });

  if (!result.success) {
    const error = result.error;
    if (typeof error === 'object' && error !== null && 'message' in error) {
      throw new AgendaGenerationError(
        error.message as string,
        (error as { code?: string }).code ?? 'UNKNOWN_ERROR',
        (error as { recoverable?: boolean }).recoverable ?? false
      );
    }
    throw new AgendaGenerationError('Agenda generation failed', 'UNKNOWN_ERROR', false);
  }

  // Safe type assertion since we've verified success
  return result.output as AgendaPlannerOutput;
}
