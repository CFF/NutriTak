import { useState, useEffect, useCallback, useRef } from "react";
import { getEntriesByDate, getAllEntries, saveEntry, deleteEntry, updateEntry, getProfile, saveProfileToDB } from "./lib/storage";

// ─── Constants ────────────────────────────────────────────────────────
const ARC_LENGTH = 311;
const MACRO_TARGETS = { protein: 120, carbs: 200, fats: 65 };

// ─── Color tokens ─────────────────────────────────────────────────────
const C = {
  bg:       "#FAF8F5",
  black:    "#1C1917",
  terra:    "#C4593A",
  muted:    "#A89E96",
  divider:  "#EDE8E3",
  amber:    "#E8A020",
  card:     "#FFFFFF",
  red:      "#C0392B",
  emptyBg:  "#EAEDE8",
};

// ─── Typography tokens ────────────────────────────────────────────────
const T = {
  ui:      "'Inter', sans-serif",
  display: "'Caveat Brush', cursive",
};

// ─── Shadow tokens ────────────────────────────────────────────────────
const SH = {
  activeCard: "0 1px 8px rgba(28,25,23,.08)",
  card:       "0 2px 16px rgba(28,25,23,.14)",
  modal:      "0 -8px 48px rgba(28,25,23,.18)",
  fab:        "0 4px 20px rgba(196,89,58,.4)",
};

// ─── Motion tokens ────────────────────────────────────────────────────
const M = {
  stagger:   40,   // ms per FAB item
  gauge:     "stroke-dashoffset .5s ease, stroke .4s",
  heroColor: "color .4s",
  macroFill: "width .5s ease",
  fabSpin:   "transform .2s ease",
  saveBg:    "background .3s",
  sheet:     ".28s cubic-bezier(0.25, 1, 0.5, 1)",
};

// ─── Helpers ──────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }

function buildWeek() {
  const out = [];
  const now = new Date();
  for (let i = -3; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    out.push({ date: d, offset: i });
  }
  return out;
}

const DAY_SINGLE = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function ringColor(net, floor, goal) {
  if (net < floor)  return C.muted;
  if (net <= goal)  return C.terra;
  return C.red;
}

// ─── OpenRouter API ───────────────────────────────────────────────────
// Try openrouter/free first (auto-routes to best available), fall back to specific models
const FREE_MODELS = [
  "openrouter/free",
  "google/gemma-3-4b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

function extractJSON(text) {
  // Find first balanced JSON object or array (handles trailing text from models)
  const start = text.search(/[{\[]/);
  if (start === -1) return null;
  const opener = text[start], closer = opener === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === opener) depth++;
    else if (text[i] === closer) { depth--; if (depth === 0) return JSON.parse(text.slice(start, i + 1)); }
  }
  return null;
}

async function tryModel(model, messages, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/openrouter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });
    const data = await res.json();
    clearTimeout(timer);
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    const text = data.choices?.[0]?.message?.content || "";
    const parsed = extractJSON(text);
    if (!parsed) throw new Error("No JSON in response");
    return parsed;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function callOpenRouter(messages) {
  let lastError;
  for (const model of FREE_MODELS) {
    try {
      return await tryModel(model, messages, 20000);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All models failed");
}

// ─── Vision AI ────────────────────────────────────────────────────────
const VISION_MODELS = [
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-31b-it:free",
];

const VISION_PROMPT = `You are a nutrition assistant. Identify every distinct food item visible in this photo.
Return ONLY a JSON array, no markdown, no explanation.

Required format:
[
  { "name": "Chicken Breast", "calories": 243, "protein": 46, "carbs": 0, "fats": 5, "portion": "3 pieces (~300g)" },
  { "name": "Yellow Rice", "calories": 143, "protein": 3, "carbs": 30, "fats": 1, "portion": "1 serving (~120g)" }
]

Rules:
- Each distinct ingredient or component gets its own object
- calories, protein, carbs, fats must be integers
- portion is a human-readable string (count, volume, or weight estimate) of what you see in the photo
- If you cannot identify something precisely, make your best guess — do not omit it
- Do not add commentary, caveats, or extra fields`;

async function callVisionAI(dataUrl) {
  const messages = [{
    role: "user",
    content: [
      { type: "image_url", image_url: { url: dataUrl } },
      { type: "text", text: VISION_PROMPT },
    ],
  }];
  let lastError;
  for (const model of VISION_MODELS) {
    try {
      return await tryModel(model, messages, 30000);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Vision models failed");
}

async function compressImage(file) {
  let blob = file;
  if (file.type === "image/heic" || file.name?.toLowerCase().endsWith(".heic")) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const objUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(objUrl);
      const MAX = 1200;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        const scale = MAX / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = objUrl;
  });
}

// ─── Arc Gauge ────────────────────────────────────────────────────────
function ArcGauge({ net, floor, goal }) {
  const color     = ringColor(net, floor, goal);
  const remaining = goal - net;
  const heroColor = net > goal ? C.red : C.black;
  const floorOffset = ARC_LENGTH - Math.min(floor / goal, 1) * ARC_LENGTH;
  const fillOffset  = ARC_LENGTH - Math.min(net / goal, 1.02) * ARC_LENGTH;
  const arcPath = "M20 118 A99 99 0 0 1 218 118";

  return (
    <div style={{ position: "relative", width: "100%" }} aria-label={`${remaining} kcal remaining`}>
      <svg aria-hidden="true" width="100%" viewBox="0 0 238 130" style={{ display: "block" }}>
        <path d={arcPath} fill="none" stroke={C.divider} strokeWidth={10} strokeLinecap="round" />
        {net > 0 && (
          <path d={arcPath} fill="none" stroke={C.amber} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={ARC_LENGTH} strokeDashoffset={floorOffset} />
        )}
        {net > 0 && (
          <path d={arcPath} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={ARC_LENGTH} strokeDashoffset={fillOffset}
            style={{ transition: M.gauge }} />
        )}
      </svg>
      <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
        <span style={{ fontFamily: T.display, fontSize: 64, lineHeight: 1, color: heroColor, transition: M.heroColor }}>
          {Math.abs(remaining).toLocaleString()}
        </span>
        <span style={{ fontFamily: T.ui, fontSize: 13, color: C.muted, marginTop: 2 }}>
          kcal remaining
        </span>
      </div>
    </div>
  );
}

// ─── Macro bar ────────────────────────────────────────────────────────
function MacroBar({ label, consumed, target, opacity = 1 }) {
  const pct = Math.min(consumed / Math.max(target, 1), 1);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: T.ui, fontSize: 15, fontWeight: 700, color: C.black }}>{consumed}g</span>
      <div role="progressbar" aria-label={label} aria-valuenow={consumed} aria-valuemin={0} aria-valuemax={target}
        style={{ width: "60%", height: 6, background: C.divider, borderRadius: 99 }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: C.terra, opacity, borderRadius: 99, transition: M.macroFill, minWidth: pct > 0 ? 6 : 0 }} />
      </div>
      <span aria-hidden="true" style={{ fontFamily: T.ui, fontSize: 11, color: C.muted }}>{label}</span>
    </div>
  );
}

// ─── Date strip ───────────────────────────────────────────────────────
function DateStrip() {
  const week = buildWeek();
  return (
    <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "8px 8px 12px", borderBottom: `0.5px solid ${C.divider}` }}>
      {week.map(({ date, offset }) => {
        const isToday   = offset === 0;
        const isFuture  = offset > 0;
        const dayLabel  = DAY_SINGLE[date.getDay()];
        const num       = date.getDate();

        const circleStyle = isToday
          ? { width: 28, height: 28, borderRadius: "50%", border: `2px solid ${C.black}`, display: "flex", alignItems: "center", justifyContent: "center" }
          : { width: 28, height: 28, borderRadius: "50%", border: `1.5px dashed ${C.muted}`, display: "flex", alignItems: "center", justifyContent: "center", opacity: isFuture ? 0.4 : 1 };

        const numStyle = {
          fontFamily: T.ui,
          fontSize: 11,
          fontWeight: isToday ? 700 : 400,
          color: isToday ? C.black : C.muted,
        };

        const labelStyle = {
          fontFamily: T.ui,
          fontSize: 11,
          fontWeight: isToday ? 600 : 400,
          color: isToday ? C.black : C.muted,
          opacity: isFuture ? 0.4 : 1,
        };

        return (
          <div key={offset}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
              padding: isToday ? "7px 6px 8px" : "7px 6px 8px",
              background: isToday ? C.card : "transparent",
              borderRadius: isToday ? 12 : 0,
              boxShadow: isToday ? SH.activeCard : "none",
              minWidth: 36,
            }}>
            <span style={labelStyle}>{dayLabel}</span>
            <span style={circleStyle}>
              <span style={numStyle}>{num}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Log Entry Row ────────────────────────────────────────────────────
function LogEntry({ entry, onUpdate, onDelete, isLast }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(entry.name);
  const [editVal, setEditVal]   = useState(entry.type === 'water' ? entry.amount : entry.calories);

  const commit = async () => {
    const updated = entry.type === 'water'
      ? { ...entry, name: editName.trim(), amount: parseInt(editVal, 10) || entry.amount }
      : { ...entry, name: editName.trim(), calories: parseInt(editVal, 10) || entry.calories };
    await updateEntry(updated);
    onUpdate(updated);
    setEditing(false);
  };

  const cancel = () => {
    setEditName(entry.name);
    setEditVal(entry.type === 'water' ? entry.amount : entry.calories);
    setEditing(false);
  };

  const valueLabel = entry.type === 'water'
    ? `${entry.amount}ml`
    : entry.type === 'exercise'
      ? `−${entry.calories}`
      : `${entry.calories}`;

  const valueColor = entry.type === 'exercise' ? C.terra : C.black;

  if (editing) return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", marginBottom: isLast ? 0 : 6, background: C.emptyBg, borderRadius: 14, listStyle: "none" }}>
      <label htmlFor={`edit-name-${entry.id}`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Name</label>
      <input id={`edit-name-${entry.id}`} value={editName} onChange={e => setEditName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && commit()}
        style={{ flex: 1, fontFamily: T.ui, fontSize: 13, color: C.black, background: "transparent", border: "none", borderBottom: `1.5px solid ${C.terra}`, outline: "none", padding: "2px 0" }} />
      <label htmlFor={`edit-val-${entry.id}`} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>{entry.type === 'water' ? 'Amount in ml' : 'Calories'}</label>
      <input id={`edit-val-${entry.id}`} value={editVal} type="number" onChange={e => setEditVal(e.target.value)}
        onKeyDown={e => e.key === "Enter" && commit()}
        style={{ width: 54, fontFamily: T.ui, fontSize: 13, color: C.terra, background: "transparent", border: "none", borderBottom: `1.5px solid ${C.terra}`, outline: "none", textAlign: "right", padding: "2px 0" }} />
      <span aria-hidden="true" style={{ fontFamily: T.ui, fontSize: 11, color: C.muted }}>{entry.type === 'water' ? 'ml' : 'kcal'}</span>
      <button onClick={commit} aria-label="Save changes" style={{ background: "none", border: "none", cursor: "pointer", color: C.terra, fontSize: 18, padding: "4px", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</button>
      <button onClick={cancel} aria-label="Cancel editing" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 18, padding: "4px", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </li>
  );

  return (
    <li style={{ display: "flex", alignItems: "center", padding: "12px 14px", marginBottom: isLast ? 0 : 6, background: C.emptyBg, borderRadius: 14, gap: 8, listStyle: "none" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: T.ui, fontSize: 13, fontWeight: 400, color: C.black }}>{entry.name}</div>
        <div style={{ fontFamily: T.ui, fontSize: 12, color: C.muted, marginTop: 1 }}>{formatTime(entry.loggedAt)}</div>
      </div>
      <span style={{ fontFamily: T.ui, fontSize: 13, fontWeight: 600, color: valueColor }}>{valueLabel}</span>
      <button onClick={() => setEditing(true)} aria-label={`Edit ${entry.name}`}
        style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "4px", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>
        </svg>
      </button>
      <button onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.name}`}
        style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "4px", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>
        </svg>
      </button>
    </li>
  );
}

// ─── Sheet wrapper ────────────────────────────────────────────────────
function Sheet({ onClose, label, title, children }) {
  const dialogRef = useRef();
  const closeBtnRef = useRef();

  useEffect(() => {
    // Focus close button on open
    closeBtnRef.current?.focus();

    // Save previously focused element to restore on close
    const prev = document.activeElement;

    const handleKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      // Focus trap
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      prev?.focus();
    };
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 99, background: "rgba(28,25,23,.45)" }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label}
        style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 100, background: C.bg, borderRadius: "22px 22px 0 0", padding: "16px 20px 52px", maxHeight: "88vh", overflowY: "auto", boxShadow: SH.modal, animation: `nt-sheet-in ${M.sheet} both` }}>
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div aria-hidden="true" style={{ width: 36, height: 4, background: C.divider, borderRadius: 99 }} />
        </div>
        {/* Title + close */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase" }}>{title}</p>
          <button ref={closeBtnRef} onClick={onClose} aria-label="Close" className="nt-close-btn"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center", marginRight: -8 }}>
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─── Food Sheet ───────────────────────────────────────────────────────
function FoodSheet({ onAdd, onClose }) {
  const [phase, setPhase]           = useState("input");
  // "input" | "fdc-results" | "clarify" | "confirm" | "photo-review"
  const [text, setText]             = useState("");
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError]           = useState("");

  // FDC results
  const [fdcResults, setFdcResults] = useState([]);

  // Confirm (single item — FDC pick or AI)
  const [result, setResult]         = useState(null);
  const [servings, setServings]     = useState(1);

  // Clarify (AI)
  const [clarifyQ, setClarifyQ]     = useState("");
  const [clarifyA, setClarifyA]     = useState("");

  // Photo review
  const [photoThumb, setPhotoThumb]     = useState(null);
  const [photoItems, setPhotoItems]     = useState([]);
  const [addManualOpen, setAddManualOpen] = useState(false);
  const [addManualText, setAddManualText] = useState("");
  const [addManualLoading, setAddManualLoading] = useState(false);

  const inputRef = useRef();
  const fileRef  = useRef();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const FOOD_PROMPT = (desc) =>
    `You are a nutrition assistant. The user described a food or meal. Return ONLY a JSON object, no markdown, no explanation.\n\nRequired format:\n{\n  "name": "Short food name",\n  "calories": 350,\n  "protein": 12,\n  "carbs": 45,\n  "fats": 8,\n  "portion": "1 medium bowl (approx 300g)"\n}\n\nRules:\n- calories, protein, carbs, fats must be integers\n- If the description is ambiguous and one question would meaningfully change the estimate, return:\n  { "clarify": "Your question here?" }\n- Ask at most one clarifying question. If still ambiguous after one answer, commit to a reasonable default.\n- Do not add commentary, caveats, or extra fields.\n\nUser input: "${desc}"`;

  // FDC search → results or AI fallback
  const doFDCSearch = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    setLoadingMsg("Searching…");
    setError("");

    let results = [];
    try {
      const res = await fetch(`/api/fdc?query=${encodeURIComponent(text.trim())}`);
      if (res.ok) {
        const data = await res.json();
        results = data.results || [];
      }
    } catch {
      // FDC unavailable — fall through to AI
    }

    if (results.length > 0) {
      setFdcResults(results);
      setPhase("fdc-results");
      setLoading(false);
    } else {
      // Auto-fallback to AI estimation
      setLoadingMsg("Estimating with AI…");
      try {
        const data = await callOpenRouter([{ role: "user", content: FOOD_PROMPT(text.trim()) }]);
        if (data.clarify) {
          setClarifyQ(data.clarify);
          setPhase("clarify");
        } else {
          setResult(data);
          setServings(1);
          setPhase("confirm");
        }
      } catch {
        setError("Couldn't find or estimate. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  // Explicit AI lookup (from "Generate with AI" button or clarify submit)
  const doAILookup = async (desc, messages = null) => {
    if (loading) return;
    setLoading(true);
    setLoadingMsg("Estimating with AI…");
    setError("");
    try {
      const msgs = messages || [{ role: "user", content: FOOD_PROMPT(desc) }];
      const data = await callOpenRouter(msgs);
      if (data.clarify) {
        setClarifyQ(data.clarify);
        setPhase("clarify");
      } else {
        setResult(data);
        setServings(1);
        setPhase("confirm");
      }
    } catch {
      setError("Couldn't estimate. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const submitClarify = () => {
    if (!clarifyA.trim() || loading) return;
    doAILookup(text.trim(), [
      { role: "user", content: FOOD_PROMPT(text.trim()) },
      { role: "assistant", content: JSON.stringify({ clarify: clarifyQ }) },
      { role: "user", content: clarifyA.trim() },
    ]);
  };

  const pickFromFDC = (item) => {
    setResult({ name: item.name, calories: item.calories, protein: item.protein, carbs: item.carbs, fats: item.fats, portion: item.serving });
    setServings(1);
    setPhase("confirm");
  };

  const confirmAdd = () => {
    if (!result) return;
    const s = servings;
    onAdd({
      type: "food",
      date: todayStr(),
      name: result.name,
      calories: Math.round(result.calories * s),
      protein:  Math.round((result.protein || 0) * s),
      carbs:    Math.round((result.carbs   || 0) * s),
      fats:     Math.round((result.fats    || 0) * s),
      portion:  result.portion || "",
      loggedAt: new Date().toISOString(),
    });
    onClose();
  };

  // Photo path
  const handlePhotoFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoading(true);
    setLoadingMsg("Analysing your meal…");
    setError("");
    try {
      const dataUrl = await compressImage(file);
      setPhotoThumb(dataUrl);
      const items = await callVisionAI(dataUrl);
      if (!Array.isArray(items) || items.length === 0) throw new Error("No items detected");
      setPhotoItems(items);
      setPhase("photo-review");
    } catch {
      setError("Couldn't analyse the photo. Try again or describe your meal instead.");
      setPhase("input");
    } finally {
      setLoading(false);
    }
  };

  const updatePhotoItem = (i, field, value) =>
    setPhotoItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  const removePhotoItem = (i) =>
    setPhotoItems(prev => prev.filter((_, idx) => idx !== i));

  const addManualItem = async () => {
    if (!addManualText.trim() || addManualLoading) return;
    setAddManualLoading(true);
    try {
      const data = await callOpenRouter([{ role: "user", content: FOOD_PROMPT(addManualText.trim()) }]);
      const item = data.clarify
        ? { name: addManualText.trim(), calories: 0, protein: 0, carbs: 0, fats: 0, portion: "" }
        : data;
      setPhotoItems(prev => [...prev, item]);
      setAddManualText("");
      setAddManualOpen(false);
    } catch {
      // silently ignore — user can retry
    } finally {
      setAddManualLoading(false);
    }
  };

  const confirmAllPhoto = () => {
    photoItems.forEach(item => {
      onAdd({
        type: "food",
        date: todayStr(),
        name: item.name,
        calories: parseInt(item.calories, 10) || 0,
        protein:  parseInt(item.protein,  10) || 0,
        carbs:    parseInt(item.carbs,    10) || 0,
        fats:     parseInt(item.fats,     10) || 0,
        portion:  item.portion || "",
        loggedAt: new Date().toISOString(),
      });
    });
    onClose();
  };

  const btnPrimary = { width: "100%", padding: "14px", background: C.terra, border: "none", borderRadius: 12, fontFamily: T.ui, fontSize: 15, fontWeight: 600, color: "#fff", cursor: "pointer" };

  // Loading overlay
  if (loading) return (
    <div style={{ textAlign: "center", padding: "48px 0" }}>
      <p style={{ fontFamily: T.ui, fontSize: 14, color: C.muted }}>{loadingMsg || "Loading…"}</p>
    </div>
  );

  // Photo review
  if (phase === "photo-review") return (
    <div>
      {photoThumb && (
        <img src={photoThumb} alt="Your meal" style={{ width: "100%", borderRadius: 12, marginBottom: 16, objectFit: "cover", maxHeight: 180 }} />
      )}
      <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Review items</p>
      {photoItems.length === 0 && (
        <p style={{ fontFamily: T.ui, fontSize: 14, color: C.muted, marginBottom: 16 }}>No items detected. Add them manually below.</p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
        {photoItems.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: C.emptyBg, borderRadius: 12, padding: "10px 12px", marginBottom: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input value={item.name} onChange={e => updatePhotoItem(i, "name", e.target.value)}
                aria-label={`Name for item ${i + 1}`}
                style={{ width: "100%", fontFamily: T.ui, fontSize: 13, color: C.black, background: "transparent", border: "none", outline: "none", padding: 0 }} />
              {item.portion && <div style={{ fontFamily: T.ui, fontSize: 11, color: C.muted, marginTop: 2 }}>{item.portion}</div>}
            </div>
            <input type="number" value={item.calories} onChange={e => updatePhotoItem(i, "calories", e.target.value)}
              aria-label={`Calories for item ${i + 1}`}
              style={{ width: 48, fontFamily: T.ui, fontSize: 13, fontWeight: 600, color: C.terra, background: "transparent", border: "none", outline: "none", textAlign: "right", padding: 0 }} />
            <span style={{ fontFamily: T.ui, fontSize: 11, color: C.muted }}>kcal</span>
            <button onClick={() => removePhotoItem(i)} aria-label={`Remove ${item.name}`}
              style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 4, minWidth: 36, minHeight: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {addManualOpen ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={addManualText} onChange={e => setAddManualText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addManualItem()}
            placeholder="Describe the item…"
            autoFocus
            style={{ flex: 1, fontFamily: T.ui, fontSize: 14, color: C.black, background: C.card, border: `1px solid ${C.divider}`, borderRadius: 10, padding: "10px 12px", outline: "none" }} />
          <button onClick={addManualItem} disabled={addManualLoading || !addManualText.trim()}
            style={{ padding: "10px 16px", background: C.terra, border: "none", borderRadius: 10, fontFamily: T.ui, fontSize: 14, fontWeight: 600, color: "#fff", cursor: "pointer", opacity: addManualLoading || !addManualText.trim() ? 0.5 : 1 }}>
            {addManualLoading ? "…" : "Add"}
          </button>
        </div>
      ) : (
        <button onClick={() => setAddManualOpen(true)}
          style={{ width: "100%", padding: "10px", background: "none", border: `1px dashed ${C.divider}`, borderRadius: 10, fontFamily: T.ui, fontSize: 13, color: C.muted, cursor: "pointer", marginBottom: 12 }}>
          + Add item manually
        </button>
      )}
      {error && <p role="alert" style={{ fontFamily: T.ui, fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</p>}
      <button onClick={confirmAllPhoto} disabled={photoItems.length === 0}
        style={{ ...btnPrimary, opacity: photoItems.length === 0 ? 0.5 : 1 }}>
        Add all to log
      </button>
      <button onClick={() => { setPhase("input"); setPhotoThumb(null); setPhotoItems([]); setError(""); }}
        style={{ width: "100%", padding: "12px", background: "none", border: "none", fontFamily: T.ui, fontSize: 13, color: C.muted, cursor: "pointer", marginTop: 8 }}>
        Retake
      </button>
    </div>
  );

  // Confirm (single item)
  if (phase === "confirm" && result) {
    const scaled = (v) => Math.round((v || 0) * servings);
    const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
    return (
      <div>
        <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 16 }}>Does this look right?</p>
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.divider}`, padding: "16px", marginBottom: 16 }}>
          <div style={{ fontFamily: T.ui, fontSize: 16, fontWeight: 600, color: C.black, marginBottom: 4 }}>{result.name}</div>
          {result.portion && <div style={{ fontFamily: T.ui, fontSize: 12, color: C.muted, marginBottom: 12 }}>{result.portion}</div>}
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: T.display, fontSize: 36, color: C.terra }}>{scaled(result.calories)}</div>
              <div style={{ fontFamily: T.ui, fontSize: 11, color: C.muted }}>kcal</div>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
              {[["Pro", result.protein], ["Car", result.carbs], ["Fat", result.fats]].map(([l, v]) => (
                <div key={l} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontFamily: T.ui, fontSize: 14, fontWeight: 600, color: C.black }}>{scaled(v)}g</div>
                  <div style={{ fontFamily: T.ui, fontSize: 11, color: C.muted }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Number of servings" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {STEPS.map(s => (
              <button key={s} onClick={() => setServings(s)}
                aria-label={`${s} serving${s !== 1 ? "s" : ""}`}
                aria-pressed={servings === s}
                style={{ padding: "6px 12px", borderRadius: 99, border: `1.5px solid ${servings === s ? C.terra : C.divider}`, background: servings === s ? C.terra : "transparent", color: servings === s ? "#fff" : C.black, fontFamily: T.ui, fontSize: 12, cursor: "pointer" }}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <button onClick={confirmAdd} style={btnPrimary}>Add to log</button>
        <button onClick={() => { setPhase("input"); setResult(null); }}
          style={{ width: "100%", padding: "12px", background: "none", border: "none", fontFamily: T.ui, fontSize: 13, color: C.muted, cursor: "pointer", marginTop: 8 }}>
          Start over
        </button>
      </div>
    );
  }

  // Clarify
  if (phase === "clarify") return (
    <div>
      <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>One quick question</p>
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.divider}`, padding: "14px 16px", marginBottom: 12, fontFamily: T.ui, fontSize: 14, color: C.black }}>{clarifyQ}</div>
      <label htmlFor="food-clarify-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Your answer</label>
      <input id="food-clarify-input" value={clarifyA} onChange={e => setClarifyA(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submitClarify()}
        placeholder="Your answer…"
        autoFocus
        style={{ width: "100%", fontFamily: T.ui, fontSize: 16, color: C.black, background: C.card, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "14px 16px", outline: "none", marginBottom: 12 }} />
      {error && <p role="alert" style={{ fontFamily: T.ui, fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</p>}
      <button onClick={submitClarify} disabled={!clarifyA.trim()}
        style={{ ...btnPrimary, opacity: !clarifyA.trim() ? 0.5 : 1 }}>
        Continue
      </button>
    </div>
  );

  // FDC results
  if (phase === "fdc-results") return (
    <div>
      <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>Select a match</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
        {fdcResults.map(item => (
          <li key={item.fdcId}>
            <button onClick={() => pickFromFDC(item)}
              style={{ width: "100%", textAlign: "left", background: C.card, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                <div style={{ fontFamily: T.ui, fontSize: 14, fontWeight: 500, color: C.black, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                <div style={{ fontFamily: T.ui, fontSize: 11, color: C.muted, marginTop: 2 }}>{item.brand || "Generic"}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: T.ui, fontSize: 14, fontWeight: 600, color: C.terra }}>{item.calories} kcal</div>
                <div style={{ fontFamily: T.ui, fontSize: 11, color: C.muted }}>{item.serving}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => doAILookup(text)}
        style={{ width: "100%", padding: "13px", background: "none", border: `1px solid ${C.divider}`, borderRadius: 12, fontFamily: T.ui, fontSize: 14, color: C.muted, cursor: "pointer" }}>
        Generate with AI
      </button>
    </div>
  );

  // Default: input phase
  return (
    <div>
      <input type="file" ref={fileRef} accept="image/*" capture="environment"
        onChange={handlePhotoFile} style={{ display: "none" }} aria-hidden="true" />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <label htmlFor="food-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Search for a food</label>
        <input id="food-input" ref={inputRef} value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && doFDCSearch()}
          placeholder="Search for a food…"
          style={{ flex: 1, fontFamily: T.ui, fontSize: 16, color: C.black, background: C.card, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "14px 16px", outline: "none" }} />
        <button onClick={() => fileRef.current?.click()} aria-label="Log from photo"
          style={{ padding: "14px", background: C.card, border: `1px solid ${C.divider}`, borderRadius: 12, cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>
          </svg>
        </button>
      </div>
      {error && <p role="alert" style={{ fontFamily: T.ui, fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</p>}
      <button onClick={doFDCSearch} disabled={!text.trim()}
        style={{ ...btnPrimary, opacity: text.trim() ? 1 : 0.5 }}>
        Search
      </button>
    </div>
  );
}

// ─── Water Sheet ──────────────────────────────────────────────────────
function WaterSheet({ onAdd, onClose }) {
  const [custom, setCustom] = useState("");
  const firstPresetRef = useRef();

  useEffect(() => { firstPresetRef.current?.focus(); }, []);

  const addWater = (ml) => {
    onAdd({ type: "water", date: todayStr(), name: "Water", amount: ml, loggedAt: new Date().toISOString() });
    onClose();
  };

  const presets = [250, 500, 750];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {presets.map((ml, i) => (
          <button key={ml} ref={i === 0 ? firstPresetRef : null} onClick={() => addWater(ml)}
            aria-label={`Add ${ml} millilitres of water`}
            style={{ flex: 1, padding: "18px 0", background: C.card, border: `1px solid ${C.divider}`, borderRadius: 14, fontFamily: T.ui, fontSize: 15, fontWeight: 600, color: C.black, cursor: "pointer" }}>
            {ml}ml
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <label htmlFor="water-custom-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Custom amount in millilitres</label>
        <input id="water-custom-input" value={custom} onChange={e => setCustom(e.target.value)} type="number"
          onKeyDown={e => e.key === "Enter" && custom && addWater(parseInt(custom, 10))}
          placeholder="Custom ml" style={{ flex: 1, fontFamily: T.ui, fontSize: 16, color: C.black, background: C.card, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "14px 16px", outline: "none" }} />
        <button onClick={() => custom && addWater(parseInt(custom, 10))} disabled={!custom}
          style={{ padding: "14px 20px", background: C.terra, border: "none", borderRadius: 12, fontFamily: T.ui, fontSize: 15, fontWeight: 600, color: "#fff", cursor: "pointer", opacity: custom ? 1 : 0.4 }}>
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Exercise Sheet ───────────────────────────────────────────────────
function ExerciseSheet({ onAdd, onClose }) {
  const [phase, setPhase]   = useState("input");
  const [text, setText]     = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");
  const inputRef            = useRef();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const EXERCISE_PROMPT = (desc) =>
    `You are a fitness assistant. The user described a physical activity. Return ONLY a JSON object, no markdown, no explanation.\n\nRequired format:\n{\n  "name": "Activity name",\n  "caloriesBurned": 280,\n  "duration": "30 min"\n}\n\nRules:\n- caloriesBurned must be an integer\n- Assume an average adult (70kg) unless the user specified otherwise\n- duration is a human-readable string for display only\n- Do not add commentary, caveats, or extra fields.\n\nUser input: "${desc}"`;

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await callOpenRouter([{ role: "user", content: EXERCISE_PROMPT(text.trim()) }]);
      setResult(data);
      setPhase("confirm");
    } catch (e) {
      setError("Couldn't estimate. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const confirmAdd = () => {
    if (!result) return;
    onAdd({ type: "exercise", date: todayStr(), name: result.name, calories: result.caloriesBurned, loggedAt: new Date().toISOString() });
    onClose();
  };

  const inputStyle = { width: "100%", fontFamily: T.ui, fontSize: 16, color: C.black, background: C.card, border: `1px solid ${C.divider}`, borderRadius: 12, padding: "14px 16px", outline: "none", marginBottom: 12 };
  const btnPrimary = { width: "100%", padding: "14px", background: C.terra, border: "none", borderRadius: 12, fontFamily: T.ui, fontSize: 15, fontWeight: 600, color: "#fff", cursor: "pointer" };

  if (phase === "confirm" && result) return (
    <div>
      <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 16 }}>Does this look right?</p>
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.divider}`, padding: "16px", marginBottom: 16 }}>
        <div style={{ fontFamily: T.ui, fontSize: 16, fontWeight: 600, color: C.black, marginBottom: 4 }}>{result.name}</div>
        {result.duration && <div style={{ fontFamily: T.ui, fontSize: 12, color: C.muted, marginBottom: 12 }}>{result.duration}</div>}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: T.display, fontSize: 36, color: C.terra }}>−{result.caloriesBurned}</span>
          <span style={{ fontFamily: T.ui, fontSize: 13, color: C.muted }}>kcal burned</span>
        </div>
      </div>
      <button onClick={confirmAdd} style={btnPrimary}>Log exercise</button>
      <button onClick={() => { setPhase("input"); setResult(null); }} style={{ width: "100%", padding: "12px", background: "none", border: "none", fontFamily: T.ui, fontSize: 13, color: C.muted, cursor: "pointer", marginTop: 8 }}>Start over</button>
    </div>
  );

  return (
    <div>
      <label htmlFor="exercise-input" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>Describe the activity</label>
      <input id="exercise-input" ref={inputRef} value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder="e.g. 30 min run, yoga, cycling…" style={inputStyle} />
      {error && <p role="alert" style={{ fontFamily: T.ui, fontSize: 12, color: C.red, marginBottom: 8 }}>{error}</p>}
      <button onClick={submit} disabled={loading || !text.trim()} aria-busy={loading} style={{ ...btnPrimary, opacity: loading || !text.trim() ? 0.5 : 1 }}>
        {loading ? "Looking up…" : "Look up"}
      </button>
    </div>
  );
}

// ─── FAB fan-out ──────────────────────────────────────────────────────
function FAB({ open, onToggle, onSelect }) {
  const actions = [
    { key: "water", label: "Water", icon: (
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.116 4.104A1 1 0 0 1 6.11 3h11.78a1 1 0 0 1 .994 1.105L17.19 20.21A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.79z"/><path d="M6 12a5 5 0 0 1 6 0 5 5 0 0 0 6 0"/>
      </svg>
    )},
    { key: "food", label: "Food", icon: (
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"/><path d="m13 12 4-4"/><path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"/>
      </svg>
    )},
    { key: "exercise", label: "Exercise", icon: (
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"/><path d="m2.5 21.5 1.4-1.4"/><path d="m20.1 3.9 1.4-1.4"/><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"/><path d="m9.6 14.4 4.8-4.8"/>
      </svg>
    )},
  ];

  return (
    <>
      {/* Scrim — full screen, covers nav (nav at z:50, scrim at z:60) */}
      {open && (
        <div onClick={onToggle} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(28,25,23,.3)" }} />
      )}

      {/* Sub-action cards — detached from nav, floating above */}
      <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 65, display: "flex", flexDirection: "row", alignItems: "flex-end", gap: 12, padding: 16, pointerEvents: open ? "auto" : "none" }}>
        {actions.map((action, i) => (
          <button key={action.key}
            onClick={() => { onToggle(); onSelect(action.key); }}
            tabIndex={open ? 0 : -1}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 8,
              padding: "22px 16px 18px",
              background: C.card,
              border: "none",
              borderRadius: 18,
              boxShadow: SH.card,
              cursor: "pointer",
              color: C.black,
              fontFamily: T.ui,
              fontSize: 14,
              fontWeight: 500,
              width: 112,
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
              transition: `opacity .2s ease ${i * M.stagger}ms, transform .2s ease ${i * M.stagger}ms`,
            }}>
            <span style={{ color: C.muted, display: "flex" }}>{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </>
  );
}

// ─── Bottom nav ───────────────────────────────────────────────────────
function BottomNav({ tab, onTab }) {
  const navItem = (key, label, icon) => {
    const active = tab === key;
    return (
      <button onClick={() => onTab(key)} aria-label={label} aria-current={active ? "page" : undefined}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", minWidth: 52, minHeight: 44, justifyContent: "center", outline: "none" }}>
        {icon(active ? C.terra : C.muted)}
        <span aria-hidden="true" style={{ fontFamily: T.ui, fontSize: 11, fontWeight: active ? 600 : 400, color: active ? C.terra : C.muted }}>
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav aria-label="Main navigation" style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, borderTop: `0.5px solid ${C.divider}`, boxShadow: "0 -1px 12px rgba(28,25,23,.06)", padding: "8px 20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", background: C.bg, zIndex: 50 }}>
      {navItem("home", "Home", (c) => (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
      ))}
      {navItem("history", "History", (c) => (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v4l3 3"/><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5"/>
        </svg>
      ))}
      {navItem("profile", "Profile", (c) => (
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M7 20.662V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.662"/>
        </svg>
      ))}
      {/* Spacer — preserves nav layout width where Log button was */}
      <div style={{ width: 48, height: 48, flexShrink: 0 }} />
    </nav>
  );
}

// ─── History screen ───────────────────────────────────────────────────
function HistoryScreen() {
  const [days, setDays] = useState(null);

  useEffect(() => {
    getAllEntries().then(entries => {
      const map = {};
      for (const e of entries) {
        if (!map[e.date]) map[e.date] = [];
        map[e.date].push(e);
      }
      const sorted = Object.keys(map)
        .sort((a, b) => b.localeCompare(a))
        .map(date => {
          const dayEntries = map[date];
          const food     = dayEntries.filter(e => e.type === "food").reduce((s, e) => s + (e.calories || 0), 0);
          const exercise = dayEntries.filter(e => e.type === "exercise").reduce((s, e) => s + (e.calories || 0), 0);
          const water    = dayEntries.filter(e => e.type === "water").reduce((s, e) => s + (e.amount || 0), 0);
          return { date, net: food - exercise, food, exercise, water };
        });
      setDays(sorted);
    });
  }, []);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  if (days === null) {
    return <div aria-live="polite" aria-busy="true" style={{ padding: "40px 20px", fontFamily: T.ui, fontSize: 13, color: C.muted }}>Loading…</div>;
  }

  return (
    <div style={{ padding: "32px 20px" }}>
      <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 24 }}>History</p>
      {days.length === 0 ? (
        <p style={{ fontFamily: T.ui, fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
          No past logs yet. Start tracking today and they'll appear here.
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {days.map((day, i) => (
            <li key={day.date} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i === days.length - 1 ? "none" : `0.5px solid ${C.divider}` }}>
              <div>
                <time dateTime={day.date} style={{ fontFamily: T.ui, fontSize: 14, color: C.black }}>{formatDate(day.date)}</time>
                {(day.exercise > 0 || day.water > 0) && (
                  <div style={{ fontFamily: T.ui, fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {day.exercise > 0 && `−${day.exercise} burned`}
                    {day.exercise > 0 && day.water > 0 && "  ·  "}
                    {day.water > 0 && `${day.water}ml water`}
                  </div>
                )}
              </div>
              <span aria-label={`${day.net} kcal`} style={{ fontFamily: T.display, fontSize: 22, color: C.terra }}>{day.net}</span>
            </li>
          ))}
        </ul>
      )}
      <div style={{ height: 100 }} />
    </div>
  );
}

// ─── Profile screen ───────────────────────────────────────────────────
function ProfileScreen({ profile, onSave }) {
  const [maintenance, setMaintenance] = useState(String(profile.maintenance));
  const [goal, setGoal]               = useState(String(profile.goal));
  const [saved, setSaved]             = useState(false);

  const save = async () => {
    const m = parseInt(maintenance, 10);
    const g = parseInt(goal, 10);
    if (!m || !g) return;
    await saveProfileToDB({ maintenance: m, goal: g });
    onSave({ maintenance: m, goal: g });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fieldStyle = {
    width: 130,
    fontFamily: T.display,
    fontSize: 44,
    color: C.black,
    background: "transparent",
    border: "none",
    borderBottom: `1.5px solid ${C.divider}`,
    outline: "none",
    padding: "0 0 4px",
  };

  return (
    <div style={{ padding: "32px 20px" }}>
      <p style={{ fontFamily: T.ui, fontSize: 11, fontWeight: 600, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 36 }}>Profile</p>

      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.divider}`, padding: "20px 20px 16px", marginBottom: 12 }}>
        <label htmlFor="profile-maintenance" style={{ display: "block", fontFamily: T.ui, fontSize: 12, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>
          Maintenance
        </label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <input id="profile-maintenance" type="number" value={maintenance} onChange={e => setMaintenance(e.target.value)} style={fieldStyle} aria-describedby="maintenance-hint" />
          <span aria-hidden="true" style={{ fontFamily: T.ui, fontSize: 13, color: C.muted }}>kcal / day</span>
        </div>
        <p id="maintenance-hint" style={{ fontFamily: T.ui, fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          Your TDEE — calories burned on a typical day.
        </p>
      </div>

      <div style={{ background: C.card, borderRadius: 16, border: `0.5px solid ${C.divider}`, padding: "20px 20px 16px", marginBottom: 32 }}>
        <label htmlFor="profile-goal" style={{ display: "block", fontFamily: T.ui, fontSize: 12, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 8 }}>
          Goal
        </label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <input id="profile-goal" type="number" value={goal} onChange={e => setGoal(e.target.value)} style={fieldStyle} aria-describedby="goal-hint" />
          <span aria-hidden="true" style={{ fontFamily: T.ui, fontSize: 13, color: C.muted }}>kcal / day</span>
        </div>
        <p id="goal-hint" style={{ fontFamily: T.ui, fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          Your daily calorie target. The ring fills to this number.
        </p>
      </div>

      <button onClick={save} style={{ padding: "13px 32px", background: saved ? "#5A9E6A" : C.terra, border: "none", borderRadius: 12, fontFamily: T.ui, fontSize: 15, fontWeight: 600, color: "#fff", cursor: "pointer", transition: M.saveBg }}>
        {saved ? "Saved ✓" : "Save"}
      </button>
      <div aria-live="polite" aria-atomic="true" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
        {saved ? "Profile saved successfully." : ""}
      </div>

      <div style={{ height: 100 }} />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────
export default function Nutritak() {
  const [entries, setEntries] = useState([]);
  const [profile, setProfile] = useState({ maintenance: 1290, goal: 1900 });
  const [fabOpen, setFabOpen] = useState(false);
  const [sheet, setSheet]     = useState(null); // 'food' | 'water' | 'exercise' | null
  const [tab, setTab]         = useState("home");

  useEffect(() => {
    Promise.all([getEntriesByDate(), getProfile()]).then(([ents, prof]) => {
      setEntries(ents.sort((a, b) => new Date(b.loggedAt) - new Date(a.loggedAt)));
      setProfile(prof);
    });
  }, []);

  // ─ Derived values ──────────────────────────────────────────────────
  const foodKcal     = entries.filter(e => e.type === "food").reduce((s, e) => s + (e.calories || 0), 0);
  const exerciseKcal = entries.filter(e => e.type === "exercise").reduce((s, e) => s + (e.calories || 0), 0);
  const net          = foodKcal - exerciseKcal;
  const protein      = entries.filter(e => e.type === "food").reduce((s, e) => s + (e.protein || 0), 0);
  const carbs        = entries.filter(e => e.type === "food").reduce((s, e) => s + (e.carbs   || 0), 0);
  const fats         = entries.filter(e => e.type === "food").reduce((s, e) => s + (e.fats    || 0), 0);

  // ─ Handlers ────────────────────────────────────────────────────────
  const handleAdd = useCallback(async (item) => {
    const id = await saveEntry(item);
    const newEntry = { ...item, id };
    setEntries(prev => [newEntry, ...prev]);
  }, []);

  const handleUpdate = useCallback((updated) => {
    setEntries(prev => prev.map(e => e.id === updated.id ? updated : e));
  }, []);

  const handleDelete = useCallback(async (id) => {
    await deleteEntry(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, maxWidth: 430, margin: "0 auto", fontFamily: T.ui, overflowX: "hidden" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { -webkit-tap-highlight-color: transparent; cursor: pointer; }
        ::-webkit-scrollbar { display: none; }
        input { -webkit-appearance: none; border-radius: 0; }
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
        button:focus-visible, [role="button"]:focus-visible { outline: 2px solid #C4593A; outline-offset: 3px; border-radius: 4px; }
        .nt-close-btn { border-radius: 4px; transition: background .15s, color .15s; }
        .nt-close-btn:hover { background: rgba(28,25,23,.06) !important; color: #1C1917 !important; }
        .nt-close-btn:active { background: rgba(28,25,23,.12) !important; color: #1C1917 !important; }
        @keyframes nt-sheet-in {
          from { opacity: 0.7; transform: translateX(-50%) translateY(22px); }
          to   { opacity: 1;   transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Home tab */}
      {tab === "home" && <>
        <div style={{ height: 48 }} />
        <DateStrip />

        {/* Summary card */}
        <div style={{ margin: "12px 12px 8px", background: C.card, borderRadius: 16, border: `0.5px solid ${C.divider}`, padding: "16px 16px 14px" }}>
          <ArcGauge net={net} floor={profile.maintenance} goal={profile.goal} />
          <div style={{ display: "flex", alignItems: "stretch", gap: 0, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.divider}` }}>
            <MacroBar label="Protein" consumed={protein} target={MACRO_TARGETS.protein} opacity={1} />
            <div style={{ width: 1, background: C.divider, margin: "0 8px" }} />
            <MacroBar label="Carbs"   consumed={carbs}   target={MACRO_TARGETS.carbs}   opacity={0.65} />
            <div style={{ width: 1, background: C.divider, margin: "0 8px" }} />
            <MacroBar label="Fats"    consumed={fats}    target={MACRO_TARGETS.fats}    opacity={0.45} />
          </div>
        </div>

        {/* Recently logged */}
        <div style={{ margin: "24px 12px 8px" }}>
          <div style={{ fontFamily: T.ui, fontSize: 12, fontWeight: 500, color: C.muted, letterSpacing: ".08em", textTransform: "uppercase", padding: "0 2px 6px" }}>
            recently logged
          </div>

          {entries.length === 0 ? (
            <div style={{ marginTop: 8, background: C.emptyBg, borderRadius: 18, padding: 24 }}>
              <div style={{ position: "relative", marginBottom: 26 }}>
                <div style={{ position: "absolute", bottom: -10, left: 10, right: 10, height: "100%", background: C.card, border: `1px solid ${C.divider}`, borderRadius: 14, opacity: 0.5 }} />
                <div style={{ position: "absolute", bottom: -5, left: 5, right: 5, height: "100%", background: C.card, border: `1px solid ${C.divider}`, borderRadius: 14, opacity: 0.75 }} />
                <div style={{ position: "relative", background: C.card, border: `1px solid ${C.divider}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                  <span aria-hidden="true" style={{ fontSize: 32, lineHeight: 1 }}>🥗</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 10, background: C.divider, borderRadius: 6, marginBottom: 8, width: "70%" }} />
                    <div style={{ height: 10, background: C.divider, borderRadius: 6, width: "45%" }} />
                  </div>
                </div>
              </div>
              <p style={{ fontFamily: T.ui, fontSize: 14, color: C.muted, textAlign: "center", padding: "0 24px 16px" }}>
                Tap + to add your first meal of the day
              </p>
            </div>
          ) : (
            <ul aria-live="polite" aria-label="Today's logged entries" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {entries.map((entry, i) => (
                <LogEntry key={entry.id} entry={entry} onUpdate={handleUpdate} onDelete={handleDelete} isLast={i === entries.length - 1} />
              ))}
            </ul>
          )}
        </div>

        <div style={{ height: 100 }} />
      </>}

      {/* History tab */}
      {tab === "history" && <HistoryScreen />}

      {/* Profile tab */}
      {tab === "profile" && <ProfileScreen profile={profile} onSave={p => setProfile(p)} />}

      {/* Bottom nav */}
      <BottomNav tab={tab} onTab={(t) => { setTab(t); setFabOpen(false); }} />

      {/* Log button — fixed, aligned with nav right padding (accounts for centered container) */}
      {!sheet && (
        <button onClick={() => setFabOpen(o => !o)} aria-label={fabOpen ? "Close log menu" : "Log food, water or exercise"}
          style={{ position: "fixed", bottom: 28, right: "calc(max((100vw - 430px) / 2, 0px) + 20px)", width: 48, height: 48, borderRadius: "50%", background: C.terra, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 4px 16px rgba(196,89,58,.35)", zIndex: 70, outline: "none" }}>
          <span style={{ fontFamily: T.ui, fontSize: 24, fontWeight: 300, color: "#fff", lineHeight: 1, transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)", transition: M.fabSpin, display: "block" }}>+</span>
        </button>
      )}

      {/* FAB sub-cards + scrim */}
      {!sheet && <FAB open={fabOpen} onToggle={() => setFabOpen(o => !o)} onSelect={(key) => { setFabOpen(false); setSheet(key); }} />}

      {/* Sheets */}
      {sheet === "food" && (
        <Sheet onClose={closeSheet} label="Log food" title="What did you eat?">
          <FoodSheet onAdd={handleAdd} onClose={closeSheet} />
        </Sheet>
      )}
      {sheet === "water" && (
        <Sheet onClose={closeSheet} label="Log water" title="How much water?">
          <WaterSheet onAdd={handleAdd} onClose={closeSheet} />
        </Sheet>
      )}
      {sheet === "exercise" && (
        <Sheet onClose={closeSheet} label="Log exercise" title="What did you do?">
          <ExerciseSheet onAdd={handleAdd} onClose={closeSheet} />
        </Sheet>
      )}
    </div>
  );
}
