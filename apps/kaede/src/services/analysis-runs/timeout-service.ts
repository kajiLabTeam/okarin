import { markTimedOutAnalysisRunsFailed } from './analysis-run-repository.js'

export const expireTimedOutAnalysisRuns = async (now: Date = new Date()): Promise<number> => {
  const expiredCount = await markTimedOutAnalysisRunsFailed(now)

  if (expiredCount > 0) {
    console.info(`Marked ${expiredCount} analysis run(s) as timed out`)
  }

  return expiredCount
}
