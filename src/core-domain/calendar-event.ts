/**
 * Calendar Event Domain Model
 *
 * Represents calendar events from internal and external sources
 * with context-aware scheduling support.
 */

import { z } from 'zod';

/**
 * Event source
 */
export enum EventSource {
  INTERNAL = 'INTERNAL',
  GOOGLE = 'GOOGLE',
  MICROSOFT = 'MICROSOFT',
  ICAL = 'ICAL',
  OTHER = 'OTHER',
}

/**
 * Event type
 */
export enum EventType {
  MEETING = 'MEETING',
  FOCUS = 'FOCUS',
  BREAK = 'BREAK',
  PERSONAL = 'PERSONAL',
  TASK_BLOCK = 'TASK_BLOCK',
  OTHER = 'OTHER',
}

/**
 * Event status
 */
export enum EventStatus {
  CONFIRMED = 'CONFIRMED',
  TENTATIVE = 'TENTATIVE',
  CANCELLED = 'CANCELLED',
}

/**
 * Attendee Schema
 */
export const AttendeeSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
  responseStatus: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE', 'NEEDS_ACTION']).optional(),
  optional: z.boolean().default(false),
});

export type Attendee = z.infer<typeof AttendeeSchema>;

/**
 * Recurrence Rule Schema (simplified)
 */
export const RecurrenceRuleSchema = z.object({
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  interval: z.number().int().positive().default(1),
  until: z.string().datetime().optional(),
  count: z.number().int().positive().optional(),
  byDay: z.array(z.enum(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])).optional(),
});

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;

/**
 * Calendar Event Schema
 */
export const CalendarEventSchema = z.object({
  id: z.string(),
  externalId: z.string().optional(), // ID from external calendar
  source: z.nativeEnum(EventSource),

  // Basic info
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  location: z.string().optional(),

  // Time
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  allDay: z.boolean().default(false),
  timezone: z.string().default('UTC'),

  // Status and type
  status: z.nativeEnum(EventStatus),
  type: z.nativeEnum(EventType),

  // Meeting details
  attendees: z.array(AttendeeSchema).default([]),
  organizer: AttendeeSchema.optional(),
  meetingUrl: z.url().optional(),

  // Recurrence
  recurrence: RecurrenceRuleSchema.optional(),
  recurringEventId: z.string().optional(), // parent recurring event

  // Context-aware scheduling
  flexibility: z.enum(['FIXED', 'FLEXIBLE', 'MOVABLE']).default('FIXED'),
  priority: z.number().int().min(0).max(10).default(5),

  // Integration
  taskId: z.string().optional(), // linked task

  // Reminders
  reminders: z
    .array(
      z.object({
        method: z.enum(['EMAIL', 'POPUP', 'SMS']),
        minutesBefore: z.number().int().nonnegative(),
      })
    )
    .default([]),

  // Sync metadata
  lastSyncedAt: z.string().datetime().optional(),
  syncToken: z.string().optional(),

  // Context
  context: z.record(z.string(), z.unknown()).optional(),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdBy: z.string(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

/**
 * Calendar event creation input
 */
export const CreateCalendarEventInputSchema = CalendarEventSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
} as const).partial({
  source: true,
  status: true,
  type: true,
  allDay: true,
  timezone: true,
  attendees: true,
  reminders: true,
  flexibility: true,
  priority: true,
});

export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventInputSchema>;

/**
 * Calendar event update input
 */
export const UpdateCalendarEventInputSchema = CalendarEventSchema.partial().required({
  id: true,
  updatedAt: true,
} as const);

export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventInputSchema>;
