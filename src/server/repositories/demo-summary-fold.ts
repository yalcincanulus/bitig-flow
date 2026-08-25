import {
  completeMaintenanceRun,
  failMaintenanceRun,
  startMaintenanceRun,
} from "#/server/repositories/maintenance-runs";
import { foldExpiredDemoSummaries } from "#/server/repositories/demo-summaries";

export async function runDemoSummaryFold(now = new Date()) {
  const run = await startMaintenanceRun("summary_fold", now);
  try {
    const outcome = await foldExpiredDemoSummaries(now);
    await completeMaintenanceRun(run.id, outcome, now);
    return outcome;
  } catch (error) {
    await failMaintenanceRun(run.id, error, now);
    throw error;
  }
}
