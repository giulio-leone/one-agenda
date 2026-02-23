/**
 * Habit Domain Model
 *
 * Represents a habit to be tracked.
 * Habits can be daily, weekly, or on specific days.
 * Includes streak tracking and history.
 */

import { z } from 'zod';

/**
 * Habit frequency type
 */
export enum HabitFrequencyType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  SPECIFIC_DAYS = 'SPECIFIC_DAYS',
}

/**
 * Habit Schema
 */
export const HabitSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),

  // Frequency configuration
  frequencyType: z.nativeEnum(HabitFrequencyType),
  frequencyDays: z.array(z.number().int().min(0).max(6)).optional(), // 0=Sun, 6=Sat, used if SPECIFIC_DAYS
  targetCount: z.number().int().positive().default(1), // e.g., 1 time per day, or 3 times per week

  // Tracking
  streak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  history: z
    .array(
      z.object({
        date: z.string().datetime(), // Date completed
        count: z.number().int().positive(), // How many times completed on that date
      })
    )
    .default([]),

  // Reminders
  reminders: z.array(z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/)).default([]), // HH:mm times

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archived: z.boolean().default(false),
});

export type Habit = z.infer<typeof HabitSchema>;

/**
 * Habit creation input
 */
export const CreateHabitInputSchema = HabitSchema.omit({
  id: true,
  streak: true,
  longestStreak: true,
  history: true,
  createdAt: true,
  updatedAt: true,
} as const).partial({
  description: true,
  frequencyDays: true,
  targetCount: true,
  reminders: true,
  archived: true,
});

export type CreateHabitInput = z.infer<typeof CreateHabitInputSchema>;

/**
 * Habit update input
 */
export const UpdateHabitInputSchema = HabitSchema.partial().required({
  id: true,
  updatedAt: true,
} as const);

export type UpdateHabitInput = z.infer<typeof UpdateHabitInputSchema>;
