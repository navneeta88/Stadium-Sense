const { logQuery, getRecentQueries } = require("../queryLog");

describe("queryLog", () => {
  test("logs a query and retrieves it", () => {
    logQuery("Where is Gate A?", "en");
    const recent = getRecentQueries(1);
    expect(recent[recent.length - 1].text).toBe("Where is Gate A?");
    expect(recent[recent.length - 1].language).toBe("en");
  });

  test("defaults language to 'unknown' when not provided", () => {
    logQuery("Test query with no language");
    const recent = getRecentQueries(1);
    expect(recent[recent.length - 1].language).toBe("unknown");
  });

  test("caps stored queries at 200 and keeps the most recent", () => {
    for (let i = 0; i < 250; i++) logQuery(`query-${i}`, "en");
    const recent = getRecentQueries(200);
    expect(recent.length).toBeLessThanOrEqual(200);
    expect(recent[recent.length - 1].text).toBe("query-249");
  });

  test("getRecentQueries respects the limit parameter", () => {
    const recent = getRecentQueries(5);
    expect(recent.length).toBeLessThanOrEqual(5);
  });
});
