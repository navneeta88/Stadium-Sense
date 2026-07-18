require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const { toolDefinitions, toolImplementations } = require("./tools");
const { logQuery, getRecentQueries } = require("./queryLog");

const app = express();
app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.1-flash-lite";
const TOOLS_CONFIG = [{ functionDeclarations: toolDefinitions }];

const FAN_SYSTEM_PROMPT = `You are StadiumSense, a friendly Gen AI assistant helping fans, volunteers, and venue staff at a FIFA World Cup 2026 stadium.

You can help with:
- Navigation (directions to gates, restrooms, food, first aid, sections, transit, parking)
- Real-time crowd conditions and suggesting less congested routes
- Accessibility needs (always offer accessible routes when relevant or asked)
- Sustainability tips (recycling points, public transit over driving)
- Multilingual support: always reply in the same language the user writes in

Rules:
- Use the get_directions, get_crowd_density, and list_amenities tools whenever the user asks about locations, routes, or congestion. Do not guess at stadium layout from memory.
- If a route passes through a zone with density_pct above 70, mention it and proactively suggest checking get_crowd_density-informed alternatives.
- Keep answers short, practical, and warm. Use plain language, not technical jargon.
- If asked something unrelated to the stadium/event, gently redirect back to what you can help with.`;

const STAFF_SYSTEM_PROMPT = `You are the operations-intelligence assistant for stadium staff during a FIFA World Cup 2026 match.
You will be given a batch of recent fan questions. Produce a concise operational summary for staff:
- Group similar questions into themes with counts
- Flag anything urgent (safety, accessibility failures, medical, lost persons, closures)
- Suggest 1-3 concrete actions staff could take right now
Respond in clear, scannable bullet points. No preamble.`;

const BROADCAST_SYSTEM_PROMPT = `You draft short, calm public-address / push-notification announcements for stadium staff to send to fans during an incident.
Given an incident description and a list of target languages, produce a JSON object only, with this exact shape:
{ "announcements": [ { "language": "English", "text": "..." }, ... ] }
Keep each announcement under 40 words, calm, clear, and actionable. No preamble, no markdown, JSON only.`;

// Free-tier Gemini traffic occasionally returns 503 UNAVAILABLE under load.
// Retry a couple of times with backoff before giving up.
async function generateWithRetry(params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const status = err?.status || err?.error?.code;
      const isRetryable = status === 503 || status === 429;
      if (!isRetryable || attempt === retries) throw err;
      const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s
      console.warn(`Gemini ${status}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
function toGeminiContents(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

// --- Fan-facing chat endpoint, with tool-use loop ---
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, language } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) logQuery(lastUserMessage.content, language);

    let contents = toGeminiContents(messages);
    let finalText = "";

    // Tool-use loop: keep calling Gemini until it returns a plain text answer
    for (let turn = 0; turn < 5; turn++) {
      const response = await generateWithRetry({
        model: MODEL,
        contents,
        config: {
          systemInstruction: FAN_SYSTEM_PROMPT,
          tools: TOOLS_CONFIG,
        },
      });

      const functionCalls = response.functionCalls || [];

      if (functionCalls.length === 0) {
        finalText = response.text || "";
        break;
      }

      // Echo the model's function-call turn back into the conversation
      contents.push({ role: "model", parts: response.candidates[0].content.parts });

      // Execute each requested tool and feed results back as functionResponse parts
      const responseParts = functionCalls.map((call) => {
        const impl = toolImplementations[call.name];
        const result = impl ? impl(call.args || {}) : { error: `Unknown tool ${call.name}` };
        return {
          functionResponse: { name: call.name, response: { result } },
        };
      });

      contents.push({ role: "user", parts: responseParts });
    }

    res.json({ reply: finalText || "Sorry, I wasn't able to complete that. Could you rephrase?" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong talking to StadiumSense." });
  }
});

// --- Staff dashboard: summarize recent fan queries into operational themes ---
app.get("/api/staff/summary", async (req, res) => {
  try {
    const recent = getRecentQueries(50);
    if (recent.length === 0) {
      return res.json({ summary: "No fan queries logged yet. Summary will appear once fans start chatting." });
    }
    const response = await generateWithRetry({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [{ text: `Recent fan queries (${recent.length} total):\n${recent.map((q) => `- [${q.language}] ${q.text}`).join("\n")}` }],
        },
      ],
      config: { systemInstruction: STAFF_SYSTEM_PROMPT },
    });
    res.json({ summary: response.text || "", query_count: recent.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not generate summary." });
  }
});

// --- Staff dashboard: draft a multilingual broadcast for an incident ---
app.post("/api/staff/broadcast", async (req, res) => {
  try {
    const { incident, languages } = req.body;
    if (!incident) return res.status(400).json({ error: "incident description is required" });
    const targetLanguages = Array.isArray(languages) && languages.length ? languages : ["English"];

    const response = await generateWithRetry({
      model: MODEL,
      contents: [
        { role: "user", parts: [{ text: `Incident: ${incident}\nLanguages: ${targetLanguages.join(", ")}` }] },
      ],
      config: { systemInstruction: BROADCAST_SYSTEM_PROMPT, responseMimeType: "application/json" },
    });
    const raw = (response.text || "").trim();
    const cleaned = raw.replace(/^```json/i, "").replace(/```$/, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { announcements: [{ language: "English", text: raw }] };
    }
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not draft broadcast." });
  }
});

// --- Raw data endpoints, useful for the dashboard's live views ---
app.get("/api/crowd", (req, res) => {
  res.json(require("./data/crowd_data.json"));
});

app.get("/api/staff/queries", (req, res) => {
  res.json({ queries: getRecentQueries(50) });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`StadiumSense backend running on port ${PORT}`));
