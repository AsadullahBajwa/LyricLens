import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Eraser,
  FileJson,
  FileText,
  FileUp,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Music2,
  Plus,
  Printer,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wand2
} from "lucide-react";
import "./styles.css";

const STORAGE_KEYS = {
  draft: "lyriclens:draft:v2",
  history: "lyriclens:history:v1"
};

const MAX_HISTORY_ITEMS = 8;
const MAX_LYRICS_CHARS = 24000;

const emptyForm = {
  title: "",
  artist: "",
  notes: "",
  lyrics: "",
  detail: "plain",
  tone: "neutral",
  focus: ["themes", "context"]
};

const demoLyrics = {
  title: "Neon Harbor",
  artist: "LyricLens Demo",
  lyrics: `[Verse 1]
I left my coat by the station lights
With a ticket folded twice
The city hummed in borrowed blue
And every window looked like you

[Chorus]
Meet me down at the neon harbor
Where the old songs learn to glow
If we cannot keep forever
We can keep tonight from letting go

[Bridge]
There is a map in the static
There is a storm in the sound
I was only running from silence
Till your voice turned me around`
};

const focusOptions = [
  ["themes", "Themes"],
  ["craft", "Craft"],
  ["context", "Context"],
  ["ambiguity", "Ambiguity"]
];

const toneOptions = [
  ["neutral", "Neutral"],
  ["literary", "Literary"],
  ["direct", "Direct"],
  ["classroom", "Classroom"]
];

const analysisPresets = [
  {
    id: "balanced",
    label: "Balanced",
    detail: "plain",
    tone: "neutral",
    focus: ["themes", "context"]
  },
  {
    id: "close-read",
    label: "Close Read",
    detail: "deep",
    tone: "literary",
    focus: ["themes", "craft", "ambiguity"]
  },
  {
    id: "classroom",
    label: "Classroom",
    detail: "plain",
    tone: "classroom",
    focus: ["themes", "context", "craft"]
  },
  {
    id: "cautious",
    label: "Cautious",
    detail: "cautious",
    tone: "direct",
    focus: ["context", "ambiguity"]
  }
];

const sectionTemplates = ["Verse", "Chorus", "Bridge"];

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
  const [form, setForm] = useState(createInitialForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle");
  const [copied, setCopied] = useState(false);
  const [resultMeta, setResultMeta] = useState(null);
  const [history, setHistory] = useState(loadHistory);
  const [historyQuery, setHistoryQuery] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState(() => readStorage(STORAGE_KEYS.draft)?.savedAt || "");
  const [resultQuery, setResultQuery] = useState("");
  const [collapsedSections, setCollapsedSections] = useState([]);
  const fileInput = useRef(null);

  const lyricStats = useMemo(() => getLyricStats(form.lyrics), [form.lyrics]);
  const lyricUsagePercent = Math.min((lyricStats.characters / MAX_LYRICS_CHARS) * 100, 100);
  const isOverLimit = lyricStats.characters > MAX_LYRICS_CHARS;
  const canSubmit = form.lyrics.trim().length > 0 && !isOverLimit && status !== "loading";
  const exportContext = resultMeta || form;
  const plainText = useMemo(() => (result ? resultToText(result, resultMeta) : ""), [result, resultMeta]);
  const markdownText = useMemo(
    () => (result ? resultToMarkdown(result, exportContext) : ""),
    [exportContext, result]
  );
  const jsonText = useMemo(
    () => (result ? resultToJson(result, exportContext) : ""),
    [exportContext, result]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hasDraftContent(form)) {
        window.localStorage.removeItem(STORAGE_KEYS.draft);
        setDraftSavedAt("");
        return;
      }

      const savedAt = new Date().toISOString();
      saveStorage(STORAGE_KEYS.draft, {
        ...form,
        tone: normalizeTone(form.tone),
        focus: normalizeFocus(form.focus),
        savedAt
      });
      setDraftSavedAt(savedAt);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [form]);

  useEffect(() => {
    saveStorage(STORAGE_KEYS.history, history);
  }, [history]);

  useEffect(() => {
    function handleShortcuts(event) {
      const isCommand = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (isCommand && key === "s") {
        event.preventDefault();
        if (hasDraftContent(form)) saveDraftNow();
      }

      if (isCommand && event.key === "Enter") {
        event.preventDefault();
        document.querySelector(".composer")?.requestSubmit();
      }
    }

    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [form]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleFocus(option) {
    setForm((current) => {
      const focus = normalizeFocus(current.focus);
      const next = focus.includes(option)
        ? focus.filter((item) => item !== option)
        : [...focus, option];

      return { ...current, focus: next.length ? next : focus };
    });
  }

  function applyAnalysisPreset(preset) {
    setForm((current) => ({
      ...current,
      detail: preset.detail,
      tone: preset.tone,
      focus: normalizeFocus(preset.focus)
    }));
  }

  async function interpretLyrics(event) {
    event.preventDefault();
    if (status === "loading") return;

    if (!form.lyrics.trim()) {
      setError("Lyrics are required.");
      return;
    }

    if (isOverLimit) {
      setError(`Lyrics must stay under ${MAX_LYRICS_CHARS.toLocaleString()} characters.`);
      return;
    }

    setStatus("loading");
    setError("");
    setCopied(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 70000);

    try {
      const response = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tone: normalizeTone(form.tone),
          focus: normalizeFocus(form.focus)
        }),
        signal: controller.signal
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Interpretation failed.");
      }

      const meta = createResultMeta(form);
      setResult(data.interpretation);
      setResultMeta(meta);
      setStatus("complete");
      setResultQuery("");
      setCollapsedSections([]);
      rememberInterpretation(form, data.interpretation, meta);
    } catch (err) {
      setStatus("idle");
      setError(
        err?.name === "AbortError"
          ? "Interpretation timed out. Please try a shorter lyric excerpt."
          : err instanceof Error
            ? err.message
            : "Something went wrong."
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function copyResult() {
    if (!plainText) return;
    await navigator.clipboard.writeText(plainText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadResult(format = "txt") {
    const content = format === "json" ? jsonText : format === "md" ? markdownText : plainText;
    if (!content) return;

    const filename = makeFilename(exportContext, `interpretation.${format}`);
    const blob = new Blob([content], {
      type:
        format === "json"
          ? "application/json"
          : format === "md"
            ? "text/markdown"
            : "text/plain"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printResult() {
    if (!result) return;
    window.print();
  }

  function saveDraftNow() {
    const savedAt = new Date().toISOString();
    saveStorage(STORAGE_KEYS.draft, {
      ...form,
      tone: normalizeTone(form.tone),
      focus: normalizeFocus(form.focus),
      savedAt
    });
    setDraftSavedAt(savedAt);
  }

  function cleanLyrics() {
    updateField("lyrics", normalizeLyrics(form.lyrics));
  }

  function insertSectionTemplate(template) {
    setForm((current) => {
      const lyrics = current.lyrics.trimEnd();
      const separator = lyrics ? "\n\n" : "";
      return { ...current, lyrics: `${lyrics}${separator}[${template}]\n` };
    });
  }

  function loadDemoLyrics() {
    setForm({
      ...emptyForm,
      ...demoLyrics,
      detail: "plain",
      tone: "literary",
      focus: ["themes", "craft"]
    });
    setResult(null);
    setResultMeta(null);
    setError("");
    setStatus("idle");
    setResultQuery("");
    setCollapsedSections([]);
  }

  function clearAll() {
    setForm({ ...emptyForm, focus: [...emptyForm.focus] });
    setResult(null);
    setResultMeta(null);
    setError("");
    setStatus("idle");
    setResultQuery("");
    setCollapsedSections([]);
    window.localStorage.removeItem(STORAGE_KEYS.draft);
    setDraftSavedAt("");
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const title = file.name.replace(/\.[^.]+$/, "");
    setForm((current) => ({
      ...current,
      title: current.title || title,
      lyrics: text
    }));
    event.target.value = "";
  }

  function rememberInterpretation(submittedForm, interpretation, meta = createResultMeta(submittedForm)) {
    const entry = {
      id: `${Date.now()}`,
      ...meta,
      lyrics: submittedForm.lyrics,
      interpretation
    };
    const fingerprint = getHistoryFingerprint(entry);

    setHistory((current) => {
      const existing = current.find((item) => getHistoryFingerprint(item) === fingerprint);
      const nextEntry = { ...entry, favorite: Boolean(existing?.favorite) };
      return sortHistory([
        nextEntry,
        ...current.filter((item) => getHistoryFingerprint(item) !== fingerprint)
      ]);
    });
  }

  function restoreHistory(entry) {
    setForm({
      title: entry.title || "",
      artist: entry.artist || "",
      notes: entry.notes || "",
      lyrics: entry.lyrics || "",
      detail: entry.detail || "plain",
      tone: normalizeTone(entry.tone),
      focus: normalizeFocus(entry.focus)
    });
    setResult(entry.interpretation);
    setResultMeta(hydrateResultMeta(entry));
    setStatus("complete");
    setError("");
    setCopied(false);
    setResultQuery("");
    setCollapsedSections([]);
  }

  function removeHistoryEntry(id) {
    setHistory((current) => current.filter((entry) => entry.id !== id));
  }

  function toggleFavoriteHistory(id) {
    setHistory((current) =>
      sortHistory(
        current.map((entry) =>
          entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
        )
      )
    );
  }

  function clearHistory() {
    setHistory((current) => current.filter((entry) => entry.favorite));
  }

  function toggleSection(sectionKey) {
    setCollapsedSections((current) =>
      current.includes(sectionKey)
        ? current.filter((key) => key !== sectionKey)
        : [...current, sectionKey]
    );
  }

  function expandAllSections() {
    setCollapsedSections([]);
  }

  function collapseAllSections() {
    setCollapsedSections(sectionConfig.map(([key]) => key));
  }

  function jumpToSection(sectionKey) {
    document.getElementById(`result-${sectionKey}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
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

          <div className="workspace-strip" aria-label="Lyric stats">
            <Metric label="Words" value={lyricStats.words.toLocaleString()} />
            <Metric label="Lines" value={lyricStats.lines.toLocaleString()} />
            <Metric label="Sections" value={lyricStats.sections.toLocaleString()} />
            <Metric label="Read" value={lyricStats.readingMinutes ? `${lyricStats.readingMinutes} min` : "0 min"} />
            <Metric
              label="Draft"
              value={draftSavedAt ? formatTime(draftSavedAt) : "Unsaved"}
            />
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

          <label className="context-box">
            <span>Context Notes</span>
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Optional album, genre, release, or personal context"
              spellCheck="true"
            />
          </label>

          <fieldset className="preset-grid">
            <legend>Preset</legend>
            {analysisPresets.map((preset) => {
              const active =
                form.detail === preset.detail &&
                form.tone === preset.tone &&
                sameSet(normalizeFocus(form.focus), preset.focus);

              return (
                <button
                  key={preset.id}
                  type="button"
                  className={active ? "active" : ""}
                  onClick={() => applyAnalysisPreset(preset)}
                >
                  {preset.label}
                </button>
              );
            })}
          </fieldset>

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

          <fieldset className="segmented tone-grid">
            <legend>Voice</legend>
            {toneOptions.map(([option, label]) => (
              <label key={option} className={form.tone === option ? "active" : ""}>
                <input
                  type="radio"
                  name="tone"
                  value={option}
                  checked={form.tone === option}
                  onChange={(event) => updateField("tone", event.target.value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="lens-grid">
            <legend>Lens</legend>
            {focusOptions.map(([option, label]) => {
              const selected = normalizeFocus(form.focus).includes(option);
              return (
                <label key={option} className={selected ? "active" : ""}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={selected && normalizeFocus(form.focus).length === 1}
                    onChange={() => toggleFocus(option)}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="lyrics-box">
            <div className="lyrics-label-row">
              <label htmlFor="lyrics-input">Lyrics</label>
              <div className="template-row" aria-label="Lyric section templates">
                {sectionTemplates.map((template) => (
                  <button
                    key={template}
                    type="button"
                    className="template-button"
                    onClick={() => insertSectionTemplate(template)}
                  >
                    <Plus size={14} />
                    <span>{template}</span>
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="lyrics-input"
              value={form.lyrics}
              onChange={(event) => updateField("lyrics", event.target.value)}
              placeholder="[Verse 1]"
              spellCheck="true"
            />
          </div>

          <div
            className={isOverLimit ? "limit-meter danger" : "limit-meter"}
            aria-label="Lyric character limit"
            aria-valuemax={MAX_LYRICS_CHARS}
            aria-valuemin={0}
            aria-valuenow={Math.min(lyricStats.characters, MAX_LYRICS_CHARS)}
            role="meter"
          >
            <div>
              <span style={{ width: `${lyricUsagePercent}%` }} />
            </div>
            <p>
              {lyricStats.characters.toLocaleString()} / {MAX_LYRICS_CHARS.toLocaleString()}
            </p>
          </div>

          <div className="composer-footer">
            <p>{lyricStats.characters.toLocaleString()} characters</p>
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
                aria-label="Load demo lyrics"
                title="Load demo lyrics"
                onClick={loadDemoLyrics}
              >
                <Music2 size={18} />
              </button>
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
                aria-label="Clean lyric formatting"
                title="Clean lyric formatting"
                onClick={cleanLyrics}
                disabled={!form.lyrics}
              >
                <Wand2 size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Save draft"
                title="Save draft"
                onClick={saveDraftNow}
                disabled={!hasDraftContent(form)}
              >
                <Save size={18} />
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
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Download text interpretation"
                title="Download text interpretation"
                onClick={() => downloadResult("txt")}
                disabled={!result}
              >
                <Download size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Download markdown interpretation"
                title="Download markdown interpretation"
                onClick={() => downloadResult("md")}
                disabled={!result}
              >
                <FileText size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Download JSON interpretation"
                title="Download JSON interpretation"
                onClick={() => downloadResult("json")}
                disabled={!result}
              >
                <FileJson size={18} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Print interpretation"
                title="Print interpretation"
                onClick={printResult}
                disabled={!result}
              >
                <Printer size={18} />
              </button>
            </div>
          </header>

          <HistoryPanel
            history={history}
            historyQuery={historyQuery}
            onClear={clearHistory}
            onHistoryQueryChange={setHistoryQuery}
            onToggleFavorite={toggleFavoriteHistory}
            onRestore={restoreHistory}
            onRemove={removeHistoryEntry}
          />

          {result ? (
            <div className="result-tools">
              <label className="search-field">
                <Search size={17} />
                <input
                  value={resultQuery}
                  onChange={(event) => setResultQuery(event.target.value)}
                  placeholder="Search sections"
                />
              </label>
              <div className="result-nav">
                <div className="section-actions">
                  <button
                    type="button"
                    className="icon-button tiny"
                    aria-label="Expand all sections"
                    title="Expand all sections"
                    onClick={expandAllSections}
                  >
                    <Maximize2 size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button tiny"
                    aria-label="Collapse all sections"
                    title="Collapse all sections"
                    onClick={collapseAllSections}
                  >
                    <Minimize2 size={15} />
                  </button>
                </div>
                <div className="section-jump" aria-label="Result sections">
                  {sectionConfig.map(([key], index) => (
                    <button
                      key={key}
                      type="button"
                      aria-label={`Jump to section ${index + 1}`}
                      onClick={() => jumpToSection(key)}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {result ? <ResultMeta meta={resultMeta} /> : null}

          {status === "loading" ? <LoadingState /> : null}
          {!result && status !== "loading" ? <EmptyState /> : null}
          {result && status !== "loading" ? (
            <Interpretation
              collapsedSections={collapsedSections}
              onToggleSection={toggleSection}
              query={resultQuery}
              result={result}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function HistoryPanel({
  history,
  historyQuery,
  onClear,
  onHistoryQueryChange,
  onToggleFavorite,
  onRestore,
  onRemove
}) {
  if (!history.length) return null;

  const visibleHistory = history.filter((entry) => historyMatches(entry, historyQuery));

  return (
    <section className="history-panel" aria-label="Recent interpretations">
      <div className="history-top">
        <div className="history-heading">
          <History size={17} />
          <span>Recent</span>
        </div>
        <button
          type="button"
          className="icon-button tiny"
          aria-label="Clear unpinned recent interpretations"
          title="Clear unpinned recent interpretations"
          onClick={onClear}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <label className="history-search">
        <Search size={16} />
        <input
          value={historyQuery}
          onChange={(event) => onHistoryQueryChange(event.target.value)}
          placeholder="Search history"
        />
      </label>
      <div className="history-list">
        {visibleHistory.map((entry) => (
          <div className="history-item" key={entry.id}>
            <button type="button" className="history-main" onClick={() => onRestore(entry)}>
              <strong>{entry.title || "Untitled lyrics"}</strong>
              <span>
                {[entry.artist, capitalize(entry.detail || "plain"), getToneLabel(entry.tone), formatTime(entry.createdAt)]
                  .filter(Boolean)
                  .join(" / ")}
              </span>
            </button>
            <button
              type="button"
              className={entry.favorite ? "icon-button tiny favorite-button active" : "icon-button tiny favorite-button"}
              aria-label={`${entry.favorite ? "Unpin" : "Pin"} ${entry.title || "recent interpretation"}`}
              title={entry.favorite ? "Unpin" : "Pin"}
              onClick={() => onToggleFavorite(entry.id)}
            >
              <Star size={15} />
            </button>
            <button
              type="button"
              className="icon-button tiny"
              aria-label={`Remove ${entry.title || "recent interpretation"}`}
              title="Remove"
              onClick={() => onRemove(entry.id)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      {!visibleHistory.length ? <p className="history-empty">No matching history.</p> : null}
    </section>
  );
}

function ResultMeta({ meta }) {
  if (!meta) return null;

  return (
    <div className="result-meta" aria-label="Interpretation details">
      <span>{meta.title || "Untitled lyrics"}</span>
      <span>{meta.artist || "Unknown artist"}</span>
      <span>{capitalize(meta.detail || "plain")}</span>
      <span>{getToneLabel(meta.tone)}</span>
      <span>{normalizeFocus(meta.focus).map(getFocusLabel).join(", ")}</span>
      <span>{meta.stats?.words?.toLocaleString() || 0} words</span>
      <span>{meta.stats?.sections?.toLocaleString() || 0} sections</span>
    </div>
  );
}

function Interpretation({ result, query, collapsedSections, onToggleSection }) {
  const visibleSections = sectionConfig.filter(([key, title]) =>
    sectionMatches(title, result[key], query)
  );

  if (!visibleSections.length) {
    return (
      <div className="no-results">
        <Search size={24} />
        <p>No matching sections.</p>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {visibleSections.map(([key, title]) => {
        const collapsed = collapsedSections.includes(key);
        return (
          <article className="result-section" id={`result-${key}`} key={key}>
            <button
              type="button"
              className="section-heading"
              aria-expanded={!collapsed}
              onClick={() => onToggleSection(key)}
            >
              <h3>{title}</h3>
              <ChevronDown className={collapsed ? "chevron collapsed" : "chevron"} size={18} />
            </button>
            {!collapsed ? <SectionBody type={key} value={result[key]} query={query} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function SectionBody({ type, value, query }) {
  if (typeof value === "string") {
    return (
      <p>
        <HighlightedText text={value} query={query} />
      </p>
    );
  }

  if (!Array.isArray(value) || value.length === 0) {
    return <p className="muted">No clear items found.</p>;
  }

  if (type === "verseByVerse") {
    return (
      <div className="explain-list">
        {value.map((item, index) => (
          <div className="list-item" key={`${item.section}-${index}`}>
            <strong>
              <HighlightedText text={item.section} query={query} />
            </strong>
            <p>
              <HighlightedText text={item.explanation} query={query} />
            </p>
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
            <span>
              <HighlightedText text={item.phrase} query={query} />
            </span>
            <p>
              <HighlightedText text={item.meaning} query={query} />
            </p>
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
            <strong>
              <HighlightedText text={item.reference} query={query} />
            </strong>
            <em>
              <HighlightedText text={item.certainty} query={query} />
            </em>
            <p>
              <HighlightedText text={item.explanation} query={query} />
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="explain-list">
      {value.map((item, index) => (
        <div className="list-item" key={`${item.lineHint}-${index}`}>
          <strong>
            <HighlightedText text={item.lineHint} query={query} />
          </strong>
          <p>
            <HighlightedText text={item.possibleMeanings} query={query} />
          </p>
        </div>
      ))}
    </div>
  );
}

function HighlightedText({ text, query }) {
  const value = String(text || "");
  const needle = query.trim();

  if (!needle) return value;

  const matchIndex = value.toLowerCase().indexOf(needle.toLowerCase());
  if (matchIndex === -1) return value;

  return (
    <>
      {value.slice(0, matchIndex)}
      <mark>{value.slice(matchIndex, matchIndex + needle.length)}</mark>
      {value.slice(matchIndex + needle.length)}
    </>
  );
}

function resultToText(result, meta) {
  const header = meta
    ? [
        `Song: ${meta.title || "Untitled lyrics"}`,
        `Artist: ${meta.artist || "Unknown artist"}`,
        meta.notes ? `Context notes: ${meta.notes}` : "",
        `Depth: ${capitalize(meta.detail || "plain")}`,
        `Voice: ${getToneLabel(meta.tone)}`,
        `Lenses: ${normalizeFocus(meta.focus).map(getFocusLabel).join(", ")}`
      ].filter(Boolean).join("\n")
    : "";

  const body = sectionConfig
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

  return [header, body].filter(Boolean).join("\n\n");
}

function resultToMarkdown(result, context) {
  const song = [context.title || "Untitled lyrics", context.artist ? `by ${context.artist}` : ""]
    .filter(Boolean)
    .join(" ");
  const details = [
    `**Depth:** ${capitalize(context.detail || "plain")}`,
    `**Voice:** ${getToneLabel(context.tone)}`,
    `**Lenses:** ${normalizeFocus(context.focus).map(getFocusLabel).join(", ")}`,
    context.notes ? `**Context Notes:** ${context.notes}` : ""
  ].filter(Boolean);

  return [
    `# ${song}`,
    "",
    ...details,
    "",
    ...sectionConfig.flatMap(([key, title]) => {
      const value = result[key];
      const heading = `## ${title.replace(/^\d+\.\s*/, "")}`;

      if (typeof value === "string") {
        return [heading, "", value, ""];
      }

      if (!Array.isArray(value) || value.length === 0) {
        return [heading, "", "No clear items found.", ""];
      }

      const lines = value.map((item) => {
        if (key === "verseByVerse") return `- **${item.section}:** ${item.explanation}`;
        if (key === "slangAndPhrases") return `- **${item.phrase}:** ${item.meaning}`;
        if (key === "references") {
          return `- **${item.reference}** (${item.certainty}): ${item.explanation}`;
        }
        return `- **${item.lineHint}:** ${item.possibleMeanings}`;
      });

      return [heading, "", ...lines, ""];
    })
  ].join("\n");
}

function resultToJson(result, context) {
  return JSON.stringify(
    {
      metadata: {
        title: context.title || "",
        artist: context.artist || "",
        notes: context.notes || "",
        detail: context.detail || "plain",
        tone: normalizeTone(context.tone),
        focus: normalizeFocus(context.focus),
        stats: context.stats || null,
        createdAt: context.createdAt || null
      },
      interpretation: result
    },
    null,
    2
  );
}

function getLyricStats(lyrics) {
  const trimmed = lyrics.trim();
  const words = trimmed ? trimmed.split(/\s+/) : [];
  const uniqueWords = new Set(
    words
      .map((word) => word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
      .filter(Boolean)
  );
  const lines = trimmed ? lyrics.split(/\r\n|\r|\n/).filter((line) => line.trim()) : [];

  return {
    characters: lyrics.length,
    words: words.length,
    uniqueWords: uniqueWords.size,
    lines: lines.length,
    sections: lines.filter((line) => /^\[[^\]]+\]$/.test(line.trim())).length,
    readingMinutes: words.length ? Math.max(1, Math.ceil(words.length / 180)) : 0
  };
}

function normalizeLyrics(lyrics) {
  return lyrics
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^\s+\[/, "["))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionMatches(title, value, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${title} ${valueToSearch(value)}`.toLowerCase().includes(needle);
}

function historyMatches(entry, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [
    entry.title,
    entry.artist,
    entry.notes,
    entry.detail,
    getToneLabel(entry.tone),
    normalizeFocus(entry.focus).map(getFocusLabel).join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function valueToSearch(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(valueToSearch).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(valueToSearch).join(" ");
  return "";
}

function createInitialForm() {
  const draft = readStorage(STORAGE_KEYS.draft);
  if (!draft) return { ...emptyForm, focus: [...emptyForm.focus] };

  return {
    ...emptyForm,
    ...draft,
    tone: normalizeTone(draft.tone),
    focus: normalizeFocus(draft.focus)
  };
}

function hasDraftContent(value) {
  return Boolean(
    value.title?.trim() ||
      value.artist?.trim() ||
      value.notes?.trim() ||
      value.lyrics?.trim()
  );
}

function loadHistory() {
  const value = readStorage(STORAGE_KEYS.history);
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry?.id && entry?.interpretation)
    .map((entry) => ({
      ...entry,
      tone: normalizeTone(entry.tone),
      focus: normalizeFocus(entry.focus),
      favorite: Boolean(entry.favorite),
      stats: entry.stats || getLyricStats(entry.lyrics || "")
    }))
    .sort(compareHistoryEntries)
    .slice(0, MAX_HISTORY_ITEMS);
}

function normalizeTone(value) {
  const allowed = toneOptions.map(([option]) => option);
  return allowed.includes(value) ? value : emptyForm.tone;
}

function normalizeFocus(value) {
  const allowed = focusOptions.map(([option]) => option);
  const selected = Array.isArray(value) ? value.filter((item) => allowed.includes(item)) : [];
  return selected.length ? selected : [...emptyForm.focus];
}

function createResultMeta(source, createdAt = new Date().toISOString()) {
  return {
    title: source.title?.trim() || "",
    artist: source.artist?.trim() || "",
    notes: source.notes?.trim() || "",
    detail: source.detail || "plain",
    tone: normalizeTone(source.tone),
    focus: normalizeFocus(source.focus),
    stats: getLyricStats(source.lyrics || ""),
    createdAt
  };
}

function hydrateResultMeta(entry) {
  return {
    title: entry.title || "",
    artist: entry.artist || "",
    notes: entry.notes || "",
    detail: entry.detail || "plain",
    tone: normalizeTone(entry.tone),
    focus: normalizeFocus(entry.focus),
    stats: entry.stats || getLyricStats(entry.lyrics || ""),
    createdAt: entry.createdAt || new Date().toISOString()
  };
}

function getToneLabel(value) {
  return toneOptions.find(([option]) => option === normalizeTone(value))?.[1] || "Neutral";
}

function getFocusLabel(value) {
  return focusOptions.find(([option]) => option === value)?.[1] || capitalize(String(value));
}

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function getHistoryFingerprint(entry) {
  return [entry.title, entry.artist, entry.lyrics].join("\n").toLowerCase();
}

function sortHistory(entries) {
  return [...entries].sort(compareHistoryEntries).slice(0, MAX_HISTORY_ITEMS);
}

function compareHistoryEntries(left, right) {
  if (Boolean(left.favorite) !== Boolean(right.favorite)) {
    return left.favorite ? -1 : 1;
  }

  return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
}

function makeFilename(form, suffix) {
  const base = `${form.artist || "artist"}-${form.title || "lyrics"}-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return base || `lyriclens-${suffix}`;
}

function readStorage(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app still works if storage is unavailable.
  }
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

createRoot(document.getElementById("root")).render(<App />);
