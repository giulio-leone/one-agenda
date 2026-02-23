import React from 'react';
import { cn } from '@giulio-leone/lib-design-system';

type Visibility = 'PRIVATE' | 'SHARED_WITH_COACH';

interface VisibilityBadgeProps {
  visibility?: Visibility;
  className?: string;
}

export const VisibilityBadge: React.FC<VisibilityBadgeProps> = ({ visibility, className }) => {
  if (!visibility) return null;

  const isPrivate = visibility === 'PRIVATE';

  return (
    <span
      className={cn(
        'rounded-full px-2 py-1 text-[10px] font-semibold',
        isPrivate
          ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        className
      )}
    >
      {isPrivate ? 'Privato' : 'Condiviso col coach'}
    </span>
  );
};
