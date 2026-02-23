/**
 * ScheduleView Component
 *
 * Cross-platform component for displaying daily schedule
 */

import React from 'react';
import { format, parseISO } from 'date-fns';
import { Clock, Calendar } from 'lucide-react';

export interface ScheduleBlock {
  id: string;
  type: 'TASK' | 'EVENT' | 'BREAK' | 'BUFFER';
  title: string;
  start: string;
  end: string;
  description?: string;
}

export interface Schedule {
  date: string;
  blocks: ScheduleBlock[];
}

export interface ScheduleViewProps {
  schedule: Schedule;
  onBlockPress?: (blockId: string) => void;
}

const blockTypeColors = {
  TASK: 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700',
  EVENT: 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700',
  BREAK: 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700',
  BUFFER: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700',
};

const blockTypeIcons = {
  TASK: Clock,
  EVENT: Calendar,
  BREAK: Clock,
  BUFFER: Clock,
};

export const ScheduleView: React.FC<ScheduleViewProps> = ({ schedule, onBlockPress }) => {
  const formatTime = (dateString: string) => {
    return format(parseISO(dateString), 'HH:mm');
  };

  const getBlockDuration = (start: string, end: string) => {
    const startTime = parseISO(start);
    const endTime = parseISO(end);
    const minutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    return minutes;
  };

  if (schedule.blocks.length === 0) {
    return (
      <div className="rounded-lg bg-white py-12 text-center dark:bg-gray-800">
        <Calendar className="mx-auto mb-4 h-16 w-16 text-gray-400" />
        <h3 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
          No Schedule for {format(parseISO(schedule.date), 'MMMM d, yyyy')}
        </h3>
        <p className="text-gray-600 dark:text-gray-400">Add tasks to generate your schedule</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h2 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100">
          {format(parseISO(schedule.date), 'EEEE, MMMM d, yyyy')}
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {schedule.blocks.length} blocks scheduled
        </p>
      </div>

      <div className="space-y-2">
        {schedule.blocks.map((block: ScheduleBlock) => {
          const BlockIcon = blockTypeIcons[block.type];
          const blockColor = blockTypeColors[block.type];
          const duration = getBlockDuration(block.start, block.end);

          return (
            <div
              key={block.id}
              className={`${blockColor} cursor-pointer rounded-lg border p-4 transition-shadow hover:shadow-md`}
              onClick={() => onBlockPress?.(block.id)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <BlockIcon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {block.title}
                    </h3>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {block.type}
                    </span>
                  </div>

                  {block.description && (
                    <p className="mb-2 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
                      {block.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
                    <span>
                      {formatTime(block.start)} - {formatTime(block.end)}
                    </span>
                    <span>{duration} min</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
