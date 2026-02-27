/**
 * OneAgenda Service
 *
 * Persistence layer for OneAgenda plans.
 * Saves generated plans to the database.
 *
 * Hexagonal: depends on Prisma for persistence.
 */

import { prisma } from '@giulio-leone/lib-core';
import { createId } from '@giulio-leone/lib-shared';

// --- Logger Interface ---

interface Logger {
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

// --- Service ---

export class OneAgendaService {
  /**
   * Save a generated plan to the database.
   * Creates an agenda_project with plan blocks as tasks.
   */
  static async savePlan(plan: unknown, logger: Logger): Promise<string> {
    const projectId = createId();
    const planData = plan as Record<string, unknown>;
    const metadata = (planData.metadata ?? {}) as Record<string, unknown>;
    const userId = metadata.userId as string | undefined;
    const blocks = (planData.blocks ?? []) as Array<Record<string, unknown>>;

    try {
      // Create the project
      await prisma.agenda_projects.create({
        data: {
          id: projectId,
          name: `Day Plan — ${new Date().toLocaleDateString('it-IT')}`,
          description: (planData.summary as Record<string, unknown>)?.overview as string ?? 'AI-generated day plan',
          type: 'PLAN',
          status: 'ACTIVE',
          userId: userId ?? '',
          metadata: {
            generatedAt: metadata.generatedAt ?? new Date().toISOString(),
            model: metadata.model,
            inputSummary: metadata.inputSummary,
          },
        },
      });

      // Create tasks from plan blocks
      if (blocks.length > 0) {
        await prisma.agenda_tasks.createMany({
          data: blocks.map((block, index) => ({
            id: createId(),
            projectId,
            title: (block.title as string) ?? `Block ${index + 1}`,
            status: 'TODO',
            priority: (block.priority as string) ?? 'MEDIUM',
            order: index,
            metadata: {
              start: block.start,
              end: block.end,
              type: block.type,
              estimatedMinutes: block.duration,
            },
          })),
        });
      }

      logger.info(`Plan saved: ${projectId} with ${blocks.length} blocks`);
      return projectId;
    } catch (error) {
      logger.error('Failed to save plan', error);
      throw error;
    }
  }
}
