import process from "node:process";
import {
  runGoldenCases,
} from "../lib/backtest/golden-case-runner";

const summary = runGoldenCases();

console.log(`golden-cases status=${summary.status} passed=${summary.passed}/${summary.total}`);

for (const result of summary.results) {
  const marker = result.passed ? "PASS" : "FAIL";

  console.log(`${marker} ${result.fixture.id} ${result.fixture.title}: ${result.decision.status} ${result.decision.maturity}`);

  for (const failure of result.failures) {
    console.log(`  - ${failure.message}`);
  }
}

process.exit(summary.status === "passed" ? 0 : 2);
