import { runDemoReaper } from "./repositories/demo-reaper.ts";

const fifteenMinutes = 15 * 60 * 1_000;
const watch = process.argv.slice(2).includes("--watch");

async function run() {
  console.log(JSON.stringify(await runDemoReaper()));
}

await run();

if (watch) {
  setInterval(() => {
    void run().catch((error) => console.error("Demo Reaper failed", error));
  }, fifteenMinutes);
} else {
  process.exit(0);
}
