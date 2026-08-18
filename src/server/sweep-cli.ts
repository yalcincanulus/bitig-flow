import { sweepOrphanedObjects, sweepUnconfirmedUploads } from "./sweep.ts";

const flags = new Set(process.argv.slice(2));
const runUnconfirmed = flags.size === 0 || flags.has("--unconfirmed");
const runOrphans = flags.size === 0 || flags.has("--orphans");

const report: {
  unconfirmed?: Awaited<ReturnType<typeof sweepUnconfirmedUploads>>;
  orphans?: Awaited<ReturnType<typeof sweepOrphanedObjects>>;
} = {};

if (runUnconfirmed) report.unconfirmed = await sweepUnconfirmedUploads();
if (runOrphans) report.orphans = await sweepOrphanedObjects();

console.log(JSON.stringify(report));
process.exit(0);
