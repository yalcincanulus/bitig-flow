import { sweepOrphanedObjects, sweepUnconfirmedUploads } from "./sweep.ts";

const unconfirmed = await sweepUnconfirmedUploads();
const orphans = await sweepOrphanedObjects();

console.log(JSON.stringify({ unconfirmed, orphans }));
process.exit(0);
