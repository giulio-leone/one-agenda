/**
 * Goal Form Modal Component
 *
 * Modal for creating and editing goals
 * Follows KISS, SOLID, DRY principles
 */

'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { GoalTimeHorizon } from '../core-domain';

export interface GoalFormData {
  title: string;
  description?: string;
  timeHorizon: GoalTimeHorizon;
  startDate: string;
  targetDate: string;
  tags: string[];
}

export interface GoalFormLabels {
  createTitle: string;
  editTitle: string;
  titleLabel: string;
  descriptionLabel: string;
  timeHorizonLabel: string;
  startDateLabel: string;
  targetDateLabel: string;
  tagsLabel: string;
  addTagButton: string;
  tagPlaceholder: string;
  cancelButton: string;
  saveButton: string;
  createButton: string;
}

export interface GoalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: GoalFormData) => Promise<void>;
  initialData?: Partial<GoalFormData>;
  isLoading?: boolean;
  labels?: GoalFormLabels;
}

const TIME_HORIZONS: GoalTimeHorizon[] = [
  GoalTimeHorizon.SHORT_TERM,
  GoalTimeHorizon.MEDIUM_TERM,
  GoalTimeHorizon.LONG_TERM,
];

export const GoalFormModal: React.FC<GoalFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
  labels = {
    createTitle: 'Create Goal',
    editTitle: 'Edit Goal',
    titleLabel: 'Title',
    descriptionLabel: 'Description',
    timeHorizonLabel: 'Time Horizon',
    startDateLabel: 'Start Date',
    targetDateLabel: 'Target Date',
    tagsLabel: 'Tags',
    addTagButton: 'Add',
    tagPlaceholder: 'Add tag and press Enter',
    cancelButton: 'Cancel',
    saveButton: 'Update',
    createButton: 'Create',
  },
}) => {
  const today: string = new Date().toISOString().split('T')[0] ?? '';
  const defaultTargetDate = new Date();
  defaultTargetDate.setMonth(defaultTargetDate.getMonth() + 3);
  const defaultTargetDateStr: string = defaultTargetDate.toISOString().split('T')[0] ?? '';

  const initialFormData: GoalFormData = {
    title: initialData?.title ?? '',
    description: initialData?.description ?? '',
    timeHorizon: initialData?.timeHorizon ?? GoalTimeHorizon.MEDIUM_TERM,
    startDate: (initialData?.startDate ?? today) as string,
    targetDate: (initialData?.targetDate ?? defaultTargetDateStr) as string,
    tags: initialData?.tags ?? [],
  };

  const [formData, setFormData] = useState<GoalFormData>(initialFormData);

  const [tagInput, setTagInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    await onSubmit(formData);
    setFormData({
      title: '',
      description: '',
      timeHorizon: GoalTimeHorizon.MEDIUM_TERM,
      startDate: today,
      targetDate: defaultTargetDateStr,
      tags: [],
    });
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t: any) => t !== tag),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative mx-4 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {initialData ? labels.editTitle : labels.createTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            disabled={isLoading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {labels.titleLabel} *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setFormData({ ...formData, title: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {labels.descriptionLabel}
            </label>
            <textarea
              value={formData.description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              disabled={isLoading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {labels.timeHorizonLabel}
            </label>
            <select
              value={formData.timeHorizon}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setFormData({ ...formData, timeHorizon: e.target.value as GoalTimeHorizon })
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              disabled={isLoading}
            >
              {TIME_HORIZONS.map((h: any) => (
                <option key={h} value={h}>
                  {h.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {labels.startDateLabel}
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, startDate: e.target.value })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {labels.targetDateLabel} *
              </label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setFormData({ ...formData, targetDate: e.target.value })
                }
                min={formData.startDate}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {labels.tagsLabel}
            </label>
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={labels.tagPlaceholder}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                disabled={isLoading}
              >
                {labels.addTagButton}
              </button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag: any) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-blue-900 dark:hover:text-blue-100"
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              disabled={isLoading}
            >
              {labels.cancelButton}
            </button>
            <button
              type="submit"
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLoading || !formData.title.trim()}
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {initialData ? labels.saveButton : labels.createButton}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
