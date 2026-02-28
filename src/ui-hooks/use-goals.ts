'use client';
/**
 * useGoals Hook
 *
 * Hook for fetching and managing goals
 * Follows KISS, SOLID, DRY principles
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Goal, GoalStatus } from '../core-domain';

export interface UseGoalsOptions {
  userId: string;
  filter?: {
    status?: GoalStatus;
  };
  autoFetch?: boolean;
}

export interface UseGoalsResult {
  goals: Goal[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  createGoal: (goal: Partial<Goal>) => Promise<Goal | null>;
  deleteGoal: (goalId: string) => Promise<void>;
}

export function useGoals(options: UseGoalsOptions): UseGoalsResult {
  const { userId, filter, autoFetch = true } = options;
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Serialize filter to string for stable comparison
  const filterKey = useMemo(() => JSON.stringify(filter || {}), [filter]);

  // Use ref to access current filter without causing re-renders
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const fetchGoals = useCallback(async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const currentFilter = filterRef.current;
      if (currentFilter?.status) {
        params.append('status', currentFilter.status);
      }

      const response = await fetch(`/api/oneagenda/goals?${params.toString()}`);
      if (!response.ok) {
        // Don't throw, just set empty goals
        setGoals([]);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      setGoals(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setGoals([]);
    } finally {
      setIsLoading(false);
    }
    // filter is accessed via ref to prevent infinite loops
  }, [userId]);

  const createGoal = useCallback(
    async (goal: Partial<Goal>): Promise<Goal | null> => {
      try {
        const response = await fetch('/api/oneagenda/goals', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(goal),
        });

        if (!response.ok) {
          throw new Error(`Failed to create goal: ${response.statusText}`);
        }

        const newGoal = await response.json();
        await fetchGoals();
        return newGoal;
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        return null;
      }
    },
    [fetchGoals]
  );

  const deleteGoal = useCallback(async (goalId: string) => {
    try {
      const response = await fetch(`/api/oneagenda/goals/${goalId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete goal: ${response.statusText}`);
      }

      setGoals((prevGoals) => prevGoals.filter((goal: Goal) => goal.id !== goalId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    }
  }, []);

  // Fetch goals when userId or filter changes
  useEffect(() => {
    if (!autoFetch || !userId) return;
    fetchGoals();
  }, [autoFetch, userId, filterKey]);

  return {
    goals,
    isLoading,
    error,
    refetch: fetchGoals,
    createGoal,
    deleteGoal,
  };
}
