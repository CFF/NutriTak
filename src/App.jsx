import { useState, useRef, useEffect, useCallback } from "react";
import heic2any from "heic2any";
import { Camera, Settings, CalendarDays, ChevronDown, ChevronUp, X } from "lucide-react";
import { getLog, saveLog, getAllLogs, getProfile, saveProfileToDB, getHistory, upsertHistory } from "./lib/storage";

// ─── Constants ────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10);

const PREFILLED_FOODS = [
  { name: "Banana",               kcal: 89  },
  { name: "Boiled egg",           kcal: 78  },
  { name: "Greek yogurt (150g)",  kcal: 130 },
  { name: "Avocado toast",        kcal: 290 },
  { name: "Chicken breast (150g)",kcal: 248 },
  { name: "Green salad",          kcal: 35  },
  { name: "Brown rice (100g)",    kcal: 216 },
  { name: "Apple",                kcal: 80  },
  { name: "Oatmeal (1 cup)",      kcal: 150 },
  { name: "Coffee with milk",     kcal: 50  },
  { name: "Almonds (30g)",        kcal: 174 },
  { name: "Salmon fillet (150g)", kcal: 280 },
];

// ─── History helpers ──────────────────────────────────────────────────
function recordFood(history, name, kcal) {
  const key = name.toLowerCase().trim();
  const prev = history[key] || { name, kcal, count: 0 };
  const entry = { name, kcal, count: prev.count + 1 };
  upsertHistory({ key, ...entry }); // fire and forget
  return { ...history, [key]: entry };
}
function getFrequent(history) {
  return Object.values(history)
    .filter(f => f.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

const LOADING_MSGS = [
  "Estimating…",
  "Looking that up…",
  "Crunching the numbers…",
];

// ─── OpenRouter API ───────────────────────────────────────────────────
async function callOpenRouter(messages) {
  const res = await fetch("/api/openrouter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openrouter/free", messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content || "";
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`No JSON found in: ${text.slice(0, 120)}`);
  return match[1];
}

async function lookupFood(text) {
  const raw = await callOpenRouter([
    { role: "user", content: `Estimate calories for: "${text}".
Reply ONLY with a JSON object, no markdown:
{"name": "concise food name", "kcal": number}
Use a typical portion if unspecified.` }
  ]);
  return JSON.parse(raw);
}

async function analyzePhoto(base64, mediaType) {
  const res = await fetch("/api/openrouter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openrouter/free", // free router — auto-selects a vision-capable free model
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
        { type: "text", text: `List every food item visible and estimate calories for each.
Reply ONLY with a JSON array, no markdown:
[{"name": "item name", "kcal": number}, ...]
Use concise names. Estimate from what's visible.` }
      ]}]
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  const text = data.choices?.[0]?.message?.content || "";
  const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (!match) throw new Error(`No JSON found in: ${text.slice(0, 120)}`);
  return JSON.parse(match[1]);
}

// ─── Style tokens ─────────────────────────────────────────────────────
const LABEL = {
  fontFamily: "'Courier Prime', monospace",
  fontSize: 11, color: "#6B6259",
  letterSpacing: ".14em", textTransform: "uppercase",
  marginBottom: 20,
};
const BTN_PRIMARY = {
  flex: 2, padding: "15px",
  background: "#1C1917", border: "none", borderRadius: 12,
  fontFamily: "'Courier Prime', monospace", fontSize: 14,
  color: "#FAF8F5", cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
const BTN_SECONDARY = {
  flex: 1, padding: "15px",
  background: "transparent", border: "1px solid #D9D2CB", borderRadius: 12,
  fontFamily: "'Courier Prime', monospace", fontSize: 14,
  color: "#7A7068", cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
// Shared error style — terracotta darkened for contrast on small text
const ERR_STYLE = {
  fontFamily: "'Courier Prime', monospace", fontSize: 13,
  color: "#8B3220", marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 6,
};

// ─── Entry row ────────────────────────────────────────────────────────
function EntryRow({ entry, onUpdate, onDelete, isNew }) {
  const [editing, setEditing]   = useState(false);
  const [name, setName]         = useState(entry.name);
  const [kcal, setKcal]         = useState(String(entry.kcal));
  const [flash, setFlash]       = useState(isNew);
  const [isDeleting, setIsDeleting] = useState(false);
  const rowRef                  = useRef();

  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => setFlash(false), 1400);
    return () => clearTimeout(t);
  }, [isNew]);

  const handleDelete = (e) => {
    e.stopPropagation();
    setIsDeleting(true);
    setTimeout(() => onDelete(entry.id), 220);
  };

  const commit = () => {
    const k = parseInt(kcal, 10);
    if (name.trim() && !isNaN(k)) onUpdate({ ...entry, name: name.trim(), kcal: k });
    else { setName(entry.name); setKcal(String(entry.kcal)); }
    setEditing(false);
    // Restore focus to the row after editing
    setTimeout(() => rowRef.current?.focus(), 0);
  };

  const rowBase = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 0", borderBottom: "1px solid #EDE8E3",
    borderRadius: 6,
    background: flash ? "#FEF3EE" : "transparent",
    transition: "background .8s ease",
    animation: isDeleting
      ? "nt-exit .22s ease forwards"
      : isNew
        ? "nt-enter .28s ease both"
        : "none",
    overflow: isDeleting ? "hidden" : "visible",
  };

  if (editing) return (
    <div style={rowBase} role="group" aria-label={`Editing ${entry.name}`}>
      <input value={name} onChange={e => setName(e.target.value)}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()} autoFocus
        aria-label="Food name"
        style={{ flex: 1, fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#1C1917", background: "transparent", border: "none", borderBottom: "1.5px solid #C4593A", outline: "none", padding: "2px 0" }}
      />
      <input value={kcal} type="number" onChange={e => setKcal(e.target.value)}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}
        aria-label="Calories"
        style={{ width: 50, fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#C4593A", background: "transparent", border: "none", borderBottom: "1.5px solid #C4593A", outline: "none", textAlign: "right", padding: "2px 0" }}
      />
      <span aria-hidden="true" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "#7A7068", flexShrink: 0 }}>kcal</span>
    </div>
  );

  return (
    // div with role="button" keeps the delete <button> valid (no button-in-button nesting)
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${entry.name}, ${entry.kcal} kcal`}
      onClick={() => setEditing(true)}
      onKeyDown={e => (e.key === "Enter" || e.key === " ") && setEditing(true)}
      style={{ ...rowBase, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      <span style={{ flex: 1, fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#1C1917", lineHeight: 1.4 }}>
        {entry.name}
        {entry.servings && entry.servings !== 1 && (
          <span style={{ color: "#A89E96", marginLeft: 6 }}>
            × {entry.servings % 1 === 0 ? entry.servings : entry.servings.toFixed(1)}
          </span>
        )}
      </span>
      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#C4593A", flexShrink: 0 }}>{entry.kcal}</span>
      <button
        onClick={handleDelete}
        aria-label={`Remove ${entry.name}`}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7068", fontSize: 20, lineHeight: 1, padding: "4px 4px 4px 8px", flexShrink: 0, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
      >×</button>
    </div>
  );
}

// ─── Bottom sheet ─────────────────────────────────────────────────────
function Sheet({ onClose, label, children }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(28,25,23,.42)" }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 100, background: "#FAF5E8", borderRadius: "22px 22px 0 0", padding: "16px 24px 52px", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 -8px 48px rgba(28,25,23,.18)", animation: "nt-sheet-in .3s cubic-bezier(0.25, 1, 0.5, 1) both" }}
      >
        {/* Header row: drag handle + close button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", marginBottom: 24 }}>
          <div aria-hidden="true" style={{ width: 36, height: 4, background: "#D9D2CB", borderRadius: 99 }} />
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#7A7068", padding: 8, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44 }}
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────
function Stepper({ value, onChange, min = 0.5, step = 0.5, label = "quantity" }) {
  const btn = (symbol, ariaLabel, action) => (
    <button
      onClick={action}
      aria-label={ariaLabel}
      style={{
        width: 44, height: 44, borderRadius: 99,
        background: "#E8E2DC", border: "none", cursor: "pointer",
        fontFamily: "'Courier Prime', monospace", fontSize: 18, color: "#1C1917",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, WebkitTapHighlightColor: "transparent",
      }}
    >{symbol}</button>
  );
  return (
    <div role="group" aria-label={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {btn("−", `Decrease ${label}`, () => onChange(Math.max(min, +(value - step).toFixed(1))))}
      <span aria-live="polite" aria-atomic="true" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 15, color: "#1C1917", minWidth: 28, textAlign: "center" }}>
        {value % 1 === 0 ? value : value.toFixed(1)}
      </span>
      {btn("+", `Increase ${label}`, () => onChange(+(value + step).toFixed(1)))}
    </div>
  );
}

// ─── Text entry sheet ─────────────────────────────────────────────────
function TextSheet({ onAdd, onClose, history, onHistoryUpdate }) {
  const [text, setText]         = useState("");
  const [phase, setPhase]       = useState("input");
  const [editName, setEditName] = useState("");
  const [baseKcal, setBaseKcal] = useState(0);
  const [servings, setServings] = useState(1);
  const [errMsg, setErrMsg]     = useState("");
  const [selected, setSelected] = useState(null);
  const [chipQty, setChipQty]   = useState(1);
  const [loadMsg, setLoadMsg]   = useState(LOADING_MSGS[0]);
  const loadMsgIdx              = useRef(0);
  const errorRef                = useRef();

  const frequent = getFrequent(history);

  // Focus error message when it appears
  useEffect(() => {
    if (phase === "error") errorRef.current?.focus();
  }, [phase]);

  // Cycle loading messages while waiting for estimate
  useEffect(() => {
    if (phase !== "loading") return;
    loadMsgIdx.current = 0;
    setLoadMsg(LOADING_MSGS[0]);
    const t = setInterval(() => {
      loadMsgIdx.current = (loadMsgIdx.current + 1) % LOADING_MSGS.length;
      setLoadMsg(LOADING_MSGS[loadMsgIdx.current]);
    }, 1300);
    return () => clearInterval(t);
  }, [phase]);

  const estimate = async (query) => {
    const q = (query || text).trim();
    if (!q) return;
    setText(q);
    setPhase("loading");
    try {
      const r = await lookupFood(q);
      setEditName(r.name);
      setBaseKcal(r.kcal);
      setServings(1);
      setPhase("confirm");
    } catch (e) { setErrMsg(e.message || "Unknown error"); setPhase("error"); }
  };

  const confirmAdd = () => {
    const totalKcal = Math.round(baseKcal * servings);
    if (!editName.trim() || !totalKcal) return;
    const item = { name: editName.trim(), kcal: totalKcal, ...(servings !== 1 && { servings }) };
    onHistoryUpdate(recordFood(history, item.name, item.kcal));
    onAdd(item);
    onClose();
  };

  const handleChipClick = (food) => {
    if (selected?.name === food.name) { setSelected(null); return; }
    setSelected(food);
    setChipQty(1);
  };

  const confirmChipAdd = () => {
    if (!selected) return;
    const item = { name: selected.name, kcal: Math.round(selected.kcal * chipQty), ...(chipQty !== 1 && { servings: chipQty }) };
    onHistoryUpdate(recordFood(history, item.name, item.kcal));
    onAdd(item);
    onClose();
  };

  const chipStyle = (isSelected) => ({
    background: isSelected ? "#1C1917" : "#F2EDE8",
    border: isSelected ? "none" : "none",
    borderRadius: 99, padding: "9px 16px",
    fontFamily: "'Courier Prime', monospace", fontSize: 13,
    color: isSelected ? "#FAF8F5" : "#1C1917",
    cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
    WebkitTapHighlightColor: "transparent", flexShrink: 0,
    transition: "background .15s, color .15s",
    minHeight: 44,
  });

  if (phase === "confirm") return (
    <div>
      <p style={LABEL} aria-live="polite">Does this look right?</p>
      <div style={{ background: "#F2EDE8", borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
        <label htmlFor="confirm-name" style={{ ...LABEL, marginBottom: 6 }}>Food name</label>
        <input
          id="confirm-name"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          style={{ display: "block", width: "100%", fontFamily: "'Courier Prime', monospace", fontSize: 15, color: "#1C1917", background: "transparent", border: "none", outline: "none", marginBottom: 14, borderBottom: "1px solid #D9D2CB", padding: "2px 0 8px" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span aria-live="polite" aria-label={`${Math.round(baseKcal * servings)} calories`} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 48, color: "#C4593A", lineHeight: 1 }}>
              {Math.round(baseKcal * servings)}
            </span>
            <span aria-hidden="true" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#7A7068" }}>kcal</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span aria-hidden="true" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#6B6259", letterSpacing: ".1em", textTransform: "uppercase" }}>servings</span>
            <Stepper value={servings} onChange={setServings} label="servings" />
          </div>
        </div>
        {servings !== 1 && (
          <p aria-live="polite" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "#7A7068", marginTop: 8 }}>
            {baseKcal} kcal × {servings} = {Math.round(baseKcal * servings)} kcal
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setPhase("input")} style={BTN_SECONDARY}>Try again</button>
        <button onClick={confirmAdd} style={BTN_PRIMARY}>Add to log</button>
      </div>
    </div>
  );

  const query = text.trim().toLowerCase();
  const filteredUsuals = frequent.filter(f => !query || f.name.toLowerCase().includes(query));
  const filteredPrefilled = PREFILLED_FOODS.filter(f => !query || f.name.toLowerCase().includes(query));
  const usualNames = new Set(filteredUsuals.map(f => f.name.toLowerCase()));
  const filteredPrefilledDeduped = filteredPrefilled.filter(f => !usualNames.has(f.name.toLowerCase()));
  const allChips = [...filteredUsuals, ...filteredPrefilledDeduped];
  const showSuggestions = allChips.length > 0;

  return (
    <div>
      <h2 style={{ ...LABEL, marginBottom: 12 }}>What did you eat?</h2>

      <label htmlFor="food-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
        Describe what you ate
      </label>
      <input
        id="food-input"
        autoFocus
        value={text}
        onChange={e => { setText(e.target.value); setSelected(null); }}
        onKeyDown={e => e.key === "Enter" && (selected ? confirmChipAdd() : estimate())}
        placeholder="e.g. bowl of pasta, two scrambled eggs…"
        style={{ width: "100%", fontFamily: "'Courier Prime', monospace", fontSize: 15, color: "#1C1917", background: "#F2EDE8", border: "none", borderRadius: 12, padding: "16px", outline: "none", marginBottom: 16 }}
      />

      {showSuggestions && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#6B6259", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 10 }}>
            {query ? "Matches" : frequent.length > 0 ? "Your usuals" : "Quick add"}
          </p>
          <div role="list" style={{ display: "flex", overflowX: "auto", gap: 8, paddingBottom: 4, scrollbarWidth: "none" }}>
            {allChips.map(f => (
              <button
                key={f.name}
                role="listitem"
                onClick={() => handleChipClick(f)}
                aria-pressed={selected?.name === f.name}
                style={chipStyle(selected?.name === f.name)}
              >
                {f.name}
                <span style={{ color: selected?.name === f.name ? "#FAC8BC" : "#A33B27", fontSize: 11 }}>{f.kcal} kcal</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity selector for chip quick-add */}
      {selected && (
        <div
          role="group"
          aria-label={`Quantity for ${selected.name}`}
          style={{ background: "#F2EDE8", borderRadius: 14, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#1C1917", marginBottom: 2 }}>{selected.name}</div>
            <div aria-live="polite" style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "#7A7068" }}>
              {selected.kcal} kcal × {chipQty} = <span style={{ color: "#A33B27" }}>{Math.round(selected.kcal * chipQty)} kcal</span>
            </div>
          </div>
          <Stepper value={chipQty} onChange={setChipQty} label={`servings of ${selected.name}`} />
        </div>
      )}

      {phase === "error" && (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          style={ERR_STYLE}
        >
          <span aria-hidden="true">⚠</span>
          Couldn't estimate. Check your connection and try again.
        </p>
      )}
      <button
        onClick={() => selected ? confirmChipAdd() : estimate()}
        disabled={phase === "loading" || (!text.trim() && !selected)}
        aria-busy={phase === "loading" && !selected}
        style={{ ...BTN_PRIMARY, flex: "unset", width: "100%", opacity: ((!text.trim() && !selected) || phase === "loading") ? 0.4 : 1, transition: "opacity .2s" }}
      >
        {phase === "loading" && !selected ? loadMsg : "Add"}
      </button>
      {!selected && (
        <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#A89E96", letterSpacing: ".06em", textAlign: "center", marginTop: 10 }}>
          calories are estimated
        </p>
      )}
    </div>
  );
}

// ─── Photo entry sheet ────────────────────────────────────────────────
function PhotoSheet({ onAdd, onClose, history, onHistoryUpdate }) {
  const [phase, setPhase]     = useState("pick");
  const [items, setItems]     = useState([]);
  const [preview, setPreview] = useState(null);
  const [errMsg, setErrMsg]   = useState("");
  const cameraRef             = useRef();
  const galleryRef            = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setPhase("loading");
    try {
      const isHeic = file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith(".heic");
      const sourceFile = isHeic
        ? await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 })
        : file;

      const dataUrl = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 800;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.src = URL.createObjectURL(sourceFile);
      });
      setPreview(dataUrl);
      const base64 = dataUrl.split(",")[1];
      const res = await analyzePhoto(base64, "image/jpeg");
      setItems(res.map((r, i) => ({ ...r, id: i })));
      setPhase("review");
    } catch (e) {
      setErrMsg(e.message?.includes("key") ? "API key issue — check your .env.local file." : "Could not read the photo. Try a clearer image.");
      setPhase("error");
    }
  };

  const updateItem = (id, field, val) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: field === "kcal" ? (parseInt(val, 10) || 0) : val } : it));

  const removeItem = (id) => setItems(prev => prev.filter(it => it.id !== id));

  const confirmAdd = () => {
    let h = history;
    items.forEach(it => { h = recordFood(h, it.name, it.kcal); });
    onHistoryUpdate(h);
    items.forEach(it => onAdd({ name: it.name, kcal: it.kcal }));
    onClose();
  };

  const total = items.reduce((s, i) => s + (i.kcal || 0), 0);

  if (phase === "loading") return (
    <div>
      <h2 style={LABEL}>Analysing photo…</h2>
      {preview && (
        <div style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
          <img src={preview} alt="Your meal being analysed" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
          <div
            role="status"
            aria-live="polite"
            style={{ position: "absolute", inset: 0, background: "rgba(28,25,23,.52)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}
          >
            {/* Animated dots */}
            <div aria-hidden="true" style={{ display: "flex", gap: 6 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: 99, background: "#FAF8F5", animation: `nt-pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#FAF8F5" }}>Reading your meal…</span>
          </div>
        </div>
      )}
    </div>
  );

  if (phase === "review") return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ ...LABEL, marginBottom: 0 }}>Review items</h2>
        <span aria-label={`Total: ${total} calories`} style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: "#C4593A" }}>{total} kcal</span>
      </div>
      {preview && (
        <img src={preview} alt="Your meal" style={{ width: "100%", borderRadius: 12, marginBottom: 16, maxHeight: 160, objectFit: "cover" }} />
      )}
      <div role="list" style={{ marginBottom: 20 }}>
        {items.map(it => (
          <div key={it.id} role="listitem" style={{ display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid #EDE8E3", padding: "11px 0" }}>
            <input
              value={it.name}
              onChange={e => updateItem(it.id, "name", e.target.value)}
              aria-label="Food name"
              style={{ flex: 1, fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#1C1917", background: "transparent", border: "none", outline: "none" }}
            />
            <input
              value={it.kcal}
              type="number"
              onChange={e => updateItem(it.id, "kcal", e.target.value)}
              aria-label="Calories"
              style={{ width: 50, fontFamily: "'Courier Prime', monospace", fontSize: 14, color: "#C4593A", background: "transparent", border: "none", outline: "none", textAlign: "right" }}
            />
            <button
              onClick={() => removeItem(it.id)}
              aria-label={`Remove ${it.name}`}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7068", fontSize: 20, padding: "4px", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => { setPhase("pick"); setPreview(null); setItems([]); }} style={BTN_SECONDARY}>Retake</button>
        <button onClick={confirmAdd} style={BTN_PRIMARY}>
          Add {items.length} item{items.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={LABEL}>Take a photo</h2>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo of your meal"
        style={{ display: "none" }}
        onChange={e => handleFile(e.target.files[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        aria-label="Choose a photo from your gallery"
        style={{ display: "none" }}
        onChange={e => handleFile(e.target.files[0])}
      />
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button
          onClick={() => cameraRef.current.click()}
          aria-label="Take a photo of your meal"
          style={{ flex: 1, padding: "38px 0", background: "#F2EDE8", border: "2px dashed #D9D2CB", borderRadius: 14, fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#6B6259", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, WebkitTapHighlightColor: "transparent" }}
        >
          <Camera size={26} strokeWidth={1.5} color="#7A7068" aria-hidden="true" />
          Take a photo
        </button>
        <button
          onClick={() => galleryRef.current.click()}
          aria-label="Choose a photo from your gallery"
          style={{ flex: 1, padding: "38px 0", background: "#F2EDE8", border: "2px dashed #D9D2CB", borderRadius: 14, fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#6B6259", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, WebkitTapHighlightColor: "transparent" }}
        >
          <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7A7068" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          Choose a photo
        </button>
      </div>
      {phase === "error" && (
        <p role="alert" style={ERR_STYLE}>
          <span aria-hidden="true">⚠</span>
          {errMsg}
        </p>
      )}
    </div>
  );
}

// ─── Profile sheet ────────────────────────────────────────────────────
function ProfileSheet({ profile, onSave, onClose }) {
  const [maintenance, setMaintenance] = useState(String(profile.maintenance));
  const [goal, setGoal]               = useState(String(profile.goal));
  const [error, setError]             = useState("");
  const [mainInvalid, setMainInvalid] = useState(false);
  const [goalInvalid, setGoalInvalid] = useState(false);
  const errorRef                      = useRef();

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const save = () => {
    const m = parseInt(maintenance, 10);
    const g = parseInt(goal, 10);
    const mBad = isNaN(m) || m <= 0;
    const gBad = isNaN(g) || g <= 0;
    setMainInvalid(mBad);
    setGoalInvalid(gBad);
    if (mBad || gBad) {
      setError("Enter a number greater than 0 in the highlighted fields.");
      return;
    }
    onSave({ maintenance: m, goal: g });
    onClose();
  };

  const inputStyle = (invalid) => ({
    width: "100%", fontFamily: "'DM Serif Display', serif", fontSize: 36,
    color: "#1C1917", background: "#F2EDE8",
    border: invalid ? "2px solid #8B3220" : "2px solid transparent",
    borderRadius: 12, padding: "14px 18px", outline: "none", marginBottom: 6,
    transition: "border-color .2s",
  });
  const sublabel = {
    fontFamily: "'Courier Prime', monospace", fontSize: 11,
    color: "#6B6259", letterSpacing: ".1em", textTransform: "uppercase",
    marginBottom: 8, display: "block",
  };

  return (
    <div>
      <h2 style={LABEL}>Your calorie profile</h2>

      <label htmlFor="profile-maintenance" style={sublabel}>Maintenance: calories to stay at your current weight</label>
      <input
        id="profile-maintenance"
        type="number"
        value={maintenance}
        onChange={e => { setMaintenance(e.target.value); setMainInvalid(false); setError(""); }}
        aria-invalid={mainInvalid}
        style={inputStyle(mainInvalid)}
        placeholder="1300"
      />

      <label htmlFor="profile-goal" style={{ ...sublabel, marginTop: 12 }}>Goal: your daily calorie target</label>
      <input
        id="profile-goal"
        type="number"
        value={goal}
        onChange={e => { setGoal(e.target.value); setGoalInvalid(false); setError(""); }}
        aria-invalid={goalInvalid}
        style={inputStyle(goalInvalid)}
        placeholder="1920"
      />

      {error && (
        <p ref={errorRef} role="alert" tabIndex={-1} style={{ ...ERR_STYLE, marginTop: 10 }}>
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={onClose} style={BTN_SECONDARY}>Cancel</button>
        <button onClick={save} style={BTN_PRIMARY}>Save</button>
      </div>
    </div>
  );
}

// ─── History sheet ────────────────────────────────────────────────────
function HistorySheet({ profile }) {
  const [days, setDays] = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    getAllLogs().then(logs => {
      setDays(
        logs
          .filter(log => log.date !== TODAY && log.meals?.length > 0)
          .map(log => ({
            date: log.date,
            entries: log.meals,
            total: log.meals.reduce((s, e) => s + e.kcal, 0),
          }))
      );
    });
  }, []);

  const formatDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  };

  const statusColor = (total) =>
    total < profile.maintenance ? "#6B6259"
    : total <= profile.goal     ? "#C4593A"
    :                             "#DC2626";

  if (days.length === 0) return (
    <div>
      <h2 style={LABEL}>Past days</h2>
      <p style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 16, color: "#A89E96", padding: "8px 0" }}>
        Nothing yet. Log some food today and it will show up here tomorrow.
      </p>
    </div>
  );

  return (
    <div>
      <h2 style={LABEL}>Past days</h2>
      {days.map(day => {
        const isOpen = expanded === day.date;
        const pct    = Math.min(day.total / profile.goal, 1);
        const mPct   = Math.min(profile.maintenance / profile.goal, 1);
        const color  = statusColor(day.total);

        return (
          <div key={day.date} style={{ borderBottom: "1px solid #EDE8E3", paddingBottom: 14, marginBottom: 14 }}>
            <button
              onClick={() => setExpanded(isOpen ? null : day.date)}
              aria-expanded={isOpen}
              aria-controls={`day-entries-${day.date}`}
              style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", justifyContent: "space-between", WebkitTapHighlightColor: "transparent" }}
            >
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: 12, color: "#6B6259", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 2 }}>
                  {formatDate(day.date)}
                </div>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color, lineHeight: 1 }}>
                  {day.total} <span style={{ fontSize: 14, color: "#7A7068", fontFamily: "'Courier Prime', monospace" }}>kcal</span>
                </div>
              </div>
              <div aria-hidden="true" style={{ color: "#7A7068" }}>
                {isOpen ? <ChevronUp size={18} strokeWidth={1.5} /> : <ChevronDown size={18} strokeWidth={1.5} />}
              </div>
            </button>

            {/* Mini progress bar */}
            <div
              role="progressbar"
              aria-valuenow={day.total}
              aria-valuemin={0}
              aria-valuemax={profile.goal}
              aria-label={`${day.total} of ${profile.goal} kcal`}
              style={{ position: "relative", height: 2, background: "#EDE8E3", borderRadius: 99, marginTop: 10, overflow: "visible" }}
            >
              <div style={{ height: "100%", width: `${pct * 100}%`, background: color, borderRadius: 99, transition: "width .4s ease" }} />
              <div aria-hidden="true" title={`Maintenance: ${profile.maintenance} kcal`} style={{ position: "absolute", top: -3, left: `${mPct * 100}%`, width: 2, height: 8, background: "#C9C0B8", borderRadius: 99, transform: "translateX(-50%)" }} />
            </div>

            {/* Expanded entries */}
            <div id={`day-entries-${day.date}`}>
              {isOpen && (
                <div style={{ marginTop: 14 }} role="list">
                  {day.entries.map((e, i) => (
                    <div key={i} role="listitem" style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #F5F0EC" }}>
                      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#1C1917" }}>{e.name}</span>
                      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#A33B27", flexShrink: 0, marginLeft: 12 }}>{e.kcal} kcal</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────
export default function Nutritak() {
  const [entries, setEntries] = useState([]);
  const [history, setHistory] = useState({});
  const [profile, setProfile] = useState({ maintenance: 1300, goal: 1920 });
  const [sheet, setSheet]     = useState(null);
  const [newIds, setNewIds]   = useState(new Set());
  const [loaded, setLoaded]   = useState(false);
  const [heroKey, setHeroKey] = useState(0);
  const prevConsumed          = useRef(null);
  const nextId                = useRef(Date.now());

  useEffect(() => {
    Promise.all([getLog(), getProfile(), getHistory()]).then(([log, prof, hist]) => {
      if (log?.meals) setEntries(log.meals);
      setProfile(prof);
      setHistory(hist);
      setLoaded(true);
    });
  }, []);

  const consumed  = entries.reduce((s, e) => s + e.kcal, 0);

  // Pulse hero number whenever calories change (but not on initial data load)
  useEffect(() => {
    if (!loaded) { prevConsumed.current = consumed; return; }
    if (prevConsumed.current !== null && consumed !== prevConsumed.current) {
      setHeroKey(k => k + 1);
    }
    prevConsumed.current = consumed;
  }, [consumed, loaded]);

  const remaining = profile.goal - consumed;
  const overGoal  = remaining < 0;
  const pct       = Math.min(consumed / profile.goal, 1);
  const maintPct  = Math.min(profile.maintenance / profile.goal, 1);

  const barColor =
    consumed < profile.maintenance ? "#A89E96"
    : consumed <= profile.goal     ? "#C4593A"
    :                                "#DC2626";

  const flashIds = (ids) => {
    setNewIds(prev => new Set([...prev, ...ids]));
    setTimeout(() => setNewIds(prev => {
      const s = new Set(prev);
      ids.forEach(id => s.delete(id));
      return s;
    }), 1600);
  };

  const addEntry = useCallback((item) => {
    const id = nextId.current++;
    setEntries(prev => {
      const next = [...prev, { id, name: item.name, kcal: item.kcal, ...(item.servings && item.servings !== 1 && { servings: item.servings }) }];
      saveLog(undefined, next);
      return next;
    });
    flashIds([id]);
  }, []);

  const updateEntry = useCallback((updated) => {
    setEntries(prev => {
      const next = prev.map(e => e.id === updated.id ? updated : e);
      saveLog(undefined, next);
      return next;
    });
  }, []);

  const deleteEntry = useCallback((id) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      saveLog(undefined, next);
      return next;
    });
  }, []);

  const handleSaveProfile = (updated) => {
    setProfile(updated);
    saveProfileToDB(updated); // fire and forget
  };

  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <div style={{ minHeight: "100vh", background: "#FAF5E8", maxWidth: 430, margin: "0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Courier+Prime:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        input { -webkit-appearance: none; border-radius: 0; }
        button { -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        button:focus-visible { outline: 2px solid #C4593A; outline-offset: 2px; border-radius: 4px; }
        input:focus-visible { outline: 2px solid #C4593A; outline-offset: 2px; }
        [role="button"]:focus-visible { outline: 2px solid #C4593A; outline-offset: 2px; border-radius: 4px; }
        @keyframes nt-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(0.85); }
        }
        @keyframes nt-enter {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes nt-exit {
          to { opacity: 0; transform: translateX(12px); }
        }
        @keyframes nt-number-pop {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.055); }
          100% { transform: scale(1); }
        }
        @keyframes nt-sheet-in {
          from { opacity: 0.7; transform: translateX(-50%) translateY(22px); }
          to   { opacity: 1;   transform: translateX(-50%) translateY(0); }
        }
        button { transition: transform .12s ease; }
        button:active:not([disabled]) { transform: scale(0.96); transition-duration: .06s; }
        .nt-fab { transition: transform .18s ease, box-shadow .18s ease !important; }
        .nt-fab:hover:not([disabled]) { transform: translateY(-2px) !important; box-shadow: 0 8px 38px rgba(28,25,23,.38) !important; }
        .nt-number-pop { animation: nt-number-pop .4s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div style={{ height: 48 }} />

      {/* Header */}
      <header style={{ padding: "0 28px 44px" }}>

        {/* Date + icons — tight timestamp row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <time
            dateTime={TODAY}
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "#7A7068", letterSpacing: ".14em", textTransform: "uppercase" }}
          >
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </time>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <button
              onClick={() => setSheet("history")}
              aria-label="View history"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7068", padding: 12, display: "flex", alignItems: "center", minWidth: 44, minHeight: 44 }}
            >
              <CalendarDays size={17} strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              onClick={() => setSheet("profile")}
              aria-label="Edit calorie profile"
              style={{ background: "none", border: "none", cursor: "pointer", color: "#7A7068", padding: 12, display: "flex", alignItems: "center", minWidth: 44, minHeight: 44 }}
            >
              <Settings size={17} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Hero number — anchored tight to date */}
        <div
          key={heroKey}
          className="nt-number-pop"
          aria-label={`${Math.abs(remaining)} calories ${overGoal ? "over goal" : "remaining"}`}
          style={{ fontFamily: "'DM Serif Display', serif", fontSize: 80, lineHeight: .95, letterSpacing: "-.03em", color: overGoal ? "#DC2626" : "#1C1917", transition: "color .4s", display: "inline-block", transformOrigin: "left center" }}
        >
          {Math.abs(remaining)}
        </div>

        {/* Subtitle — unit label for the number above */}
        <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: 13, color: "#7A7068", marginTop: 6 }}>
          {overGoal ? "kcal over goal" : "kcal left"} · {consumed} eaten of {profile.goal}
        </p>

        {/* Progress bar with maintenance marker */}
        <div style={{ marginTop: 20 }}>
          <div
            role="progressbar"
            aria-valuenow={consumed}
            aria-valuemin={0}
            aria-valuemax={profile.goal}
            aria-label={`${consumed} of ${profile.goal} kcal eaten today`}
            style={{ position: "relative", height: 3, background: "#EDE8E3", borderRadius: 99, overflow: "visible" }}
          >
            <div style={{ height: "100%", width: `${pct * 100}%`, background: barColor, borderRadius: 99, transition: "width .5s ease, background .4s" }} />
            <div
              aria-hidden="true"
              title={`Maintenance: ${profile.maintenance} kcal`}
              style={{ position: "absolute", top: -4, left: `${maintPct * 100}%`, width: 2, height: 11, background: "#A89E96", borderRadius: 99, transform: "translateX(-50%)" }}
            />
          </div>
          {/* Label anchored left — reads as bar caption, not floating note */}
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: 10, color: "#7A7068", letterSpacing: ".08em", marginTop: 7 }}>
            maintain at {profile.maintenance}
          </p>
        </div>
      </header>

      {/* Log */}
      <main style={{ padding: "0 28px" }}>
        <h2 style={{ fontFamily: "'Courier Prime', monospace", fontSize: 11, color: "#7A7068", letterSpacing: ".14em", textTransform: "uppercase", marginBottom: 6 }}>
          Today's log
        </h2>

        {entries.length === 0 ? (
          <p style={{ fontFamily: "'DM Serif Display', serif", fontStyle: "italic", fontSize: 16, color: "#A89E96", padding: "8px 0" }}>
            Nothing logged yet. Tap <strong style={{ fontStyle: "normal", fontWeight: "normal", color: "#7A7068" }}>+ Type food</strong> to start.
          </p>
        ) : entries.map(entry => (
          <EntryRow
            key={entry.id}
            entry={entry}
            onUpdate={updateEntry}
            onDelete={deleteEntry}
            isNew={newIds.has(entry.id)}
          />
        ))}
      </main>

      <div style={{ height: 120 }} />

      {/* FAB */}
      <div style={{ position: "fixed", bottom: 36, left: "50%", transform: "translateX(-50%)", zIndex: 50, width: "100%", maxWidth: 430, pointerEvents: "none" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, pointerEvents: "all" }}>
          <button
            onClick={() => setSheet("text")}
            className="nt-fab"
            style={{ padding: "15px 28px", background: "#1C1917", border: "none", borderRadius: 99, fontFamily: "'Courier Prime', monospace", fontSize: 15, color: "#FAF8F5", cursor: "pointer", boxShadow: "0 4px 28px rgba(28,25,23,.28)" }}
          >
            + Type food
          </button>
          <button
            onClick={() => setSheet("photo")}
            className="nt-fab"
            aria-label="Log food from a photo"
            style={{ width: 52, height: 52, background: "#FAF5E8", border: "1.5px solid #EDE8E3", borderRadius: 99, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 28px rgba(28,25,23,.12)" }}
          >
            <Camera size={20} strokeWidth={1.5} color="#7A7068" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Sheets */}
      {sheet === "text" && (
        <Sheet onClose={closeSheet} label="Add food">
          <TextSheet onAdd={addEntry} onClose={closeSheet} history={history} onHistoryUpdate={setHistory} />
        </Sheet>
      )}
      {sheet === "photo" && (
        <Sheet onClose={closeSheet} label="Photo your meal">
          <PhotoSheet onAdd={addEntry} onClose={closeSheet} history={history} onHistoryUpdate={setHistory} />
        </Sheet>
      )}
      {sheet === "profile" && (
        <Sheet onClose={closeSheet} label="Edit calorie profile">
          <ProfileSheet profile={profile} onSave={handleSaveProfile} onClose={closeSheet} />
        </Sheet>
      )}
      {sheet === "history" && (
        <Sheet onClose={closeSheet} label="Past days">
          <HistorySheet profile={profile} />
        </Sheet>
      )}
    </div>
  );
}
