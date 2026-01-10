/**
 * OneAgenda Agentic Planner
 *
 * @deprecated This module uses legacy SDK 2.5 concepts (createAgent, createModel, AgentConfig)
 * that no longer exist in the codebase. The AI-powered planning features were never fully implemented.
 *
 * Current status: Stub implementation that falls back to non-AI planDay() function.
 *
 * TODO: Migrate to OneAgent SDK 3.1 workflow system in #498
 * For now, use planDay() directly for planning functionality.
 */

import {
  PlanSchema,
  PlannerInputSchema,
  PlannerOptionsSchema,
  WhatIfScenarioSchema,
  type Plan,
  type PlannerInput,
  type PlannerOptions,
  type WhatIfScenario,
} from '../domain/types';
import { planDay } from '../planner/plan-day';
import { runWhatIfScenario } from '../planner/what-if';

// Legacy type stubs for backwards compatibility
export type ModelTier = 'fast' | 'balanced' | 'powerful';

export interface OneAgendaAgenticPlannerOptions {
  tier?: ModelTier;
  enableLearning?: boolean;
}

/**
 * OneAgenda Agentic Planner
 *
 * @deprecated Falls back to non-AI planning. Use planDay() directly instead.
 */
export class OneAgendaAgenticPlanner {
  constructor(_options: OneAgendaAgenticPlannerOptions = {}) {
    console.warn(
      '[DEPRECATED] OneAgendaAgenticPlanner: AI features not implemented. Using planDay() fallback.'
    );
  }

  /**
   * Genera un piano giornaliero
   * @deprecated Falls back to planDay() - no AI features
   */
  async generatePlan(rawInput: PlannerInput, options?: Partial<PlannerOptions>): Promise<Plan> {
    const input = PlannerInputSchema.parse(rawInput);
    const validatedOptions = options ? PlannerOptionsSchema.partial().parse(options) : undefined;

    // Fallback to non-AI planning
    return planDay(input, validatedOptions);
  }

  /**
   * Simula uno scenario what-if
   * @deprecated Falls back to runWhatIfScenario() - no AI features
   */
  async simulateScenario(
    rawInput: PlannerInput,
    baselinePlan: Plan,
    scenario: WhatIfScenario
  ): Promise<ReturnType<typeof runWhatIfScenario>> {
    const input = PlannerInputSchema.parse(rawInput);
    const validatedBaseline = PlanSchema.parse(baselinePlan);
    const validatedScenario = WhatIfScenarioSchema.parse(scenario);

    return runWhatIfScenario(input, validatedBaseline, validatedScenario);
  }
}
