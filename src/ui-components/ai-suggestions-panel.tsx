/**
 * AI Suggestions Panel Component
 *
 * Displays AI-powered suggestions for tasks and activities
 * Follows KISS, SOLID, DRY principles
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, X, Lightbulb } from 'lucide-react';

export interface AISuggestion {
  type: 'TASK' | 'ACTIVITY' | 'INSIGHT';
  title: string;
  description: string;
  action?: () => void;
  priority?: number;
}

export interface AISuggestionsPanelProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuggestionSelect?: (suggestion: AISuggestion) => void;
}

export const AISuggestionsPanel: React.FC<AISuggestionsPanelProps> = ({
  userId,
  isOpen,
  onClose,
  onSuggestionSelect,
}) => {
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      fetchSuggestions();
    }
  }, [isOpen, userId]);

  const fetchSuggestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/oneagenda/insights/activity-suggestion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timeAvailable: 60,
          energyLevel: 'MEDIUM',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      const data = await response.json();
      // Transform API response to suggestions
      const newSuggestions: AISuggestion[] = [];

      if (data.rationale) {
        newSuggestions.push({
          type: 'INSIGHT',
          title: 'AI Insight',
          description: data.rationale,
          priority: 1,
        });
      }

      if (data.challenge) {
        newSuggestions.push({
          type: 'ACTIVITY',
          title: data.challenge.type,
          description: data.challenge.description,
          priority: 2,
        });
      }

      setSuggestions(newSuggestions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              AI Suggestions
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : error ? (
            <div className="py-12 text-center">
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <button
                onClick={fetchSuggestions}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-12 text-center">
              <Lightbulb className="mx-auto mb-4 h-16 w-16 text-gray-400" />
              <p className="text-gray-600 dark:text-gray-400">
                No suggestions available at the moment
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="cursor-pointer rounded-lg border border-blue-200 bg-blue-50 p-4 transition-colors hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"
                  onClick={() => {
                    if (onSuggestionSelect) {
                      onSuggestionSelect(suggestion);
                    }
                    if (suggestion.action) {
                      suggestion.action();
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {suggestion.type === 'INSIGHT' ? (
                        <Lightbulb className="h-5 w-5 text-blue-600" />
                      ) : (
                        <Sparkles className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">
                        {suggestion.title}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {suggestion.description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
