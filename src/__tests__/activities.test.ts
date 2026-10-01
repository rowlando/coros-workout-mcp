import { describe, it, expect, vi, afterEach } from "vitest";
import { activityQueryParams, queryActivities } from "../coros-api.js";
import type { AuthData } from "../types.js";

describe("activityQueryParams", () => {
  it("defaults to the first page of 20", () => {
    expect(activityQueryParams({})).toEqual({ pageNumber: 1, size: 20 });
  });

  it("sends the date range as startDay/endDay, which COROS filters on", () => {
    expect(
      activityQueryParams({ startDate: 20260301, endDate: 20260331, size: 50, pageNumber: 2 })
    ).toEqual({ pageNumber: 2, size: 50, startDay: 20260301, endDay: 20260331 });
  });

  it("never sends startDate/endDate, which COROS silently ignores", () => {
    const params = activityQueryParams({ startDate: 20260301, endDate: 20260331 });
    expect(params).not.toHaveProperty("startDate");
    expect(params).not.toHaveProperty("endDate");
  });

  it("supports an open-ended range", () => {
    expect(activityQueryParams({ endDate: 20260331 })).toEqual({
      pageNumber: 1,
      size: 20,
      endDay: 20260331,
    });
  });
});

describe("queryActivities", () => {
  afterEach(() => vi.unstubAllGlobals());

  const auth: AuthData = {
    accessToken: "token",
    userId: "user",
    region: "eu",
    timestamp: Date.now(),
  };

  it("GETs /activity/query with the date params and returns count and dataList", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: "0000",
          data: { count: 33, dataList: [{ labelId: "480738767399846088" }] },
        })
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await queryActivities(auth, { startDate: 20260301, endDate: 20260331 });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/activity/query");
    expect(url.searchParams.get("startDay")).toBe("20260301");
    expect(url.searchParams.get("endDay")).toBe("20260331");
    expect(result.count).toBe(33);
    expect(result.dataList[0].labelId).toBe("480738767399846088");
  });

  it("returns an empty list when COROS omits dataList", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ result: "0000", data: { count: 0 } }))
      )
    );

    expect(await queryActivities(auth)).toEqual({ count: 0, dataList: [] });
  });
});
