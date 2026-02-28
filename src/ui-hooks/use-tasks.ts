'use client';
/**
 * useTasks Hook
 *
 * Hook for fetching and managing tasks
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Task, TaskStatus } from '../core-domain';

export interface UseTasksOptions {
  userId: string;
  filter?: {
    status?: TaskStatus;
    priority?: string;
    tags?: string[];
  };
  autoFetch?: boolean;
}

export interface UseTasksResult {
  tasks: Task[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  createTask: (task: Partial<Task>) => Promise<Task | null>;
  deleteTask: (taskId: string) => Promise<void>;
}

export function useTasks(options: UseTasksOptions): UseTasksResult {
  const { userId, filter, autoFetch = true } = options;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Serialize filter to string for stable comparison
  const filterKey = useMemo(() => JSON.stringify(filter || {}), [filter]);

  // Use ref to access current filter without causing re-renders
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const fetchTasks = useCallback(async () => {
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
      if (currentFilter?.priority) {
        params.append('priority', currentFilter.priority);
      }
      if (currentFilter?.tags && currentFilter.tags.length > 0) {
        params.append('tags', currentFilter.tags.join(','));
      }

      const response = await fetch(`/api/oneagenda/tasks?${params.toString()}`);
      if (!response.ok) {
        // Don't throw, just set empty tasks
        setTasks([]);
        setIsLoading(false);
        return;
      }

      const data = await response.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setTasks([]);
    } finally {
      setIsLoading(false);
    }
    // filter is accessed via ref to prevent infinite loops
  }, [userId]);

  const updateTaskStatus = useCallback(
    async (taskId: string, status: TaskStatus) => {
      try {
        const response = await fetch(`/api/oneagenda/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        });

        if (!response.ok) {
          throw new Error(`Failed to update task: ${response.statusText}`);
        }

        // Optimistically update local state
        setTasks((prevTasks) =>
          prevTasks.map((task: Task) => (task.id === taskId ? { ...task, status } : task))
        );

        // Refetch to ensure consistency
        await fetchTasks();
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        throw err;
      }
    },
    [fetchTasks]
  );

  const createTask = useCallback(
    async (task: Partial<Task>): Promise<Task | null> => {
      try {
        const response = await fetch('/api/oneagenda/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(task),
        });

        if (!response.ok) {
          throw new Error(`Failed to create task: ${response.statusText}`);
        }

        const newTask = await response.json();
        await fetchTasks();
        return newTask;
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error('Unknown error'));
        return null;
      }
    },
    [fetchTasks]
  );

  const deleteTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/oneagenda/tasks/${taskId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete task: ${response.statusText}`);
      }

      // Optimistically remove from local state
      setTasks((prevTasks) => prevTasks.filter((task: Task) => task.id !== taskId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    }
  }, []);

  // Fetch tasks when userId or filter changes
  useEffect(() => {
    if (!autoFetch || !userId) return;
    fetchTasks();
    // fetchTasks is stable (only depends on userId), filterKey changes only when filter value changes
  }, [autoFetch, userId, filterKey]);

  return {
    tasks,
    isLoading,
    error,
    refetch: fetchTasks,
    updateTaskStatus,
    createTask,
    deleteTask,
  };
}
