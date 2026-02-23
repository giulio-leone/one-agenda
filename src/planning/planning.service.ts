/**
 * Planning Service v2 - Database Persistent
 *
 * Gestisce creazione e tracking di piani multi-task per generazione programmi complessi
 * con persistenza su database Supabase tramite Prisma.
 *
 * Features:
 * - Persistenza completa su database
 * - Checkpoint granulari (ogni subtask)
 * - Recovery automatico da crash
 * - Atomic updates con transactions
 * - Type-safe operations
 *
 * @version 2.0.0 - AI SDK v6 Integration
 */

import { prisma } from '@giulio-leone/lib-core';
import { Prisma } from '@prisma/client';
import type { $Enums } from '@prisma/client';
import { logger } from '@giulio-leone/lib-core';
import type {
  PlanningPlan,
  PlanningTask,
  PlanningSubTask,
  PlanningSubSubTask,
  PlanningProgress,
  PlanningPlanParams,
  TaskStatus,
} from '@giulio-leone/types';
import type { MealType } from '@giulio-leone/types/nutrition';

// Type aliases for Prisma models with their relations
type DbSubSubTask = Prisma.planning_sub_sub_tasksGetPayload<{}>;
type DbSubTask = Prisma.planning_sub_tasksGetPayload<{
  include: { subSubTasks: true };
}>;
type DbTask = Prisma.planning_tasksGetPayload<{
  include: {
    subTasks: {
      include: { subSubTasks: true };
    };
  };
}>;
type DbPlan = Prisma.planning_plansGetPayload<{
  include: {
    tasks: {
      include: {
        subTasks: {
          include: { subSubTasks: true };
        };
      };
    };
  };
}>;

/**
 * Mapping tra TaskStatus (types) e PlanningStatus (Prisma enum)
 */
function toPrismaStatus(status: TaskStatus): $Enums.PlanningStatus {
  const mapping: Record<TaskStatus, $Enums.PlanningStatus> = {
    pending: 'PENDING',
    'in-progress': 'IN_PROGRESS',
    completed: 'COMPLETED',
    failed: 'FAILED',
  };
  return mapping[status];
}

function fromPrismaStatus(status: $Enums.PlanningStatus): TaskStatus {
  const mapping: Record<string, TaskStatus> = {
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'failed',
    PAUSED: 'in-progress',
  };
  return mapping[status] || 'pending';
}

function inferMealType(mealNumber: number, mealsPerDay: number): MealType {
  if (mealsPerDay <= 0) {
    throw new Error('mealsPerDay must be > 0');
  }

  if (mealNumber === 1) return 'breakfast';

  // Keep the last meal as dinner when we have 3+ meals.
  if (mealsPerDay >= 3 && mealNumber === mealsPerDay) return 'dinner';

  // With 2 meals/day, default the second meal to lunch (neutral default).
  if (mealsPerDay === 2 && mealNumber === 2) return 'lunch';

  // With 3 meals/day, middle is lunch.
  if (mealsPerDay === 3 && mealNumber === 2) return 'lunch';

  // For additional meals, use snack as a safe, generic type.
  return 'snack';
}

function getDefaultMealName(mealNumber: number, mealType: MealType): string {
  const baseNames: Record<MealType, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
    'pre-workout': 'Pre-workout',
    'post-workout': 'Post-workout',
  };

  // If multiple snacks, keep them distinguishable.
  if (mealType === 'snack') {
    return `${baseNames[mealType]} ${mealNumber}`;
  }

  return baseNames[mealType];
}

/**
 * Planning Service v2
 * Gestisce piani di lavoro multi-task con persistenza database
 */
export class PlanningServiceV2 {
  /**
   * Crea un nuovo piano di lavoro persistente
   * Supporta struttura dinamica da metadata.structure invece di hardcoded
   */
  static async createPlan(params: PlanningPlanParams & { userId: string }): Promise<PlanningPlan> {
    const { userId, agentType, durationWeeks, daysPerWeek, metadata } = params;

    // Determina struttura dai metadata (se fornita dall'orchestratore)
    const structure = metadata?.structure as
      | {
          levels: number;
          mealsPerDay?: number;
          exercisesPerDay?: number;
        }
      | undefined;

    // Estrai mealsPerDay dai metadata o dalla struttura
    const mealsPerDay =
      structure?.mealsPerDay ||
      (metadata?.mealsPerDay as number) ||
      (agentType === 'nutrition' ? 4 : undefined);

    // Determina se creare sub-sub-task basato sulla struttura
    // Per nutrition plans, crea sempre i sub-sub-tasks se mealsPerDay è definito
    // (necessari per il salvataggio dei meals)
    const shouldCreateSubSubTasks =
      agentType === 'nutrition' &&
      mealsPerDay &&
      (structure?.levels === undefined || structure.levels >= 3);

    // Prepara metadata con mealsPerDay se è nutrition
    const enrichedMetadata = {
      ...metadata,
      ...(mealsPerDay && { mealsPerDay }),
      ...(structure && { structure }),
    };

    // Crea piano con tasks, subtasks e sub-subtasks in una transaction
    const dbPlan = await prisma.$transaction(async (tx) => {
      // Crea il piano
      const plan = await tx.planning_plans.create({
        data: {
          userId,
          agentType: agentType.toUpperCase() as $Enums.PlanningAgentType,
          durationWeeks,
          daysPerWeek,
          status: 'PENDING',
          metadata: (enrichedMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      // Crea tasks (settimane)
      for (let week = 1; week <= durationWeeks; week++) {
        const task = await tx.planning_tasks.create({
          data: {
            planId: plan.id,
            weekNumber: week,
            status: 'PENDING',
          },
        });

        // Crea subtasks (giorni)
        for (let day = 1; day <= daysPerWeek; day++) {
          const subTask = await tx.planning_sub_tasks.create({
            data: {
              taskId: task.id,
              dayNumber: day,
              dayName: this.getDayName(day),
              status: 'PENDING',
            },
          });

          // Crea sub-sub-task (pasti) se la struttura lo richiede
          // Supporta struttura dinamica invece di hardcoded
          if (shouldCreateSubSubTasks) {
            await this.createSubSubTasksInTransaction(tx, subTask.id, mealsPerDay);
          }
          // Per workout, se la struttura richiede 3+ livelli, potresti creare sub-sub-task per esercizi
          // (da implementare se necessario in futuro)
        }
      }

      return plan;
    });

    // Ricarica con relations
    return this.getPlan(dbPlan.id);
  }

  /**
   * Ottiene un piano per ID con tutte le relations
   */
  static async getPlan(planId: string): Promise<PlanningPlan> {
    const dbPlan = await prisma.planning_plans.findUnique({
      where: { id: planId },
      include: {
        tasks: {
          include: {
            subTasks: {
              include: {
                subSubTasks: {
                  orderBy: { mealNumber: 'asc' },
                },
              },
              orderBy: { dayNumber: 'asc' },
            },
          },
          orderBy: { weekNumber: 'asc' },
        },
      },
    });

    if (!dbPlan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    return this.mapDbPlanToInterface(dbPlan);
  }

  /**
   * Ottiene progress di un piano
   */
  static async getProgress(planId: string): Promise<PlanningProgress> {
    const plan = await this.getPlan(planId);

    const totalTasks = plan.tasks.length;
    const completedTasks = plan.tasks.filter((t: PlanningTask) => t.status === 'completed').length;

    const totalSubTasks = plan.tasks.reduce(
      (sum: number, task: PlanningTask) => sum + task.subTasks.length,
      0
    );
    const completedSubTasks = plan.tasks.reduce(
      (sum: number, task: PlanningTask) =>
        sum + task.subTasks.filter((st: PlanningSubTask) => st.status === 'completed').length,
      0
    );

    const currentTask = plan.tasks.find((t: PlanningTask) => t.status === 'in-progress');
    const currentSubTask = currentTask?.subTasks.find(
      (st: PlanningSubTask) => st.status === 'in-progress'
    );

    const progressPercentage =
      totalSubTasks > 0 ? Math.round((completedSubTasks / totalSubTasks) * 100) : 0;

    // Get plan status from database
    const dbPlan = await prisma.planning_plans.findUnique({
      where: { id: planId },
      select: { status: true },
    });

    return {
      planId,
      planStatus: dbPlan?.status,
      totalTasks,
      completedTasks,
      totalSubTasks,
      completedSubTasks,
      tasks: plan.tasks,
      currentTask: currentTask || undefined,
      currentSubTask: currentSubTask || undefined,
      progressPercentage,
    };
  }

  /**
   * Aggiorna stato di un task (week)
   * Atomic update con transaction
   */
  static async updateTaskStatus(
    planId: string,
    weekNumber: number,
    status: TaskStatus,
    result?: unknown,
    error?: string
  ): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        const task = await tx.planning_tasks.findFirst({
          where: { planId, weekNumber },
        });

        if (!task) throw new Error(`Task not found: week ${weekNumber}`);

        const updateData: Prisma.planning_tasksUpdateInput = {
          status: toPrismaStatus(status),
          updatedAt: new Date(),
        };

        if (status === 'in-progress' && !task.startedAt) {
          updateData.startedAt = new Date();
        }

        if (status === 'completed') {
          updateData.completedAt = new Date();
          if (result !== undefined) {
            updateData.result = result as Prisma.InputJsonValue;
          }
        }

        if (status === 'failed' && error) {
          updateData.errorMessage = error;
        }

        await tx.planning_tasks.update({
          where: { id: task.id },
          data: updateData,
        });

        // Auto-update plan status
        await this.updatePlanStatusInTransaction(tx, planId);
      });

      return true;
    } catch (error: unknown) {
      logger.error('[PlanningService] updateTaskStatus error:', error);
      return false;
    }
  }

  /**
   * Aggiorna stato di un sub-task (day) con checkpoint
   * Atomic update con transaction
   */
  static async updateSubTaskStatus(
    planId: string,
    weekNumber: number,
    dayNumber: number,
    status: TaskStatus,
    result?: unknown,
    error?: string
  ): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        // Find task
        const task = await tx.planning_tasks.findFirst({
          where: { planId, weekNumber },
          include: { subTasks: true },
        });

        if (!task) throw new Error(`Task not found: week ${weekNumber}`);

        // Find subtask
        const subTask = task.subTasks.find(
          (st: { dayNumber: number }) => st.dayNumber === dayNumber
        );
        if (!subTask) throw new Error(`SubTask not found: day ${dayNumber}`);

        // Update subtask
        const updateData: Prisma.planning_sub_tasksUpdateInput = {
          status: toPrismaStatus(status),
          updatedAt: new Date(),
        };

        if (status === 'in-progress' && !subTask.startedAt) {
          updateData.startedAt = new Date();
        }

        if (status === 'completed') {
          updateData.completedAt = new Date();
          if (result !== undefined) {
            updateData.result = result as Prisma.InputJsonValue;
          }
        }

        if (status === 'failed' && error) {
          updateData.errorMessage = error;
          updateData.retryCount = { increment: 1 };
        }

        await tx.planning_sub_tasks.update({
          where: { id: subTask.id },
          data: updateData,
        });

        // Auto-update task status based on subtasks
        // OPTIMIZATION: Reuse already-loaded subTasks instead of N+1 query
        // Update the in-memory subtask status to reflect the change we just made
        const updatedSubTasks = task.subTasks.map((st: { id: string; status: string }) =>
          st.id === subTask.id ? { ...st, status: toPrismaStatus(status) } : st
        );

        if (updatedSubTasks.every((st: { status: string }) => st.status === 'COMPLETED')) {
          await tx.planning_tasks.update({
            where: { id: task.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });
        } else if (updatedSubTasks.some((st: { status: string }) => st.status === 'IN_PROGRESS')) {
          await tx.planning_tasks.update({
            where: { id: task.id },
            data: {
              status: 'IN_PROGRESS',
              startedAt: task.startedAt || new Date(),
            },
          });
        }

        // Auto-update plan status
        await this.updatePlanStatusInTransaction(tx, planId);
      });

      return true;
    } catch (error: unknown) {
      logger.error('[PlanningService] updateSubTaskStatus error:', error);
      return false;
    }
  }

  /**
   * Ottiene prossimo task/subtask da eseguire
   */
  static async getNextTask(
    planId: string
  ): Promise<{ task: PlanningTask; subTask: PlanningSubTask } | null> {
    const plan = await this.getPlan(planId);

    for (const task of plan.tasks) {
      if (task.status === 'completed') continue;

      for (const subTask of task.subTasks) {
        if (subTask.status === 'pending') {
          return { task, subTask };
        }
      }
    }

    return null;
  }

  /**
   * Aggrega tutti i risultati in un programma completo
   */
  static async aggregateResults(planId: string): Promise<unknown> {
    const plan = await this.getPlan(planId);

    if (plan.agentType === 'workout') {
      return this.aggregateWorkoutResults(plan);
    } else if (plan.agentType === 'nutrition') {
      return this.aggregateNutritionResults(plan);
    }

    throw new Error(`Unknown agent type: ${plan.agentType}`);
  }

  /**
   * Rimuove un piano (cleanup)
   */
  static async removePlan(planId: string): Promise<boolean> {
    try {
      await prisma.planning_plans.delete({
        where: { id: planId },
      });
      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Pause un piano (per controllo utente)
   */
  static async pausePlan(planId: string): Promise<boolean> {
    try {
      await prisma.planning_plans.update({
        where: { id: planId },
        data: {
          status: 'PAUSED',
          pausedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Resume un piano pausato
   */
  static async resumePlan(planId: string): Promise<boolean> {
    try {
      await prisma.planning_plans.update({
        where: { id: planId },
        data: {
          status: 'IN_PROGRESS',
          pausedAt: null,
          updatedAt: new Date(),
        },
      });
      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Cancel un piano
   */
  static async cancelPlan(planId: string): Promise<boolean> {
    try {
      await prisma.planning_plans.update({
        where: { id: planId },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date(),
        },
      });
      return true;
    } catch (_error: unknown) {
      return false;
    }
  }

  /**
   * Aggiorna metadata del piano effettuando un merge shallow
   */
  static async setPlanMetadata(planId: string, patch: Record<string, unknown>): Promise<boolean> {
    try {
      const plan = await prisma.planning_plans.findUnique({
        where: { id: planId },
        select: { metadata: true },
      });
      const current = (plan?.metadata as Record<string, unknown>) || {};
      const merged = { ...current, ...patch } as Prisma.InputJsonValue;
      await prisma.planning_plans.update({
        where: { id: planId },
        data: { metadata: merged, updatedAt: new Date() },
      });
      return true;
    } catch (error: unknown) {
      logger.error('[PlanningService] patchMetadata error:', error);
      return false;
    }
  }

  /**
   * Ottiene tutti i piani di un utente
   */
  static async getUserPlans(userId: string): Promise<PlanningPlan[]> {
    const dbPlans = await prisma.planning_plans.findMany({
      where: { userId },
      include: {
        tasks: {
          include: {
            subTasks: {
              include: {
                subSubTasks: {
                  orderBy: { mealNumber: 'asc' },
                },
              },
              orderBy: { dayNumber: 'asc' },
            },
          },
          orderBy: { weekNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return dbPlans.map((p: DbPlan) => this.mapDbPlanToInterface(p));
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Aggiorna stato piano basato su tasks
   * Da usare all'interno di una transaction
   */
  private static async updatePlanStatusInTransaction(
    tx: Prisma.TransactionClient,
    planId: string
  ): Promise<void> {
    const tasks = await tx.planning_tasks.findMany({
      where: { planId },
    });

    if (tasks.every((t) => t.status === 'COMPLETED')) {
      await tx.planning_plans.update({
        where: { id: planId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } else if (tasks.some((t) => t.status === 'IN_PROGRESS')) {
      const plan = await tx.planning_plans.findUnique({ where: { id: planId } });
      await tx.planning_plans.update({
        where: { id: planId },
        data: {
          status: 'IN_PROGRESS',
          startedAt: plan?.startedAt || new Date(),
          updatedAt: new Date(),
        },
      });
    } else if (tasks.some((t) => t.status === 'FAILED')) {
      await tx.planning_plans.update({
        where: { id: planId },
        data: {
          status: 'FAILED',
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Map database model to interface type
   */
  private static mapDbPlanToInterface(dbPlan: DbPlan): PlanningPlan {
    return {
      id: dbPlan.id,
      agentType: dbPlan.agentType.toLowerCase() as 'workout' | 'nutrition',
      durationWeeks: dbPlan.durationWeeks,
      daysPerWeek: dbPlan.daysPerWeek,
      status: fromPrismaStatus(dbPlan.status),
      createdAt: dbPlan.createdAt,
      updatedAt: dbPlan.updatedAt,
      metadata: (dbPlan.metadata as Record<string, unknown>) || undefined,
      tasks: dbPlan.tasks.map((task: DbTask) => ({
        id: task.id,
        weekNumber: task.weekNumber,
        status: fromPrismaStatus(task.status),
        result: task.result || undefined,
        error: task.errorMessage || undefined,
        startedAt: task.startedAt || undefined,
        completedAt: task.completedAt || undefined,
        subTasks: task.subTasks.map((subTask: DbSubTask) => ({
          id: subTask.id,
          dayNumber: subTask.dayNumber,
          dayName: subTask.dayName,
          status: fromPrismaStatus(subTask.status),
          result: subTask.result || undefined,
          error: subTask.errorMessage || undefined,
          startedAt: subTask.startedAt || undefined,
          completedAt: subTask.completedAt || undefined,
          subSubTasks: (subTask.subSubTasks || []).map((subSubTask: DbSubSubTask) => ({
            id: subSubTask.id,
            mealNumber: subSubTask.mealNumber,
            mealName: subSubTask.mealName || undefined,
            mealType: subSubTask.mealType || undefined,
            status: fromPrismaStatus(subSubTask.status),
            result: subSubTask.result || undefined,
            error: subSubTask.errorMessage || undefined,
            startedAt: subSubTask.startedAt || undefined,
            completedAt: subSubTask.completedAt || undefined,
          })),
        })),
      })),
    };
  }

  /**
   * Aggrega risultati workout
   */
  private static aggregateWorkoutResults(plan: PlanningPlan): unknown {
    const weeks = plan.tasks
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((task: PlanningTask) => {
        if (!task.result) {
          // Se usiamo subtask-based generation, aggrega da subtasks
          const days = task.subTasks
            .sort((a, b) => a.dayNumber - b.dayNumber)
            .map((st: PlanningSubTask) => {
              if (!st.result) {
                throw new Error(
                  `SubTask giorno ${st.dayNumber} settimana ${task.weekNumber} non ha risultato`
                );
              }
              return st.result;
            });

          return {
            weekNumber: task.weekNumber,
            days,
          };
        }

        return task.result;
      });

    return {
      weeks,
      durationWeeks: plan.durationWeeks,
    };
  }

  /**
   * Aggrega risultati nutrition
   */
  private static aggregateNutritionResults(plan: PlanningPlan): unknown {
    const weeks = plan.tasks
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((task: PlanningTask) => {
        if (!task.result) {
          // Se usiamo subtask-based generation, aggrega da subtasks
          const days = task.subTasks
            .sort((a, b) => a.dayNumber - b.dayNumber)
            .map((st: PlanningSubTask) => {
              if (!st.result) {
                throw new Error(
                  `SubTask giorno ${st.dayNumber} settimana ${task.weekNumber} non ha risultato`
                );
              }
              return st.result;
            });

          return {
            weekNumber: task.weekNumber,
            days,
          };
        }

        return task.result;
      });

    return {
      weeks,
      durationWeeks: plan.durationWeeks,
    };
  }

  /**
   * Crea sub-sub-task (pasti) per un sub-task (giorno) in una transaction
   * Usato durante la creazione del piano
   */
  private static async createSubSubTasksInTransaction(
    tx: Prisma.TransactionClient,
    subTaskId: string,
    mealsPerDay: number
  ): Promise<void> {
    for (let mealNumber = 1; mealNumber <= mealsPerDay; mealNumber++) {
      const mealType = inferMealType(mealNumber, mealsPerDay);
      const mealName = getDefaultMealName(mealNumber, mealType);

      await tx.planning_sub_sub_tasks.create({
        data: {
          subTaskId,
          mealNumber,
          mealName,
          mealType,
          status: 'PENDING',
        },
      });
    }
  }

  /**
   * Aggiorna stato di un sub-sub-task (pasto)
   * Atomic update con transaction
   */
  static async updateSubSubTaskStatus(
    planId: string,
    weekNumber: number,
    dayNumber: number,
    mealNumber: number,
    status: TaskStatus,
    result?: unknown,
    error?: string
  ): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        // Find task
        const task = await tx.planning_tasks.findFirst({
          where: { planId, weekNumber },
          include: {
            subTasks: {
              include: {
                subSubTasks: true,
              },
            },
          },
        });

        if (!task) throw new Error(`Task not found: week ${weekNumber}`);

        // Find subtask
        const subTask = task.subTasks.find(
          (st: { dayNumber: number }) => st.dayNumber === dayNumber
        );
        if (!subTask) throw new Error(`SubTask not found: day ${dayNumber}`);

        // Find sub-sub-task
        const subSubTask = subTask.subSubTasks.find(
          (sst: { mealNumber: number }) => sst.mealNumber === mealNumber
        );
        if (!subSubTask) {
          throw new Error(`SubSubTask not found: meal ${mealNumber} day ${dayNumber}`);
        }

        // Update sub-sub-task
        const updateData: Prisma.planning_sub_sub_tasksUpdateInput = {
          status: toPrismaStatus(status),
          updatedAt: new Date(),
        };

        if (status === 'in-progress' && !subSubTask.startedAt) {
          updateData.startedAt = new Date();
        }

        if (status === 'completed') {
          updateData.completedAt = new Date();
          if (result !== undefined) {
            updateData.result = result as Prisma.InputJsonValue;
          }
        }

        if (status === 'failed' && error) {
          updateData.errorMessage = error;
          updateData.retryCount = { increment: 1 };
        }

        await tx.planning_sub_sub_tasks.update({
          where: { id: subSubTask.id },
          data: updateData,
        });

        // Auto-update sub-task status based on sub-sub-tasks
        const allSubSubTasks = await tx.planning_sub_sub_tasks.findMany({
          where: { subTaskId: subTask.id },
        });

        if (allSubSubTasks.length > 0) {
          if (allSubSubTasks.every((sst) => sst.status === 'COMPLETED')) {
            // Se tutti i pasti sono completati, il giorno può essere considerato completato
            // Ma non aggiorniamo automaticamente il sub-task per permettere flessibilità
          } else if (allSubSubTasks.some((sst) => sst.status === 'IN_PROGRESS')) {
            // Se almeno un pasto è in progress, il giorno è in progress
            if (subTask.status !== 'IN_PROGRESS') {
              await tx.planning_sub_tasks.update({
                where: { id: subTask.id },
                data: {
                  status: 'IN_PROGRESS',
                  startedAt: subTask.startedAt || new Date(),
                },
              });
            }
          }
        }
      });

      return true;
    } catch (error: unknown) {
      logger.error('[PlanningService] updateSubSubTaskStatus error:', error);
      return false;
    }
  }

  /**
   * Ottiene tutti i sub-sub-task (pasti) per un giorno specifico
   */
  static async getSubSubTasks(
    planId: string,
    weekNumber: number,
    dayNumber: number
  ): Promise<PlanningSubSubTask[]> {
    const plan = await this.getPlan(planId);
    const task = plan.tasks.find((t: PlanningTask) => t.weekNumber === weekNumber);
    if (!task) {
      throw new Error(`Task not found: week ${weekNumber}`);
    }

    const subTask = task.subTasks.find((st: PlanningSubTask) => st.dayNumber === dayNumber);
    if (!subTask) {
      throw new Error(`SubTask not found: day ${dayNumber}`);
    }

    return subTask.subSubTasks || [];
  }

  /**
   * Helper per nome giorno
   */
  private static getDayName(dayNumber: number): string {
    const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
    const index = (dayNumber - 1) % 7;
    const dayName = days[index];
    if (!dayName) {
      return 'Lunedì'; // Fallback
    }
    return dayName;
  }
}
