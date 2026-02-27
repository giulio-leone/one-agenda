/**
 * OneAgenda Mesh Orchestrator
 *
 * Multi-agent orchestrator that plans a user's day using the core planner.
 * Streams progress via SSE through the EventSender interface.
 *
 * Hexagonal: depends on planDay() from the planner module.
 */

import { planDay } from '../planner/plan-day';
import type { PlannerInput } from '../domain/types';
import type {
  EventSender,
  OneAgendaMeshInput,
  MeshOrchestratorResult,
} from './types';

// --- Logger Interface ---

interface MeshLogger {
  info: (category: string, message: string, data?: unknown) => void;
  warn: (category: string, message: string, data?: unknown) => void;
  error: (category: string, message: string, data?: unknown) => void;
}

// --- Constructor Options ---

interface MeshOrchestratorOptions {
  model: string;
  logger: MeshLogger;
}

// --- Orchestrator ---

export class OneAgendaMeshOrchestrator {
  private readonly model: string;
  private readonly logger: MeshLogger;

  constructor(options: MeshOrchestratorOptions) {
    this.model = options.model;
    this.logger = options.logger;
  }

  async orchestrate(
    input: OneAgendaMeshInput,
    eventSender: EventSender,
  ): Promise<MeshOrchestratorResult> {
    const startTime = Date.now();
    this.logger.info(
      'Orchestrator',
      `Starting mesh orchestration with model ${this.model}`,
    );

    try {
      // Phase 1: Parse user intent
      eventSender.sendEvent('agent_start', {
        agent: 'intent-parser',
        label: 'Parsing user request',
      });
      eventSender.sendProgress(10, 'Analyzing request...');

      const plannerInput = this.buildPlannerInput(input);

      eventSender.sendEvent('agent_complete', {
        agent: 'intent-parser',
        durationMs: Date.now() - startTime,
      });

      // Phase 2: Plan the day
      eventSender.sendEvent('agent_start', {
        agent: 'day-planner',
        label: 'Creating optimized plan',
      });
      eventSender.sendProgress(40, 'Generating plan...');

      const plan = planDay(plannerInput);

      eventSender.sendEvent('agent_complete', {
        agent: 'day-planner',
        durationMs: Date.now() - startTime,
      });

      // Phase 3: Enrich with context
      eventSender.sendProgress(80, 'Finalizing plan...');

      const enrichedPlan = {
        ...plan,
        metadata: {
          model: this.model,
          userId: input.userId,
          generatedAt: new Date().toISOString(),
          inputSummary: input.rawUserInput.slice(0, 200),
        },
      };

      eventSender.sendProgress(90, 'Plan ready');

      this.logger.info(
        'Orchestrator',
        `Orchestration complete in ${Date.now() - startTime}ms`,
      );

      return {
        success: true,
        plan: enrichedPlan,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Orchestrator', `Orchestration failed: ${errorMessage}`);

      eventSender.sendEvent('error', { message: errorMessage });

      return {
        success: false,
        errors: [errorMessage],
      };
    }
  }

  // --- Private ---

  private buildPlannerInput(input: OneAgendaMeshInput): PlannerInput {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]!;
    const tz = input.userPreferences?.timezone ?? 'Europe/Rome';
    const workStart = input.userPreferences?.workingHoursStart ?? '09:00';
    const workEnd = input.userPreferences?.workingHoursEnd ?? '18:00';

    return {
      date: dateStr,
      timezone: tz,
      tasks: input.existingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        estimatedMinutes: t.estimatedMinutes ?? 30,
        dueDate: t.dueDate ?? null,
        priority: this.mapPriority(t.priority),
        score: 50,
        tags: [],
        project: null,
        dependencies: [],
        requiredPeople: [],
        preferredWindow: null,
        allowFragmentation: false,
        focusType: 'DEEP' as const,
      })),
      events: input.calendarEvents.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.startTime,
        end: e.endTime,
        source: 'EXTERNAL' as const,
        meeting: { attendees: [], meetingLink: null },
        category: this.mapEventCategory(e.type),
        flexibility: 'FIXED' as const,
        createdFrom: 'CALENDAR' as const,
      })),
      constraints: [],
      preferences: {
        workingHours: [{ start: workStart, end: workEnd }],
        focusBlocks: [],
        meetingFreeDays: [],
        timezone: tz,
        minimumBreakMinutes: 15,
        transitionBufferMinutes: 5,
        defaultMeetingDurationMinutes: 30,
      },
      emailActions: [],
    };
  }

  private mapPriority(
    priority: string,
  ): 'MUST' | 'SHOULD' | 'COULD' | 'WONT' {
    const upper = priority.toUpperCase();
    if (upper === 'HIGH' || upper === 'URGENT' || upper === 'MUST')
      return 'MUST';
    if (upper === 'MEDIUM' || upper === 'SHOULD') return 'SHOULD';
    if (upper === 'LOW' || upper === 'COULD') return 'COULD';
    return 'COULD';
  }

  private mapEventCategory(
    type: string,
  ): 'MEETING' | 'FOCUS' | 'TRAVEL' | 'PERSONAL' | 'OTHER' {
    if (type === 'MEETING') return 'MEETING';
    if (type === 'FOCUS') return 'FOCUS';
    return 'OTHER';
  }
}
