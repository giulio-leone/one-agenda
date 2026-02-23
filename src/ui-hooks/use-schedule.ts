/**
 * useSchedule Hook
 *
 * Hook for fetching and managing daily schedule
 */

import { useState, useEffect, useCallback } from 'react';
import type { Schedule } from '../ui-components/schedule-view';

export interface UseScheduleOptions {
  userId: string;
  date: string;
  autoFetch?: boolean;
}

export interface UseScheduleResult {
  schedule: Schedule | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  generateSchedule: () => Promise<Schedule | null>;
}

export function useSchedule(options: UseScheduleOptions): UseScheduleResult {
  const { userId, date, autoFetch = true } = options;
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchSchedule = useCallback(async () => {
    if (!userId || !date) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        date,
      });

      const response = await fetch(`/api/oneagenda/schedule?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
          // No schedule exists yet or invalid request, that's okay
          setSchedule(null);
          setIsLoading(false);
          return;
        }
        throw new Error(`Failed to fetch schedule: ${response.statusText}`);
      }

      const data = await response.json();
      // Ensure we have the correct structure
      if (data && typeof data === 'object') {
        setSchedule(data.schedule || data);
      } else {
        setSchedule(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setSchedule(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, date]);

  const generateSchedule = useCallback(async (): Promise<Schedule | null> => {
    if (!userId || !date) return null;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/oneagenda/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate schedule: ${response.statusText}`);
      }

      const data = await response.json();
      setSchedule(data);
      return data;
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, date]);

  useEffect(() => {
    if (!autoFetch || !userId || !date) {
      setIsLoading(false);
      return;
    }
    fetchSchedule();
    // fetchSchedule is stable (only depends on userId and date)
  }, [autoFetch, userId, date]);

  return {
    schedule,
    isLoading,
    error,
    refetch: fetchSchedule,
    generateSchedule,
  };
}
