/**
 * HabitCard Component
 *
 * Display a habit with its streak and a quick way to check it off.
 */

import React from 'react';
import type { Habit } from '../core-domain';
import { Flame, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { VisibilityBadge } from './visibility-badge';
import { AssignmentChips } from './assignment-chips';

// Utility for tailwind classes
function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface HabitCardProps {
  habit: Habit;
  onToggle?: (habitId: string) => void;
  className?: string;
}

export const HabitCard: React.FC<HabitCardProps> = ({ habit, onToggle, className }) => {
  type HabitWithVisibility = Habit & {
    visibility?: 'PRIVATE' | 'SHARED_WITH_COACH';
    assignedToUserId?: string | null;
    assignedByCoachId?: string | null;
  };
  const habitWithVisibility = habit as HabitWithVisibility;

  const isCompletedToday = habit.history.some(
    (h) => new Date(h.date).toDateString() === new Date().toDateString()
  );

  const visibility = habitWithVisibility.visibility ?? undefined;
  const assignedToUserId = habitWithVisibility.assignedToUserId ?? undefined;
  const assignedByCoachId = habitWithVisibility.assignedByCoachId ?? undefined;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-neutral-50 p-5 shadow-sm transition-all hover:shadow-md dark:bg-neutral-900/80',
        isCompletedToday
          ? 'border-green-200 bg-green-50/50 dark:border-green-900/30 dark:bg-green-900/10'
          : 'border-neutral-200 dark:border-neutral-800',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3
              className={cn(
                'text-lg font-semibold transition-colors',
                isCompletedToday
                  ? 'text-green-900 dark:text-green-100'
                  : 'text-slate-900 dark:text-slate-100'
              )}
            >
              {habit.title}
            </h3>
            {habit.streak > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <Flame className="h-3 w-3 fill-current" />
                <span>{habit.streak}</span>
              </div>
            )}
          </div>

          {habit.description && (
            <p className="mb-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
              {habit.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
            <span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {habit.frequencyType === 'DAILY'
                ? 'Daily'
                : habit.frequencyType === 'WEEKLY'
                  ? 'Weekly'
                  : 'Custom'}
            </span>
            <span>Target: {habit.targetCount}x</span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <VisibilityBadge visibility={visibility} />
            <AssignmentChips
              assignedToUserId={assignedToUserId}
              assignedByCoachId={assignedByCoachId}
              className="text-slate-500 dark:text-slate-400"
            />
          </div>
        </div>

        <button
          onClick={() => onToggle?.(habit.id)}
          className={cn(
            'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all active:scale-95',
            isCompletedToday
              ? 'border-green-500 bg-green-500 text-white shadow-green-200 dark:shadow-none'
              : 'border-neutral-200 bg-neutral-50 text-neutral-300 hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-600 dark:hover:border-neutral-600 dark:hover:text-neutral-500'
          )}
          aria-label={isCompletedToday ? 'Mark as incomplete' : 'Mark as complete'}
        >
          <Check className={cn('h-6 w-6', isCompletedToday && 'stroke-[3px]')} />
        </button>
      </div>

      {/* Progress bar for weekly/custom targets could go here */}
    </div>
  );
};
