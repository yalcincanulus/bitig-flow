import { sweepExpiredDemoReports, sweepOrphanedObjects, sweepUnconfirmedUploads } from "./sweep.ts";
import {
  completeMaintenanceRun,
  failMaintenanceRun,
  startMaintenanceRun,
} from "./repositories/maintenance-runs.ts";

const flags = new Set(process.argv.slice(2));
const runUnconfirmed = flags.size === 0 || flags.has("--unconfirmed");
const runOrphans = flags.size === 0 || flags.has("--orphans");

const report: {
  unconfirmed?: Awaited<ReturnType<typeof sweepUnconfirmedUploads>>;
  orphans?: Awaited<ReturnType<typeof sweepOrphanedObjects>>;
  reports?: Awaited<ReturnType<typeof sweepExpiredDemoReports>>;
} = {};

const tracksFleetHealth = flags.size === 0;
const maintenance = tracksFleetHealth ? await startMaintenanceRun("sweep") : undefined;

try {
  if (runUnconfirmed) report.unconfirmed = await sweepUnconfirmedUploads();
  if (runOrphans) report.orphans = await sweepOrphanedObjects();
  if (flags.size === 0) report.reports = await sweepExpiredDemoReports();

  if (maintenance) {
    await completeMaintenanceRun(maintenance.id, {
      removedDocumentCount: report.unconfirmed?.removedDocumentIds.length ?? 0,
      removedUploadCount:
        (report.unconfirmed?.removedUploadKeys.length ?? 0) +
        (report.orphans?.removedUploadKeys.length ?? 0),
      removedStorageObjectCount: report.orphans?.removedStorageKeys.length ?? 0,
      removedDemoReportCount: report.reports?.removedReportIds.length ?? 0,
    });
  }
} catch (error) {
  if (maintenance) await failMaintenanceRun(maintenance.id, error);
  throw error;
}

console.log(JSON.stringify(report));
process.exit(0);
