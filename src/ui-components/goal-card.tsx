/**
 * GoalCard Component
 *
 * Cross-platform card component for displaying goals
 */

import React from 'react';
import type { Goal } from '../core-domain';
import { format } from 'date-fns';
import { Target, Calendar, TrendingUp } from 'lucide-react';

export interface GoalCardLabels {
  progress: string;
  milestones: string;
}

export interface GoalCardProps {
  goal: Goal;
  onPress?: () => void;
  labels?: GoalCardLabels;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  onPress,
  labels = {
    progress: 'Progress',
    milestones: 'milestones',
  },
}) => {
  const progressPercentage = goal.progress.percentComplete;

  return (
    <div
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
      onClick={onPress}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 text-blue-500">
          <Target className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {goal.title}
            </h3>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              {goal.timeHorizon}
            </span>
          </div>

          {goal.description && (
            <p className="mb-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
              {goal.description}
            </p>
          )}

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>{labels.progress}</span>
              <span className="font-medium">{progressPercentage}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all dark:bg-blue-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(goal.targetDate), 'MMM d, yyyy')}
            </span>
            {goal.milestoneIds.length > 0 && (
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {goal.milestoneIds.length} {labels.milestones}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
