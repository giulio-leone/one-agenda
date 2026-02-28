import { PlannerInputSchema, PlannerOptionsSchema, PlanSchema } from '../domain/types';
import type { PlannerInput, PlannerOptions, Plan, PlanBlock, PlanDecision } from '../domain/types';
import { buildBreakBlocks, DayTimeline } from './core/day-timeline';
import { rankTasks } from './core/task-prioritizer';
import { TaskScheduler } from './core/task-scheduler';
import { buildPlanSummary } from './core/summary';

export function planDay(rawInput: PlannerInput, rawOptions?: Partial<PlannerOptions>): Plan {
  const input = PlannerInputSchema.parse(rawInput);
  const options = PlannerOptionsSchema.parse({ ...rawOptions });

  const timeline = new DayTimeline(input, options);
  const availableIntervals = timeline.getAvailableIntervals();
  const rankedTasks = rankTasks(input.tasks, new Date(input.date));
  const scheduler = new TaskScheduler(options);
  const schedule = scheduler.schedule(rankedTasks, availableIntervals);

  const existingEvents = timeline.getExistingEventBlocks();
  const candidateBlocks = [...existingEvents, ...schedule.blocks];
  const breakBlocks = buildBreakBlocks(candidateBlocks, input.preferences.minimumBreakMinutes);
  const blocks = [...candidateBlocks, ...breakBlocks];

  const plan = buildPlanSummary({
    input,
    blocks,
    rankedTasks,
    remaining: schedule.remaining,
    decisions: schedule.decisions,
    options,
  });

  return PlanSchema.parse(plan);
}

export function explainBlock(plan: Plan, blockId: string): string[] {
  const block = plan.blocks.find((candidate: PlanBlock) => candidate.id === blockId);
  if (!block) {
    return ['Blocco non trovato'];
  }
  const decisions = plan.decisions.filter(
    (decision: PlanDecision) => decision.relatedBlockId === blockId
  );
  return [...block.explanations, ...decisions.map((decision: any) => decision.rationale)];
}
