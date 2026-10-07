// Pre-compute plans with Claude. Default: the 3 hero personas × every precompute scenario.
//   npm run gen:plans                         heroes, all scenarios
//   npm run gen:plans -- --demo               heroes, demo composite scenario only (test this first)
//   npm run gen:plans -- --sample 20          + 20 generated cohorts
//   npm run gen:plans -- --only tom_70 --scenario STORM
//   npm run gen:plans -- --rules-only         no API calls: English rule-ranked placeholders (UI testing only)
import { config } from "dotenv";
config({ path: ".env.local" });
import { loadProfiles, scenarios } from "../lib/data";
import { generatePlan, writePlan } from "../lib/generate";
import { rulesFallbackPlan } from "../lib/plan";
import { canonicalCode } from "../lib/scenario";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const rulesOnly = args.includes("--rules-only");
if (!rulesOnly && !process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY in .env.local first.");
  process.exit(1);
}

const all = loadProfiles();
let people = all.filter((p) => p.hero);
const sample = Number(flag("--sample") ?? 0);
if (sample) people = [...people, ...all.filter((p) => !p.hero).slice(0, sample)];
if (flag("--only")) people = all.filter((p) => p.id === flag("--only"));

let scenarioList = scenarios.precompute;
if (args.includes("--demo")) scenarioList = [scenarios.demo_scenario];
if (flag("--scenario")) scenarioList = [canonicalCode(flag("--scenario")!)!];

console.log(`Generating ${people.length} people × ${scenarioList.length} scenarios = ${people.length * scenarioList.length} plans`);

// Each person's scenarios run in sequence (one file per person); 4 people at a time.
const queue = [...people];
async function worker() {
  for (let p = queue.shift(); p; p = queue.shift()) {
    for (const sc of scenarioList) {
      try {
        const plan = rulesOnly ? rulesFallbackPlan(p, sc) : await generatePlan(p, sc);
        if (plan) writePlan(plan);
      } catch (e) {
        console.error(`  ERROR ${p.id} ${sc}:`, e instanceof Error ? e.message : e);
      }
    }
  }
}
Promise.all([worker(), worker(), worker(), worker()]).then(() => console.log("Done. Plans in data/plans/"));
