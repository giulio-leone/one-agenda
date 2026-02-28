import { db } from '@giulio-leone/lib-core';
import type { OneAgendaPlan } from './agents/types';
import type { Logger } from '@giulio-leone/lib-shared';

export class OneAgendaService {
  /**
   * Save a generated OneAgenda plan to the database.
   * Creates Goals, Projects, Milestones, and Tasks.
   * Uses robust ID mapping to handle AI-generated simple IDs.
   */
  static async savePlan(plan: OneAgendaPlan, logger?: Logger): Promise<void> {
    const { userId, goals, tasks, schedule } = plan;

    logger?.info('Starting plan persistence', {
      goals: goals.length,
      tasks: tasks.length,
      userId,
    });

    // START TRANSACTION - 5 minute timeout for large plans with many tasks
    await db.$transaction(
      async (tx) => {
        // Maps to track ID mapping from Plan (temp IDs) to DB (CUIDs)
        const goalMap = new Map<string, string>(); // planGoalId -> dbGoalId
        const projectMap = new Map<string, string>(); // planGoalId -> dbProjectId
        const milestoneMap = new Map<string, string>(); // planMilestoneId -> dbMilestoneId

        // Also store by index for fallback matching
        const goalsByIndex = new Map<number, { dbGoalId: string; dbProjectId: string }>();
        const milestonesByIndex = new Map<string, string>(); // "goalIdx_milestoneIdx" -> dbMilestoneId
        const projectFirstMilestoneMap = new Map<string, string>(); // dbProjectId -> first dbMilestoneId (for fallback)

        // 1. Process Goals
        goals.forEach((goal, goalIdx) => {
          // Store goal ID variations for flexible matching
          goalMap.set(goal.id, ''); // Will be filled after creation
          goalMap.set(`goal_${goalIdx + 1}`, ''); // Simple index format
        });

        let goalIdx = 0;
        for (const goal of goals) {
          // Create Goal
          const dbGoal = await tx.agenda_goals.create({
            data: {
              userId,
              title: goal.title,
              description: goal.description,
              status: 'ACTIVE',
              timeHorizon: goal.timeHorizon,
              targetDate: goal.targetDate ? new Date(goal.targetDate) : undefined,
              totalMilestones: goal.milestones?.length || 0,
              aiInsights: JSON.stringify({
                risks: goal.risks || [],
                successMetrics: goal.successMetrics || [],
              }),
            },
          });

          // Map by actual ID and by index
          goalMap.set(goal.id, dbGoal.id);
          goalMap.set(`goal_${goalIdx + 1}`, dbGoal.id);

          // Create Associated Project
          const dbProject = await tx.agenda_projects.create({
            data: {
              userId,
              name: goal.title,
              description: goal.description,
              status: 'ACTIVE',
              startDate: new Date(),
              endDate: goal.targetDate ? new Date(goal.targetDate) : undefined,
            },
          });
          projectMap.set(goal.id, dbProject.id);
          projectMap.set(`goal_${goalIdx + 1}`, dbProject.id);

          goalsByIndex.set(goalIdx, { dbGoalId: dbGoal.id, dbProjectId: dbProject.id });

          // Process Milestones
          const goalMilestoneIds: string[] = [];
          const milestones = goal.milestones || [];

          for (let milestoneIdx = 0; milestoneIdx < milestones.length; milestoneIdx++) {
            const milestone = milestones[milestoneIdx];
            if (!milestone) continue;

            const dbMilestone = await tx.agenda_milestones.create({
              data: {
                projectId: dbProject.id,
                name: milestone.name,
                description: milestone.description,
                status: 'PENDING',
                order: milestone.order || milestoneIdx + 1,
                dueDate: milestone.dueDate ? new Date(milestone.dueDate) : undefined,
              },
            });

            // Map by actual ID and various simple formats
            milestoneMap.set(milestone.id, dbMilestone.id);
            milestoneMap.set(`milestone_${milestoneIdx + 1}`, dbMilestone.id);
            milestoneMap.set(`milestone_00${milestoneIdx + 1}`, dbMilestone.id);
            milestoneMap.set(
              `milestone_${String(milestoneIdx + 1).padStart(3, '0')}`,
              dbMilestone.id
            );
            milestonesByIndex.set(`${goalIdx}_${milestoneIdx}`, dbMilestone.id);

            goalMilestoneIds.push(dbMilestone.id);

            // Cache first milestone for this project (for task fallback)
            if (!projectFirstMilestoneMap.has(dbProject.id)) {
              projectFirstMilestoneMap.set(dbProject.id, dbMilestone.id);
            }
          }

          // Update Goal with milestone IDs
          if (goalMilestoneIds.length > 0) {
            await tx.agenda_goals.update({
              where: { id: dbGoal.id },
              data: { milestoneIds: goalMilestoneIds },
            });
          }

          goalIdx++;
        }

        // 2. Process Tasks
        let savedTasks = 0;
        let skippedTasks = 0;

        for (const task of tasks) {
          // Try to resolve goal ID
          let dbGoalId = goalMap.get(task.goalId);
          let dbProjectId = projectMap.get(task.goalId);

          // Fallback: use first goal if only one exists
          if (!dbGoalId && goals.length === 1) {
            const firstGoal = goalsByIndex.get(0);
            dbGoalId = firstGoal?.dbGoalId;
            dbProjectId = firstGoal?.dbProjectId;
          }

          // Try to resolve milestone ID
          let dbMilestoneId = milestoneMap.get(task.milestoneId);

          // Fallback: use first milestone of the goal (from cache, no DB query)
          if (!dbMilestoneId && dbProjectId) {
            dbMilestoneId = projectFirstMilestoneMap.get(dbProjectId);
          }

          if (!dbGoalId || !dbProjectId) {
            logger?.warn('Skipping task due to missing goal/project references', {
              task: task.title,
              planGoalId: task.goalId,
              planMilestoneId: task.milestoneId,
            });
            skippedTasks++;
            continue;
          }

          // Find schedule data
          const scheduleBlock = schedule?.days
            ?.flatMap((d) => d.blocks || [])
            .find((b: any) => b.sourceId === task.id && b.type === 'TASK');

          const scheduledStart = scheduleBlock?.start ? new Date(scheduleBlock.start) : undefined;
          const scheduledEnd = scheduleBlock?.end ? new Date(scheduleBlock.end) : undefined;

          // Create Task
          await tx.agenda_tasks.create({
            data: {
              userId,
              title: task.title,
              description: task.description,
              status: 'TODO',
              priority:
                task.priority === 'CRITICAL'
                  ? 'HIGH'
                  : task.priority === 'HIGH'
                    ? 'HIGH'
                    : 'MEDIUM',
              estimatedMinutes: task.estimatedMinutes,
              goalId: dbGoalId,
              projectId: dbProjectId,
              milestoneId: dbMilestoneId,
              scheduledStart,
              scheduledEnd,
              deadline: task.suggestedDeadline ? new Date(task.suggestedDeadline) : undefined,
              complexity: task.complexity,
              tags: task.tags || [],
              assignedToUserId: userId,
              visibility: 'PRIVATE',
              context: JSON.stringify({ dependencies: task.dependencies || [] }),
            },
          });
          savedTasks++;
        }

        logger?.info('Tasks processed', { savedTasks, skippedTasks });
      },
      {
        timeout: 300000, // 5 minutes
        maxWait: 30000, // 30 seconds max wait to acquire lock
      }
    );

    logger?.info('Plan persisted successfully');
  }
}
