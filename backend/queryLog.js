// Simple in-memory store of recent fan questions.
// In a real deployment this would be a database (Postgres/Firestore/etc).
// Kept in-memory here so the hackathon demo has zero external dependencies.

let queries = [];

function logQuery(text, language) {
  queries.push({ text, language: language || "unknown", timestamp: new Date().toISOString() });
  // keep only the last 200 to stay light
  if (queries.length > 200) queries = queries.slice(-200);
}

function getRecentQueries(limit = 50) {
  return queries.slice(-limit);
}

function clearQueries() {
  queries = [];
}

module.exports = { logQuery, getRecentQueries, clearQueries };
