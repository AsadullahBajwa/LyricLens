const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.5";
const MAX_LYRICS_CHARS = 24000;

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const interpretationSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "overallMeaning",
    "backgroundContext",
    "verseByVerse",
    "slangAndPhrases",
    "references",
    "ambiguousLines",
    "finalTakeaway"
  ],
  properties: {
    overallMeaning: {
      type: "string",
      description: "Plain-English summary of what the lyrics are likely about."
    },
    backgroundContext: {
      type: "string",
      description: "Artist, genre, cultural, or release context only when supported or clearly uncertain."
    },
    verseByVerse: {
      type: "array",
      description: "Compact explanation by verse, chorus, bridge, or clear lyrical movement.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "explanation"],
        properties: {
          section: { type: "string" },
          explanation: { type: "string" }
        }
      }
    },
    slangAndPhrases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["phrase", "meaning"],
        properties: {
          phrase: {
            type: "string",
            description: "A short phrase or paraphrase. Avoid long lyric quotes."
          },
          meaning: { type: "string" }
        }
      }
    },
    references: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["reference", "explanation", "certainty"],
        properties: {
          reference: { type: "string" },
          explanation: { type: "string" },
          certainty: {
            type: "string",
            enum: ["likely", "uncertain", "not enough context"]
          }
        }
      }
    },
    ambiguousLines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lineHint", "possibleMeanings"],
        properties: {
          lineHint: {
            type: "string",
            description: "Short hint under eight words, not a long lyric quote."
          },
          possibleMeanings: { type: "string" }
        }
      }
    },
    finalTakeaway: {
      type: "string"
    }
  }
};

const systemPrompt = `You are a music interpretation assistant.
Explain the user-provided lyrics in plain English.
Do not quote long lyric sections back.
Do not invent facts.
If a reference is uncertain, say it is uncertain.
Explain slang, cultural references, double meanings, artist context, tone, and likely intent.
When discussing lyrics, paraphrase whenever possible and only use very short phrase hints when necessary.
If the input is too short or not lyrics, explain the limitation in the relevant sections instead of fabricating an interpretation.`;

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST for lyric interpretation." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return json(500, {
      error: "OPENAI_API_KEY is not configured.",
      setupHint: "Add OPENAI_API_KEY in Netlify site settings or your local .env file."
    });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Request body must be valid JSON." });
  }

  const lyrics = String(payload.lyrics || "").trim();
  const title = String(payload.title || "").trim();
  const artist = String(payload.artist || "").trim();
  const detail = ["plain", "deep", "cautious"].includes(payload.detail)
    ? payload.detail
    : "plain";

  if (!lyrics) {
    return json(400, { error: "Lyrics are required." });
  }

  if (lyrics.length > MAX_LYRICS_CHARS) {
    return json(413, {
      error: `Lyrics are too long. Please keep input under ${MAX_LYRICS_CHARS.toLocaleString()} characters.`
    });
  }

  const userPrompt = [
    title ? `Song title: ${title}` : "Song title: not provided",
    artist ? `Artist: ${artist}` : "Artist: not provided",
    `Explanation depth: ${detail}`,
    "",
    "Lyrics:",
    lyrics
  ].join("\n");

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: systemPrompt,
        input: userPrompt,
        store: false,
        reasoning: { effort: detail === "deep" ? "medium" : "low" },
        text: {
          format: {
            type: "json_schema",
            name: "lyric_interpretation",
            strict: true,
            schema: interpretationSchema
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return json(response.status, {
        error: data?.error?.message || "OpenAI request failed."
      });
    }

    const text = extractOutputText(data);
    const interpretation = JSON.parse(text);

    return json(200, { interpretation });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unexpected interpretation error."
    });
  }
}

function extractOutputText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const message = data.output?.find((item) => item.type === "message");
  const content = message?.content?.find((item) => item.type === "output_text");

  if (!content?.text) {
    throw new Error("The model response did not contain output text.");
  }

  return content.text;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body)
  };
}
