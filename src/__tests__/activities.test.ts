import { describe, it, expect, vi } from "vitest";
import {
  collectActivities,
  MAX_SCAN_PAGES,
  SCAN_PAGE_SIZE,
  type ActivityPageFetcher,
  type ActivitySummary,
} from "../coros-api.js";

function activity(date: number, name = `Activity ${date}`): ActivitySummary {
  return {
    labelId: String(date),
    date,
    name,
    sportType: 402,
    mode: 0,
    subMode: 0,
    startTime: 0,
    endTime: 0,
    totalTime: 0,
    workoutTime: 0,
    distance: 0,
    calorie: 0,
    avgHr: 0,
    trainingLoad: 0,
    device: "",
  };
}

/** Fake COROS endpoint: serves `all` (newest first) in pages, ignoring dates. */
function fakeFetcher(all: ActivitySummary[]) {
  return vi.fn<ActivityPageFetcher>(async (pageNumber, size) => ({
    count: all.length,
    dataList: all.slice((pageNumber - 1) * size, pageNumber * size),
  }));
}

/** One activity per day, newest first, counting back from 20261001. */
function dailyActivities(n: number): ActivitySummary[] {
  const out: ActivitySummary[] = [];
  const d = new Date(Date.UTC(2026, 9, 1));
  for (let i = 0; i < n; i++) {
    const ymd = Number(d.toISOString().slice(0, 10).replace(/-/g, ""));
    out.push(activity(ymd));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

describe("collectActivities", () => {
  it("passes pageNumber/size straight through when no date range is given", async () => {
    const fetchPage = fakeFetcher(dailyActivities(50));
    const result = await collectActivities(fetchPage, { pageNumber: 2, size: 10 });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(2, 10);
    expect(result.count).toBe(50);
    expect(result.dataList).toHaveLength(10);
    expect(result.truncated).toBe(false);
  });

  it("finds activities in a date range beyond the first page", async () => {
    // 100 daily activities from 20261001 back to 20260624.
    const fetchPage = fakeFetcher(dailyActivities(100));
    const result = await collectActivities(fetchPage, {
      startDate: 20260701,
      endDate: 20260707,
    });

    expect(result.dataList.map((a) => a.date)).toEqual([
      20260707, 20260706, 20260705, 20260704, 20260703, 20260702, 20260701,
    ]);
    expect(result.count).toBe(7);
    expect(result.truncated).toBe(false);
  });

  it("stops scanning once a page goes older than startDate", async () => {
    const fetchPage = fakeFetcher(dailyActivities(200));
    // 20260915 is 16 days back, so it's on page 1.
    await collectActivities(fetchPage, { startDate: 20260915 });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1, SCAN_PAGE_SIZE);
  });

  it("stops when all activities have been scanned", async () => {
    const fetchPage = fakeFetcher(dailyActivities(30));
    const result = await collectActivities(fetchPage, { startDate: 20200101 });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.count).toBe(30);
    expect(result.truncated).toBe(false);
  });

  it("handles an endDate-only range", async () => {
    const fetchPage = fakeFetcher(dailyActivities(30));
    const result = await collectActivities(fetchPage, { endDate: 20260905 });

    expect(result.dataList[0].date).toBe(20260905);
    expect(result.dataList.every((a) => a.date <= 20260905)).toBe(true);
  });

  it("paginates over the filtered matches", async () => {
    const fetchPage = fakeFetcher(dailyActivities(100));
    const result = await collectActivities(fetchPage, {
      startDate: 20260801,
      endDate: 20260831,
      pageNumber: 2,
      size: 10,
    });

    expect(result.count).toBe(31);
    expect(result.dataList.map((a) => a.date)[0]).toBe(20260821);
    expect(result.dataList).toHaveLength(10);
  });

  it("returns an empty list when nothing matches", async () => {
    const fetchPage = fakeFetcher(dailyActivities(30));
    const result = await collectActivities(fetchPage, {
      startDate: 20250101,
      endDate: 20250131,
    });

    expect(result.count).toBe(0);
    expect(result.dataList).toEqual([]);
  });

  it("caps the scan at MAX_SCAN_PAGES and reports truncation", async () => {
    const total = (MAX_SCAN_PAGES + 5) * SCAN_PAGE_SIZE;
    const fetchPage = fakeFetcher(dailyActivities(total));
    const result = await collectActivities(fetchPage, { startDate: 19000101 });

    expect(fetchPage).toHaveBeenCalledTimes(MAX_SCAN_PAGES);
    expect(result.truncated).toBe(true);
    expect(result.count).toBe(MAX_SCAN_PAGES * SCAN_PAGE_SIZE);
  });
});
