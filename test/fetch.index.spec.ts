import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchText } from "../src/fetch/fetch";
import * as indexdb from "../src/store/indexdb";

const URL1 = "https://example.com/item";

describe("fetch with index", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses ETag and 304 short-circuits", async () => {
    vi.spyOn(indexdb, "readIndex").mockResolvedValue({ heads: { [URL1]: { etag: "E1" } } });
    const fetchMock = vi.fn()
      // first call 200 with ETag
      .mockResolvedValueOnce(new Response("hello", { status: 200, headers: { ETag: "E2", "content-type": "text/html" } as any }))
      // second call 304
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { "content-type": "text/html" } as any }));
    // @ts-ignore
    global.fetch = fetchMock;

    let r = await fetchText(URL1, { noRobots: true });
    expect(r.status).toBe(200);
    r = await fetchText(URL1, { noRobots: true });
    expect(r.status).toBe(304);
  });
});


