import React from 'react';
import { cn } from '@giulio-leone/lib-design-system';

interface AssignmentChipsProps {
  assignedToUserId?: string | null;
  assignedByCoachId?: string | null;
  className?: string;
}

export const AssignmentChips: React.FC<AssignmentChipsProps> = ({
  assignedToUserId,
  assignedByCoachId,
  className,
}) => {
  if (!assignedToUserId && !assignedByCoachId) return null;

  return (
    <div className={cn('flex flex-wrap gap-2 text-[11px]', className)}>
      {assignedToUserId && (
        <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
          Utente: {assignedToUserId.slice(0, 8)}
        </span>
      )}
      {assignedByCoachId && (
        <span className="rounded-full bg-purple-50 px-2 py-1 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200">
          Coach: {assignedByCoachId.slice(0, 8)}
        </span>
      )}
    </div>
  );
};
