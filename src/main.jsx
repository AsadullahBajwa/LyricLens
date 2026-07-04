import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Clipboard,
  Download,
  Eraser,
  FileUp,
  Loader2,
  Music2,
  RefreshCw,
  Sparkles
} from "lucide-react";
import "./styles.css";

const emptyForm = {
  title: "",
  artist: "",
  lyrics: "",
  detail: "plain"
};

const sectionConfig = [
  ["overallMeaning", "1. Overall Meaning"],
  ["backgroundContext", "2. Background Context"],
  ["verseByVerse", "3. Verse-by-Verse Explanation"],
  ["slangAndPhrases", "4. Slang and Phrases"],
  ["references", "5. References"],
  ["ambiguousLines", "6. Ambiguous Lines"],
  ["finalTakeaway", "7. Final Takeaway"]
];

function App() {
  const [form, setForm] = useState(emptyForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const [copied, setCopied] = useState(false);
  const fileInput = useRef(null);

  const characterCount = form.lyrics.length;
  const canSubmit = form.lyrics.trim().length > 0 && status !== "loading";
  const plainText = useMemo(() => (result ? resultToText(result) : ""), [result]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function interpretLyrics(event) {
    event.preventDefault();
    if (!form.lyrics.trim()) {
      setError("Lyrics are required.");
      return;
    }

    setStatus("loading");
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Interpretation failed.");
      }

      setResult(data.interpretation);
      setStatus("complete");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function copyResult() {
    if (!plainText) return;
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadResult() {
    if (!plainText) return;
    const filename = `${form.artist || "artist"}-${form.title || "lyrics"}-interpretation`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const blob = new Blob([plainText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename || "lyriclens-interpretation"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    setForm(emptyForm);
    setResult(null);
    setError("");
    setStatus("idle");
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    updateField("lyrics", text);
    event.target.value = "";
  }

  return (
    <main className="shell">
      <section className="app-grid">
        <form className="composer" onSubmit={interpretLyrics}>
          <header className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              <Music2 size={25} />
            </div>
            <div>
              <p className="eyebrow">LyricLens</p>
              <h1>Music Interpretation Assistant</h1>
            </div>
          </header>

          <div className="art-strip">
            <img src="/lyriclens-studio.png" alt="" />
            <div className="meter" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, index) => (
                <span key={index} style={{ "--level": `${28 + ((index * 19) % 54)}%` }} />
              ))}
            </div>
          </div>

          <div className="song-fields">
            <label>
              <span>Song Title</span>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Optional"
              />
            </label>
            <label>
              <span>Artist</span>
              <input
                value={form.artist}
                onChange={(event) => updateField("artist", event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <fieldset className="segmented">
            <legend>Depth</legend>
            {["plain", "deep", "cautious"].map((option) => (
              <label key={option} className={form.detail === option ? "active" : ""}>
                <input
                  type="radio"
                  name="detail"
                  value={option}
                  checked={form.detail === option}
                  onChange={(event) => updateField("detail", event.target.value)}
                />
                <span>{capitalize(option)}</span>
              </label>
            ))}
          </fieldset>

          <label className="lyrics-box">
            <span>Lyrics</span>
            <textarea
              value={form.lyrics}
              onChange={(event) => updateField("lyrics", event.target.value)}
              placeholder="[Verse 1]"
              spellCheck="true"
            />
          </label>

          <div className="composer-footer">
            <p>{characterCount.toLocaleString()} characters</p>
            <div className="button-row">
              <input
                ref={fileInput}
                className="sr-only"
                type="file"
                accept=".txt,.md,.text"
                onChange={loadFile}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Upload text file"
                title="Upload text file"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Clear"
                title="Clear"
                onClick={clearAll}
              >
                <Eraser size={18} />
              </button>
              <button type="submit" className="primary-button" disabled={!canSubmit}>
                {status === "loading" ? (
                  <Loader2 className="spin" size={18} />
                ) : (
                  <Sparkles size={18} />
                )}
                <span>{status === "loading" ? "Interpreting" : "Interpret"}</span>
              </button>
            </div>
          </div>

          {error ? (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : null}
        </form>

        <section className="results" aria-live="polite">
          <header className="results-toolbar">
            <div>
              <p className="eyebrow">Output</p>
              <h2>Interpretation</h2>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="icon-button"
                aria-label="Copy interpretation"
                title="Copy interpretation"
                onClick={copyResult}
                disabled={!result}
              >
                {copied ? <RefreshCw size={18} /> : <Clipboard size={18} />}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Download interpretation"
                title="Download interpretation"
                onClick={downloadResult}
                disabled={!result}
              >
                <Download size={18} />
              </button>
            </div>
          </header>

          {status === "loading" ? <LoadingState /> : null}
          {!result && status !== "loading" ? <EmptyState /> : null}
          {result && status !== "loading" ? <Interpretation result={result} /> : null}
        </section>
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="record" aria-hidden="true">
        <span />
      </div>
      <p>Ready</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state">
      <Loader2 className="spin" size={28} />
      <p>Listening closely</p>
    </div>
  );
}

function Interpretation({ result }) {
  return (
    <div className="section-stack">
      {sectionConfig.map(([key, title]) => (
        <article className="result-section" key={key}>
          <h3>{title}</h3>
          <SectionBody type={key} value={result[key]} />
        </article>
      ))}
    </div>
  );
}

function SectionBody({ type, value }) {
  if (typeof value === "string") {
    return <p>{value}</p>;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return <p className="muted">No clear items found.</p>;
  }

  if (type === "verseByVerse") {
    return (
      <div className="explain-list">
        {value.map((item, index) => (
          <div className="list-item" key={`${item.section}-${index}`}>
            <strong>{item.section}</strong>
            <p>{item.explanation}</p>
          </div>
        ))}
      </div>
    );
  }

  if (type === "slangAndPhrases") {
    return (
      <div className="phrase-grid">
        {value.map((item, index) => (
          <div className="phrase" key={`${item.phrase}-${index}`}>
            <span>{item.phrase}</span>
            <p>{item.meaning}</p>
          </div>
        ))}
      </div>
    );
  }

  if (type === "references") {
    return (
      <div className="explain-list">
        {value.map((item, index) => (
          <div className="list-item" key={`${item.reference}-${index}`}>
            <strong>{item.reference}</strong>
            <em>{item.certainty}</em>
            <p>{item.explanation}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="explain-list">
      {value.map((item, index) => (
        <div className="list-item" key={`${item.lineHint}-${index}`}>
          <strong>{item.lineHint}</strong>
          <p>{item.possibleMeanings}</p>
        </div>
      ))}
    </div>
  );
}

function resultToText(result) {
  return sectionConfig
    .map(([key, title]) => {
      const value = result[key];
      if (typeof value === "string") {
        return `${title}\n${value}`;
      }

      if (!Array.isArray(value) || value.length === 0) {
        return `${title}\nNo clear items found.`;
      }

      const lines = value.map((item) => {
        if (key === "verseByVerse") return `${item.section}: ${item.explanation}`;
        if (key === "slangAndPhrases") return `${item.phrase}: ${item.meaning}`;
        if (key === "references") {
          return `${item.reference} (${item.certainty}): ${item.explanation}`;
        }
        return `${item.lineHint}: ${item.possibleMeanings}`;
      });

      return `${title}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

createRoot(document.getElementById("root")).render(<App />);
