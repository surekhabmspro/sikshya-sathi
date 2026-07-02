import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookOpen, CalendarDays, CheckCircle2, ClipboardList, ChevronLeft,
  Sparkles, FileText, Users, MessageSquare, PenSquare, Layers, Clock,
  X, Home, NotebookPen, Search, Image as ImageIcon, Video, Music,
  FileSpreadsheet, Presentation, Tag, Eye, HelpCircle, CheckSquare,
  Square, Printer, Shuffle, Bot, Send, Lock, ListChecks, Plus, Smile,
  Meh, Frown, Heart, Gamepad2, FolderKanban, Map as MapIcon, Wand2,
  Brain, Copy, ChevronRight, LogOut, User, AlertCircle, Loader,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as db from "./db";

const ACCENT = "#1F4D3D";
const MARIGOLD = "#D98E2B";
const PAPER = "#FBF7EE";
const INK = "#2A2723";

const FILE_TYPE_META = {
  pdf:   { icon: FileText,        color: "#A23C2A" },
  pptx:  { icon: Presentation,    color: "#D98E2B" },
  doc:   { icon: FileText,        color: "#2C5F9E" },
  image: { icon: ImageIcon,       color: "#9A5B12" },
  video: { icon: Video,           color: "#6B3FA0" },
  audio: { icon: Music,           color: "#1F4D3D" },
  sheet: { icon: FileSpreadsheet, color: "#1B7A4A" },
};

const MOOD_META = {
  good: { icon: Smile, color: ACCENT,    label: "राम्रो गयो"   },
  okay: { icon: Meh,   color: "#9A5B12", label: "ठीकै थियो"   },
  hard: { icon: Frown, color: "#A23C2A", label: "गाह्रो थियो" },
};

function Card({ children, onClick, style }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", border: "1px solid #ECE6D8", borderRadius: 16, padding: 18, cursor: onClick ? "pointer" : "default", transition: "box-shadow .15s", ...style }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = "0 6px 20px rgba(31,77,61,0.08)"; }}
      onMouseLeave={(e) => { if (onClick) e.currentTarget.style.boxShadow = "none"; }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8A8275", marginBottom: 10, fontWeight: 600 }}>{children}</div>;
}

function StatusPill({ status }) {
  const map = {
    ready:   { label: "तयार",         bg: "#E4EFE6", color: ACCENT    },
    prep:    { label: "तयारी चाहिने", bg: "#FBEBD3", color: "#9A5B12" },
    missing: { label: "सुरु नभएको",  bg: "#F6E1DC", color: "#A23C2A" },
  };
  const s = map[status] || map.prep;
  return <span style={{ background: s.bg, color: s.color, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>{s.label}</span>;
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
      <Loader size={28} color={ACCENT} style={{ animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ErrorMsg({ msg }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F6E1DC", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#A23C2A", margin: "10px 0" }}><AlertCircle size={16} />{msg}</div>;
}

function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handle = async () => {
    setError(""); setSuccess(""); setLoading(true);
    const fn = mode === "login" ? db.signIn : db.signUp;
    const { data, error: err } = await fn(email, password);
    setLoading(false);
    if (err) { setError(err.message); return; }
    if (mode === "signup") {
      setSuccess("खाता बनाइयो! आफ्नो इमेल जाँच गर्नुहोस् र लिङ्क थिचेर प्रमाणित गर्नुहोस्।");
      setMode("login");
    } else { onLogin(data.session); }
  };

  return (
    <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: ACCENT, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, margin: "0 auto 12px" }}>सि</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: INK }}>शिक्षा साथी</div>
          <div style={{ fontSize: 14, color: "#8A8275", marginTop: 4 }}>कक्षा ५ · सामाजिक अध्ययन</div>
        </div>
        <Card>
          <div style={{ fontSize: 17, fontWeight: 700, color: INK, marginBottom: 16 }}>{mode === "login" ? "लगइन गर्नुहोस्" : "नयाँ खाता बनाउनुहोस्"}</div>
          {error && <ErrorMsg msg={error} />}
          {success && <div style={{ background: "#E4EFE6", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: ACCENT, marginBottom: 10 }}>{success}</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="email" placeholder="इमेल ठेगाना" value={email} onChange={(e) => setEmail(e.target.value)} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "12px 14px", fontSize: 15, fontFamily: "Inter, sans-serif", outline: "none" }} />
            <input type="password" placeholder="पासवर्ड" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handle()} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "12px 14px", fontSize: 15, fontFamily: "Inter, sans-serif", outline: "none" }} />
            <button onClick={handle} disabled={loading} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "प्रतीक्षा गर्नुहोस्..." : mode === "login" ? "लगइन" : "खाता बनाउनुहोस्"}
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 13.5, color: "#8A8275" }}>
            {mode === "login" ? (<>खाता छैन?{" "}<span onClick={() => setMode("signup")} style={{ color: ACCENT, fontWeight: 700, cursor: "pointer" }}>नयाँ बनाउनुहोस्</span></>) : (<>पहिले नै खाता छ?{" "}<span onClick={() => setMode("login")} style={{ color: ACCENT, fontWeight: 700, cursor: "pointer" }}>लगइन गर्नुहोस्</span></>)}
          </div>
        </Card>
      </div>
    </div>
  );
}function SectionSelector({ sections, current, onChange, onAdd }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const { data, error } = await db.createSection(name.trim());
    setLoading(false);
    if (!error) { onAdd(data); setName(""); setAdding(false); }
  };

  return (
    <div style={{ padding: "12px 20px", background: "#fff", borderBottom: "1px solid #ECE6D8" }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", alignItems: "center" }}>
        {sections.map((s) => (
          <button key={s.id} onClick={() => onChange(s)} style={{ padding: "6px 14px", borderRadius: 999, border: "none", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", cursor: "pointer", background: current?.id === s.id ? ACCENT : "#F4EFE3", color: current?.id === s.id ? "#fff" : "#7A6F3E" }}>{s.name}</button>
        ))}
        {adding ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="जस्तै: कक्षा ५ क" style={{ border: "1px solid #ECE6D8", borderRadius: 8, padding: "6px 10px", fontSize: 13, width: 130, fontFamily: "Inter, sans-serif" }} />
            <button onClick={save} disabled={loading} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{loading ? "..." : "थप"}</button>
            <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}><X size={16} /></button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 999, border: "1px dashed #C7BFAE", background: "none", color: "#8A8275", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
            <Plus size={14} /> सेक्सन थप
          </button>
        )}
      </div>
    </div>
  );
}

function LessonMode({ lesson, onClose }) {
  const [tab, setTab] = useState("sequence");
  const tabs = [
    { id: "sequence",   label: "पढाउने",          icon: ClipboardList },
    { id: "questions",  label: "मुख्य प्रश्नहरू", icon: MessageSquare },
    { id: "activities", label: "क्रियाकलाप",       icon: Users         },
    { id: "homework",   label: "गृहकार्य",          icon: PenSquare     },
    { id: "rubric",     label: "मूल्याङ्कन",        icon: Layers        },
  ];
  const objectives   = lesson.objectives    || [];
  const vocabulary   = lesson.vocabulary    || [];
  const sequence     = lesson.sequence      || [];
  const keyQuestions = lesson.key_questions || [];
  const activities   = lesson.activities    || [];
  const rubric       = lesson.rubric        || [];

  return (
    <div style={{ position: "fixed", inset: 0, background: PAPER, zIndex: 50, display: "flex", flexDirection: "column" }}>
      <div style={{ background: ACCENT, color: "#fff", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 10, padding: 10, display: "flex", cursor: "pointer" }}><ChevronLeft size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 500 }}>{lesson.chapters?.title || ""}</div>
          <div style={{ fontSize: 19, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title}</div>
        </div>
        <Sparkles size={20} style={{ opacity: 0.8, flexShrink: 0 }} />
      </div>
      <div style={{ padding: "14px 20px 8px", background: "#fff", borderBottom: "1px solid #ECE6D8" }}>
        <div style={{ fontSize: 13, color: "#6B6557", marginBottom: 6, fontWeight: 600 }}>आजको उद्देश्य</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, color: INK, lineHeight: 1.6 }}>
          {objectives.map((o, i) => <li key={i}>{o}</li>)}
        </ul>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {vocabulary.map((v) => <span key={v} style={{ background: "#F4EFE3", color: "#7A6F3E", fontSize: 12.5, fontWeight: 600, padding: "4px 10px", borderRadius: 8 }}>{v}</span>)}
        </div>
      </div>
      <div style={{ display: "flex", overflowX: "auto", background: "#fff", borderBottom: "1px solid #ECE6D8", padding: "0 8px" }}>
        {tabs.map((t) => {
          const Icon = t.icon; const active = tab === t.id;
          return <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "13px 14px", border: "none", background: "none", borderBottom: active ? `3px solid ${ACCENT}` : "3px solid transparent", color: active ? ACCENT : "#8A8275", fontWeight: 600, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap" }}><Icon size={16} />{t.label}</button>;
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20, maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {tab === "sequence" && (
          <div>
            <SectionLabel>पढाउने क्रम</SectionLabel>
            <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
              {sequence.map((s, i) => (
                <li key={i} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: i < sequence.length - 1 ? "1px solid #ECE6D8" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#E4EFE6", color: ACCENT, fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: 15, color: INK, lineHeight: 1.5, paddingTop: 3 }}>{s}</div>
                </li>
              ))}
            </ol>
            {lesson.notes && <div style={{ marginTop: 18, background: "#FBEBD3", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: "#9A5B12", marginBottom: 4 }}>आफ्नो लागि टिप्पणी</div><div style={{ fontSize: 14, color: "#5E4622" }}>{lesson.notes}</div></div>}
          </div>
        )}
        {tab === "questions" && <div><SectionLabel>कक्षामा सोध्नुहोस्</SectionLabel><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{keyQuestions.map((q, i) => <Card key={i}><div style={{ fontSize: 15.5, color: INK }}>{q}</div></Card>)}</div></div>}
        {tab === "activities" && <div><SectionLabel>क्रियाकलापहरू</SectionLabel><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{activities.map((a, i) => <Card key={i}><div style={{ fontSize: 15.5, color: INK }}>{a}</div></Card>)}</div></div>}
        {tab === "homework" && <div><SectionLabel>दिने गृहकार्य</SectionLabel><Card><div style={{ fontSize: 15.5, color: INK, lineHeight: 1.6 }}>{lesson.homework || "गृहकार्य थपिएको छैन।"}</div></Card></div>}
        {tab === "rubric" && <div><SectionLabel>मूल्याङ्कन मापदण्ड</SectionLabel>{rubric.length === 0 ? <div style={{ color: "#8A8275", fontSize: 14 }}>मूल्याङ्कन मापदण्ड थपिएको छैन।</div> : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{rubric.map((r, i) => <Card key={i}><div style={{ fontWeight: 700, color: ACCENT, fontSize: 14, marginBottom: 4 }}>{r.level}</div><div style={{ fontSize: 14.5, color: INK }}>{r.desc}</div></Card>)}</div>}</div>}
      </div>
    </div>
  );
}

function Dashboard({ onOpenLesson, onGoPlanner, onGoHomework, section, lessons, homework, loading }) {
  const today = lessons.find((l) => l.status === "ready") || lessons[0];
  const pending = lessons.filter((l) => l.status !== "ready").slice(0, 3);
  const hwPending = homework.filter((h) => h.checked_count < h.total_students).slice(0, 3);
  if (loading) return <Spinner />;
  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      {today ? (
        <div style={{ background: `linear-gradient(135deg, ${ACCENT}, #143329)`, borderRadius: 20, padding: 24, color: "#fff", marginBottom: 24 }}>
          <div style={{ fontSize: 13, opacity: 0.8, fontWeight: 600 }}>{today.chapters?.title || ""}</div>
          <div style={{ fontSize: 26, fontWeight: 700, margin: "6px 0 4px" }}>{today.title}</div>
          <button onClick={() => onOpenLesson(today)} style={{ background: MARIGOLD, color: "#2A1E07", border: "none", borderRadius: 14, padding: "14px 22px", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 14 }}>
            <Sparkles size={19} /> आजको पाठ सुरु गर्नुहोस्
          </button>
        </div>
      ) : (
        <Card style={{ marginBottom: 24, textAlign: "center", padding: 32 }}>
          <div style={{ color: "#8A8275", fontSize: 15 }}>{section ? `${section.name} का लागि कुनै पाठ थपिएको छैन।` : "पहिले एउटा सेक्सन छान्नुहोस्।"}</div>
          <button onClick={onGoPlanner} style={{ marginTop: 14, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer" }}>+ पाठ थप्नुहोस्</button>
        </Card>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 28 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><ClipboardList size={18} color={ACCENT} /><div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>तयारी चाहिने</div></div>
          {pending.length === 0 ? <div style={{ fontSize: 13.5, color: "#8A8275" }}>सबै पाठ तयार छ! ✓</div> : pending.map((l) => (
            <div key={l.id} onClick={onGoPlanner} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid #F3EFE3", cursor: "pointer" }}>
              <div><div style={{ fontSize: 14, color: INK, fontWeight: 600 }}>{l.title}</div><div style={{ fontSize: 12.5, color: "#8A8275" }}>{l.chapters?.title || ""}</div></div>
              <StatusPill status={l.status} />
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><CheckCircle2 size={18} color={ACCENT} /><div style={{ fontWeight: 700, color: INK, fontSize: 15 }}>जाँच्नुपर्ने गृहकार्य</div></div>
          {hwPending.length === 0 ? <div style={{ fontSize: 13.5, color: "#8A8275" }}>सबै गृहकार्य जाँच भयो! ✓</div> : hwPending.map((h) => (
            <div key={h.id} onClick={onGoHomework} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderTop: "1px solid #F3EFE3", cursor: "pointer" }}>
              <div style={{ fontSize: 14, color: INK }}>{h.title}</div>
              <div style={{ fontSize: 13, color: "#8A8275", fontWeight: 600 }}>{h.checked_count}/{h.total_students}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );function Planner({ onOpenLesson, section, lessons, loading, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", status: "missing", chapter_title: "", objectives: "", vocabulary: "", sequence: "", key_questions: "", activities: "", homework: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!form.title.trim()) { setError("पाठको नाम आवश्यक छ।"); return; }
    setSaving(true); setError("");
    const payload = { ...form, section_id: section?.id || null, objectives: form.objectives.split("\n").filter(Boolean), vocabulary: form.vocabulary.split(",").map((v) => v.trim()).filter(Boolean), sequence: form.sequence.split("\n").filter(Boolean), key_questions: form.key_questions.split("\n").filter(Boolean), activities: form.activities.split("\n").filter(Boolean) };
    const { error: err } = await db.upsertLesson(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowForm(false);
    setForm({ title: "", status: "missing", chapter_title: "", objectives: "", vocabulary: "", sequence: "", key_questions: "", activities: "", homework: "", notes: "" });
    onRefresh();
  };

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK }}>पाठ योजना</div>
        <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}><Plus size={15} />नयाँ पाठ</button>
      </div>
      {!section && <div style={{ color: "#8A8275", fontSize: 14, marginBottom: 16 }}>माथिबाट एउटा सेक्सन छान्नुहोस्।</div>}
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>नयाँ पाठ थप्नुहोस्</div>
          {error && <ErrorMsg msg={error} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["title","पाठको नाम *"],["chapter_title","अध्याय"],["homework","गृहकार्य"],["notes","आफ्नो नोट"]].map(([field, placeholder]) => (
              <input key={field} placeholder={placeholder} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif" }} />
            ))}
            {[["objectives","उद्देश्यहरू (प्रत्येक नयाँ लाइनमा)"],["vocabulary","शब्दावली (कमाले छुट्याउनुहोस्)"],["sequence","पढाउने क्रम (प्रत्येक नयाँ लाइनमा)"],["key_questions","मुख्य प्रश्नहरू (प्रत्येक नयाँ लाइनमा)"],["activities","क्रियाकलापहरू (प्रत्येक नयाँ लाइनमा)"]].map(([field, placeholder]) => (
              <textarea key={field} placeholder={placeholder} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} rows={3} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              {["missing","prep","ready"].map((s) => (
                <button key={s} onClick={() => setForm({ ...form, status: s })} style={{ flex: 1, padding: "9px", borderRadius: 10, border: `2px solid ${form.status === s ? ACCENT : "#ECE6D8"}`, background: form.status === s ? "#E4EFE6" : "#fff", color: form.status === s ? ACCENT : "#6B6557", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}><StatusPill status={s} /></button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #ECE6D8", background: "#fff", color: "#6B6557", fontWeight: 600, cursor: "pointer" }}>रद्द</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{saving ? "सुरक्षित गर्दै..." : "सुरक्षित गर्नुहोस्"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading ? <Spinner /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lessons.length === 0 ? <div style={{ textAlign: "center", color: "#8A8275", padding: 40 }}>कुनै पाठ छैन — माथिको बटनबाट थप्नुहोस्।</div>
            : lessons.map((l) => (
              <Card key={l.id} onClick={() => onOpenLesson(l)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12.5, color: "#8A8275", fontWeight: 600, marginBottom: 3 }}>{l.chapters?.title || l.chapter_title || ""}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{l.title}</div>
                  </div>
                  <StatusPill status={l.status} />
                </div>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

function Materials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.getMaterials();
    setMaterials(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const ext = file.name.split(".").pop().toLowerCase();
    const typeMap = { pdf:"pdf",pptx:"pptx",ppt:"pptx",doc:"doc",docx:"doc",xlsx:"sheet",xls:"sheet",jpg:"image",jpeg:"image",png:"image",mp4:"video",mp3:"audio" };
    const fileType = typeMap[ext] || "doc";
    const { path, error: upErr } = await db.uploadMaterialFile(file, user.id);
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    await db.insertMaterial({ name: file.name, storage_path: path, file_type: fileType, size_bytes: file.size, tags: [] });
    setUploading(false); load();
  };

  const openPreview = async (mat) => {
    setPreview(mat); setPreviewUrl("");
    const url = await db.getMaterialUrl(mat.storage_path);
    setPreviewUrl(url || "");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) => m.name.toLowerCase().includes(q) || (m.tags || []).some((t) => t.toLowerCase().includes(q)));
  }, [materials, query]);

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK }}>सामग्री पुस्तकालय</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={15} />{uploading ? "अपलोड गर्दै..." : "फाइल थप्नुहोस्"}
          <input type="file" onChange={upload} style={{ display: "none" }} accept=".pdf,.pptx,.ppt,.doc,.docx,.xlsx,.jpg,.jpeg,.png,.mp4,.mp3" />
        </label>
      </div>
      {error && <ErrorMsg msg={error} />}
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #ECE6D8", borderRadius: 14, padding: "12px 16px", marginBottom: 18, marginTop: 14 }}>
        <Search size={18} color="#A39B8B" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="फाइल खोज्नुहोस्..." style={{ border: "none", outline: "none", fontSize: 15, flex: 1, background: "transparent", fontFamily: "Inter, sans-serif" }} />
      </div>
      {loading ? <Spinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#8A8275", padding: 40, fontSize: 14.5 }}>{query ? `"${query}" फेला परेन।` : "कुनै सामग्री छैन — माथिबाट अपलोड गर्नुहोस्।"}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {filtered.map((f) => {
            const meta = FILE_TYPE_META[f.file_type] || FILE_TYPE_META.doc;
            const Icon = meta.icon;
            return (
              <Card key={f.id} onClick={() => openPreview(f)} style={{ padding: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.color + "1A", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}><Icon size={20} color={meta.color} /></div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{f.name}</div>
                <div style={{ fontSize: 11.5, color: "#8A8275" }}>{f.file_type?.toUpperCase()}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: ACCENT, fontWeight: 700, marginTop: 8 }}><Eye size={13} />पूर्वावलोकन</div>
              </Card>
            );
          })}
        </div>
      )}
      {preview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,18,14,0.55)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, padding: 24, maxWidth: 440, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{preview.name}</div>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}><X size={20} /></button>
            </div>
            {previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" style={{ display: "block", background: ACCENT, color: "#fff", borderRadius: 12, padding: "13px", fontWeight: 700, fontSize: 15, textAlign: "center", textDecoration: "none" }}>फाइल खोल्नुहोस् / डाउनलोड</a>
              : <div style={{ textAlign: "center", padding: 20, color: "#8A8275" }}>लिङ्क तयार गर्दै...</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function HomeworkManager({ section, loading, homework, onRefresh }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", total_students: 30, remark: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await db.upsertHomework({ ...form, section_id: section?.id || null, checked_count: 0 });
    setSaving(false); setShowForm(false);
    setForm({ title: "", total_students: 30, remark: "" });
    onRefresh();
  };

  const bump = async (hw, delta) => {
    const newCount = Math.max(0, Math.min(hw.total_students, hw.checked_count + delta));
    await db.upsertHomework({ ...hw, checked_count: newCount });
    onRefresh();
  };

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK }}>गृहकार्य व्यवस्थापक</div>
        <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}><Plus size={15} />नयाँ</button>
      </div>
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>नयाँ गृहकार्य</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="गृहकार्यको शीर्षक" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif" }} />
            <input type="number" placeholder="कुल विद्यार्थी" value={form.total_students} onChange={(e) => setForm({ ...form, total_students: parseInt(e.target.value) || 0 })} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif" }} />
            <textarea placeholder="टिप्पणी" value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} rows={2} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #ECE6D8", background: "#fff", color: "#6B6557", fontWeight: 600, cursor: "pointer" }}>रद्द</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{saving ? "..." : "सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading ? <Spinner /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {homework.length === 0 ? <div style={{ textAlign: "center", color: "#8A8275", padding: 40 }}>कुनै गृहकार्य छैन।</div>
            : homework.map((h) => {
              const pct = h.total_students > 0 ? Math.round((h.checked_count / h.total_students) * 100) : 0;
              const done = h.checked_count >= h.total_students;
              return (
                <Card key={h.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 700, color: INK }}>{h.title}</div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: done ? ACCENT : "#9A5B12", background: done ? "#E4EFE6" : "#FBEBD3", padding: "4px 10px", borderRadius: 999 }}>{h.checked_count}/{h.total_students}</span>
                  </div>
                  <div style={{ height: 7, background: "#F0EBDD", borderRadius: 99, marginBottom: 12 }}>
                    <div style={{ height: 7, width: `${pct}%`, background: done ? ACCENT : MARIGOLD, borderRadius: 99 }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => bump(h, -1)} style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #ECE6D8", background: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>−</button>
                    <div style={{ fontSize: 13, color: "#6B6557", fontWeight: 600, flex: 1 }}>थप विद्यार्थी जाँच गर्नुहोस्</div>
                    <button onClick={() => bump(h, 1)} style={{ width: 34, height: 34, borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer" }}>+</button>
                  </div>
                  {h.remark && <div style={{ marginTop: 10, background: "#FAF7EE", borderRadius: 10, padding: "9px 12px", fontSize: 13.5, color: "#6B6557" }}>{h.remark}</div>}
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}

function TeachingJournal() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ lesson_title: "", taught: "", difficulty: "", idea: "", mood: "good" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await db.getJournalEntries();
    setEntries(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.lesson_title.trim()) return;
    setSaving(true);
    await db.upsertJournalEntry({ taught: form.taught, difficulty: form.difficulty, idea: form.idea, mood: form.mood });
    setSaving(false); setShowForm(false);
    setForm({ lesson_title: "", taught: "", difficulty: "", idea: "", mood: "good" });
    load();
  };

  return (
    <div style={{ padding: "20px 20px 100px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: 8 }}><Heart size={22} color={ACCENT} />शिक्षण डायरी</div>
        {!showForm && <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: ACCENT, color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}><Plus size={15} />थप्नुहोस्</button>}
      </div>
      <div style={{ fontSize: 14, color: "#8A8275", marginBottom: 18 }}>दैनिक प्रतिबिम्बन — के राम्रो भयो, के गाह्रो भयो।</div>
      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="आजको पाठ" value={form.lesson_title} onChange={(e) => setForm({ ...form, lesson_title: e.target.value })} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif" }} />
            <textarea placeholder="के पढाइयो?" value={form.taught} onChange={(e) => setForm({ ...form, taught: e.target.value })} rows={2} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
            <textarea placeholder="के गाह्रो भयो?" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })} rows={2} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
            <textarea placeholder="अर्को पटकका लागि सुधारको विचार" value={form.idea} onChange={(e) => setForm({ ...form, idea: e.target.value })} rows={2} style={{ border: "1px solid #ECE6D8", borderRadius: 10, padding: "10px 12px", fontSize: 14, fontFamily: "Inter, sans-serif", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(MOOD_META).map(([key, m]) => {
                const Icon = m.icon;
                return <button key={key} onClick={() => setForm({ ...form, mood: key })} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 10, border: form.mood === key ? `2px solid ${m.color}` : "1px solid #ECE6D8", background: form.mood === key ? m.color + "15" : "#fff", color: m.color, fontSize: 12, fontWeight: 700, cursor: "pointer" }}><Icon size={14} />{m.label}</button>;
              })}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #ECE6D8", background: "#fff", fontWeight: 600, cursor: "pointer" }}>रद्द</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, cursor: "pointer" }}>{saving ? "..." : "सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading ? <Spinner /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {entries.length === 0 ? <div style={{ textAlign: "center", color: "#8A8275", padding: 40 }}>कुनै डायरी प्रविष्टि छैन।</div>
            : entries.map((e) => {
              const mood = MOOD_META[e.mood] || MOOD_META.okay;
              const MoodIcon = mood.icon;
              return (
                <Card key={e.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{e.lessons?.title || e.entry_date}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, background: mood.color + "15", color: mood.color, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}><MoodIcon size={13} />{mood.label}</div>
                  </div>
                  {e.taught && <div style={{ fontSize: 14, color: INK, marginBottom: 6 }}><strong>के पढाइयो:</strong> {e.taught}</div>}
                  {e.difficulty && <div style={{ fontSize: 14, color: "#6B6557", marginBottom: 6 }}><strong>गाह्रो:</strong> {e.difficulty}</div>}
                  {e.idea && <div style={{ background: "#F4EFE3", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, color: "#7A6F3E" }}>💡 {e.idea}</div>}
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}

function AIAssistant({ lessons }) {
  const [messages, setMessages] = useState([{ role: "ai", text: "नमस्ते! म तपाईंको पाठ योजनाबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस् वा आफ्नै प्रश्न टाइप गर्नुहोस्। पूर्णतया निःशुल्क।" }]);
  const [input, setInput] = useState("");

  const QUICK = ["आजको पाठ बुझाउनुहोस्","उद्देश्यहरू के के छन्?","क्रियाकलाप सुझाव दिनुहोस्","मुख्य प्रश्नहरू के के छन्?","गृहकार्य के दिने?","शब्दावली सूची देखाउनुहोस्","पढाउने क्रम बताउनुहोस्","मूल्याङ्कन कसरी गर्ने?"];

  const getReply = (text) => {
    const lesson = lessons[0];
    const t = text.toLowerCase();
    if (!lesson) return "अहिले कुनै पाठ योजना थपिएको छैन। पहिले 'योजना' ट्याबमा गई एउटा पाठ थप्नुहोस्।";
    const title = lesson.title || "";
    const chapter = lesson.chapters?.title || lesson.chapter_title || "";
    const objectives = lesson.objectives || [];
    const vocabulary = lesson.vocabulary || [];
    const sequence = lesson.sequence || [];
    const keyQuestions = lesson.key_questions || [];
    const activities = lesson.activities || [];
    const homework = lesson.homework || "";
    const notes = lesson.notes || "";
    const rubric = lesson.rubric || [];

    if (t.includes("आजको पाठ") || t.includes("बुझाउनुहोस्"))
      return `📚 आजको पाठ: ${title}\nअध्याय: ${chapter}\n\n` + (objectives.length ? `🎯 उद्देश्यहरू:\n${objectives.map((o,i)=>`${i+1}. ${o}`).join("\n")}\n\n` : "") + (vocabulary.length ? `📝 मुख्य शब्दावली: ${vocabulary.join(", ")}` : "");
    if (t.includes("उद्देश्य"))
      return objectives.length ? `🎯 उद्देश्यहरू:\n\n${objectives.map((o,i)=>`${i+1}. ${o}`).join("\n")}` : "उद्देश्यहरू थपिएका छैनन्।";
    if (t.includes("शब्दावली"))
      return vocabulary.length ? `📝 शब्दावलीहरू:\n\n${vocabulary.map((v,i)=>`${i+1}. ${v}`).join("\n")}` : "शब्दावली थपिएको छैन।";
    if (t.includes("क्रम") || t.includes("पढाउने"))
      return sequence.length ? `📋 पढाउने क्रम:\n\n${sequence.map((s,i)=>`${i+1}. ${s}`).join("\n")}` : "पढाउने क्रम थपिएको छैन।";
    if (t.includes("मुख्य प्रश्न") || t.includes("छलफल"))
      return keyQuestions.length ? `❓ मुख्य प्रश्नहरू:\n\n${keyQuestions.map((q,i)=>`${i+1}. ${q}`).join("\n")}` : "मुख्य प्रश्नहरू थपिएका छैनन्।";
    if (t.includes("मौखिक"))
      return [...keyQuestions,...vocabulary.map(v=>`"${v}" को अर्थ के हो?`)].length ? `🗣️ मौखिक प्रश्नहरू:\n\n${[...keyQuestions,...vocabulary.map(v=>`"${v}" को अर्थ के हो?`)].map((q,i)=>`${i+1}. ${q}`).join("\n")}` : "प्रश्नहरू थपिएका छैनन्।";
    if (t.includes("क्रियाकलाप"))
      return activities.length ? `🎮 क्रियाकलापहरू:\n\n${activities.map((a,i)=>`${i+1}. ${a}`).join("\n")}` : "क्रियाकलापहरू थपिएका छैनन्।";
    if (t.includes("गृहकार्य"))
      return homework ? `📖 गृहकार्य:\n\n${homework}` : "गृहकार्य थपिएको छैन।";
    if (t.includes("मूल्याङ्कन"))
      return rubric.length ? `📊 मूल्याङ्कन मापदण्ड:\n\n${rubric.map(r=>`• ${r.level}: ${r.desc}`).join("\n")}` : "मूल्याङ्कन मापदण्ड थपिएको छैन।";
    return `"${title}" पाठबारे:\n• उद्देश्य: ${objectives.length} वटा\n• शब्दावली: ${vocabulary.length} वटा\n• पढाउने चरण: ${sequence.length} वटा\n• प्रश्न: ${keyQuestions.length} वटा\n• क्रियाकलाप: ${activities.length} वटा\n• गृहकार्य: ${homework ? "छ" : "छैन"}\n\nमाथिका छिटो प्रश्नहरू थिचेर थप जानकारी पाउनुहोस्।`;
  };

  const send = (text) => {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => [...prev, { role: "user", text: t }, { role: "ai", text: getReply(t) }]);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxWidth: 720, margin: "0 auto", width: "100%" }}>
      <div style={{ padding: "16px 20px 8px" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: INK, display: "flex", alignItems: "center", gap: 8 }}><Bot size={22} color={ACCENT} />एआई शिक्षण सहायक</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#8A8275", marginTop: 4 }}><Lock size={12} />केवल तपाईंको पाठ योजनाबाट — निःशुल्क</div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div style={{ maxWidth: "85%", background: m.role === "user" ? ACCENT : "#fff", color: m.role === "user" ? "#fff" : INK, border: m.role === "ai" ? "1px solid #ECE6D8" : "none", borderRadius: 16, padding: "12px 16px", fontSize: 14.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 20px", display: "flex", gap: 8, overflowX: "auto" }}>
        {QUICK.map((q) => <button key={q} onClick={() => send(q)} style={{ flexShrink: 0, background: "#F4EFE3", color: "#7A6F3E", border: "none", borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" }}>{q}</button>)}
      </div>
      <div style={{ display: "flex", gap: 10, padding: "10px 20px 20px" }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="आफ्नो प्रश्न लेख्नुहोस्..." style={{ flex: 1, border: "1px solid #ECE6D8", borderRadius: 999, padding: "13px 18px", fontSize: 14.5, outline: "none", fontFamily: "Inter, sans-serif" }} />
        <button onClick={() => send(input)} style={{ background: ACCENT, color: "#fff", border: "none", borderRadius: "50%", width: 46, height: 46, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Send size={18} /></button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("dashboard");
  const [activeLesson, setActiveLesson] = useState(null);
  const [showMore, setShowMore] = useState(false);
  const [sections, setSections] = useState([]);
  const [currentSection, setCurrentSection] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [homework, setHomework] = useState([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [hwLoading, setHwLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    db.getSections().then(({ data }) => { if (data?.length) { setSections(data); setCurrentSection(data[0]); } });
  }, [session]);

  const loadLessons = useCallback(async () => {
    setLessonsLoading(true);
    const { data } = await db.getLessons(currentSection?.id || null);
    setLessons(data || []);
    setLessonsLoading(false);
  }, [currentSection]);

  const loadHomework = useCallback(async () => {
    setHwLoading(true);
    const { data } = await db.getHomework(currentSection?.id || null);
    setHomework(data || []);
    setHwLoading(false);
  }, [currentSection]);

  useEffect(() => { if (session) { loadLessons(); loadHomework(); } }, [session, loadLessons, loadHomework]);

  const nav = [
    { id: "dashboard", label: "आज",     icon: Home         },
    { id: "ai",        label: "एआई",    icon: Bot          },
    { id: "planner",   label: "योजना",  icon: CalendarDays },
    { id: "materials", label: "सामग्री", icon: BookOpen     },
  ];
  const navMore = [
    { id: "homework",   label: "गृहकार्य",   icon: ListChecks  },
    { id: "journal",    label: "डायरी",      icon: Heart       },
    { id: "questions",  label: "प्रश्न बैंक", icon: HelpCircle  },
    { id: "assessment", label: "मूल्याङ्कन",  icon: NotebookPen },
  ];
  const allNav = [...nav, ...navMore];
  const [showMoreState] = useState(false);

  if (authLoading) return <div style={{ minHeight: "100vh", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div>;
  if (!session) return <LoginScreen onLogin={setSession} />;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: PAPER, minHeight: "100vh", color: INK }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ background: "#fff", borderBottom: "1px solid #ECE6D8", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10, position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: ACCENT, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>सि</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>शिक्षा साथी</div>
          <div style={{ fontSize: 11.5, color: "#8A8275" }}>कक्षा ५ · सामाजिक अध्ययन</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: ACCENT, fontWeight: 600 }}><Clock size={13} />सिंक भएको</div>
          <button onClick={() => db.signOut()} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }} title="लगआउट"><LogOut size={18} /></button>
        </div>
      </div>

      <SectionSelector sections={sections} current={currentSection} onChange={(s) => setCurrentSection(s)} onAdd={(s) => { setSections((prev) => [...prev, s]); setCurrentSection(s); }} />

      <div style={{ flex: 1 }}>
        {screen === "dashboard"  && <Dashboard onOpenLesson={setActiveLesson} onGoPlanner={() => setScreen("planner")} onGoHomework={() => setScreen("homework")} section={currentSection} lessons={lessons} homework={homework} loading={lessonsLoading} />}
        {screen === "planner"    && <Planner onOpenLesson={setActiveLesson} section={currentSection} lessons={lessons} loading={lessonsLoading} onRefresh={loadLessons} />}
        {screen === "materials"  && <Materials />}
        {screen === "ai"         && <AIAssistant lessons={lessons} />}
        {screen === "homework"   && <HomeworkManager section={currentSection} loading={hwLoading} homework={homework} onRefresh={loadHomework} />}
        {screen === "journal"    && <TeachingJournal />}
        {screen === "questions"  && <div style={{ padding: 40, textAlign: "center", color: "#8A8275" }}>प्रश्न बैंक — छिट्टै आउँदैछ।</div>}
        {screen === "assessment" && <div style={{ padding: 40, textAlign: "center", color: "#8A8275" }}>मूल्याङ्कन निर्माता — छिट्टै आउँदैछ।</div>}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #ECE6D8", display: "flex", justifyContent: "space-around", padding: "8px 0", zIndex: 10 }}>
        {nav.map((n) => {
          const Icon = n.icon; const active = screen === n.id;
          return <button key={n.id} onClick={() => setScreen(n.id)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: active ? ACCENT : "#A39B8B", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 8px" }}><Icon size={20} />{n.label}</button>;
        })}
        <button onClick={() => setShowMore(true)} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: navMore.some((n) => n.id === screen) ? ACCENT : "#A39B8B", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "4px 8px" }}><Layers size={20} />थप</button>
      </div>

      {showMore && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,18,14,0.55)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setShowMore(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", padding: 20, maxWidth: 480, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>थप विशेषताहरू</div>
              <button onClick={() => setShowMore(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#8A8275" }}><X size={20} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {navMore.map((n) => {
                const Icon = n.icon;
                return <button key={n.id} onClick={() => { setScreen(n.id); setShowMore(false); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 10px", borderRadius: 14, border: "1px solid #ECE6D8", background: screen === n.id ? "#E4EFE6" : "#fff", color: screen === n.id ? ACCENT : INK, cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}><Icon size={22} />{n.label}</button>;
              })}
            </div>
          </div>
        </div>
      )}

      {activeLesson && <LessonMode lesson={activeLesson} onClose={() => setActiveLesson(null)} />}
    </div>
  );
            }
                               }
