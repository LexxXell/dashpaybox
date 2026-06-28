import { test } from "node:test";
import assert from "node:assert/strict";

// Set the limit BEFORE importing the server so config picks it up. This file
// runs in its own process (node:test isolates files), so the override and the
// module-level limiter state don't leak into other tests.
process.env.RATE_LIMIT_MAX = "3";
process.env.RATE_LIMIT_WINDOW_SECONDS = "60";

test("rate limit returns 429 once the window cap is exceeded", async () => {
  const { buildServer } = await import("../src/server.js");
  const app = buildServer();
  await app.ready();
  try {
    const hit = () => app.inject({ method: "POST", url: "/quote", payload: {} });
    // First 3 are allowed through (they fail auth with 401, but are not limited).
    for (let i = 0; i < 3; i++) {
      assert.notEqual((await hit()).statusCode, 429);
    }
    // 4th exceeds the cap.
    assert.equal((await hit()).statusCode, 429);
  } finally {
    await app.close();
  }
});
