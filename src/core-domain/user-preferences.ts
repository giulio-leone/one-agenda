/**
 * User Preferences Domain Model
 *
 * Stores user preferences for intelligent scheduling and personalization.
 */

import { z } from 'zod';

/**
 * Working hours for a specific day
 */
export const DayWorkingHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday, 6 = Saturday
  enabled: z.boolean(),
  startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/), // HH:mm format
  endTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
});

export type DayWorkingHours = z.infer<typeof DayWorkingHoursSchema>;

/**
 * Focus time preference
 */
export const FocusTimePreferenceSchema = z.object({
  preferredTimeOfDay: z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'ANY']),
  minimumBlockMinutes: z.number().int().positive().default(60),
  maximumBlockMinutes: z.number().int().positive().default(180),
  bufferBeforeMinutes: z.number().int().nonnegative().default(15),
  bufferAfterMinutes: z.number().int().nonnegative().default(15),
});

export type FocusTimePreference = z.infer<typeof FocusTimePreferenceSchema>;

/**
 * Break preferences
 */
export const BreakPreferencesSchema = z.object({
  enableAutoBreaks: z.boolean().default(true),
  breakAfterMinutes: z.number().int().positive().default(90), // Pomodoro-style
  breakDurationMinutes: z.number().int().positive().default(15),
  longBreakAfterCycles: z.number().int().positive().default(4),
  longBreakDurationMinutes: z.number().int().positive().default(30),
});

export type BreakPreferences = z.infer<typeof BreakPreferencesSchema>;

/**
 * Scheduling preferences
 */
export const SchedulingPreferencesSchema = z.object({
  // Task scheduling
  allowTaskSplitting: z.boolean().default(true),
  preferLargeContinuousBlocks: z.boolean().default(true),
  bufferBetweenTasksMinutes: z.number().int().nonnegative().default(5),

  // Meeting scheduling
  preferBackToBackMeetings: z.boolean().default(false),
  minimumMeetingGapMinutes: z.number().int().nonnegative().default(15),
  maximumMeetingsPerDay: z.number().int().positive().optional(),

  // Priorities
  prioritizeMorningFocus: z.boolean().default(true),
  protectFocusBlocks: z.boolean().default(true),

  // Flexibility
  allowFlexibleRescheduling: z.boolean().default(true),
  rescheduleAheadDays: z.number().int().positive().default(7),
});

export type SchedulingPreferences = z.infer<typeof SchedulingPreferencesSchema>;

/**
 * Notification preferences
 */
export const NotificationPreferencesSchema = z.object({
  // Reminders
  enableTaskReminders: z.boolean().default(true),
  reminderLeadTimeMinutes: z.number().int().nonnegative().default(15),

  // Daily digest
  enableDailyDigest: z.boolean().default(true),
  dailyDigestTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/), // HH:mm

  // AI suggestions
  enableAISuggestions: z.boolean().default(true),
  suggestionFrequency: z.enum(['REALTIME', 'HOURLY', 'DAILY']).default('REALTIME'),
});

export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

/**
 * User Preferences Schema
 */
export const UserPreferencesSchema = z.object({
  userId: z.string(),

  // Time zone and locale
  timezone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).default('MM/DD/YYYY'),
  timeFormat: z.enum(['12h', '24h']).default('24h'),
  weekStartsOn: z.number().int().min(0).max(6).default(1), // 0 = Sunday, 1 = Monday

  // Working hours
  workingHours: z.array(DayWorkingHoursSchema),

  // Focus time
  focusTime: FocusTimePreferenceSchema,

  // Breaks
  breaks: BreakPreferencesSchema,

  // Scheduling
  scheduling: SchedulingPreferencesSchema,

  // Notifications
  notifications: NotificationPreferencesSchema,

  // Calendar integrations
  enabledCalendars: z
    .array(
      z.object({
        source: z.enum(['GOOGLE', 'MICROSOFT', 'ICAL']),
        accountId: z.string(),
        enabled: z.boolean(),
        syncFrequencyMinutes: z.number().int().positive().default(15),
      })
    )
    .default([]),

  // AI preferences
  aiSettings: z.object({
    enableProactiveScheduling: z.boolean().default(true),
    enableGoalBreakdown: z.boolean().default(true),
    enableProgressTracking: z.boolean().default(true),
    learningMode: z.enum(['ACTIVE', 'PASSIVE', 'DISABLED']).default('ACTIVE'),
  }),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

/**
 * User preferences update input
 */
export const UpdateUserPreferencesInputSchema = UserPreferencesSchema.partial().required({
  userId: true,
  updatedAt: true,
} as const);

export type UpdateUserPreferencesInput = z.infer<typeof UpdateUserPreferencesInputSchema>;

/**
 * Default user preferences factory
 */
export function createDefaultUserPreferences(userId: string): UserPreferences {
  const now = new Date().toISOString();

  return {
    userId,
    timezone: 'UTC',
    locale: 'en-US',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '24h',
    weekStartsOn: 1,
    workingHours: [
      { dayOfWeek: 1, enabled: true, startTime: '09:00', endTime: '17:00' }, // Monday
      { dayOfWeek: 2, enabled: true, startTime: '09:00', endTime: '17:00' }, // Tuesday
      { dayOfWeek: 3, enabled: true, startTime: '09:00', endTime: '17:00' }, // Wednesday
      { dayOfWeek: 4, enabled: true, startTime: '09:00', endTime: '17:00' }, // Thursday
      { dayOfWeek: 5, enabled: true, startTime: '09:00', endTime: '17:00' }, // Friday
      { dayOfWeek: 6, enabled: false, startTime: '09:00', endTime: '17:00' }, // Saturday
      { dayOfWeek: 0, enabled: false, startTime: '09:00', endTime: '17:00' }, // Sunday
    ],
    focusTime: {
      preferredTimeOfDay: 'MORNING',
      minimumBlockMinutes: 60,
      maximumBlockMinutes: 180,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
    },
    breaks: {
      enableAutoBreaks: true,
      breakAfterMinutes: 90,
      breakDurationMinutes: 15,
      longBreakAfterCycles: 4,
      longBreakDurationMinutes: 30,
    },
    scheduling: {
      allowTaskSplitting: true,
      preferLargeContinuousBlocks: true,
      bufferBetweenTasksMinutes: 5,
      preferBackToBackMeetings: false,
      minimumMeetingGapMinutes: 15,
      prioritizeMorningFocus: true,
      protectFocusBlocks: true,
      allowFlexibleRescheduling: true,
      rescheduleAheadDays: 7,
    },
    notifications: {
      enableTaskReminders: true,
      reminderLeadTimeMinutes: 15,
      enableDailyDigest: true,
      dailyDigestTime: '08:00',
      enableAISuggestions: true,
      suggestionFrequency: 'REALTIME',
    },
    enabledCalendars: [],
    aiSettings: {
      enableProactiveScheduling: true,
      enableGoalBreakdown: true,
      enableProgressTracking: true,
      learningMode: 'ACTIVE',
    },
    createdAt: now,
    updatedAt: now,
  };
}
