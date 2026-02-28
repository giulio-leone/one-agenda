/**
 * OneAgenda Database
 *
 * Re-export from one-agenda package for convenience
 * Note: This is a temporary solution until one-agenda package exports db
 */

// For now, we'll create a stub that matches the interface
// TODO: Move db.ts to one-agenda package and export it properly
import { prisma } from '@giulio-leone/lib-core';
import { randomUUID } from 'crypto';
import { TaskStatus, TaskPriority } from './core-domain/task';
import { GoalStatus, GoalTimeHorizon } from './core-domain/goal';
import type { Task } from './core-domain/task';
import type { Goal } from './core-domain/goal';
import type { Prisma, UserRole } from '@prisma/client';
import { logger, toPrismaJsonValue } from '@giulio-leone/lib-shared';

type ActorContext = { id: string; role?: UserRole };

export interface AgendaUserPreferencesUpdate {
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  focusBlocks: number;
  breakDuration: number;
}

const ADMIN_ROLES: UserRole[] = ['ADMIN', 'SUPER_ADMIN'];
const isAdminLike = (role?: UserRole) => (role ? ADMIN_ROLES.includes(role) : false);
const isCoach = (role?: UserRole) => role === 'COACH';

const buildTaskVisibilityWhere = (actor: ActorContext): Prisma.agenda_tasksWhereInput => {
  if (isAdminLike(actor.role)) return {};

  if (isCoach(actor.role)) {
    return {
      OR: [
        { assignedByCoachId: actor.id },
        { userId: actor.id },
        { assignedToUserId: actor.id, visibility: 'SHARED_WITH_COACH' },
      ],
    };
  }

  return {
    OR: [{ userId: actor.id }, { assignedToUserId: actor.id }],
  };
};

const buildGoalVisibilityWhere = (actor: ActorContext): Prisma.agenda_goalsWhereInput => {
  if (isAdminLike(actor.role)) return {};

  // Goals use userId field for ownership
  return { userId: actor.id };
};

export const oneagendaDB = {
  async getTasks(
    actorId: string,
    filters?: {
      status?: TaskStatus;
      priority?: TaskPriority;
      tags?: string[];
      goalId?: string;
      summary?: boolean;
    },
    context?: { role?: UserRole }
  ): Promise<Task[]> {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const where: Prisma.agenda_tasksWhereInput = {
        ...buildTaskVisibilityWhere(actor),
        ...(filters?.status && { status: filters.status }),
        ...(filters?.priority && { priority: filters.priority }),
        ...(filters?.goalId && { goalId: filters.goalId }),
      };

      // Define the relation shape we expect
      // We use a union type if the shape differs significantly, or a superset if compatible.
      // Here both select and include strategies return other_agenda_tasks with id.
      // We assert the result to this payload type because TS cannot infer conditional spread types effectively.
      type TaskWithRelations = Prisma.agenda_tasksGetPayload<{
        include: { other_agenda_tasks: { select: { id: true } } };
      }>;

      const queryArgs: Prisma.agenda_tasksFindManyArgs = {
        where,
        orderBy: {
          createdAt: 'desc',
        },
        ...(filters?.summary
          ? {
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                tags: true,
                deadline: true,
                scheduledStart: true,
                scheduledEnd: true,
                completedAt: true,
                estimatedMinutes: true,
                confidence: true,
                actualMinutes: true,
                complexity: true,
                dependencies: true,
                blockedBy: true,
                goalId: true,
                milestoneId: true,
                visibility: true,
                assignedToUserId: true,
                assignedByCoachId: true,
                parentId: true,
                createdAt: true,
                updatedAt: true,
                userId: true,
                reminders: true,
                context: true,
                other_agenda_tasks: {
                  select: { id: true },
                },
              },
            }
          : {
              include: {
                other_agenda_tasks: {
                  select: { id: true },
                },
              },
            }),
      };

      const tasks = (await prisma.agenda_tasks.findMany(
        queryArgs
      )) as unknown as TaskWithRelations[]; // Structural assertion: we know our query structure matches this type

      return tasks.map(
        (task): Task => ({
          id: task.id,
          title: task.title ?? 'Untitled task',
          description: task.description ?? undefined,
          status: task.status as unknown as TaskStatus,
          priority: task.priority as unknown as TaskPriority,
          tags: task.tags ?? [],
          deadline: task.deadline?.toISOString(),
          scheduledStart: task.scheduledStart?.toISOString(),
          scheduledEnd: task.scheduledEnd?.toISOString(),
          completedAt: task.completedAt?.toISOString(),
          effort: {
            estimatedMinutes: task.estimatedMinutes ?? 0,
            confidence: Number(task.confidence ?? 0.5),
            actualMinutes: task.actualMinutes ?? undefined,
            complexity: (task.complexity as Task['effort']['complexity']) ?? 'MODERATE',
          },
          reminders: (task.reminders as unknown as Task['reminders']) ?? [],
          dependencies: task.dependencies ?? [],
          blockedBy: task.blockedBy ?? [],
          goalId: task.goalId ?? undefined,
          milestoneId: task.milestoneId ?? undefined,
          context: (task.context as Record<string, unknown> | null) ?? {},
          visibility: (task.visibility as 'PRIVATE' | 'SHARED_WITH_COACH' | null) ?? undefined,
          assignedToUserId: task.assignedToUserId ?? undefined,
          assignedByCoachId: task.assignedByCoachId ?? undefined,
          parentId: task.parentId ?? undefined,
          subtasks: task.other_agenda_tasks?.map((t: { id: string }) => t.id) ?? [],
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
          createdBy: task.userId ?? actorId,
        })
      );
    } catch (error: unknown) {
      logger.error('oneagendaDB.getTasks failed', { error, actorId, filters });
      return [];
    }
  },

  async getTask(id: string, actorId: string, context?: { role?: UserRole }): Promise<Task | null> {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const task = await prisma.agenda_tasks.findFirst({
        where: { id, ...buildTaskVisibilityWhere(actor) },
        include: {
          other_agenda_tasks: {
            select: { id: true },
          },
        },
      });
      return task
        ? {
            id: task.id,
            title: task.title ?? 'Untitled task',
            description: task.description ?? undefined,
            status: task.status as unknown as TaskStatus,
            priority: task.priority as unknown as TaskPriority,
            tags: task.tags ?? [],
            deadline: task.deadline?.toISOString(),
            scheduledStart: task.scheduledStart?.toISOString(),
            scheduledEnd: task.scheduledEnd?.toISOString(),
            completedAt: task.completedAt?.toISOString(),
            effort: {
              estimatedMinutes: task.estimatedMinutes ?? 0,
              confidence: Number(task.confidence ?? 0.5),
              actualMinutes: task.actualMinutes ?? undefined,
              complexity: (task.complexity as Task['effort']['complexity']) ?? 'MODERATE',
            },
            reminders: (task.reminders as unknown as Task['reminders']) ?? [],
            dependencies: task.dependencies ?? [],
            blockedBy: task.blockedBy ?? [],
            goalId: task.goalId ?? undefined,
            milestoneId: task.milestoneId ?? undefined,
            context: (task.context as Record<string, unknown> | null) ?? {},
            visibility: (task.visibility as 'PRIVATE' | 'SHARED_WITH_COACH' | null) ?? undefined,
            assignedToUserId: task.assignedToUserId ?? undefined,
            assignedByCoachId: task.assignedByCoachId ?? undefined,
            parentId: task.parentId ?? undefined,
            subtasks: task.other_agenda_tasks?.map((t: any) => t.id) ?? [],
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            createdBy: task.userId ?? actorId,
          }
        : null;
    } catch (error: unknown) {
      logger.error('oneagendaDB.getTask failed', { error, actorId, taskId: id });
      return null;
    }
  },

  async createTask(
    actorId: string,
    input: Partial<Prisma.agenda_tasksUncheckedCreateInput>, // Changed to Unchecked to allow scalar FKs
    context?: { role?: UserRole }
  ) {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const coachMode = isCoach(actor.role);
      const assignedTo = input.assignedToUserId ?? null;
      const ownerId = coachMode && assignedTo ? assignedTo : actorId;

      const task = await prisma.agenda_tasks.create({
        data: {
          id: input.id || randomUUID(),
          userId: ownerId,
          assignedToUserId: assignedTo,
          assignedByCoachId: coachMode ? actorId : null,
          visibility: input.visibility ?? 'PRIVATE',
          title: input.title || 'Untitled task',
          description: input.description ?? null,
          status: input.status || 'TODO',
          priority: input.priority || 'MEDIUM',
          estimatedMinutes: input.estimatedMinutes || 30,
          actualMinutes: input.actualMinutes ?? null,
          complexity: input.complexity || 'MODERATE',
          confidence: input.confidence ?? 0.5,
          deadline: input.deadline || null,
          scheduledStart: input.scheduledStart || null,
          scheduledEnd: input.scheduledEnd || null,
          completedAt: input.completedAt || null,
          goalId: input.goalId || null,
          milestoneId: input.milestoneId || null,
          dependencies: (input.dependencies as string[]) || [], // Postgres array
          blockedBy: (input.blockedBy as string[]) || [],
          parentId: input.parentId || null,
          tags: (input.tags as string[]) || [],
          context: toPrismaJsonValue((input.context as Record<string, unknown>) ?? {}),
          createdBy: actorId,
        },
      });

      return {
        ...task,
        dueDate: task.deadline?.toISOString(),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
    } catch (error: unknown) {
      logger.error('oneagendaDB.createTask failed', { error, actorId, input });
      throw error;
    }
  },

  async updateTask(
    id: string,
    actorId: string,
    input: Partial<Prisma.agenda_tasksUncheckedUpdateInput>,
    context?: { role?: UserRole }
  ) {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const existing = await prisma.agenda_tasks.findFirst({
        where: { id, ...buildTaskVisibilityWhere(actor) },
      });
      if (!existing) {
        throw new Error('Task not found or access denied');
      }

      const task = await prisma.agenda_tasks.update({
        where: { id },
        data: {
          ...input,
          deadline: (input.deadline as Date | undefined) || undefined,
          updatedAt: new Date(),
        },
      });

      return {
        ...task,
        dueDate: task.deadline?.toISOString(),
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
    } catch (error: unknown) {
      logger.error('oneagendaDB.updateTask failed', { error, actorId, taskId: id, input });
      throw error;
    }
  },

  async deleteTask(id: string, actorId: string, context?: { role?: UserRole }) {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const existing = await prisma.agenda_tasks.findFirst({
        where: { id, ...buildTaskVisibilityWhere(actor) },
      });
      if (!existing) {
        throw new Error('Task not found or access denied');
      }

      await prisma.agenda_tasks.delete({ where: { id } });
      return { success: true };
    } catch (error: unknown) {
      logger.error('oneagendaDB.deleteTask failed', { error, actorId, taskId: id });
      throw error;
    }
  },

  async getGoals(
    actorId: string,
    filters?: {
      status?: GoalStatus;
    },
    context?: { role?: UserRole }
  ): Promise<Goal[]> {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const where: Prisma.agenda_goalsWhereInput = {
        ...buildGoalVisibilityWhere(actor),
        ...(filters?.status && { status: filters.status }),
      };

      const goals = await prisma.agenda_goals.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
      });

      return goals.map(
        (goal): Goal => ({
          id: goal.id,
          title: goal.title ?? 'Untitled goal',
          description: goal.description ?? undefined,
          status: goal.status as unknown as GoalStatus,
          timeHorizon: goal.timeHorizon as unknown as GoalTimeHorizon,
          startDate: goal.startDate?.toISOString() ?? new Date().toISOString(),
          targetDate: goal.targetDate?.toISOString() ?? new Date().toISOString(),
          completedAt: goal.completedAt?.toISOString() ?? undefined,
          progress: {
            completedMilestones: goal.completedMilestones ?? 0,
            totalMilestones: goal.totalMilestones ?? 0,
            completedTasks: goal.completedTasks ?? 0,
            totalTasks: goal.totalTasks ?? 0,
            percentComplete: goal.percentComplete ?? 0,
            daysRemaining: goal.daysRemaining ?? undefined,
            projectedCompletionDate: goal.projectedCompletionDate?.toISOString(),
          },
          parentGoalId: goal.parentGoalId ?? undefined,
          milestoneIds: goal.milestoneIds ?? [],
          dailyProgressNotes:
            (goal.dailyProgressNotes as unknown as Goal['dailyProgressNotes']) ?? [],
          tags: goal.tags ?? [],
          category: goal.category ?? undefined,
          aiInsights: (goal.aiInsights as unknown as Goal['aiInsights']) ?? [],
          context: (goal.context as Record<string, unknown>) ?? {},
          createdAt: goal.createdAt.toISOString(),
          updatedAt: goal.updatedAt.toISOString(),
          createdBy: goal.userId ?? actorId,
        })
      );
    } catch (error: unknown) {
      logger.error('oneagendaDB.getGoals failed', { error, actorId, filters });
      return [];
    }
  },

  async getGoal(id: string, actorId: string, context?: { role?: UserRole }): Promise<Goal | null> {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const goal = await prisma.agenda_goals.findFirst({
        where: { id, ...buildGoalVisibilityWhere(actor) },
      });
      return goal
        ? {
            id: goal.id,
            title: goal.title ?? 'Untitled goal',
            description: goal.description ?? undefined,
            status: goal.status as unknown as GoalStatus,
            timeHorizon: goal.timeHorizon as unknown as GoalTimeHorizon,
            startDate: goal.startDate?.toISOString() ?? new Date().toISOString(),
            targetDate: goal.targetDate?.toISOString() ?? new Date().toISOString(),
            completedAt: goal.completedAt?.toISOString() ?? undefined,
            progress: {
              completedMilestones: goal.completedMilestones ?? 0,
              totalMilestones: goal.totalMilestones ?? 0,
              completedTasks: goal.completedTasks ?? 0,
              totalTasks: goal.totalTasks ?? 0,
              percentComplete: goal.percentComplete ?? 0,
              daysRemaining: goal.daysRemaining ?? undefined,
              projectedCompletionDate: goal.projectedCompletionDate?.toISOString(),
            },
            parentGoalId: goal.parentGoalId ?? undefined,
            milestoneIds: goal.milestoneIds ?? [],
            dailyProgressNotes:
              (goal.dailyProgressNotes as unknown as Goal['dailyProgressNotes']) ?? [],
            tags: goal.tags ?? [],
            category: goal.category ?? undefined,
            aiInsights: (goal.aiInsights as unknown as Goal['aiInsights']) ?? [],
            context: (goal.context as Record<string, unknown>) ?? {},
            createdAt: goal.createdAt.toISOString(),
            updatedAt: goal.updatedAt.toISOString(),
            createdBy: goal.userId ?? actorId,
          }
        : null;
    } catch (error: unknown) {
      logger.error('oneagendaDB.getGoal failed', { error, actorId, goalId: id });
      return null;
    }
  },

  async createGoal(userId: string, input: Partial<Prisma.agenda_goalsUncheckedCreateInput>) {
    try {
      const goal = await prisma.agenda_goals.create({
        data: {
          id: input.id || randomUUID(),
          userId,
          title: input.title || 'Nuovo obiettivo',
          description: input.description ?? null,
          status: input.status || 'ACTIVE',
          timeHorizon: input.timeHorizon || 'MEDIUM_TERM',
          startDate: (input.startDate as Date | undefined) || new Date(),
          targetDate:
            (input.targetDate as Date | undefined) || new Date(Date.now() + 30 * 86400000),
          completedAt: input.completedAt || null,
          completedMilestones: input.completedMilestones || 0,
          totalMilestones: input.totalMilestones || 0,
          completedTasks: input.completedTasks || 0,
          totalTasks: input.totalTasks || 0,
          percentComplete: input.percentComplete || 0,
          daysRemaining: input.daysRemaining ?? null,
          projectedCompletionDate: input.projectedCompletionDate || null,
          parentGoalId: input.parentGoalId || null,
          tags: (input.tags as string[]) || [],
          category: input.category || null,
          context: toPrismaJsonValue((input.context as Record<string, unknown>) ?? {}),
        },
      });

      return {
        ...goal,
        targetDate: goal.targetDate?.toISOString(),
        createdAt: goal.createdAt.toISOString(),
        updatedAt: goal.updatedAt.toISOString(),
      };
    } catch (error: unknown) {
      logger.error('oneagendaDB.createGoal failed', { error, userId, input });
      throw error;
    }
  },

  async deleteGoal(id: string, actorId: string, context?: { role?: UserRole }) {
    try {
      const actor: ActorContext = { id: actorId, role: context?.role };
      const existing = await prisma.agenda_goals.findFirst({
        where: { id, ...buildGoalVisibilityWhere(actor) },
      });
      if (!existing) {
        throw new Error('Goal not found or access denied');
      }

      await prisma.agenda_goals.delete({ where: { id } });
      return { success: true };
    } catch (error: unknown) {
      logger.error('oneagendaDB.deleteGoal failed', { error, actorId, goalId: id });
      throw error;
    }
  },

  async getUserPreferences(userId: string) {
    const prefs = await prisma.agenda_user_preferences.findUnique({
      where: { userId },
    });

    return prefs
      ? {
          userId: prefs.userId,
          workingHoursStart: prefs.workingHoursStart,
          workingHoursEnd: prefs.workingHoursEnd,
          timezone: prefs.timezone,
          focusBlocks: prefs.focusBlocks,
          breakDuration: prefs.breakDuration,
        }
      : null;
  },

  async updateUserPreferences(userId: string, preferences: Partial<AgendaUserPreferencesUpdate>) {
    try {
      const data: Partial<AgendaUserPreferencesUpdate> = {
        workingHoursStart: preferences.workingHoursStart,
        workingHoursEnd: preferences.workingHoursEnd,
        timezone: preferences.timezone,
        focusBlocks: preferences.focusBlocks,
        breakDuration: preferences.breakDuration,
      };

      // Remove undefined keys
      (Object.keys(data) as Array<keyof AgendaUserPreferencesUpdate>).forEach((key: any) => {
        if ((data as any)[key] === undefined) delete (data as any)[key];
      });

      const updated = await prisma.agenda_user_preferences.upsert({
        where: { userId },
        update: data as Parameters<typeof prisma.agenda_user_preferences.upsert>[0]['update'],
        create: {
          userId,
          workingHoursStart: preferences.workingHoursStart ?? '09:00',
          workingHoursEnd: preferences.workingHoursEnd ?? '17:00',
          timezone: preferences.timezone ?? 'Europe/Rome',
          focusBlocks: preferences.focusBlocks ?? 0,
          breakDuration: preferences.breakDuration ?? 15,
        },
      });

      return {
        userId: updated.userId,
        workingHoursStart: updated.workingHoursStart,
        workingHoursEnd: updated.workingHoursEnd,
        timezone: updated.timezone,
        focusBlocks: updated.focusBlocks,
        breakDuration: updated.breakDuration,
      };
    } catch (error) {
      logger.error('oneagendaDB.updateUserPreferences failed', { error, userId });
      throw error;
    }
  },
};
