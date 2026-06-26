import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultLongMarketEnvironmentDays,
  describeMarketEnvironmentWindows,
  marketEnvironmentWindows,
} from "./market-environment-windows";

test("marketEnvironmentWindows keeps long environment as 30-90d with 30d default", () => {
  assert.equal(marketEnvironmentWindows.large.minHours, 24 * 30);
  assert.equal(marketEnvironmentWindows.large.maxHours, 24 * 90);
  assert.equal(marketEnvironmentWindows.large.defaultHours, 24 * 30);
  assert.equal(defaultLongMarketEnvironmentDays(), 30);
});

test("marketEnvironmentWindows keeps daily and weekly as major regime context", () => {
  assert.deepEqual([...marketEnvironmentWindows.major.timeframes], ["1d", "1w"]);
  assert.match(marketEnvironmentWindows.major.purpose, /不能被低周期信号推翻/);
});

test("describeMarketEnvironmentWindows exposes all environment layers", () => {
  const summary = describeMarketEnvironmentWindows();

  assert.match(summary, /短周期环境=4小时-1天/);
  assert.match(summary, /中周期环境=3天-7天/);
  assert.match(summary, /长周期环境=30天-90天，默认 30天/);
  assert.match(summary, /大级别趋势背景=1d\+1w/);
});
