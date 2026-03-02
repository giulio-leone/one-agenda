/**
 * Agenda Generation Service
 *
 * Entry point for invoking the SDK 3.1 agenda-planner agent.
 * Provides a typed interface for consumers to generate daily agendas.
 */

// Legacy SDK 3.1 execute function — no longer used. Agenda generation now uses
// OneAgendaMeshOrchestrator (Gauss-based) in the /api/oneagenda/generate route.
import {
  AgendaPlannerInputSchema,
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

  // Legacy SDK 3.1 execute() removed — use OneAgendaMeshOrchestrator instead.
  // This function is kept for backward compatibility but should not be called.
  throw new AgendaGenerationError(
    'Legacy generateAgenda() is deprecated. Use OneAgendaMeshOrchestrator.orchestrate() instead.',
    'DEPRECATED',
    false
  );
}
