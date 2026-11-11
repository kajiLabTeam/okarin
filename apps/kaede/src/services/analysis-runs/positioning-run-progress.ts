export interface PositioningProgress {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
}

export const positioningRunStatus = (progress: PositioningProgress, storedStatus: string) => {
  if (progress.total === 0)
    return storedStatus as
      'accepted' | 'processing' | 'completed' | 'partially_completed' | 'failed'
  if (progress.queued > 0 || progress.processing > 0) return 'processing'
  if (progress.completed === progress.total) return 'completed'
  if (progress.failed === progress.total) return 'failed'
  return 'partially_completed'
}
