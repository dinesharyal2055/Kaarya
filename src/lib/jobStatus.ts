/**
 * Display-only job status labels.
 * Maps the raw DB status value to the user-facing label.
 * IMPORTANT: only the displayed text changes — the underlying status values
 * (open, assigned, in_progress, completed, cancelled) are never altered here.
 */
export function jobStatusLabel(t: (key: string) => string, status: string): string {
  switch (status) {
    case 'open':
      return t('jobs.status.open');
    case 'assigned':
      return t('jobs.status.assigned');
    case 'in_progress':
      return t('jobs.status.inProgress');
    case 'completed':
      return t('jobs.status.completed');
    case 'cancelled':
      return t('jobs.status.cancelled');
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  }
}