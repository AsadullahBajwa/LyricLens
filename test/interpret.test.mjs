import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { handler } from "../netlify/functions/interpret.mjs";

const originalApiKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_MODEL;
const originalFetch = globalThis.fetch;

const fixtureInterpretation = {
  overallMeaning: "A speaker is trying to understand a difficult memory.",
  backgroundContext: "No external release context was supplied.",
  verseByVerse: [
    {
      section: "Verse",
      explanation: "The verse introduces the central image and emotional tension."
    }
  ],
  slangAndPhrases: [],
  references: [],
  ambiguousLines: [],
  finalTakeaway: "The lyric centers on reflection, distance, and uncertainty."
};

afterEach(() => {
  restoreRuntime();
});

test("returns CORS preflight response without an API key", async () => {
  delete process.env.OPENAI_API_KEY;

  const response = await handler({ httpMethod: "OPTIONS" });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(response.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

test("rejects unsupported HTTP methods before calling OpenAI", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => assert.fail("OpenAI should not be called for unsupported methods.");

  const response = await handler({ httpMethod: "GET" });
  const body = parseBody(response);

  assert.equal(response.statusCode, 405);
  assert.equal(body.error, "Use POST for lyric interpretation.");
});

test("reports missing API key for POST requests", async () => {
  delete process.env.OPENAI_API_KEY;

  const response = await handler({ httpMethod: "POST", body: "{}" });
  const body = parseBody(response);

  assert.equal(response.statusCode, 500);
  assert.match(body.error, /OPENAI_API_KEY/);
  assert.match(body.setupHint, /Netlify site settings/);
});

test("validates invalid JSON, empty lyrics, lyric length, and note length", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => assert.fail("OpenAI should not be called for invalid requests.");

  const invalidJson = await handler({ httpMethod: "POST", body: "{bad json" });
  assert.equal(invalidJson.statusCode, 400);
  assert.equal(parseBody(invalidJson).error, "Request body must be valid JSON.");

  const emptyLyrics = await post({ lyrics: "   " });
  assert.equal(emptyLyrics.statusCode, 400);
  assert.equal(parseBody(emptyLyrics).error, "Lyrics are required.");

  const longLyrics = await post({ lyrics: "a".repeat(24001) });
  assert.equal(longLyrics.statusCode, 413);
  assert.match(parseBody(longLyrics).error, /under 24[,.]000 characters/);

  const longNotes = await post({ lyrics: "one line", notes: "n".repeat(2001) });
  assert.equal(longNotes.statusCode, 413);
  assert.match(parseBody(longNotes).error, /Context notes are too long/);
});

test("accepts boundary-sized lyrics and context notes", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  let capturedRequest = null;

  globalThis.fetch = async (_, options) => {
    capturedRequest = JSON.parse(options.body);
    return openAiJsonResponse({ output_text: JSON.stringify(fixtureInterpretation) });
  };

  const response = await post({
    lyrics: "a".repeat(24000),
    notes: "n".repeat(2000)
  });

  assert.equal(response.statusCode, 200);
  assert.equal(parseBody(response).interpretation.overallMeaning, fixtureInterpretation.overallMeaning);
  assert.match(capturedRequest.input, /^a{24000}$/m);
  assert.match(capturedRequest.input, /^User-provided context notes: n{2000}$/m);
});

test("sends normalized interpretation settings to OpenAI", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "test-model";
  let capturedUrl = "";
  let capturedRequest = null;
  let capturedHeaders = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedRequest = JSON.parse(options.body);
    capturedHeaders = options.headers;
    return openAiJsonResponse({ output_text: JSON.stringify(fixtureInterpretation) });
  };

  const response = await post({
    title: "Neon Harbor",
    artist: "LyricLens Demo",
    notes: "Synth-pop demo context",
    lyrics: "[Verse]\nThe city hummed in borrowed blue",
    detail: "deep",
    length: "expanded",
    tone: "classroom",
    audience: "songwriter",
    language: "german",
    focus: ["craft", "unknown"]
  });
  const body = parseBody(response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(body.interpretation, fixtureInterpretation);
  assert.equal(capturedUrl, "https://api.openai.com/v1/responses");
  assert.equal(capturedHeaders.Authorization, "Bearer test-key");
  assert.equal(capturedRequest.model, "test-model");
  assert.equal(capturedRequest.store, false);
  assert.deepEqual(capturedRequest.reasoning, { effort: "medium" });
  assert.equal(capturedRequest.text.format.name, "lyric_interpretation");
  assert.equal(capturedRequest.text.format.strict, true);
  assert.match(capturedRequest.input, /Song title: Neon Harbor/);
  assert.match(capturedRequest.input, /Response length: expanded detail/);
  assert.match(capturedRequest.input, /Response voice: teacherly explanation/);
  assert.match(capturedRequest.input, /Target audience: a songwriter/);
  assert.match(capturedRequest.input, /Output language: German/);
  assert.match(capturedRequest.input, /Interpretation lenses: imagery, structure, rhyme/);
  assert.doesNotMatch(capturedRequest.input, /unknown/);
});

test("uses the default model and trims submitted metadata", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.OPENAI_MODEL;
  let capturedRequest = null;

  globalThis.fetch = async (_, options) => {
    capturedRequest = JSON.parse(options.body);
    return openAiJsonResponse({ output_text: JSON.stringify(fixtureInterpretation) });
  };

  const response = await post({
    title: "  Spaced Title  ",
    artist: "  Spaced Artist  ",
    notes: "  Trim this note  ",
    lyrics: "  [Verse]\ntrimmed lyric  ",
    detail: "cautious",
    length: "brief",
    tone: "direct",
    audience: "critic",
    language: "urdu",
    focus: ["ambiguity"]
  });

  assert.equal(response.statusCode, 200);
  assert.equal(capturedRequest.model, "gpt-5.5");
  assert.deepEqual(capturedRequest.reasoning, { effort: "low" });
  assert.match(capturedRequest.input, /^Song title: Spaced Title$/m);
  assert.match(capturedRequest.input, /^Artist: Spaced Artist$/m);
  assert.match(capturedRequest.input, /^User-provided context notes: Trim this note$/m);
  assert.match(capturedRequest.input, /^Output language: Urdu$/m);
  assert.match(capturedRequest.input, /^Lyrics:\n\[Verse\]\ntrimmed lyric$/m);
});

test("falls back to safe defaults for invalid selector values", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  let capturedRequest = null;

  globalThis.fetch = async (_, options) => {
    capturedRequest = JSON.parse(options.body);
    return openAiJsonResponse({ output_text: JSON.stringify(fixtureInterpretation) });
  };

  const response = await post({
    lyrics: "Small lyric fragment",
    detail: "verbose",
    length: "novel",
    tone: "dramatic",
    audience: "producer",
    language: "klingon",
    focus: ["unsupported"]
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(capturedRequest.reasoning, { effort: "low" });
  assert.match(capturedRequest.input, /Explanation depth: plain/);
  assert.match(capturedRequest.input, /Response length: moderate detail/);
  assert.match(capturedRequest.input, /Response voice: clear, balanced/);
  assert.match(capturedRequest.input, /Target audience: a general music listener/);
  assert.match(capturedRequest.input, /Output language: English/);
  assert.match(capturedRequest.input, /Interpretation lenses: emotional themes/);
  assert.match(capturedRequest.input, /artist context when supported/);
});

test("extracts nested Responses API output text", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    openAiJsonResponse({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(fixtureInterpretation) }]
        }
      ]
    });

  const response = await post({ lyrics: "Nested response shape" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(parseBody(response).interpretation, fixtureInterpretation);
});

test("reports a clear server error when Responses output text is missing", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    openAiJsonResponse({
      output: [{ type: "message", content: [{ type: "summary_text", text: "not usable" }] }]
    });

  const response = await post({ lyrics: "Missing output shape" });
  const body = parseBody(response);

  assert.equal(response.statusCode, 500);
  assert.equal(body.error, "The model response did not contain output text.");
});

test("returns clear errors for OpenAI failures and invalid model JSON", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () =>
    openAiJsonResponse({ error: { message: "Rate limited" } }, { ok: false, status: 429 });

  const failedOpenAi = await post({ lyrics: "A valid line" });
  assert.equal(failedOpenAi.statusCode, 429);
  assert.equal(parseBody(failedOpenAi).error, "Rate limited");

  globalThis.fetch = async () => openAiJsonResponse({ output_text: "not json" });

  const invalidJson = await post({ lyrics: "A valid line" });
  assert.equal(invalidJson.statusCode, 502);
  assert.equal(parseBody(invalidJson).error, "The model response was not valid JSON.");
});

test("uses fallback error text for upstream failures without a message", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => openAiJsonResponse({}, { ok: false, status: 503 });

  const response = await post({ lyrics: "A valid line" });
  const body = parseBody(response);

  assert.equal(response.statusCode, 503);
  assert.equal(body.error, "OpenAI request failed.");
});

test("returns timeout response when the upstream request aborts", async () => {
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  };

  const response = await post({ lyrics: "A valid line" });
  const body = parseBody(response);

  assert.equal(response.statusCode, 504);
  assert.match(body.error, /timed out/);
});

function post(body) {
  return handler({ httpMethod: "POST", body: JSON.stringify(body) });
}

function parseBody(response) {
  return JSON.parse(response.body || "{}");
}

function openAiJsonResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async json() {
      return body;
    }
  };
}

function restoreRuntime() {
  restoreEnvValue("OPENAI_API_KEY", originalApiKey);
  restoreEnvValue("OPENAI_MODEL", originalModel);
  globalThis.fetch = originalFetch;
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
