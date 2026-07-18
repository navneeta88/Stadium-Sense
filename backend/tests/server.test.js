process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key-for-jest";

const request = require("supertest");
const app = require("../server");

describe("GET /api/health", () => {
  test("returns ok status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/crowd", () => {
  test("returns zone data", async () => {
    const res = await request(app).get("/api/crowd");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.zones)).toBe(true);
  });
});

describe("GET /api/staff/queries", () => {
  test("returns a queries array", async () => {
    const res = await request(app).get("/api/staff/queries");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.queries)).toBe(true);
  });
});

describe("POST /api/chat validation", () => {
  test("rejects missing messages", async () => {
    const res = await request(app).post("/api/chat").send({});
    expect(res.status).toBe(400);
  });

  test("rejects empty messages array", async () => {
    const res = await request(app).post("/api/chat").send({ messages: [] });
    expect(res.status).toBe(400);
  });

  test("rejects a message with invalid role", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [{ role: "system", content: "hi" }] });
    expect(res.status).toBe(400);
  });

  test("rejects an overly long message", async () => {
    const res = await request(app)
      .post("/api/chat")
      .send({ messages: [{ role: "user", content: "a".repeat(3000) }] });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/staff/broadcast validation", () => {
  test("rejects missing incident", async () => {
    const res = await request(app).post("/api/staff/broadcast").send({});
    expect(res.status).toBe(400);
  });

  test("rejects overly long incident description", async () => {
    const res = await request(app)
      .post("/api/staff/broadcast")
      .send({ incident: "a".repeat(600) });
    expect(res.status).toBe(400);
  });
});
