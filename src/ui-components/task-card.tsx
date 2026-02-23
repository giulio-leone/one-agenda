/**
 * TaskCard Component
 *
 * Cross-platform card component for displaying tasks
 */

import React from 'react';
import { format } from 'date-fns';
import { CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { VisibilityBadge } from './visibility-badge';
import { AssignmentChips } from './assignment-chips';

/**
 * Task status enum - defined inline to avoid external dependencies
 */
export type TaskStatusValue = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';

/**
 * Task priority enum
 */
export type TaskPriorityValue = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Flexible task type for UI rendering
 * All fields except id and status are optional for maximum compatibility
 */
export interface TaskCardData {
  id: string;
  title?: string;
  description?: string;
  status: TaskStatusValue;
  priority?: TaskPriorityValue;
  tags?: string[];
  deadline?: string;
  effort?: {
    estimatedMinutes?: number;
  };
  visibility?: 'PRIVATE' | 'SHARED_WITH_COACH';
  assignedByCoachId?: string | null;
  assignedToUserId?: string | null;
}

export interface TaskCardLabels {
  untitled: string;
  minutesShort: string;
  markAsInProgress: string;
  markAsCompleted: string;
  markAsTodo: string;
}

export interface TaskCardProps {
  task: TaskCardData;
  onPress?: () => void;
  onStatusChange?: (taskId: string, status: TaskStatusValue) => Promise<void>;
  labels?: TaskCardLabels;
}

const statusIcons: Record<TaskStatusValue, typeof Circle> = {
  TODO: Circle,
  IN_PROGRESS: Clock,
  COMPLETED: CheckCircle2,
  BLOCKED: AlertCircle,
  CANCELLED: Circle,
};

const statusColors: Record<TaskStatusValue, string> = {
  TODO: 'text-gray-500',
  IN_PROGRESS: 'text-blue-500',
  COMPLETED: 'text-green-500',
  BLOCKED: 'text-red-500',
  CANCELLED: 'text-gray-400',
};

const priorityColors: Record<TaskPriorityValue, string> = {
  CRITICAL: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  HIGH: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  MEDIUM: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  LOW: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  onPress,
  onStatusChange,
  labels = {
    untitled: 'Untitled Task',
    minutesShort: 'min',
    markAsInProgress: 'Mark task as in progress',
    markAsCompleted: 'Mark task as completed',
    markAsTodo: 'Mark task as todo',
  },
}) => {
  const StatusIcon = statusIcons[task.status];
  const statusColor = statusColors[task.status];
  const priority: TaskPriorityValue = task.priority || 'MEDIUM';
  const priorityColor = priorityColors[priority];

  const handleStatusClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusChange) {
      const nextStatus: TaskStatusValue =
        task.status === 'TODO'
          ? 'IN_PROGRESS'
          : task.status === 'IN_PROGRESS'
            ? 'COMPLETED'
            : 'TODO';
      await onStatusChange(task.id, nextStatus);
    }
  };

  return (
    <div
      className="cursor-pointer rounded-lg border border-neutral-200 bg-neutral-50 p-4 shadow-sm transition-shadow hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/80"
      onClick={onPress}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={handleStatusClick}
          className={`mt-1 ${statusColor} transition-colors`}
          aria-label={
            task.status === 'TODO'
              ? labels.markAsInProgress
              : task.status === 'IN_PROGRESS'
                ? labels.markAsCompleted
                : labels.markAsTodo
          }
        >
          <StatusIcon className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {task.title || labels.untitled}
            </h3>
            <span className={`rounded-full px-2 py-1 text-xs font-medium ${priorityColor}`}>
              {priority}
            </span>
          </div>

          {task.description && (
            <p className="mb-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            {task.deadline && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(task.deadline), 'MMM d, yyyy')}
              </span>
            )}
            {task.effort?.estimatedMinutes && (
              <span>
                {task.effort.estimatedMinutes} {labels.minutesShort}
              </span>
            )}
            {task.tags && task.tags.length > 0 && (
              <span className="flex items-center gap-1">
                {task.tags.slice(0, 2).join(', ')}
                {task.tags.length > 2 && ` +${task.tags.length - 2}`}
              </span>
            )}
            <VisibilityBadge visibility={task.visibility} />
          </div>
          <AssignmentChips
            assignedToUserId={task.assignedToUserId}
            assignedByCoachId={task.assignedByCoachId}
            className="mt-2 text-gray-500 dark:text-gray-400"
          />
        </div>
      </div>
    </div>
  );
};
