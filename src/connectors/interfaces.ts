import { z } from 'zod';
import type { Event, Task, EmailAction, Person } from '../domain/types';

export interface CalendarProvider {
  id: string;
  name: string;
  listEvents(params: { start: string; end: string; timezone: string }): Promise<Event[]>;
  createEvent(event: Event): Promise<Event>;
  proposeTimeSlots(params: {
    attendees: Person[];
    durationMinutes: number;
    start: string;
    end: string;
  }): Promise<Event[]>;
}

export interface MailProvider {
  id: string;
  name: string;
  listThreads(params: { after?: string; before?: string }): Promise<EmailAction[]>;
  sendQuickReply(threadId: string, body: string): Promise<void>;
  extractTasksFromThread(threadId: string): Promise<Task[]>;
}

export interface TaskProvider {
  id: string;
  name: string;
  listTasks(params?: { project?: string; status?: 'OPEN' | 'CLOSED' }): Promise<Task[]>;
  upsertTask(task: Task): Promise<Task>;
  completeTask(taskId: string): Promise<void>;
}

export type ProviderType = 'calendar' | 'mail' | 'task';

export const ProviderFeatureFlagSchema = z.object({
  providerId: z.string(),
  type: z.enum(['calendar', 'mail', 'task']),
  isEnabled: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ProviderFeatureFlag = z.infer<typeof ProviderFeatureFlagSchema>;
