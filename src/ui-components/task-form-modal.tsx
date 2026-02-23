/**
 * Task Form Modal Component
 *
 * Modal for creating and editing tasks
 * Follows KISS, SOLID, DRY principles
 */

'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Link as LinkIcon, Trash2, Plus } from 'lucide-react';
import { TaskPriority } from '../core-domain';
import { Card } from '@giulio-leone/ui';

export interface TaskDependency {
  id: string;
  title: string;
  status: string;
}

export interface TaskFormData {
  id?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED';
  startDate?: string;
  deadline?: string;
  estimatedMinutes: number;
  tags: string[];
  visibility?: 'PRIVATE' | 'SHARED_WITH_COACH';
  assignedToUserId?: string;
  dependencies?: string[]; // IDs
}

export interface TaskFormLabels {
  createTitle: string;
  editTitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  statusLabel: string;
  priorityLabel: string;
  startDateLabel: string;
  deadlineLabel: string;
  estimatedMinutesLabel: string;
  dependenciesLabel: string;
  addDependency: string;
  selectTaskPlaceholder: string;
  noDependencies: string;
  tagsLabel: string;
  addTagButton: string;
  tagPlaceholder: string;
  deleteButton: string;
  deleteConfirm: string;
  cancelButton: string;
  saveButton: string;
  createButton: string;
}

export interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  initialData?: Partial<TaskFormData>;
  availableTasks?: { id: string; title: string; status: string }[]; // For dependency selection
  isLoading?: boolean;
  labels?: TaskFormLabels;
}

const PRIORITIES: TaskPriority[] = [
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.CRITICAL,
];

const STATUSES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED'] as const;

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  initialData,
  availableTasks = [],
  isLoading = false,
  labels = {
    createTitle: 'Create Task',
    editTitle: 'Edit Task',
    titleLabel: 'Title',
    titlePlaceholder: 'Task title',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'Add a description...',
    statusLabel: 'Status',
    priorityLabel: 'Priority',
    startDateLabel: 'Start Date',
    deadlineLabel: 'Deadline',
    estimatedMinutesLabel: 'Estimated (min)',
    dependenciesLabel: 'Dependencies (Blocked By)',
    addDependency: 'Add Dependency',
    selectTaskPlaceholder: 'Select a task...',
    noDependencies: 'No dependencies',
    tagsLabel: 'Tags',
    addTagButton: 'Add',
    tagPlaceholder: 'Add tag...',
    deleteButton: 'Delete',
    deleteConfirm: 'Are you sure you want to delete this task?',
    cancelButton: 'Cancel',
    saveButton: 'Save Changes',
    createButton: 'Create Task',
  },
}) => {
  const [formData, setFormData] = useState<TaskFormData>({
    title: initialData?.title || '',
    description: initialData?.description || '',
    priority: initialData?.priority || TaskPriority.MEDIUM,
    status: initialData?.status || 'TODO',
    startDate: initialData?.startDate || '',
    deadline: initialData?.deadline || '',
    estimatedMinutes: initialData?.estimatedMinutes || 30,
    tags: initialData?.tags || [],
    visibility: initialData?.visibility || 'PRIVATE',
    assignedToUserId: initialData?.assignedToUserId || '',
    dependencies: initialData?.dependencies || [],
  });

  const [tagInput, setTagInput] = useState('');
  const [showDependencySelect, setShowDependencySelect] = useState(false);

  // Update state when initialData changes (for optimistic updates or reload)
  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        ...initialData,
        dependencies: initialData.dependencies || prev.dependencies,
      }));
    }
  }, [initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    await onSubmit(formData);
    // Only reset if creating (no initial ID)
    if (!initialData?.id) {
      setFormData({
        title: '',
        description: '',
        priority: TaskPriority.MEDIUM,
        status: 'TODO',
        startDate: '',
        deadline: '',
        estimatedMinutes: 30,
        tags: [],
        dependencies: [],
      });
    }
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
      tags: formData.tags.filter((t: string) => t !== tag),
    });
  };

  const addDependency = (taskId: string) => {
    if (!formData.dependencies?.includes(taskId)) {
      setFormData({
        ...formData,
        dependencies: [...(formData.dependencies || []), taskId],
      });
    }
    setShowDependencySelect(false);
  };

  const removeDependency = (taskId: string) => {
    setFormData({
      ...formData,
      dependencies: formData.dependencies?.filter((id) => id !== taskId) || [],
    });
  };

  // Filter available tasks: exclude current task (if editing), exclude already linked
  const filteredAvailableTasks = availableTasks.filter(
    (t) => t.id !== initialData?.id && !formData.dependencies?.includes(t.id)
  );

  // Resolve dependency details for display
  const resolvedDependencies = (formData.dependencies || [])
    .map((id) => availableTasks.find((t) => t.id === id))
    .filter(Boolean) as { id: string; title: string; status: string }[];

  const isEditMode = !!initialData?.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 backdrop-blur-sm sm:p-4">
      <Card
        variant="glass"
        className="flex h-full max-h-[100dvh] w-full max-w-2xl flex-col rounded-none border-neutral-800 bg-neutral-900/90 p-0 sm:h-auto sm:max-h-[90vh] sm:rounded-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 p-6">
          <h2 className="text-xl font-bold text-white">
            {isEditMode ? labels.editTitle : labels.createTitle}
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white"
            disabled={isLoading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="scrollbar-thin scrollbar-thumb-neutral-700 flex-1 overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">{labels.titleLabel} *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                required
                disabled={isLoading}
                placeholder={labels.titlePlaceholder}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">
                {labels.descriptionLabel}
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={isLoading}
                placeholder={labels.descriptionPlaceholder}
              />
            </div>

            {/* Status & Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">{labels.statusLabel}</label>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value as TaskFormData['status'] })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={isLoading}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">
                  {labels.priorityLabel}
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: e.target.value as TaskPriority })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={isLoading}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">
                  {labels.startDateLabel}
                </label>
                <input
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300">
                  {labels.deadlineLabel}
                </label>
                <input
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-300">
                  {labels.estimatedMinutesLabel}
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.estimatedMinutes}
                  onChange={(e) =>
                    setFormData({ ...formData, estimatedMinutes: parseInt(e.target.value) || 30 })
                  }
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Dependencies */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-neutral-300">
                  {labels.dependenciesLabel}
                </label>
                <button
                  type="button"
                  onClick={() => setShowDependencySelect(!showDependencySelect)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  <Plus size={14} /> {labels.addDependency}
                </button>
              </div>

              {showDependencySelect && (
                <div className="mb-2 rounded-lg border border-neutral-700 bg-neutral-900 p-2">
                  <select
                    className="w-full rounded bg-transparent p-1 text-sm text-white focus:outline-none"
                    onChange={(e) => {
                      if (e.target.value) addDependency(e.target.value);
                    }}
                    value=""
                  >
                    <option value="">{labels.selectTaskPlaceholder}</option>
                    {filteredAvailableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                {resolvedDependencies.length === 0 && (
                  <p className="text-xs text-neutral-500 italic">{labels.noDependencies}</p>
                )}
                {resolvedDependencies.map((dep) => (
                  <div
                    key={dep.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <LinkIcon size={14} className="text-neutral-400" />
                      <span className="text-sm text-white">{dep.title}</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          dep.status === 'COMPLETED'
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-neutral-700 text-neutral-400'
                        }`}
                      >
                        {dep.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDependency(dep.id)}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-300">
                {labels.tagsLabel}
              </label>
              <div className="mb-2 flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder={labels.tagPlaceholder}
                  className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-lg bg-neutral-700 px-4 py-2 text-neutral-300 hover:bg-neutral-600"
                  disabled={isLoading}
                >
                  {labels.addTagButton}
                </button>
              </div>
              {formData.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-900/30 px-2 py-1 text-sm text-blue-300"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-blue-100"
                        disabled={isLoading}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between border-t border-neutral-800 pt-6">
              {onDelete && isEditMode ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(labels.deleteConfirm)) {
                      onDelete();
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-900/20"
                  disabled={isLoading}
                >
                  <Trash2 size={16} />
                  {labels.deleteButton}
                </button>
              ) : (
                <div />
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800"
                  disabled={isLoading}
                >
                  {labels.cancelButton}
                </button>
                <button
                  type="submit"
                  className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading || !formData.title.trim()}
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEditMode ? labels.saveButton : labels.createButton}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
};
