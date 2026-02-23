/**
 * OneAgenda Mesh Orchestrator
 *
 * Coordinates all agents in the OneAgenda mesh to generate complete plans.
 * Follows the same pattern as WorkoutMeshOrchestrator.
 *
 * Execution phases:
 * 1. Foundation (parallel): IntentParser + UserContext
 * 2. Planning (sequential): GoalPlanner → TaskBreaker
 * 3. Scheduling (parallel): Scheduler + Prioritizer
 * 4. Quality (parallel): TimeOptimizer + QAReview
 *
 * Uses ToolLoopAgent with Output.object for structured output.
 *
 * @module oneagenda/agents/orchestrator
 */

import { ToolLoopAgent, Output, stepCountIs, type LanguageModel } from 'ai';
import type {
  Logger,
  Checkpoint,
  OneAgendaMeshOrchestratorConfig,
  OneAgendaMeshInput,
  EventSender,
  OrchestrationResult,
  AgentContext,
  OneAgendaPlan,
  ParsedIntent,
  UserContext,
  GoalPlan,
  TaskBreakdown,
  Schedule,
  Prioritization,
  QAReport,
} from './types';
import {
  assertCheckpoint,
  normalizeGoalPlanIds,
  normalizeTaskBreakdownIds,
  createId,
} from './utils';
import { OrchestrationResilience } from '@giulio-leone/lib-ai';
import { GenerationStateService } from '@giulio-leone/lib-ai';

// Import agents
import { IntentParserAgent, parsedIntentSchema } from './foundation/intent-parser.agent';
import { UserContextAgent, userContextSchema } from './foundation/user-context.agent';
import { GoalPlannerAgent, goalPlanSchema } from './planning/goal-planner.agent';
import { TaskBreakerAgent, taskBreakdownSchema } from './planning/task-breaker.agent';
import { SchedulerAgent, scheduleSchema } from './scheduling/scheduler.agent';
import { PrioritizerAgent, prioritizationSchema } from './scheduling/prioritizer.agent';
import {
  TimeOptimizerAgent,
  optimizationResultSchema,
  type OptimizationResult,
} from './quality/time-optimizer.agent';
import { QAReviewAgent, qaReportSchema } from './quality/qa-review.agent';

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export class OneAgendaMeshOrchestrator {
  private readonly model: LanguageModel;
  private readonly maxSteps: number;
  private readonly logger?: Logger;
  private readonly resilience: OrchestrationResilience;

  // Agents
  private readonly intentParserAgent: IntentParserAgent;
  private readonly userContextAgent: UserContextAgent;
  private readonly goalPlannerAgent: GoalPlannerAgent;
  private readonly taskBreakerAgent: TaskBreakerAgent;
  private readonly schedulerAgent: SchedulerAgent;
  private readonly prioritizerAgent: PrioritizerAgent;
  private readonly timeOptimizerAgent: TimeOptimizerAgent;
  private readonly qaReviewAgent: QAReviewAgent;

  constructor(config: OneAgendaMeshOrchestratorConfig) {
    this.model = config.model;
    this.maxSteps = config.maxSteps || 100;
    this.logger = config.logger;
    this.resilience = new OrchestrationResilience();

    // Initialize agents
    this.intentParserAgent = new IntentParserAgent(this.logger);
    this.userContextAgent = new UserContextAgent(this.logger);
    this.goalPlannerAgent = new GoalPlannerAgent(this.logger);
    this.taskBreakerAgent = new TaskBreakerAgent(this.logger);
    this.schedulerAgent = new SchedulerAgent(this.logger);
    this.prioritizerAgent = new PrioritizerAgent(this.logger);
    this.timeOptimizerAgent = new TimeOptimizerAgent(this.logger);
    this.qaReviewAgent = new QAReviewAgent(this.logger);
  }

  // ============================================================================
  // GENERIC AGENT RUNNER
  // ============================================================================

  /**
   * Run a single agent with ToolLoopAgent + Output.object pattern.
   * Uses partialOutputStream for streaming structured output.
   */
  private async runAgent<T>(
    agentName: string,
    systemPrompt: string,
    userPrompt: string,
    tools: Record<string, unknown>,
    outputSchema: unknown,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ result: T | null; raw: string }> {
    const startTime = Date.now();

    this.logger?.info('ORCHESTRATOR', `Starting ${agentName}`, {
      promptLength: userPrompt.length,
      toolCount: Object.keys(tools).length,
    });

    eventSender?.sendEvent?.('agent_start', { agent: agentName });

    try {
      const agent = new ToolLoopAgent({
        model: this.model,
        instructions: systemPrompt,
        tools,
        stopWhen: stepCountIs(this.maxSteps),
        toolChoice: 'auto',
        output: Output.object({
          schema: outputSchema as Parameters<typeof Output.object>[0]['schema'],
        }),
      });

      // Use stream() pattern from AI SDK docs
      // output is a promise that resolves when agent completes
      const streamResult = await agent.stream({
        prompt: userPrompt,
        abortSignal,
      });

      const { partialOutputStream, textStream, output } = streamResult;

      let lastPartial: Partial<T> | null = null;
      let stepCount = 0;
      let textOutput = '';

      // Consume textStream for debugging
      const textPromise = (async () => {
        for await (const text of textStream) {
          textOutput += text;
        }
      })();

      // Consume partialOutputStream for progress updates
      for await (const partial of partialOutputStream) {
        lastPartial = partial as Partial<T>;
        stepCount++;

        if (stepCount % 5 === 0) {
          eventSender?.sendProgress?.(Math.min(stepCount * 3, 80), `${agentName}: processing...`);
        }
      }

      await textPromise;

      // Get final output from the output promise (AI SDK pattern)
      let finalOutput: T | null = null;
      try {
        finalOutput = (await output) as T;
      } catch (outputError) {
        // output promise may throw if no structured output was generated
        this.logger?.warn(
          'ORCHESTRATOR',
          `${agentName} output promise rejected, using lastPartial`,
          {
            hasLastPartial: !!lastPartial,
            lastPartialKeys: lastPartial ? Object.keys(lastPartial as object) : [],
            errorMessage: outputError instanceof Error ? outputError.message : String(outputError),
            errorName: outputError instanceof Error ? outputError.name : 'Unknown',
          }
        );
        finalOutput = lastPartial as T;
      }

      // Log text output for debugging if no output received
      if (!finalOutput && textOutput.length > 0) {
        this.logger?.warn('ORCHESTRATOR', `${agentName} generated text but no structured output`, {
          textLength: textOutput.length,
          textPreview: textOutput.substring(0, 500),
        });
      }

      const duration = Date.now() - startTime;

      this.logger?.info('ORCHESTRATOR', `Completed ${agentName}`, {
        durationMs: duration,
        partialsReceived: stepCount,
        hasResult: !!finalOutput,
        outputSource: finalOutput
          ? finalOutput === lastPartial
            ? 'partial'
            : 'output_promise'
          : 'none',
      });

      eventSender?.sendEvent?.('agent_complete', {
        agent: agentName,
        durationMs: duration,
        success: !!finalOutput,
      });

      return { result: finalOutput, raw: textOutput };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger?.error('ORCHESTRATOR', `Failed ${agentName}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: duration,
      });

      eventSender?.sendEvent?.('agent_error', {
        agent: agentName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  // ============================================================================
  // AGENT RUNNERS
  // ============================================================================

  private async runIntentParser(
    input: OneAgendaMeshInput,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ intent: ParsedIntent; checkpoint: Checkpoint }> {
    const tools = this.intentParserAgent.getTools();
    const userPrompt = this.intentParserAgent.buildUserPrompt({
      rawUserInput: input.rawUserInput,
      existingData: {
        existingGoals: input.existingGoals,
        existingTasks: input.existingTasks,
      },
    });

    const { result } = await this.runAgent<ParsedIntent>(
      'IntentParserAgent',
      this.intentParserAgent.getSystemPrompt(),
      userPrompt,
      tools,
      parsedIntentSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('IntentParser failed to produce result');
    }

    return this.intentParserAgent.processOutput(result);
  }

  private async runUserContext(
    input: OneAgendaMeshInput,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ context: UserContext; checkpoint: Checkpoint }> {
    const tools = this.userContextAgent.getTools(input);
    const userPrompt = this.userContextAgent.buildUserPrompt({
      userId: input.userId,
    });

    const { result } = await this.runAgent<UserContext>(
      'UserContextAgent',
      this.userContextAgent.getSystemPrompt(),
      userPrompt,
      tools,
      userContextSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('UserContext failed to produce result');
    }

    return this.userContextAgent.processOutput(result);
  }

  private async runGoalPlanner(
    intent: ParsedIntent,
    userContext: UserContext,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ plan: GoalPlan; checkpoint: Checkpoint }> {
    const tools = this.goalPlannerAgent.getTools();
    const userPrompt = this.goalPlannerAgent.buildUserPrompt({
      intent,
      userContext,
    });

    const { result } = await this.runAgent<GoalPlan>(
      'GoalPlannerAgent',
      this.goalPlannerAgent.getSystemPrompt(),
      userPrompt,
      tools,
      goalPlanSchema,
      eventSender,
      abortSignal
    );

    // Detailed logging of result structure
    this.logger?.info('ORCHESTRATOR', 'GoalPlannerAgent result inspection', {
      hasResult: !!result,
      resultType: typeof result,
      resultKeys: result ? Object.keys(result) : [],
      goalsCount: result?.goals?.length ?? 0,
      hasGoalsArray: Array.isArray(result?.goals),
    });

    if (!result) {
      this.logger?.error('ORCHESTRATOR', 'GoalPlanner returned null result');
      throw new Error('GoalPlanner failed to produce result');
    }

    // Try/catch around processOutput for better error handling
    try {
      this.logger?.info('ORCHESTRATOR', 'Calling GoalPlannerAgent.processOutput');
      const output = this.goalPlannerAgent.processOutput(result);
      this.logger?.info('ORCHESTRATOR', 'GoalPlannerAgent.processOutput succeeded', {
        planGoalsCount: output.plan.goals?.length ?? 0,
        checkpointIsValid: output.checkpoint.isValid,
      });
      return output;
    } catch (processError) {
      this.logger?.error('ORCHESTRATOR', 'GoalPlannerAgent.processOutput failed', {
        error: processError instanceof Error ? processError.message : String(processError),
        stack: processError instanceof Error ? processError.stack : undefined,
        resultSnapshot: JSON.stringify(result).slice(0, 500),
      });
      throw processError;
    }
  }

  private async runTaskBreaker(
    goalPlan: GoalPlan,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ breakdown: TaskBreakdown; checkpoint: Checkpoint }> {
    const tools = this.taskBreakerAgent.getTools();
    const userPrompt = this.taskBreakerAgent.buildUserPrompt({
      goalPlan,
    });

    const { result } = await this.runAgent<TaskBreakdown>(
      'TaskBreakerAgent',
      this.taskBreakerAgent.getSystemPrompt(),
      userPrompt,
      tools,
      taskBreakdownSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('TaskBreaker failed to produce result');
    }

    return this.taskBreakerAgent.processOutput(result);
  }

  private async runScheduler(
    taskBreakdown: TaskBreakdown,
    userContext: UserContext,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ schedule: Schedule; checkpoint: Checkpoint }> {
    const tools = this.schedulerAgent.getTools(userContext);
    const userPrompt = this.schedulerAgent.buildUserPrompt({
      taskBreakdown,
      userContext,
    });

    const { result } = await this.runAgent<Schedule>(
      'SchedulerAgent',
      this.schedulerAgent.getSystemPrompt(),
      userPrompt,
      tools,
      scheduleSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('Scheduler failed to produce result');
    }

    return this.schedulerAgent.processOutput(result);
  }

  private async runPrioritizer(
    taskBreakdown: TaskBreakdown,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ prioritization: Prioritization; checkpoint: Checkpoint }> {
    const tools = this.prioritizerAgent.getTools();
    const userPrompt = this.prioritizerAgent.buildUserPrompt({
      taskBreakdown,
    });

    const { result } = await this.runAgent<Prioritization>(
      'PrioritizerAgent',
      this.prioritizerAgent.getSystemPrompt(),
      userPrompt,
      tools,
      prioritizationSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('Prioritizer failed to produce result');
    }

    return this.prioritizerAgent.processOutput(result);
  }

  private async runTimeOptimizer(
    schedule: Schedule,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ schedule: Schedule; checkpoint: Checkpoint }> {
    const tools = this.timeOptimizerAgent.getTools();
    const userPrompt = this.timeOptimizerAgent.buildUserPrompt({
      schedule,
    });

    const { result } = await this.runAgent<OptimizationResult>(
      'TimeOptimizerAgent',
      this.timeOptimizerAgent.getSystemPrompt(),
      userPrompt,
      tools,
      optimizationResultSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('TimeOptimizer failed to produce result');
    }

    return this.timeOptimizerAgent.processOutput(result);
  }

  private async runQAReview(
    schedule: Schedule,
    goalPlan: GoalPlan,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<{ report: QAReport; checkpoint: Checkpoint }> {
    const tools = this.qaReviewAgent.getTools();
    const userPrompt = this.qaReviewAgent.buildUserPrompt({
      schedule,
      goalPlan,
    });

    const { result } = await this.runAgent<QAReport>(
      'QAReviewAgent',
      this.qaReviewAgent.getSystemPrompt(),
      userPrompt,
      tools,
      qaReportSchema,
      eventSender,
      abortSignal
    );

    if (!result) {
      throw new Error('QAReview failed to produce result');
    }

    return this.qaReviewAgent.processOutput(result);
  }

  // ============================================================================
  // MAIN ORCHESTRATION
  // ============================================================================

  /**
   * Main orchestration method.
   * Executes all agents in phases with parallel execution where possible.
   */
  async orchestrate(
    input: OneAgendaMeshInput,
    eventSender?: EventSender,
    abortSignal?: AbortSignal
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const context: AgentContext = {};
    const checkpoints: Checkpoint[] = [];
    const agentDurations: Record<string, number> = {};

    // Automatic Resumption logic: if no state ID is provided, look for one
    let targetStateId = input.resumeFromStateId;
    if (!targetStateId) {
      const recoverableStates = await GenerationStateService.getRecoverableStates(
        input.userId,
        'oneagenda'
      );
      if (recoverableStates.length > 0 && recoverableStates[0]) {
        // Take the latest one
        targetStateId = recoverableStates[0].id;
        this.logger?.info(
          'ORCHESTRATOR',
          `♻️ Automatic resumption: found latest state ${targetStateId}`
        );
      }
    }

    const resilienceCtx = await this.resilience.createContext(
      input.userId,
      'oneagenda',
      targetStateId
    );

    // Store input in context so it can be recovered by frontend
    resilienceCtx.phaseResults.set('input', input);

    this.logger?.info('ORCHESTRATOR', 'Starting orchestration', {
      userId: input.userId,
      inputLength: input.rawUserInput.length,
    });

    eventSender?.sendEvent?.('orchestration_start', { userId: input.userId });

    try {
      // ============================================
      // PHASE 1: PARALLEL FOUNDATION
      // ============================================
      eventSender?.sendProgress?.(5, 'Analyzing input...');

      const phase1Start = Date.now();
      const [intentResult, contextResult] = await this.resilience.executePhase(
        resilienceCtx,
        'foundation',
        async () => {
          return Promise.all([
            this.runIntentParser(input, eventSender, abortSignal),
            this.runUserContext(input, eventSender, abortSignal),
          ]);
        }
      );
      agentDurations['phase1_foundation'] = Date.now() - phase1Start;

      context.intent = intentResult.intent;
      context.userContext = contextResult.context;
      checkpoints.push(intentResult.checkpoint, contextResult.checkpoint);

      // Validate foundation phase
      assertCheckpoint(intentResult.checkpoint);

      eventSender?.sendProgress?.(20, 'Input analyzed');
      this.logger?.info('ORCHESTRATOR', 'Phase 1 complete', {
        intent: context.intent.intentType,
        goalsExtracted: context.intent.extractedGoals.length,
        tasksExtracted: context.intent.extractedTasks.length,
      });

      // ============================================
      // PHASE 2: SEQUENTIAL PLANNING
      // ============================================
      eventSender?.sendProgress?.(25, 'Planning goals...');

      const phase2Start = Date.now();

      const goalResult = await this.resilience.executePhase(resilienceCtx, 'planning_goals', () =>
        this.runGoalPlanner(context.intent!, context.userContext!, eventSender, abortSignal)
      );
      checkpoints.push(goalResult.checkpoint);

      this.logger?.info('ORCHESTRATOR', 'GoalPlanner checkpoint', {
        phase: goalResult.checkpoint.phase,
        isValid: goalResult.checkpoint.isValid,
        canContinue: goalResult.checkpoint.canContinue,
        criticalIssues: goalResult.checkpoint.criticalIssues,
      });

      assertCheckpoint(goalResult.checkpoint);

      // NORMALIZE GOAL IDs PROGRAMMATICALLY
      const { normalizedPlan, goalIdMap, milestoneIdMap } = normalizeGoalPlanIds(goalResult.plan);
      context.goalPlan = normalizedPlan;

      this.logger?.info('ORCHESTRATOR', 'IDs normalized for goals', {
        goalsNormalized: goalIdMap.size,
        milestonesNormalized: milestoneIdMap.size,
      });

      eventSender?.sendProgress?.(40, 'Breaking down tasks...');

      const taskResult = await this.resilience.executePhase(resilienceCtx, 'planning_tasks', () =>
        this.runTaskBreaker(context.goalPlan!, eventSender, abortSignal)
      );
      checkpoints.push(taskResult.checkpoint);
      assertCheckpoint(taskResult.checkpoint);

      // NORMALIZE TASK IDs AND RESOLVE milestoneId FROM milestoneIndex
      context.taskBreakdown = normalizeTaskBreakdownIds(
        taskResult.breakdown,
        context.goalPlan, // Pass the normalized goal plan
        goalIdMap
      );

      this.logger?.info('ORCHESTRATOR', 'IDs normalized for tasks', {
        tasksNormalized: context.taskBreakdown.tasks.length,
      });

      agentDurations['phase2_planning'] = Date.now() - phase2Start;

      eventSender?.sendProgress?.(55, 'Tasks created');
      this.logger?.info('ORCHESTRATOR', 'Phase 2 complete', {
        goalsPlanned: context.goalPlan.goals.length,
        tasksCreated: context.taskBreakdown.tasks.length,
        totalEffort: context.taskBreakdown.totalEffortMinutes,
      });

      // ============================================
      // PHASE 3: PARALLEL SCHEDULING
      // ============================================
      eventSender?.sendProgress?.(60, 'Scheduling and prioritizing...');

      const phase3Start = Date.now();

      // Use allSettled to prevent race conditions where one agent fails fast
      // and closes the stream while the other is still running/sending events.
      const [scheduleSettled, prioritySettled] = await this.resilience.executePhase(
        resilienceCtx,
        'scheduling',
        async () => {
          return Promise.allSettled([
            this.runScheduler(
              context.taskBreakdown!,
              context.userContext!,
              eventSender,
              abortSignal
            ),
            this.runPrioritizer(context.taskBreakdown!, eventSender, abortSignal),
          ]);
        }
      );

      agentDurations['phase3_scheduling'] = Date.now() - phase3Start;

      // Check for failures
      if (scheduleSettled.status === 'rejected') {
        throw scheduleSettled.reason;
      }
      if (prioritySettled.status === 'rejected') {
        throw prioritySettled.reason;
      }

      const scheduleResult = scheduleSettled.value;
      const priorityResult = prioritySettled.value;

      context.schedule = scheduleResult.schedule;
      context.prioritization = priorityResult.prioritization;
      checkpoints.push(scheduleResult.checkpoint, priorityResult.checkpoint);

      eventSender?.sendProgress?.(80, 'Schedule created');
      this.logger?.info('ORCHESTRATOR', 'Phase 3 complete', {
        daysScheduled: context.schedule.days.length,
        tasksScheduled: context.schedule.summary.totalTasksScheduled,
        topPriorities: context.prioritization.topPriorities.length,
      });

      // ============================================
      // PHASE 4: PARALLEL QUALITY
      // ============================================
      eventSender?.sendProgress?.(85, 'Optimizing and validating...');

      const phase4Start = Date.now();
      const [optimizedSettled, qaSettled] = await this.resilience.executePhase(
        resilienceCtx,
        'quality',
        async () => {
          return Promise.allSettled([
            this.runTimeOptimizer(context.schedule!, eventSender, abortSignal),
            this.runQAReview(context.schedule!, context.goalPlan!, eventSender, abortSignal),
          ]);
        }
      );
      agentDurations['phase4_quality'] = Date.now() - phase4Start;

      if (optimizedSettled.status === 'rejected') {
        throw optimizedSettled.reason;
      }
      if (qaSettled.status === 'rejected') {
        throw qaSettled.reason;
      }

      const optimizedResult = optimizedSettled.value;
      const qaResult = qaSettled.value;

      context.optimizedSchedule = optimizedResult.schedule;
      context.qaReport = qaResult.report;
      checkpoints.push(optimizedResult.checkpoint, qaResult.checkpoint);

      eventSender?.sendProgress?.(100, 'Plan generated');
      this.logger?.info('ORCHESTRATOR', 'Phase 4 complete', {
        qaScore: context.qaReport.overallScore,
        qaValid: context.qaReport.isValid,
      });

      // ============================================
      // BUILD FINAL RESULT
      // ============================================
      const totalDuration = Date.now() - startTime;

      const plan = this.buildFinalPlan(context, input.userId);

      this.logger?.info('ORCHESTRATOR', 'Orchestration complete', {
        success: true,
        totalDurationMs: totalDuration,
        goalsCount: plan.goals.length,
        tasksCount: plan.tasks.length,
      });

      eventSender?.sendEvent?.('orchestration_complete', {
        success: true,
        planId: plan.id,
        durationMs: totalDuration,
      });

      if (resilienceCtx) {
        await this.resilience.complete(resilienceCtx);
      }

      return {
        success: true,
        plan,
        context,
        checkpoints,
        metrics: {
          totalDurationMs: totalDuration,
          tokensUsed: 0, // Would need to track from agent calls
          agentDurations,
        },
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger?.error('ORCHESTRATOR', 'Orchestration failed', {
        errorMessage,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorStack: error instanceof Error ? error.stack : undefined,
        durationMs: totalDuration,
        checkpointsCompleted: checkpoints.length,
        lastContextPhase: context.qaReport
          ? 'phase4'
          : context.schedule
            ? 'phase3'
            : context.taskBreakdown
              ? 'phase2.5'
              : context.goalPlan
                ? 'phase2'
                : context.intent
                  ? 'phase1'
                  : 'init',
      });

      eventSender?.sendEvent?.('orchestration_error', {
        error: errorMessage,
        durationMs: totalDuration,
      });

      return {
        success: false,
        context,
        checkpoints,
        errors: [errorMessage],
        metrics: {
          totalDurationMs: totalDuration,
          tokensUsed: 0,
          agentDurations,
        },
      };
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Build the final OneAgenda plan from accumulated context.
   */
  private buildFinalPlan(context: AgentContext, userId: string): OneAgendaPlan {
    const { goalPlan, taskBreakdown, optimizedSchedule, schedule, prioritization, qaReport } =
      context;

    // Use optimized schedule if available, otherwise regular schedule
    const finalSchedule = optimizedSchedule || schedule!;

    return {
      id: createId(),
      title: goalPlan!.goals[0]?.title || 'Nuovo Progetto', // AI-generated from first goal
      userId,
      createdAt: new Date().toISOString(),
      goals: goalPlan!.goals,
      tasks: taskBreakdown!.tasks,
      schedule: finalSchedule,
      prioritization: prioritization!,
      qaReport: qaReport!,
      metadata: {
        generatedBy: 'OneAgendaMeshOrchestrator',
        totalGoals: goalPlan!.goals.length,
        totalTasks: taskBreakdown!.tasks.length,
        totalEffortMinutes: taskBreakdown!.totalEffortMinutes,
        scheduledDays: finalSchedule.days.length,
      },
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createOneAgendaMeshOrchestrator(
  config: OneAgendaMeshOrchestratorConfig
): OneAgendaMeshOrchestrator {
  return new OneAgendaMeshOrchestrator(config);
}
