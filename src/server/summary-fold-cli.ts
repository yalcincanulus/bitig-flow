import { runDemoSummaryFold } from "./repositories/demo-summary-fold.ts";

console.log(JSON.stringify(await runDemoSummaryFold()));
process.exit(0);
