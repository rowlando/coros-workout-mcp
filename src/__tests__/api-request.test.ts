import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { queryActivityDetail, queryWorkouts } from "../coros-api.js";
import type { AuthData } from "../types.js";

const auth: AuthData = {
  accessToken: "token-123",
  userId: "user-456",
  region: "eu",
  timestamp: Date.now(),
};

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queryActivityDetail", () => {
  it("POSTs with query params, no body, and auth headers", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ result: "0000", data: { lapList: [], summary: {} } })
    );

    const detail = await queryActivityDetail(auth, "477574221250199560", 402);

    expect(detail).toEqual({ lapList: [], summary: {} });
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe(
      "https://teameuapi.coros.com/activity/detail/query"
    );
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      screenW: "565",
      screenH: "982",
      labelId: "477574221250199560",
      sportType: "402",
    });
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(headers.accesstoken).toBe("token-123");
    expect(JSON.parse(headers.yfheader)).toEqual({ userId: "user-456" });
  });

  it("reports the HTTP status when COROS returns a non-2xx response", async () => {
    fetchMock.mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        status: 502,
        statusText: "Bad Gateway",
      })
    );

    await expect(queryActivityDetail(auth, "1", 402)).rejects.toThrow(
      "COROS API error (/activity/detail/query): HTTP 502 Bad Gateway"
    );
  });

  it("reports a clear error when the response is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>maintenance</html>"));

    await expect(queryActivityDetail(auth, "1", 402)).rejects.toThrow(
      "COROS API error (/activity/detail/query): response was not JSON"
    );
  });

  it("surfaces the COROS error message when result is not 0000", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ result: "1019", message: "Access token is invalid" })
    );

    await expect(queryActivityDetail(auth, "1", 402)).rejects.toThrow(
      "COROS API error (/activity/detail/query): Access token is invalid"
    );
  });
});

describe("JSON POST requests", () => {
  it("still send a JSON body with a JSON content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: "0000", data: [] }));

    await queryWorkouts(auth);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://teameuapi.coros.com/training/program/query");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ startNo: 0, limitSize: 10 });
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
