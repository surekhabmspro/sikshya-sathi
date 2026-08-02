import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BookOpen, CalendarDays, CheckCircle2, ClipboardList, ChevronLeft,
  Sparkles, FileText, Users, MessageSquare, PenSquare, Layers, Clock,
  X, Home, NotebookPen, Search, Image as ImageIcon, Video, Music,
  FileSpreadsheet, Presentation, Tag, Eye, EyeOff, HelpCircle, CheckSquare,
  Square, Printer, Shuffle, Bot, Send, Lock, ListChecks, Plus, Smile,
  Meh, Frown, Heart, Gamepad2, FolderKanban, Map as MapIcon, Wand2,
  Brain, Copy, ChevronRight, LogOut, User, AlertCircle, Loader,
  Settings as SettingsIcon, Trash2, RefreshCw, BookMarked, Zap,
  Sun, Moon, Lightbulb, Paperclip, ChevronDown, Pin, RotateCw,
  GraduationCap, PartyPopper, Bell, Palmtree, Megaphone,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as db from "./db";
import * as gemini from "./gemini";
import { extractTextFromFile } from "./lib/extract";

// NEW — every color below is a CSS custom property, not a hardcoded hex.
// That's what makes dark/light mode possible without rewriting every
// component: the actual color values are defined once in the global
// stylesheet (see the :root / [data-theme="dark"] blocks in App()), and
// switching the data-theme attribute on the page instantly re-points every
// one of these to the right value — no re-render logic needed anywhere else.
const ACCENT = "var(--accent)";
const ACCENT_DARK = "var(--accent-dark)";
const ACCENT_LIGHT = "var(--accent-light)";
const MARIGOLD = "var(--marigold)";
const MARIGOLD_DARK = "var(--marigold-dark)";
const TEAL = "var(--teal)";
const TEAL_LIGHT = "var(--teal-light)";
const VIOLET = "var(--violet)";
const VIOLET_LIGHT = "var(--violet-light)";
const BLUE = "var(--blue)";
const BLUE_LIGHT = "var(--blue-light)";
const ROSE = "var(--rose)";
const ROSE_LIGHT = "var(--rose-light)";
const PAPER = "var(--bg)";
const SURFACE = "var(--surface)";
const SURFACE_2 = "var(--surface-2)";
const INK = "var(--ink)";
const INK_SOFT = "var(--ink-soft)";
const BORDER = "var(--border)";
const DANGER = "var(--danger)";
const DANGER_BG = "var(--danger-bg)";
const WARN = "var(--warn)";
const WARN_BG = "var(--warn-bg)";

// NEW — a shared rotating palette (used via PALETTE[i % PALETTE.length]) for
// lists that don't have a natural status/category color of their own —
// activity types, assessment types, journal entries, search results — so
// those screens get the same colorful, distinguishable-at-a-glance look as
// the ones that already have semantic colors (status, file category, etc).
const PALETTE = [ACCENT, MARIGOLD_DARK, TEAL, VIOLET, ROSE, BLUE];

// Elevation scale — used for the "premium, elevated" card/button look.
const SHADOW = {
  sm: "0 1px 2px rgba(var(--shadow-rgb),0.06), 0 1px 1px rgba(var(--shadow-rgb),0.04)",
  md: "0 4px 14px rgba(var(--shadow-rgb),0.10), 0 1px 3px rgba(var(--shadow-rgb),0.08)",
  lg: "0 12px 28px rgba(var(--shadow-rgb),0.18), 0 4px 10px rgba(var(--shadow-rgb),0.10)",
  // "raised" = the 3D/live card look: a bright 1px sheen along the top inner
  // edge (like light catching a slightly domed surface) plus a soft two-layer
  // drop shadow underneath. Used on every Card/StatCard so tiles read as
  // physical, tappable objects instead of flat rectangles.
  raised: "inset 0 1px 0 var(--card-sheen), 0 1px 2px rgba(var(--shadow-rgb),0.06), 0 8px 18px rgba(var(--shadow-rgb),0.13), 0 2px 5px rgba(var(--shadow-rgb),0.09)",
  raisedHover: "inset 0 1px 0 var(--card-sheen), 0 14px 30px rgba(var(--shadow-rgb),0.20), 0 4px 10px rgba(var(--shadow-rgb),0.12)",
  accent: "0 8px 20px color-mix(in srgb, var(--accent) 32%, transparent)",
  marigold: "0 8px 20px color-mix(in srgb, var(--marigold) 36%, transparent)",
};

// color+"1A" string-concat only works when color is a literal hex string; it
// silently produces invalid CSS (transparent) when color is one of the
// var(--x)-based constants above. tint() works for both.
const tint = (color, pct=14) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const FILE_TYPE_META = {
  pdf:   { icon: FileText,        color: "#A23C2A" },
  pptx:  { icon: Presentation,    color: "#D98E2B" },
  doc:   { icon: FileText,        color: "#2C5F9E" },
  image: { icon: ImageIcon,       color: "#9A5B12" },
  video: { icon: Video,           color: "#6B3FA0" },
  audio: { icon: Music,           color: "#7A2E4A" },
  sheet: { icon: FileSpreadsheet, color: "#1B7A4A" },
};

// NEW — material "purpose" categories, distinct from file_type (a lesson
// plan and a Q&A solution might both be .docx — this is what actually
// separates them in the Materials library).
const CATEGORY_META = {
  lesson_plan: { label: "पाठ योजना",        icon: ClipboardList, color: ACCENT },
  presentation:{ label: "प्रस्तुति",         icon: Presentation,  color: MARIGOLD_DARK },
  qa_solution: { label: "प्रश्नोत्तर समाधान", icon: HelpCircle,    color: VIOLET },
  exercise:    { label: "अभ्यास",            icon: PenSquare,     color: TEAL },
  assessment:  { label: "मूल्याङ्कन",         icon: Layers,        color: ROSE },
  other:       { label: "अन्य",              icon: FileText,      color: INK_SOFT },
};
const CATEGORY_ORDER = ["lesson_plan","presentation","qa_solution","exercise","assessment","other"];

// NEW — Phase 3: calendar event categories. Same pattern as CATEGORY_META
// above (Materials), so the calendar gets the same color-coding language
// the rest of the app already uses.
const EVENT_CATEGORY_META = {
  event:    { label: "विद्यालय कार्यक्रम", icon: PartyPopper,   color: TEAL },
  holiday:  { label: "बिदा",              icon: Palmtree,      color: MARIGOLD_DARK },
  exam:     { label: "परीक्षा",            icon: GraduationCap, color: ROSE },
  deadline: { label: "म्याद (गृहकार्य/काम)", icon: PenSquare,     color: VIOLET },
  training: { label: "तालिम/गोष्ठी",       icon: Megaphone,     color: "#2C5F9E" },
  reminder: { label: "सम्झना",            icon: Bell,          color: ACCENT },
};
const EVENT_CATEGORY_ORDER = ["event","holiday","exam","deadline","training","reminder"];

const MOOD_META = {
  good: { icon: Smile, color: ACCENT,    label: "राम्रो गयो"   },
  okay: { icon: Meh,   color: "#9A5B12", label: "ठीकै थियो"   },
  hard: { icon: Frown, color: "#A23C2A", label: "गाह्रो थियो" },
};

const getTextbookPDF = () => window.__textbookPDF__ || null;
const setTextbookPDF = (b64) => { window.__textbookPDF__ = b64; };

// NEW — the piece that actually connects Materials to every AI button.
// Your lessons/questions/activities forms use a typed chapter name
// (chapter_title), but Materials/Gemini need a real chapter_id (your
// database already has a proper `chapters` table). This helper resolves
// the typed name to that chapter's id, fetches every material tagged to
// it, and turns them into Gemini parts alongside the global textbook.
async function getMaterialContext(chapterTitle, classLabel = null) {
  if (!chapterTitle || !chapterTitle.trim()) {
    return { pdfBase64: getTextbookPDF(), materialParts: [], matchedCount: 0 };
  }
  const chapterId = await db.getChapterIdByTitle(chapterTitle.trim(), classLabel);
  if (!chapterId) return { pdfBase64: getTextbookPDF(), materialParts: [], matchedCount: 0 };
  const { data: materials } = await db.getMaterialsByChapter(chapterId);
  const materialParts = await gemini.buildMaterialParts(materials || [], db.downloadMaterialFile);
  return { pdfBase64: getTextbookPDF(), materialParts, matchedCount: (materials || []).length };
}

// FIX — the root cause of the "wrong/broken tagging" problem: every screen
// (Planner, Question Bank, Activities, Assessment) let a teacher pick a
// chapter from the ChapterPicker, but only ever saved the typed chapter
// NAME (chapter_title) onto the row — never the real chapter_id foreign
// key. Materials was the one screen that got this right (see
// getOrCreateChapterId in db.js). Because of that mismatch, the
// `chapters(title)` join used everywhere (getLessons/getQuestions/
// getActivities) always came back empty, so lesson cards, the chapter
// materials list, and AI context-matching all silently broke or
// under-matched. Every save() below now calls this first so chapter_id is
// always set correctly and consistently, the same way Materials already
// does it. Safe to call with an empty title (returns null, meaning
// "unassigned").
async function resolveChapterId(title, classLabel = null) {
  if (!title || !title.trim()) return null;
  try { return await db.getOrCreateChapterId(title.trim(), classLabel); }
  catch { return null; }
}

// NEW — live counts (materials / questions / activities) tagged to one
// chapter, fetched together. Powers the "यो अध्यायसँग जोडिएको" strip in the
// Planner form — the cross-screen interconnection the app was missing,
// only reliable now that chapter_id is always set correctly (see above).
async function getChapterLinkedCounts(chapterId) {
  if (!chapterId) return { materials: 0, questions: 0, activities: 0 };
  const [mats, qs, acts] = await Promise.all([
    supabase.from("materials").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
  ]);
  return { materials: mats.count || 0, questions: qs.count || 0, activities: acts.count || 0 };
}

// NEW — a real elevated, "premium" button with hover lift, active press,
// and a soft focus ring, done in plain inline styles + a couple of CSS
// classes injected globally (see the <style> block in App()) so :hover and
// :active actually work instead of relying only on JS mouse handlers.
function Button({ children, onClick, variant="primary", size="md", disabled, style, icon:Icon, type }) {
  const variants = {
    primary:   { background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`, color:"#fff", border:"none", boxShadow:SHADOW.accent },
    marigold:  { background:`linear-gradient(180deg, #DDB054 0%, ${MARIGOLD} 100%)`, color:"#2A1E07", border:"none", boxShadow:SHADOW.marigold },
    secondary: { background:SURFACE, color:ACCENT, border:`1.5px solid ${BORDER}`, boxShadow:SHADOW.sm },
    ghost:     { background:ACCENT_LIGHT, color:ACCENT, border:"none", boxShadow:"none" },
    danger:    { background:SURFACE, color:DANGER, border:`1.5px solid ${DANGER_BG}`, boxShadow:SHADOW.sm },
  };
  const sizes = {
    sm: { padding:"10px 16px", fontSize:16 },
    md: { padding:"14px 22px", fontSize:16.5 },
    lg: { padding:"17px 28px", fontSize:18 },
  };
  return (
    <button
      type={type||"button"}
      onClick={onClick}
      disabled={disabled}
      className="ss-btn"
      style={{
        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        borderRadius:13, fontWeight:700, letterSpacing:"-0.01em", fontFamily:"'Inter','Noto Sans Devanagari',sans-serif",
        cursor:disabled?"wait":"pointer", opacity:disabled?0.65:1,
        ...variants[variant], ...sizes[size], ...style,
      }}>
      {Icon&&<Icon size={size==="lg"?19:size==="sm"?14:16}/>}
      {children}
    </button>
  );
}

function Card({ children, onClick, style, accentColor }) {
  return (
    <div onClick={onClick}
      className={onClick?"ss-card ss-card-hover":"ss-card"}
      style={{
        background:`linear-gradient(165deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 90%, var(--border) 55%) 100%)`,
        border:`1px solid ${BORDER}`, borderRadius:18, padding:18,
        cursor:onClick?"pointer":"default", boxShadow:SHADOW.raised,
        ...(accentColor?{borderLeft:`4px solid ${accentColor}`,borderTopLeftRadius:8,borderBottomLeftRadius:8}:{}),
        ...style,
      }}>
      {children}
    </div>
  );
}
function SectionLabel({ children, icon:Icon, color }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:7, fontSize:16, letterSpacing:"0.06em", textTransform:"uppercase", color:`color-mix(in srgb, ${color||ACCENT} 45%, ${INK_SOFT})`, marginBottom:11, fontWeight:700 }}>
      {Icon&&<Icon size={14} color={color||ACCENT}/>}
      {children}
    </div>
  );
}

// NEW — a colourful corkboard-style pushpin for library/material cards, so
// each tile reads as a physical pinned document rather than a flat row.
// Rotated slightly and drop-shadowed so it looks stuck-on, not printed-on.
function PinBadge({ color }) {
  return (
    <div style={{position:"absolute",top:-9,left:16,zIndex:3,transform:"rotate(-14deg)",filter:"drop-shadow(0 3px 4px rgba(0,0,0,0.35))"}}>
      <div style={{width:22,height:22,borderRadius:"50%",background:`radial-gradient(circle at 35% 30%, color-mix(in srgb, ${color} 60%, white) 0%, ${color} 55%, color-mix(in srgb, ${color} 70%, black) 100%)`,border:"2px solid rgba(255,255,255,0.55)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{width:5,height:5,borderRadius:"50%",background:"rgba(255,255,255,0.85)"}}/>
      </div>
    </div>
  );
}
const STATUS_META = { ready:{label:"तयार",bg:ACCENT_LIGHT,color:ACCENT}, prep:{label:"तयारी चाहिने",bg:WARN_BG,color:WARN}, missing:{label:"सुरु नभएको",bg:DANGER_BG,color:DANGER} };
function StatusPill({ status }) {
  const s = STATUS_META[status]||STATUS_META.prep;
  return <span style={{ display:"inline-flex",alignItems:"center",gap:6, background:s.bg, color:s.color, fontSize:15.5, fontWeight:700, padding:"4px 12px", borderRadius:999 }}><span style={{width:7,height:7,borderRadius:"50%",background:s.color,flexShrink:0,boxShadow:`0 0 0 3px color-mix(in srgb, ${s.color} 22%, transparent)`}}/>{s.label}</span>;
}
function Spinner({ small }) {
  return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:small?0:40 }}><Loader size={small?18:28} color={ACCENT} style={{ animation:"spin 1s linear infinite" }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;
}
function ErrorMsg({ msg }) {
  return <div style={{ display:"flex", alignItems:"center", gap:9, background:DANGER_BG, borderRadius:12, padding:"12px 15px", fontSize:16, color:DANGER, margin:"10px 0", fontWeight:500 }}><AlertCircle size={17}/>{msg}</div>;
}
function EmptyState({ icon:Icon=FileText, text }) {
  return (
    <div style={{textAlign:"center",padding:"30px 20px"}}>
      <div style={{
        width:52,height:52,borderRadius:15,margin:"0 auto 12px",
        background:`linear-gradient(160deg, color-mix(in srgb, ${ACCENT} 14%, var(--surface)) 0%, var(--surface) 70%)`,
        border:`1px solid ${BORDER}`,display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:SHADOW.raised,
      }}><Icon size={21} color={INK_SOFT}/></div>
      <div style={{fontSize:16.5,fontWeight:600,color:INK_SOFT}}>{text}</div>
    </div>
  );
}
// NEW — one shared screen-title treatment (icon badge + title + optional
// subtitle + right-aligned action) used across every screen. Before this,
// each screen hand-rolled its own title size/weight/icon usage, so the app
// felt inconsistent moving between sections — this is what makes it read as
// one cohesively-designed product instead of many separate pages.
function PageHeader({ icon:Icon, title, subtitle, action, color=ACCENT }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:18,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,minWidth:0}}>
        {Icon&&<div style={{width:42,height:42,borderRadius:13,background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${color} 40%, transparent)`}}><Icon size={19} color="#fff"/></div>}
        <div style={{minWidth:0}}>
          <div style={{fontSize:21.5,fontWeight:800,color:INK,letterSpacing:"-0.015em",lineHeight:1.2}}>{title}</div>
          {subtitle&&<div style={{fontSize:14.5,color:INK_SOFT,fontWeight:600,marginTop:1}}>{subtitle}</div>}
        </div>
      </div>
      {action&&<div style={{flexShrink:0}}>{action}</div>}
    </div>
  );
}
function AIButton({ label, onClick, loading, style }) {
  return <Button variant="ghost" size="sm" onClick={onClick} disabled={loading} icon={loading?undefined:Zap} style={style}>{loading?<><Spinner small/> {label}</>:label}</Button>;
}
function MaterialsHint({ count, chapterTitle }) {
  if (!chapterTitle || !chapterTitle.trim()) return null;
  return (
    <div style={{ fontSize:15, color: count>0?ACCENT:WARN, background: count>0?ACCENT_LIGHT:WARN_BG, borderRadius:8, padding:"6px 10px", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
      <FileText size={13}/>
      {count>0?`"${chapterTitle}" मा ट्याग गरिएका ${count} फाइल AI ले प्रयोग गर्दैछ`:`"${chapterTitle}" मा कुनै सामग्री ट्याग गरिएको छैन`}
    </div>
  );
}

// NEW — shared "attach a material to this chapter without leaving the form"
// widget. Used by Planner, Question Bank, Activities and Assessment so none
// of them require a separate trip to the Materials tab just to give the AI
// something to read from.
function MaterialAttach({ chapterTitle, classLabel }) {
  const [attaching,setAttaching]=useState(false);
  const [attachedNames,setAttachedNames]=useState([]);
  const [attachError,setAttachError]=useState("");

  const attachMaterial=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    if(!chapterTitle||!chapterTitle.trim()){setAttachError("पहिले माथि अध्याय छान्नुहोस्।");e.target.value="";return;}
    setAttaching(true);setAttachError("");
    const{data:{user}}=await supabase.auth.getUser();
    const ext=file.name.split(".").pop().toLowerCase();
    const typeMap={pdf:"pdf",pptx:"pptx",ppt:"pptx",doc:"doc",docx:"doc",xlsx:"sheet",xls:"sheet",csv:"sheet",jpg:"image",jpeg:"image",png:"image",mp4:"video",mp3:"audio"};
    const fileType=typeMap[ext]||"doc";
    let extracted_text="",extraction_status="not_needed";
    if(["docx","pptx","xlsx","xls","csv"].includes(ext)){
      const res=await extractTextFromFile(file);
      extracted_text=res.text;extraction_status=res.status;
    }else if(ext==="doc"){
      extraction_status="failed";
      setAttachError(`पुरानो .doc ढाँचा समर्थित छैन — ".docx" बनाएर फेरि प्रयास गर्नुहोस्।`);
    }
    const chapterId=await db.getOrCreateChapterId(chapterTitle.trim(),classLabel);
    const{path,error:upErr}=await db.uploadMaterialFile(file,user.id);
    if(upErr){setAttachError(upErr.message);setAttaching(false);return;}
    await db.insertMaterial({name:file.name,storage_path:path,file_type:fileType,size_bytes:file.size,tags:[],chapter_id:chapterId,category:"other",extracted_text,extraction_status,class_label:classLabel});
    setAttachedNames((prev)=>[...prev,file.name]);
    setAttaching(false);e.target.value="";
  };

  return (
    <div style={{marginBottom:8}}>
      {attachedNames.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
          {attachedNames.map((n,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:15,color:ACCENT,fontWeight:600}}><CheckCircle2 size={14}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span></div>)}
        </div>
      )}
      {attachError&&<div style={{fontSize:14.5,color:DANGER,marginBottom:6}}>{attachError}</div>}
      <label style={{display:"inline-flex",alignItems:"center",gap:7,background:chapterTitle?.trim()?ACCENT_LIGHT:SURFACE_2,color:chapterTitle?.trim()?ACCENT:INK_SOFT,border:`1.5px dashed ${chapterTitle?.trim()?ACCENT:BORDER}`,borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:15,cursor:chapterTitle?.trim()?"pointer":"not-allowed"}}>
        {attaching?<Spinner small/>:<Paperclip size={15}/>}{attaching?"अपलोड हुँदै...":"सामग्री थप्नुहोस्"}
        <input type="file" onChange={attachMaterial} disabled={!chapterTitle?.trim()||attaching} style={{display:"none"}}/>
      </label>
    </div>
  );
}

// NEW — one shared chapter picker used everywhere a chapter needs to be
// chosen (Materials, Planner, Question Bank, Activities, Assessment).
// Replaces free-typed chapter names with a dropdown of real chapters, so
// there's no more risk of "Nepalko Naksha" vs "नेपालको नक्सा" mismatches —
// pick once, reuse everywhere, exactly the same value every time.
function ChapterPicker({ value, onChange, chapters, onAddChapter, placeholder }) {
  const [showAdd,setShowAdd]=useState(false);
  const [newTitle,setNewTitle]=useState("");
  const [adding,setAdding]=useState(false);

  const submitNew=async()=>{
    if(!newTitle.trim())return;
    setAdding(true);
    try{
      await onAddChapter(newTitle.trim());
      onChange(newTitle.trim());
      setShowAdd(false);setNewTitle("");
    }finally{setAdding(false);}
  };

  return(
    <div>
      <select
        value={chapters.some((c)=>c.title===value)?value:""}
        onChange={(e)=>{
          if(e.target.value==="__new__"){setShowAdd(true);}
          else {onChange(e.target.value);setShowAdd(false);}
        }}
        className="ss-field"
        style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,color:value?INK:INK_SOFT}}>
        <option value="">{placeholder||"— अध्याय छान्नुहोस् —"}</option>
        {chapters.map((c)=><option key={c.id} value={c.title}>{c.title}</option>)}
        <option value="__new__">+ नयाँ अध्याय थप्नुहोस्</option>
      </select>
      {showAdd&&(
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input autoFocus value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submitNew()} placeholder="नयाँ अध्यायको नाम लेख्नुहोस्" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
          <button className="ss-btn" onClick={submitNew} disabled={adding||!newTitle.trim()} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:SHADOW.accent}}>{adding?"...":"थप्नुहोस्"}</button>
        </div>
      )}
    </div>
  );
}

// NEW — a simple 3-step checklist on the दashboard so a teacher opening the
// app for the first time (or feeling lost) always knows exactly what to do
// next. Disappears once all three steps are done.
function GetStartedCard({ chapters, materialsCount, lessons, onGoMaterials, onGoPlanner }) {
  const step1 = chapters.length>0;
  const step2 = materialsCount>0;
  const step3 = lessons.length>0;
  if(step1&&step2&&step3) return null;

  const Step=({ done, num, title, sub, onClick })=>(
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 6px",cursor:onClick?"pointer":"default",opacity:done?0.55:1}}>
      <div style={{width:28,height:28,borderRadius:"50%",background:done?ACCENT:WARN_BG,color:done?"#fff":WARN,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16,flexShrink:0}}>{done?"✓":num}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:16.5,fontWeight:700,color:INK,textDecoration:done?"line-through":"none"}}>{title}</div>
        {sub&&<div style={{fontSize:15,color:INK_SOFT,marginTop:1}}>{sub}</div>}
      </div>
      {!done&&onClick&&<ChevronRight size={16} color={INK_SOFT}/>}
    </div>
  );

  return(
    <Card style={{marginBottom:20}}>
      <div style={{fontSize:17,fontWeight:700,color:INK,marginBottom:4}}>👋 सुरु गर्नुहोस्</div>
      <div style={{fontSize:15.5,color:INK_SOFT,marginBottom:8}}>तीन सजिलो चरणमा शिक्षा साथी प्रयोग गर्नुहोस्</div>
      <Step done={step1} num={1} title="पहिलो अध्याय थप्नुहोस्" sub="सामग्री वा पाठ योजनाबाट नयाँ अध्याय बनाउन सकिन्छ" onClick={!step1?onGoMaterials:undefined}/>
      <div style={{height:1,background:BORDER}}/>
      <Step done={step2} num={2} title="अध्यायसँग सामग्री अपलोड गर्नुहोस्" sub="PDF, Word, PowerPoint — जे भए पनि" onClick={!step2?onGoMaterials:undefined}/>
      <div style={{height:1,background:BORDER}}/>
      <Step done={step3} num={3} title="AI बाट पाठ योजना बनाउनुहोस्" sub="अपलोड गरेको सामग्री AI ले स्वतः प्रयोग गर्छ" onClick={!step3?onGoPlanner:undefined}/>
    </Card>
  );
}

function LoginScreen({ onLogin }) {
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  // NEW — validate locally before ever hitting the network, so mistakes are
  // caught immediately with a specific message instead of waiting on a
  // round trip to get back a generic Supabase error.
  const validate=()=>{
    if(!email.trim())return"इमेल लेख्नुहोस्।";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return"मान्य इमेल ठेगाना लेख्नुहोस्।";
    if(!password)return"पासवर्ड लेख्नुहोस्।";
    if(mode==="signup"){
      if(!name.trim())return"आफ्नो नाम लेख्नुहोस्।";
      if(password.length<6)return"पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ।";
      if(password!==confirmPassword)return"पासवर्ड मिलेन। फेरि जाँच्नुहोस्।";
    }
    return"";
  };

  const handle=async()=>{
    setError("");setSuccess("");
    const validationError=validate();
    if(validationError){setError(validationError);return;}
    setLoading(true);
    const{data,error:err}=mode==="login"
      ?await db.signIn(email.trim(),password)
      :await db.signUp(email.trim(),password,{data:{full_name:name.trim()}});
    setLoading(false);
    if(err){setError(err.message);return;}
    if(mode==="signup"){
      // NEW — the teacher's name is saved right away so it's already there
      // the first time they log in, instead of a separate Settings step.
      try{localStorage.setItem("ss-teacher-name",name.trim());}catch{}
      setSuccess("इमेल जाँच गरी प्रमाणित गर्नुहोस्।");setMode("login");
      setPassword("");setConfirmPassword("");
    }
    else onLogin(data.session);
  };

  const fieldStyle={width:"100%",border:`1.5px solid ${BORDER}`,borderRadius:12,padding:"13px 42px 13px 42px",fontSize:16.5,outline:"none",background:SURFACE_2,color:INK,caretColor:ACCENT};

  return(
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden",background:`radial-gradient(1000px 560px at 15% -10%, ${ACCENT_LIGHT}, ${PAPER} 55%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}>
      <div style={{position:"absolute",top:-120,right:-100,width:340,height:340,borderRadius:"50%",background:`radial-gradient(circle, ${tint(MARIGOLD,14)}, transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-140,left:-110,width:360,height:360,borderRadius:"50%",background:`radial-gradient(circle, ${tint(TEAL,12)}, transparent 70%)`,pointerEvents:"none"}}/>

      <div style={{width:"100%",maxWidth:408,position:"relative"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src="/icons/icon-192.png" alt="शिक्षा साथी" width={76} height={76} style={{borderRadius:22,margin:"0 auto 18px",display:"block",boxShadow:SHADOW.accent}}/>
          <div style={{fontSize:30,fontWeight:800,color:INK,letterSpacing:"-0.02em"}}>शिक्षा साथी</div>
          <div style={{fontSize:16.5,color:INK_SOFT,marginTop:6,fontWeight:600}}>जुनसुकै कक्षा र विषयका शिक्षकको साथी</div>
        </div>

        <Card style={{boxShadow:SHADOW.lg,padding:8,border:`1px solid ${BORDER}`}}>
          <div style={{display:"flex",gap:4,padding:6,background:SURFACE_2,borderRadius:14,marginBottom:22}}>
            <button onClick={()=>{setMode("login");setError("");}} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:16,background:mode==="login"?SURFACE:"transparent",color:mode==="login"?ACCENT:INK_SOFT,boxShadow:mode==="login"?SHADOW.sm:"none"}}>लगइन</button>
            <button onClick={()=>{setMode("signup");setError("");}} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:16,background:mode==="signup"?SURFACE:"transparent",color:mode==="signup"?ACCENT:INK_SOFT,boxShadow:mode==="signup"?SHADOW.sm:"none"}}>नयाँ खाता</button>
          </div>

          <div style={{padding:"0 18px 22px"}}>
            {error&&<ErrorMsg msg={error}/>}
            {success&&<div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:12,padding:"11px 15px",fontSize:16,color:ACCENT,marginBottom:12,fontWeight:600}}><CheckCircle2 size={16}/>{success}</div>}

            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              {mode==="signup"&&(
                <div style={{position:"relative"}}>
                  <User size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                  <input type="text" placeholder="तपाईंको नाम" value={name} onChange={(e)=>setName(e.target.value)} style={{...fieldStyle,paddingRight:15}}/>
                </div>
              )}
              <div style={{position:"relative"}}>
                <User size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                <input type="email" autoCapitalize="none" placeholder="इमेल" value={email} onChange={(e)=>setEmail(e.target.value)} style={{...fieldStyle,paddingRight:15}}/>
              </div>
              <div style={{position:"relative"}}>
                <Lock size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                <input type={showPassword?"text":"password"} placeholder="पासवर्ड" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&mode==="login"&&handle()} style={fieldStyle}/>
                <button className="ss-icon-btn" type="button" onClick={()=>setShowPassword(!showPassword)} style={{position:"absolute",right:13,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:INK_SOFT,display:"flex"}}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button>
              </div>
              {mode==="signup"&&(
                <>
                  <div style={{position:"relative"}}>
                    <Lock size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                    <input type={showPassword?"text":"password"} placeholder="पासवर्ड फेरि लेख्नुहोस्" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handle()} style={{...fieldStyle,paddingRight:15}}/>
                  </div>
                  <div style={{fontSize:14,color:INK_SOFT,marginTop:-6}}>पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ।</div>
                </>
              )}
              <Button variant="primary" size="lg" onClick={handle} disabled={loading} style={{width:"100%",marginTop:4}}>{loading?<Spinner small/>:mode==="login"?"लगइन गर्नुहोस्":"खाता बनाउनुहोस्"}</Button>
            </div>
          </div>
        </Card>

        <div style={{textAlign:"center",marginTop:22,fontSize:14.5,color:INK_SOFT}}>नेपाली शिक्षकहरूका लागि, ❤️ सहित बनाइएको</div>
      </div>
    </div>
  );
}

function SectionSelector({ sections, current, onChange, onAdd }) {
  const [adding,setAdding]=useState(false);
  const [name,setName]=useState("");
  const [loading,setLoading]=useState(false);
  const save=async()=>{
    if(!name.trim())return;
    setLoading(true);
    const{data,error}=await db.createSection(name.trim());
    setLoading(false);
    if(!error){onAdd(data);setName("");setAdding(false);}
  };
  return(
    <div style={{padding:"11px 16px",background:SURFACE,borderBottom:`1px solid ${BORDER}`}}>
      <div style={{display:"flex",gap:8,overflowX:"auto",alignItems:"center"}}>
        {sections.map((s)=>(
          <button key={s.id} onClick={()=>onChange(s)} className="ss-chip" style={{padding:"7px 16px",borderRadius:999,border:`1.5px solid ${current?.id===s.id?ACCENT:BORDER}`,fontWeight:700,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",background:current?.id===s.id?ACCENT:SURFACE_2,color:current?.id===s.id?"#fff":INK_SOFT,boxShadow:current?.id===s.id?SHADOW.sm:"none"}}>{s.name}</button>
        ))}
        {adding?(
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <input autoFocus value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&save()} placeholder="जस्तै: ५ क" style={{border:`1.5px solid ${BORDER}`,borderRadius:10,padding:"7px 11px",fontSize:15.5,width:100}}/>
            <button className="ss-btn" onClick={save} disabled={loading} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"7px 13px",fontWeight:700,fontSize:15.5,cursor:"pointer",boxShadow:SHADOW.accent}}>{loading?"...":"थप"}</button>
            <button className="ss-icon-btn" onClick={()=>setAdding(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={16}/></button>
          </div>
        ):(
          <button onClick={()=>setAdding(true)} className="ss-chip" style={{display:"flex",alignItems:"center",gap:4,padding:"7px 12px",borderRadius:999,border:`1.5px dashed ${BORDER}`,background:"none",color:INK_SOFT,fontSize:15,fontWeight:700,cursor:"pointer",flexShrink:0}}><Plus size={13}/>नयाँ सेक्सन</button>
        )}
      </div>
    </div>
  );
}

// NEW — shared full-screen printable overlay for any single generated/saved
// document (an activity, a rubric, a saved AI resource). Mirrors the same
// no-print chrome pattern LessonMode already uses, so window.print() only
// outputs the actual content, never the nav/header.
function PrintableSheet({ title, subtitle, chip, chipColor, onClose, children }) {
  return (
    <div className="print-area" style={{position:"fixed",inset:0,background:PAPER,zIndex:70,display:"flex",flexDirection:"column"}}>
      <div className="no-print" style={{background:`linear-gradient(120deg, ${TEAL} 0%, ${ACCENT} 65%, ${ACCENT_DARK} 100%)`,color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
        <button className="ss-icon-btn" onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer"}}><ChevronLeft size={20}/></button>
        <div style={{flex:1,minWidth:0}}>
          {subtitle&&<div style={{fontSize:14,opacity:0.75}}>{subtitle}</div>}
          <div style={{fontSize:18.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div>
        </div>
        <button className="ss-icon-btn" onClick={()=>window.print()} title="प्रिन्ट गर्नुहोस्" style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer",flexShrink:0}}><Printer size={19}/></button>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:20,maxWidth:720,margin:"0 auto",width:"100%"}}>
        {chip&&<span style={{fontSize:13.5,background:tint(chipColor||ACCENT,15),color:chipColor||ACCENT,padding:"4px 10px",borderRadius:999,fontWeight:700,display:"inline-block",marginBottom:12}}>{chip}</span>}
        {children}
      </div>
    </div>
  );
}


// FIX — "printable whole at one click" was broken: the on-screen tabs below
// only ever render whichever ONE tab is currently active (the others are
// unmounted, not just hidden), so window.print() could only ever print
// that single tab. This component now renders a second, always-complete
// copy of the plan (every section, in order) that stays invisible on
// screen (`.print-only`, display:none by default) and is the ONLY thing
// shown when actually printing (`@media print` flips it to visible and
// hides everything tagged `.no-print`, including the tabs). One click on
// the printer icon now always produces the full plan, regardless of which
// tab was open.
function LessonMode({ lesson, onClose, onEdit, autoPrint, classLabel, teacherName }) {
  const [tab,setTab]=useState("sequence");
  // NEW — vocabulary entries are stored as "शब्द: अर्थ" (word: meaning). This
  // used to just print the whole string as one flat pill (word and meaning
  // both always visible, taking up space and cluttering the row). Now only
  // the word shows; tapping it reveals the meaning in a small popup.
  const [vocabPopup,setVocabPopup]=useState(null);
  // NEW — Phase 2: lets a teacher collapse "आजको उद्देश्य" once they've
  // glanced at it, so it stops eating vertical space on every visit.
  const [objOpen,setObjOpen]=useState(true);
  const tabs=[{id:"sequence",label:"पढाउने",icon:ClipboardList},{id:"questions",label:"प्रश्नहरू",icon:MessageSquare},{id:"activities",label:"क्रियाकलाप",icon:Users},{id:"homework",label:"गृहकार्य",icon:PenSquare},{id:"rubric",label:"मूल्याङ्कन",icon:Layers}];
  const objectives=lesson.objectives||[];
  const vocabulary=lesson.vocabulary||[];
  const sequence=lesson.sequence||[];
  const keyQuestions=lesson.key_questions||[];
  const activities=lesson.activities||[];
  const rubric=lesson.rubric||[];
  const chapterTitle=lesson.chapters?.title||lesson.chapter_title||"";

  // NEW — "प्रिन्ट" from the Planner list opens this lesson and prints it
  // immediately, in one click, with no extra tap needed once it's open.
  useEffect(()=>{
    if(!autoPrint)return;
    const t=setTimeout(()=>window.print(),300);
    return()=>clearTimeout(t);
  },[autoPrint]);

  return(
    <div className="print-area" style={{position:"fixed",inset:0,background:PAPER,zIndex:50,display:"flex",flexDirection:"column"}}>
      <style>{`
        /* NEW — Phase 2: "आजको पाठ सुरु" used to be a single centered
           720px column no matter the screen size — on a laptop/desktop
           that meant huge empty margins left and right, with the tab bar
           squeezed along the top exactly like on a phone. This gives
           desktop its own real layout (tabs as a left rail, content using
           the freed-up width) while keeping mobile tight and thumb-friendly. */
        .lesson-shell{display:flex;flex-direction:column;flex:1;min-height:0;}
        .lesson-tabs{display:flex;overflow-x:auto;background:${SURFACE};border-bottom:1px solid ${BORDER};}
        .lesson-tab-btn{display:flex;align-items:center;gap:5px;padding:11px 12px;border:none;background:none;border-bottom:3px solid transparent;font-weight:600;font-size:16px;cursor:pointer;white-space:nowrap;}
        .lesson-content{flex:1;overflow-y:auto;padding:14px 16px;width:100%;}
        @media(min-width:860px){
          .lesson-shell{flex-direction:row;overflow:hidden;}
          .lesson-rail{width:260px;flex-shrink:0;display:flex;flex-direction:column;overflow-y:auto;border-right:1px solid ${BORDER};background:${SURFACE};}
          .lesson-tabs{flex-direction:column;overflow-x:visible;border-bottom:none;padding:10px;gap:2px;}
          .lesson-tab-btn{border-bottom:none;border-left:3px solid transparent;border-radius:10px;padding:11px 13px;justify-content:flex-start;}
          .lesson-tab-btn.active{background:${ACCENT_LIGHT};border-left-color:${ACCENT};}
          .lesson-obj{border-bottom:none !important;border-top:1px solid ${BORDER};}
          .lesson-content{max-width:900px;padding:28px 34px;}
        }
      `}</style>
      <div className="no-print" style={{background:`linear-gradient(120deg, ${TEAL} 0%, ${ACCENT} 65%, ${ACCENT_DARK} 100%)`,color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <button className="ss-icon-btn" onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer"}}><ChevronLeft size={20}/></button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13.5,opacity:0.75}}>{chapterTitle}</div>
          <div style={{fontSize:18,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lesson.title}</div>
        </div>
        {onEdit&&<button className="ss-icon-btn" onClick={()=>onEdit(lesson)} title="सम्पादन गर्नुहोस्" style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer",flexShrink:0}}><PenSquare size={19}/></button>}
        <button className="ss-icon-btn" onClick={()=>window.print()} title="पूरा पाठ योजना प्रिन्ट गर्नुहोस्" style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer",flexShrink:0}}><Printer size={19}/></button>
      </div>

      <div className="no-print lesson-shell">
        <div className="lesson-rail">
          <div className="lesson-tabs">
            {tabs.map((t)=>{const Icon=t.icon;const active=tab===t.id;return<button key={t.id} onClick={()=>setTab(t.id)} className={`lesson-tab-btn${active?" active":""}`} style={{color:active?ACCENT:INK_SOFT,borderBottomColor:active?ACCENT:"transparent"}}><Icon size={15}/>{t.label}</button>;})}
          </div>
          {(objectives.length>0||vocabulary.length>0)&&(
            <div className="lesson-obj" style={{padding:"10px 16px 12px",borderBottom:`1px solid ${BORDER}`}}>
              {/* NEW — collapsible: a teacher who already knows today's
                  objective by heart (most days, after the first glance)
                  can close this and get straight to the tab content
                  instead of scrolling past it every time. */}
              <button className="ss-btn" onClick={()=>setObjOpen((v)=>!v)} style={{display:"flex",alignItems:"center",gap:5,width:"100%",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:objOpen?5:0,color:INK_SOFT,fontSize:14.5,fontWeight:600}}>
                <ChevronDown size={14} style={{transform:objOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform .15s ease",flexShrink:0}}/>
                आजको उद्देश्य
              </button>
              {objOpen&&(<>
                <ul style={{margin:0,paddingLeft:16,fontSize:16,color:INK,lineHeight:1.55}}>{objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {vocabulary.map((v)=>{
                    const idx=v.indexOf(":");
                    const word=idx>-1?v.slice(0,idx).trim():v.trim();
                    const meaning=idx>-1?v.slice(idx+1).trim():"";
                    return(
                      <button className="ss-btn" key={v} onClick={()=>meaning&&setVocabPopup({word,meaning})} style={{background:WARN_BG,color:MARIGOLD_DARK,fontSize:15,fontWeight:600,padding:"3px 8px",borderRadius:6,border:"none",display:"flex",alignItems:"center",gap:3,cursor:meaning?"pointer":"default"}}>
                        {word}{meaning&&<HelpCircle size={11}/>}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </div>
          )}
        </div>
        <div className="lesson-content">
        {tab==="sequence"&&(<div><SectionLabel icon={ClipboardList}>पढाउने क्रम</SectionLabel>{sequence.length===0?<div style={{color:INK_SOFT}}>पढाउने क्रम थपिएको छैन।</div>:(<ol style={{margin:0,paddingLeft:0,listStyle:"none"}}>{sequence.map((s,i)=>(<li key={i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:i<sequence.length-1?`1px solid ${BORDER}`:"none"}}><div style={{width:26,height:26,borderRadius:"50%",background:ACCENT_LIGHT,color:ACCENT,fontWeight:700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div><div style={{fontSize:17,color:INK,lineHeight:1.5,paddingTop:2}}>{s}</div></li>))}</ol>)}{lesson.notes&&<div style={{marginTop:14,background:WARN_BG,borderRadius:10,padding:12}}><div style={{fontSize:15,fontWeight:700,color:WARN,marginBottom:3}}>नोट</div><div style={{fontSize:16.5,color:INK}}>{lesson.notes}</div></div>}</div>)}
        {tab==="questions"&&<div><SectionLabel icon={MessageSquare} color={VIOLET}>कक्षामा सोध्नुहोस्</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:8}}>{keyQuestions.length===0?<div style={{color:INK_SOFT}}>प्रश्नहरू थपिएका छैनन्।</div>:keyQuestions.map((q,i)=><Card key={i} accentColor={PALETTE[i%PALETTE.length]}><div style={{fontSize:17,color:INK}}>{q}</div></Card>)}</div></div>}
        {tab==="activities"&&<div><SectionLabel icon={Users} color={TEAL}>क्रियाकलापहरू</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:8}}>{activities.length===0?<div style={{color:INK_SOFT}}>क्रियाकलापहरू थपिएका छैनन्।</div>:activities.map((a,i)=><Card key={i} accentColor={PALETTE[i%PALETTE.length]}><div style={{fontSize:17,color:INK}}>{a}</div></Card>)}</div></div>}
        {tab==="homework"&&<div><SectionLabel icon={PenSquare} color={MARIGOLD_DARK}>दिने गृहकार्य</SectionLabel><Card><div style={{fontSize:17,color:INK,lineHeight:1.6}}>{lesson.homework||"गृहकार्य थपिएको छैन।"}</div></Card></div>}
        {tab==="rubric"&&<div><SectionLabel icon={Layers} color={ROSE}>मूल्याङ्कन मापदण्ड</SectionLabel>{rubric.length===0?<div style={{color:INK_SOFT}}>मूल्याङ्कन मापदण्ड थपिएको छैन।</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{rubric.map((r,i)=>{const c=r.level==="उत्कृष्ट"?ACCENT:r.level==="सहयोग आवश्यक"?ROSE:MARIGOLD_DARK;return<Card key={i} accentColor={c}><div style={{fontWeight:700,color:c,fontSize:16.5,marginBottom:3}}>{r.level}</div><div style={{fontSize:16.5,color:INK}}>{r.desc}</div></Card>;})}</div>}</div>}
        </div>
      </div>


      {vocabPopup&&(
        <div className="no-print" onClick={()=>setVocabPopup(null)} style={{position:"fixed",inset:0,zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.5)",backdropFilter:"blur(4px)",WebkitBackdropFilter:"blur(4px)",padding:20}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:16,padding:20,maxWidth:320,width:"100%",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`}}>
            <div style={{fontSize:19,fontWeight:800,color:MARIGOLD_DARK,marginBottom:8}}>{vocabPopup.word}</div>
            <div style={{fontSize:16.5,color:INK,lineHeight:1.6}}>{vocabPopup.meaning}</div>
            <button className="ss-btn" onClick={()=>setVocabPopup(null)} style={{marginTop:16,width:"100%",padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>बुझें</button>
          </div>
        </div>
      )}

      {/* print-only — the full plan, every section, always in this order,
          regardless of which tab was open on screen. Styled as a proper
          printable handout: bordered header block, a byline row (class/
          teacher/date), and consistent section rules — not just a plain
          dump of text. */}
      <div className="print-only" style={{fontFamily:"'Noto Sans Devanagari','Inter',sans-serif",color:"#111",maxWidth:"18cm",margin:"0 auto"}}>
        <div style={{border:"1.5px solid #111",borderRadius:6,padding:"14px 18px",marginBottom:16}}>
          {chapterTitle&&<div style={{fontSize:12.5,letterSpacing:"0.06em",textTransform:"uppercase",color:"#444",fontWeight:700,marginBottom:3}}>{chapterTitle}</div>}
          <div style={{fontSize:23,fontWeight:800,marginBottom:8,lineHeight:1.25}}>{lesson.title}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 18px",fontSize:12.5,color:"#333",borderTop:"1px solid #ccc",paddingTop:7}}>
            {classLabel&&<span><strong>कक्षा:</strong> {classLabel}</span>}
            {teacherName&&<span><strong>शिक्षक:</strong> {teacherName}</span>}
            <span><strong>मिति:</strong> {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span>
          </div>
        </div>

        {objectives.length>0&&(
          <div style={{marginBottom:16,breakInside:"avoid"}}>
            <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>उद्देश्यहरू</div>
            <ul style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{objectives.map((o,i)=><li key={i} style={{marginBottom:3}}>{o}</li>)}</ul>
          </div>
        )}

        {vocabulary.length>0&&(
          <div style={{marginBottom:16,breakInside:"avoid"}}>
            <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>शब्दावली</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{vocabulary.map((v)=><span key={v} style={{border:"1px solid #999",borderRadius:4,padding:"2px 9px",fontSize:13}}>{v}</span>)}</div>
          </div>
        )}

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>पढाउने क्रम</div>
          {sequence.length===0?<div>—</div>:<ol style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{sequence.map((s,i)=><li key={i} style={{marginBottom:6}}>{s}</li>)}</ol>}
        </div>

        {lesson.notes&&(
          <div style={{marginBottom:16,breakInside:"avoid",background:"#f4f4f4",borderLeft:"3px solid #111",padding:"8px 12px",borderRadius:"0 4px 4px 0"}}>
            <div style={{fontWeight:700,fontSize:12.5,marginBottom:3}}>नोट</div>
            <div style={{lineHeight:1.55}}>{lesson.notes}</div>
          </div>
        )}

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>कक्षामा सोध्ने प्रश्नहरू</div>
          {keyQuestions.length===0?<div>—</div>:<ol style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{keyQuestions.map((q,i)=><li key={i} style={{marginBottom:5}}>{q}</li>)}</ol>}
        </div>

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>क्रियाकलापहरू</div>
          {activities.length===0?<div>—</div>:<ol style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{activities.map((a,i)=><li key={i} style={{marginBottom:5}}>{a}</li>)}</ol>}
        </div>

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>गृहकार्य</div>
          <div style={{lineHeight:1.6}}>{lesson.homework||"—"}</div>
        </div>

        <div style={{marginBottom:8,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>मूल्याङ्कन मापदण्ड</div>
          {rubric.length===0?<div>—</div>:(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
              <tbody>
                {rubric.map((r,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #ddd"}}>
                    <td style={{padding:"6px 10px 6px 0",fontWeight:700,whiteSpace:"nowrap",verticalAlign:"top",width:"28%"}}>{r.level}</td>
                    <td style={{padding:"6px 0",verticalAlign:"top"}}>{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon:Icon, value, label, color, onClick, accent }) {
  return (
    <Card onClick={onClick} style={{padding:"14px 15px",paddingTop:20,position:"relative",overflow:"visible", background: accent?`linear-gradient(160deg, color-mix(in srgb, ${color} 10%, var(--surface)) 0%, var(--surface) 65%)`:undefined}}>
      <PinBadge color={color}/>
      <div style={{display:"flex",alignItems:"center",gap:11}}>
        <div style={{
          width:38,height:38,borderRadius:11,flexShrink:0,
          background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 70%, black) 100%)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${color} 40%, transparent)`,
        }}>
          <Icon size={18} color="#fff"/>
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:22,fontWeight:800,color:INK,lineHeight:1.05}}>{value}</div>
          <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

// NEW — the things a one-click "prepare this chapter" run produces. The
// lesson plan and any presentation/PPT come from what the teacher already
// uploaded (shown separately below) — this only fills in what AI is
// actually useful for: questions, activities, and an assessment rubric.
const PREP_STEPS=[
  {id:"questions",label:"प्रश्नहरू"},
  {id:"activities",label:"क्रियाकलाप"},
  {id:"assessment",label:"मूल्याङ्कन"},
];
function PrepStepRow({ label, state }) {
  const color=state==="done"?ACCENT:state==="error"?DANGER:state==="loading"?MARIGOLD_DARK:INK_SOFT;
  const bg=state==="done"?ACCENT_LIGHT:state==="error"?DANGER_BG:state==="loading"?WARN_BG:SURFACE_2;
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 2px"}}>
      <div style={{width:24,height:24,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {state==="loading"?<Loader size={12} color={color} style={{animation:"spin 1s linear infinite"}}/>
          :state==="done"?<CheckCircle2 size={13} color={color}/>
          :state==="error"?<AlertCircle size={13} color={color}/>
          :<div style={{width:6,height:6,borderRadius:"50%",background:color}}/>}
      </div>
      <div style={{fontSize:16,fontWeight:600,color:state==="idle"?INK_SOFT:INK}}>{label}</div>
    </div>
  );
}

// NEW — shows what the teacher has already uploaded for this chapter
// (lesson plan, PPT, etc., tagged by category in Materials). This is the
// source of truth for the lesson plan/presentation — AI never overwrites
// these, it only reads them for context.
function ChapterMaterialsList({ materials, onGoMaterials }) {
  if(!materials||materials.length===0){
    return(
      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:WARN,background:WARN_BG,borderRadius:10,padding:"9px 12px",marginBottom:10}}>
        <FileText size={14}/>
        <span style={{flex:1}}>यो अध्यायमा अझै पाठ योजना/PPT थपिएको छैन।</span>
        <button className="ss-icon-btn" onClick={onGoMaterials} style={{background:"none",border:"none",color:MARIGOLD_DARK,fontWeight:700,fontSize:14.5,cursor:"pointer",textDecoration:"underline",flexShrink:0}}>थप्नुहोस्</button>
      </div>
    );
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
      {materials.map((m)=>{
        const meta=CATEGORY_META[m.category]||CATEGORY_META.other;
        const Icon=meta.icon;
        return(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:INK,background:SURFACE_2,borderRadius:8,padding:"7px 10px"}}>
            <Icon size={14} color={meta.color} style={{flexShrink:0}}/>
            <span style={{fontWeight:700,color:meta.color,fontSize:13.5,flexShrink:0}}>{meta.label}</span>
            <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// NEW — HomeScreen replaces the old Dashboard. The lesson plan and teaching
// materials (PPT, worksheets, etc.) are uploaded once by the teacher —
// tagged to a chapter in Materials. From there, picking that chapter here
// and tapping one button prepares everything AI can usefully add on top —
// questions, activities, and an assessment rubric — reading the teacher's
// own uploaded lesson plan/PPT and the textbook as its source, never
// replacing them. This is meant to be the only screen a teacher needs to
// touch on a normal day.
function HomeScreen({ onOpenLesson, onGoPlanner, onGoHomework, onGoMaterials, onGoAITools, onGoSettings, section, lessons, homework, loading, chapters, teacherName, onAddChapter, classContext, classLabel }) {
  // FIX — "today's lesson" was permanently whichever lesson happened to be
  // first "ready" (or just lessons[0]), with no way to change it — so once
  // you'd taught it, the card kept pointing at the same chapter forever.
  // A teacher can now explicitly pick which lesson is "today's"; the
  // choice is remembered (per class) until changed again, and falls back
  // to the automatic pick if the chosen lesson gets deleted.
  const [todayOverrideId,setTodayOverrideId]=useState(()=>{
    try{return localStorage.getItem(`ss-today-lesson::${classLabel||"default"}`)||null;}catch{return null;}
  });
  const [pickingToday,setPickingToday]=useState(false);
  useEffect(()=>{
    try{setTodayOverrideId(localStorage.getItem(`ss-today-lesson::${classLabel||"default"}`)||null);}catch{}
  },[classLabel]);
  const chooseToday=(l)=>{
    setTodayOverrideId(l.id);setPickingToday(false);
    try{localStorage.setItem(`ss-today-lesson::${classLabel||"default"}`,l.id);}catch{}
  };
  const today=lessons.find((l)=>l.id===todayOverrideId)||lessons.find((l)=>l.status==="ready")||lessons[0];
  const [materialsCount,setMaterialsCount]=useState(0);
  const [prepChapter,setPrepChapter]=useState("");
  const [chapterMaterials,setChapterMaterials]=useState([]);
  const [stepState,setStepState]=useState({});
  const [preparing,setPreparing]=useState(false);
  const [prepError,setPrepError]=useState("");
  const [prepResult,setPrepResult]=useState(null);
  const textbookReady=!!getTextbookPDF();

  useEffect(()=>{ db.getMaterials(classLabel).then(({data})=>setMaterialsCount((data||[]).length)); },[classLabel]);
  useEffect(()=>{
    if(!prepChapter){setChapterMaterials([]);return;}
    let cancelled=false;
    db.getChapterIdByTitle(prepChapter,classLabel).then((id)=>{
      if(!id){if(!cancelled)setChapterMaterials([]);return;}
      db.getMaterialsByChapter(id).then(({data})=>{if(!cancelled)setChapterMaterials(data||[]);});
    });
    return ()=>{cancelled=true;};
  },[prepChapter,classLabel]);

  const prepareChapter=async()=>{
    const chapter=prepChapter.trim();
    if(!chapter){setPrepError("पहिले अध्याय छान्नुहोस्।");return;}
    setPreparing(true);setPrepError("");setPrepResult(null);
    setStepState({questions:"loading",activities:"idle",assessment:"idle"});
    let qCount=0,aCount=0,gotRubric=false;
    // NEW: this pulls in the teacher's own uploaded lesson plan/PPT/materials
    // for this chapter (plus the textbook) as the source AI reads from.
    const ctx=await getMaterialContext(chapter,classLabel);
    // FIX — same root-cause tagging bug as Planner/Question Bank/Activities
    // had: resolve the real chapter_id ONCE up front and save it on
    // everything this "prepare my class" flow creates, instead of only
    // ever saving the typed chapter name. This is the main daily-use
    // button on the dashboard, so it mattered most to get right.
    const chapter_id=await resolveChapterId(chapter,classLabel);

    try{
      const qs=await gemini.generateQuestions(chapter,ctx,classContext);
      if(qs?.length){
        for(const q of qs)await db.upsertQuestion({text:q.text,type:q.type||"छोटो उत्तर",difficulty:q.difficulty||"सजिलो",bloom_level:q.bloom||"सम्झना",chapter_title:chapter,chapter_id,options:q.options||[],correct_option:q.correct_option??null});
        qCount=qs.length;
        setStepState((s)=>({...s,questions:"done",activities:"loading"}));
      }else setStepState((s)=>({...s,questions:"error",activities:"loading"}));
    }catch(e){setStepState((s)=>({...s,questions:"error",activities:"loading"}));}

    try{
      const acts=await gemini.generateActivities(chapter,ctx,classContext);
      if(acts?.length){
        for(const a of acts)await db.upsertActivity({title:a.title,type:a.type||"game",duration:a.duration,competency:a.competency,description:a.description,chapter_title:chapter,chapter_id});
        aCount=acts.length;
        setStepState((s)=>({...s,activities:"done",assessment:"loading"}));
      }else setStepState((s)=>({...s,activities:"error",assessment:"loading"}));
    }catch(e){setStepState((s)=>({...s,activities:"error",assessment:"loading"}));}

    try{
      const prompt=`नेपाल ${classContext} "${chapter}" का लागि अवलोकन मूल्याङ्कन मापदण्ड भएको JSON array मात्र: [{"level":"उत्कृष्ट","desc":"..."},{"level":"राम्रो","desc":"..."},{"level":"सहयोग आवश्यक","desc":"..."}]`;
      const rubric=await gemini.generateRubric(prompt,ctx);
      if(rubric?.length){
        // FIX — chapter_title was previously never saved here at all, so a
        // rubric made from this button could never be found again from any
        // chapter-based view.
        await db.upsertAssessment({title:`${chapter} — मूल्याङ्कन`,type:"observation",rubric,due_date:null,status:"pending",chapter_title:chapter});
        gotRubric=true;
        setStepState((s)=>({...s,assessment:"done"}));
      }else setStepState((s)=>({...s,assessment:"error"}));
    }catch(e){setStepState((s)=>({...s,assessment:"error"}));}

    const hasLesson=lessons.some((l)=>(l.chapters?.title||l.chapter_title)===chapter);
    setPrepResult({chapter,questions:qCount,activities:aCount,rubric:gotRubric,hasLesson});
    setPreparing(false);
  };

  if(loading)return<Spinner/>;
  const hour=new Date().getHours();
  const timeGreeting=hour<11?"शुभ प्रभात":hour<16?"नमस्ते":"शुभ साँझ";

  return(
    <div style={{padding:"18px 18px 130px",maxWidth:760,margin:"0 auto"}}>
      {teacherName&&<div style={{fontSize:16.5,fontWeight:700,color:INK,marginBottom:10}}>{timeGreeting}, {teacherName} जी 👋</div>}

      {!textbookReady&&(
        <Card onClick={onGoSettings} style={{marginBottom:16,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
          <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(160deg, ${MARIGOLD_DARK} 0%, color-mix(in srgb, ${MARIGOLD_DARK} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${MARIGOLD_DARK} 40%, transparent)`}}><BookMarked size={18} color="#fff"/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:16.5,color:INK}}>पहिले पाठ्यपुस्तक अपलोड गर्नुहोस्</div>
            <div style={{fontSize:14.5,color:INK_SOFT}}>सेटिङमा गएर PDF थप्नुहोस् — त्यसपछि मात्र AI ले तयार गर्न सक्छ</div>
          </div>
          <ChevronRight size={18} color={INK_SOFT} style={{flexShrink:0}}/>
        </Card>
      )}

      {today&&(
        <div style={{background:`linear-gradient(120deg,${TEAL} 0%, ${ACCENT} 65%, ${ACCENT_DARK} 100%)`,borderRadius:18,padding:"16px 18px",color:"#fff",marginBottom:16,boxShadow:SHADOW.accent,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-30,right:-30,width:110,height:110,borderRadius:"50%",background:"rgba(255,255,255,0.07)"}}/>
          <div style={{position:"relative",minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{fontSize:13,opacity:0.8,fontWeight:600,letterSpacing:"0.03em",textTransform:"uppercase"}}>{today.chapters?.title||today.chapter_title||""}</div>
              {/* NEW — was previously impossible to change; this is the fix. */}
              {lessons.length>1&&(
                <button className="ss-btn" onClick={()=>setPickingToday((v)=>!v)} style={{background:"rgba(255,255,255,0.16)",border:"none",color:"#fff",borderRadius:8,padding:"4px 9px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>बदल्नुहोस्</button>
              )}
            </div>
            <div style={{fontSize:19.5,fontWeight:800,margin:"2px 0 12px",letterSpacing:"-0.01em",overflowWrap:"break-word"}}>{today.title}</div>
            {pickingToday?(
              <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:8,marginBottom:4,maxHeight:220,overflowY:"auto",boxShadow:SHADOW.lg}}>
                {lessons.map((l)=>(
                  <div key={l.id} onClick={()=>chooseToday(l)} style={{padding:"9px 10px",borderRadius:8,cursor:"pointer",background:l.id===today.id?ACCENT_LIGHT:"transparent"}}>
                    <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600}}>{l.chapters?.title||l.chapter_title||""}</div>
                    <div style={{fontSize:15.5,color:INK,fontWeight:700}}>{l.title}</div>
                  </div>
                ))}
              </div>
            ):(
              <Button variant="marigold" size="sm" icon={Sparkles} onClick={()=>onOpenLesson(today)}>आजको पाठ सुरु</Button>
            )}
          </div>
        </div>
      )}

      <Card style={{marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(160deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOW.accent}}><Wand2 size={18} color="#fff"/></div>
          <div style={{fontWeight:800,fontSize:18,color:INK}}>कक्षा तयार गर्नुहोस्</div>
        </div>
        <div style={{fontSize:15,color:INK_SOFT,marginBottom:12,lineHeight:1.5}}>अध्याय छान्नुहोस् — तपाईंले अपलोड गरेको पाठ योजना र सामग्री (जस्तै PPT) प्रयोग गरेर प्रश्न, क्रियाकलाप र मूल्याङ्कन एकैचोटि तयार हुनेछ।</div>

        <ChapterPicker value={prepChapter} onChange={setPrepChapter} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् —"/>
        {prepChapter.trim()&&<div style={{marginTop:8}}><ChapterMaterialsList materials={chapterMaterials} onGoMaterials={onGoMaterials}/></div>}

        {prepError&&<ErrorMsg msg={prepError}/>}

        <Button variant="primary" size="lg" icon={preparing?undefined:Zap} disabled={preparing||!prepChapter.trim()} onClick={prepareChapter} style={{width:"100%",marginTop:6}}>
          {preparing?<><Spinner small/> तयार हुँदै...</>:"यो अध्याय तयार गर्नुहोस्"}
        </Button>

        {(preparing||prepResult)&&(
          <div style={{marginTop:14,borderTop:`1px solid ${BORDER}`,paddingTop:8}}>
            {PREP_STEPS.map((s)=><PrepStepRow key={s.id} label={s.label} state={stepState[s.id]||"idle"}/>)}
          </div>
        )}

        {prepResult&&(
          <div style={{marginTop:12,background:ACCENT_LIGHT,borderRadius:12,padding:14}}>
            <div style={{fontWeight:700,color:ACCENT,fontSize:16.5,marginBottom:6}}>"{prepResult.chapter}" तयार भयो ✓</div>
            <div style={{fontSize:15,color:INK,marginBottom:10}}>{prepResult.questions} प्रश्न · {prepResult.activities} क्रियाकलाप{prepResult.rubric?" · मूल्याङ्कन मापदण्ड":""} बनाइयो</div>
            {/* NEW — this flow deliberately never writes the lesson plan
                itself (objectives/sequence), only what's built on top of
                it; without a visible link back to the Planner, that gap
                was easy to miss. Shows whether one already exists for this
                chapter, and jumps straight there either way. */}
            {!prepResult.hasLesson&&(
              <div style={{display:"flex",alignItems:"center",gap:6,fontSize:14.5,color:WARN,marginBottom:10}}><ClipboardList size={14}/>यो अध्यायको पाठ योजना (उद्देश्य/क्रम) अझै बनेको छैन।</div>
            )}
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Button variant="secondary" size="sm" onClick={onGoAITools}>प्रश्न/क्रियाकलाप हेर्नुहोस्</Button>
              <Button variant="secondary" size="sm" onClick={onGoMaterials}>सामग्री हेर्नुहोस्</Button>
              <Button variant="secondary" size="sm" onClick={()=>onGoPlanner(prepResult.chapter)}>{prepResult.hasLesson?"पाठ योजना हेर्नुहोस्":"पाठ योजना बनाउनुहोस्"}</Button>
            </div>
          </div>
        )}
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>
        <StatCard icon={BookOpen} value={chapters?.length||0} label="अध्यायहरू" color={ACCENT} accent onClick={onGoMaterials}/>
        <StatCard icon={FileText} value={materialsCount} label="सामग्री फाइल" color={ROSE} accent onClick={onGoMaterials}/>
        <StatCard icon={CheckCircle2} value={lessons.filter((l)=>l.status==="ready").length} label="तयार पाठ" color={TEAL} accent onClick={onGoPlanner}/>
        <StatCard icon={ListChecks} value={homework.length} label="गृहकार्य" color={VIOLET} accent onClick={onGoHomework}/>
      </div>

      <GetStartedCard chapters={chapters||[]} materialsCount={materialsCount} lessons={lessons} onGoMaterials={onGoMaterials} onGoPlanner={onGoPlanner}/>
    </div>
  );
}

const EMPTY_LESSON_FORM={id:null,title:"",status:"missing",chapter_title:"",objectives:"",vocabulary:"",sequence:"",key_questions:"",activities:"",homework:"",notes:""};

// NEW — turns a saved lesson row back into the editable form shape (the
// reverse of save()'s split/join). This is what makes a lesson plan
// actually editable after creation instead of create-once/view-only.
function lessonToForm(l){
  return{
    id:l.id, title:l.title||"", status:l.status||"missing",
    chapter_title:l.chapters?.title||l.chapter_title||"",
    objectives:(l.objectives||[]).join("\n"),
    vocabulary:(l.vocabulary||[]).join("; "),
    sequence:(l.sequence||[]).join("\n"),
    key_questions:(l.key_questions||[]).join("\n"),
    activities:(l.activities||[]).join("\n"),
    homework:l.homework||"", notes:l.notes||"",
  };
}

function Planner({ onOpenLesson, section, lessons, loading, onRefresh, chapters, onAddChapter, classContext, classLabel, editLessonId, onEditConsumed, prefillChapter, onPrefillConsumed }) {
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(EMPTY_LESSON_FORM);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const [linkedCounts,setLinkedCounts]=useState(null);
  const [showDetails,setShowDetails]=useState(false);
  const isEditing=!!form.id;

  // NEW — opening a lesson for editing can be triggered from outside this
  // screen (the "सम्पादन गर्नुहोस्" button inside a lesson's full-screen
  // view). When that happens App() hands us the lesson's id here; once we
  // find it among the lessons already loaded, we populate the form exactly
  // like clicking "Edit" locally would, then tell App() the trigger has
  // been consumed so it doesn't keep re-firing.
  useEffect(()=>{
    if(!editLessonId)return;
    const l=lessons.find((x)=>x.id===editLessonId);
    if(l){
      setForm(lessonToForm(l));setShowForm(true);setShowDetails(true);
      window.scrollTo({top:0,behavior:"smooth"});
    }
    onEditConsumed?.();
  },[editLessonId,lessons,onEditConsumed]);

  // NEW — arriving from the Dashboard's "chapter prepared" card: open the
  // Planner with that chapter already selected, editing the existing plan
  // if there is one instead of risking a duplicate.
  useEffect(()=>{
    if(!prefillChapter)return;
    const existing=lessons.find((l)=>(l.chapters?.title||l.chapter_title)===prefillChapter);
    if(existing)setForm(lessonToForm(existing));
    else setForm({...EMPTY_LESSON_FORM,chapter_title:prefillChapter});
    setShowForm(true);setShowDetails(true);
    window.scrollTo({top:0,behavior:"smooth"});
    onPrefillConsumed?.();
  },[prefillChapter,lessons,onPrefillConsumed]);

  // NEW — shows live counts of what's already linked to the picked chapter
  // (materials / questions / activities), so a teacher can see at a glance
  // whether this chapter has supporting content elsewhere in the app —
  // this is the "different screens feel connected" fix, made reliable now
  // that chapter_id is always resolved correctly (see resolveChapterId).
  useEffect(()=>{
    let cancelled=false;
    const title=form.chapter_title;
    if(!title||!title.trim()){setLinkedCounts(null);return;}
    (async()=>{
      const chapterId=await db.getChapterIdByTitle(title.trim(),classLabel);
      if(cancelled)return;
      if(!chapterId){setLinkedCounts(null);return;}
      const counts=await getChapterLinkedCounts(chapterId);
      if(!cancelled)setLinkedCounts(counts);
    })();
    return()=>{cancelled=true;};
  },[form.chapter_title,classLabel]);

  const startEdit=(l)=>{setForm(lessonToForm(l));setShowForm(true);setShowDetails(true);};
  const startNew=()=>{setForm(EMPTY_LESSON_FORM);setShowForm(true);setShowDetails(false);};

  // NEW — "make the plan for all the chapters at once": generates and
  // saves a full lesson plan (objectives/vocabulary/sequence/questions/
  // activities/homework) for every chapter that doesn't already have one,
  // one chapter after another (not in parallel — gentler on the free AI
  // quota and lets each one finish cleanly before the next starts).
  // Saved with status "prep" (needs review), not "ready" — AI output
  // should get a look before being treated as classroom-ready, and this
  // makes it obvious which ones still need a read-through.
  const [bulkRunning,setBulkRunning]=useState(false);
  const [bulkProgress,setBulkProgress]=useState(null);
  const [bulkResult,setBulkResult]=useState(null);
  const [bulkConfirming,setBulkConfirming]=useState(false);
  const chaptersMissingLessons=(chapters||[]).filter((c)=>!lessons.some((l)=>(l.chapters?.title||l.chapter_title)===c.title));
  const bulkGenerateAll=async()=>{
    setBulkConfirming(false);
    const targets=chaptersMissingLessons;
    if(!targets.length)return;
    setBulkRunning(true);setBulkResult(null);
    let done=0,failed=[];
    for(const c of targets){
      setBulkProgress({current:done+1,total:targets.length,chapter:c.title});
      try{
        const ctx=await getMaterialContext(c.title,classLabel);
        const result=await gemini.generateLessonPlan(c.title,ctx,classContext);
        if(!result){failed.push(c.title);done++;continue;}
        const chapter_id=await resolveChapterId(c.title,classLabel);
        const payload={
          title:c.title,status:"prep",chapter_title:c.title,chapter_id,
          section_id:section?.id||null,class_label:classLabel,
          objectives:result.objectives||[],vocabulary:result.vocabulary||[],
          sequence:result.sequence||[],key_questions:result.key_questions||[],
          activities:result.activities||[],homework:result.homework||"",notes:result.notes||"",
        };
        const{error:err}=await db.upsertLesson(payload);
        if(err)failed.push(c.title);
      }catch(e){failed.push(c.title);}
      done++;
    }
    setBulkRunning(false);setBulkProgress(null);
    setBulkResult({done:targets.length-failed.length,failed});
    onRefresh();
  };

  const autoGenerate=async()=>{
    const chapter=form.chapter_title||form.title;
    if(!chapter.trim()){setError("पहिले अध्याय वा पाठको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      // NEW: pulls in the global textbook PDF *and* every material tagged to this chapter
      const ctx=await getMaterialContext(chapter,classLabel);
      setMatchedCount(ctx.matchedCount||0);
      const result=await gemini.generateLessonPlan(chapter,ctx,classContext);
      if(result){
        setForm((prev)=>({...prev,
          objectives:(result.objectives||[]).join("\n"),
          vocabulary:(result.vocabulary||[]).join("; "),
          sequence:(result.sequence||[]).join("\n"),
          key_questions:(result.key_questions||[]).join("\n"),
          activities:(result.activities||[]).join("\n"),
          homework:result.homework||prev.homework,
          notes:result.notes||prev.notes,
        }));
      }else setError("AI ले डाटा बनाउन सकेन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.title.trim()){setError("पाठको नाम आवश्यक छ।");return;}
    // NEW — warn before creating a second lesson for a chapter that already
    // has one. Only applies when creating a new lesson (not while editing
    // this same lesson — previously this fired on every re-save of an
    // existing plan because there was no way to tell "editing" from
    // "creating" apart).
    if(!isEditing&&form.chapter_title.trim()){
      const dup=lessons.find((l)=>(l.chapters?.title||l.chapter_title)===form.chapter_title);
      if(dup&&!confirm(`"${form.chapter_title}" का लागि पहिले नै "${dup.title}" भन्ने पाठ बनाइसकिएको छ। फेरि पनि नयाँ पाठ बनाउने?`))return;
    }
    setSaving(true);setError("");
    // FIX — resolve the real chapter_id (not just the typed title) before
    // saving, so this lesson is actually linked to its chapter everywhere
    // else in the app (materials list, AI matching, chapter hub).
    const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
    const payload={...form,chapter_id,section_id:section?.id||null,class_label:classLabel,
      objectives:form.objectives.split("\n").filter(Boolean),
      vocabulary:form.vocabulary.split(";").map((v)=>v.trim()).filter(Boolean),
      sequence:form.sequence.split("\n").filter(Boolean),
      key_questions:form.key_questions.split("\n").filter(Boolean),
      activities:form.activities.split("\n").filter(Boolean),
    };
    if(!isEditing)delete payload.id; // let the database assign a new id for a fresh lesson
    const{error:err}=await db.upsertLesson(payload);
    setSaving(false);
    if(err){setError(err.message);return;}
    setShowForm(false);
    setForm(EMPTY_LESSON_FORM);
    setShowDetails(false);
    onRefresh();
  };

  const deleteLesson=async(id,e)=>{
    e.stopPropagation();
    if(!confirm("यो पाठ मेटाउने?"))return;
    await db.deleteLesson(id);onRefresh();
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>पाठ योजना</div>
        <div style={{display:"flex",gap:8}}>
          {/* NEW — the actual "make the plan for all chapters at once" button. */}
          {chaptersMissingLessons.length>0&&(
            <button className="ss-btn" onClick={()=>setBulkConfirming(true)} disabled={bulkRunning} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${TEAL} 0%, color-mix(in srgb, ${TEAL} 70%, black) 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:bulkRunning?"default":"pointer",boxShadow:`0 6px 16px color-mix(in srgb, ${TEAL} 35%, transparent)`}}><Sparkles size={14}/>सबै अध्याय तयार गर्नुहोस् ({chaptersMissingLessons.length})</button>
          )}
          <button className="ss-btn" onClick={startNew} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={14}/>नयाँ पाठ</button>
        </div>
      </div>
      {bulkConfirming&&(
        <Card style={{marginBottom:14,borderLeft:`4px solid ${TEAL}`}}>
          <div style={{fontWeight:700,fontSize:16.5,marginBottom:6}}>{chaptersMissingLessons.length} वटा अध्यायको पाठ योजना बनाउने?</div>
          <div style={{fontSize:15,color:INK_SOFT,marginBottom:10,lineHeight:1.5}}>{chaptersMissingLessons.map((c)=>c.title).join(" · ")}</div>
          <div style={{fontSize:14.5,color:INK_SOFT,marginBottom:12}}>प्रत्येक अध्यायको लागि छुट्टै AI अनुरोध पठाइने भएकाले केही समय लाग्न सक्छ। बनेपछि "तयारी चाहिने" चिन्हका साथ देखिन्छन् — हेरेर मिलाएपछि मात्र "तयार" बनाउनुहोस्।</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setBulkConfirming(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
            <button className="ss-btn" onClick={bulkGenerateAll} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${TEAL} 0%, color-mix(in srgb, ${TEAL} 70%, black) 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:`0 6px 16px color-mix(in srgb, ${TEAL} 35%, transparent)`}}>सुरु गर्नुहोस्</button>
          </div>
        </Card>
      )}
      {bulkRunning&&(
        <Card style={{marginBottom:14,borderLeft:`4px solid ${TEAL}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Spinner small/>
            <div>
              <div style={{fontWeight:700,fontSize:16}}>तयार गर्दै... ({bulkProgress?.current}/{bulkProgress?.total})</div>
              <div style={{fontSize:15,color:INK_SOFT}}>{bulkProgress?.chapter}</div>
            </div>
          </div>
        </Card>
      )}
      {bulkResult&&(
        <Card style={{marginBottom:14,borderLeft:`4px solid ${bulkResult.failed.length?WARN:ACCENT}`}}>
          <div style={{fontWeight:700,fontSize:16,color:bulkResult.failed.length?WARN:ACCENT}}>✓ {bulkResult.done} वटा पाठ योजना बनियो (तयारी चाहिने)</div>
          {bulkResult.failed.length>0&&<div style={{fontSize:15,color:INK_SOFT,marginTop:4}}>असफल: {bulkResult.failed.join(" · ")}</div>}
        </Card>
      )}
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:17}}>{isEditing?"पाठ सम्पादन गर्नुहोस्":"नयाँ पाठ"}</div>
            {isEditing&&<span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 9px",borderRadius:999,fontWeight:700}}>सम्पादन मोड</span>}
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <div>
              <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>१. पाठको नाम</div>
              {[["title","पाठको नाम *"]].map(([f,p])=>(
                <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              ))}
            </div>
            <div>
              <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>२. अध्याय</div>
              <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् —"/>
              {/* NEW — proof the chapters really are connected across screens:
                  shows what's already linked to this chapter elsewhere in
                  the app, live, as soon as one is picked. */}
              {linkedCounts&&(
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  <span style={{fontSize:13.5,background:SURFACE_2,color:INK_SOFT,padding:"4px 9px",borderRadius:999,fontWeight:700}}>📎 {linkedCounts.materials} सामग्री</span>
                  <span style={{fontSize:13.5,background:SURFACE_2,color:INK_SOFT,padding:"4px 9px",borderRadius:999,fontWeight:700}}>❓ {linkedCounts.questions} प्रश्न</span>
                  <span style={{fontSize:13.5,background:SURFACE_2,color:INK_SOFT,padding:"4px 9px",borderRadius:999,fontWeight:700}}>🎲 {linkedCounts.activities} क्रियाकलाप</span>
                </div>
              )}
            </div>

            {/* NEW — attach materials right here instead of needing a separate
                trip to the Materials tab first. Uses whatever chapter was just
                picked above. */}
            <div>
              <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>३. सामग्री (वैकल्पिक)</div>
              <MaterialsHint count={matchedCount} chapterTitle={form.chapter_title}/>
              <MaterialAttach chapterTitle={form.chapter_title} classLabel={classLabel}/>
            </div>

            <div>
              <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>४. सामग्री तयार गर्नुहोस्</div>
              <AIButton label={generating?"बनाउँदै...":"AI बाट स्वतः बनाउनुहोस्"} onClick={autoGenerate} loading={generating} style={{width:"100%",justifyContent:"center"}}/>
            </div>

            <button className="ss-icon-btn" type="button" onClick={()=>setShowDetails((v)=>!v)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",color:ACCENT,fontWeight:700,fontSize:15,cursor:"pointer",padding:"6px 0",alignSelf:"flex-start"}}>
              {showDetails?<ChevronDown size={15}/>:<ChevronRight size={15}/>}विवरण हेर्नुहोस् / सम्पादन गर्नुहोस् (उद्देश्य, शब्दावली, गृहकार्य...)
            </button>
            {showDetails&&(
              <>
                {[["homework","गृहकार्य"],["notes","नोट"]].map(([f,p])=>(
                  <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                ))}
                {[["objectives","उद्देश्यहरू (प्रत्येक नयाँ लाइनमा)"],["vocabulary","शब्दावली — यसरी लेख्नुहोस्: शब्द: अर्थ; अर्को शब्द: अर्थ"],["sequence","पढाउने क्रम (प्रत्येक नयाँ लाइनमा)"],["key_questions","मुख्य प्रश्नहरू (प्रत्येक नयाँ लाइनमा)"],["activities","क्रियाकलापहरू (प्रत्येक नयाँ लाइनमा)"]].map(([f,p])=>(
                  <textarea key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} rows={3} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
                ))}
              </>
            )}
            <div style={{display:"flex",gap:8}}>
              {["missing","prep","ready"].map((s)=>{const meta=STATUS_META[s];const active=form.status===s;return(
                <button key={s} onClick={()=>setForm({...form,status:s})} style={{flex:1,padding:"8px",borderRadius:10,border:`1.5px solid ${active?meta.color:`color-mix(in srgb, ${meta.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${meta.color} 14%, ${SURFACE})`:SURFACE,cursor:"pointer",boxShadow:active?`0 4px 10px color-mix(in srgb, ${meta.color} 25%, transparent)`:"none"}}><StatusPill status={s}/></button>
              );})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setShowForm(false);setForm(EMPTY_LESSON_FORM);setShowDetails(false);}} className="ss-btn" style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":isEditing?"परिवर्तन सुरक्षित गर्नुहोस्":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:lessons.length===0?<EmptyState icon={ClipboardList} text="कुनै पाठ छैन।"/>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lessons.map((l)=>(
            <Card key={l.id} onClick={()=>onOpenLesson(l)} accentColor={STATUS_META[l.status]?.color||STATUS_META.prep.color} style={{paddingTop:20,position:"relative",overflow:"visible"}}>
              <PinBadge color={STATUS_META[l.status]?.color||STATUS_META.prep.color}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,color:INK_SOFT,fontWeight:600,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.chapters?.title||l.chapter_title||""}</div>
                  <div style={{fontSize:17.5,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.title}</div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                  <StatusPill status={l.status}/>
                  {/* NEW — one-click edit and one-click "print the whole plan"
                      right from the list, no need to open the lesson first. */}
                  <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();startEdit(l);}} title="सम्पादन गर्नुहोस्" style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,padding:4}}><PenSquare size={15}/></button>
                  <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();onOpenLesson(l,{autoPrint:true});}} title="पूरा पाठ योजना प्रिन्ट गर्नुहोस्" style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,padding:4}}><Printer size={15}/></button>
                  <button className="ss-icon-btn" onClick={(e)=>deleteLesson(l.id,e)} title="मेटाउनुहोस्" style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,padding:4}}><Trash2 size={15}/></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryPicker({ value, onChange }) {
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:7}}>
      {CATEGORY_ORDER.map((key)=>{
        const meta=CATEGORY_META[key];const Icon=meta.icon;const active=value===key;
        return(
          <button key={key} type="button" onClick={()=>onChange(key)} className="ss-chip" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"12px 6px",borderRadius:14,border:`1.5px solid ${active?meta.color:`color-mix(in srgb, ${meta.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${meta.color} 14%, ${SURFACE})`:SURFACE,color:active?meta.color:INK,fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:active?`0 6px 16px color-mix(in srgb, ${meta.color} 30%, transparent)`:SHADOW.sm}}>
            <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={18} color="#fff"/></div>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

function Materials({ chapters, onAddChapter, onChaptersChanged, classLabel }) {
  const [materials,setMaterials]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [query,setQuery]=useState("");
  const [preview,setPreview]=useState(null);
  const [previewUrl,setPreviewUrl]=useState("");
  const [previewError,setPreviewError]=useState("");
  const [error,setError]=useState("");
  const [syncing,setSyncing]=useState(false);
  const [uploadChapter,setUploadChapter]=useState("");
  const [uploadCategory,setUploadCategory]=useState("lesson_plan");
  const [tagging,setTagging]=useState(null);
  const [tagValue,setTagValue]=useState("");
  const [tagCategory,setTagCategory]=useState("other");
  const [retagging,setRetagging]=useState(false);
  const [categoryFilter,setCategoryFilter]=useState("all");
  // NEW — filtering was category-only; a teacher with many chapters had no
  // way to jump straight to "everything for Chapter 4" without typing its
  // exact name into search. This mirrors the chapter-based browsing the
  // Planner now has, so Materials and Planner pivot around the same
  // concept instead of feeling like separate apps.
  const [chapterFilter,setChapterFilter]=useState("all"); // "all" | "untagged" | chapter id
  const [sortBy,setSortBy]=useState("newest");
  const [showChapterManage,setShowChapterManage]=useState(false);
  const [editingChapterId,setEditingChapterId]=useState(null);
  const [chapterEditValue,setChapterEditValue]=useState("");
  const [chapterBusy,setChapterBusy]=useState(null);
  // NEW — per-chapter counts of lessons/questions/activities, shown inside
  // "अध्याय व्यवस्थापन" so a teacher can see, right from Materials, whether a
  // chapter already has a lesson plan / questions / activities elsewhere in
  // the app — the same cross-screen link the Planner now shows in reverse.
  const [chapterLinks,setChapterLinks]=useState({});
  // NEW — multi-file upload progress ("3 / 7 अपलोड हुँदै"), since the file
  // picker below now accepts several files at once instead of one at a time.
  const [uploadProgress,setUploadProgress]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true);const{data}=await db.getMaterials(classLabel);setMaterials(data||[]);setLoading(false);
  },[classLabel]);
  useEffect(()=>{load();},[load]);

  const sync=async()=>{setSyncing(true);await load();setSyncing(false);};

  // NEW — fetch lesson/question/activity counts for every chapter, once,
  // when the management panel opens (not on every render).
  useEffect(()=>{
    if(!showChapterManage||!chapters?.length)return;
    let cancelled=false;
    (async()=>{
      const entries=await Promise.all(chapters.map(async(c)=>[c.id,await getChapterLinkedCounts(c.id)]));
      if(!cancelled)setChapterLinks(Object.fromEntries(entries));
    })();
    return()=>{cancelled=true;};
  },[showChapterManage,chapters]);

  const addChapterAndRefresh=async(title)=>{
    await onAddChapter(title);
    if(onChaptersChanged) onChaptersChanged();
  };

  // NEW — rename/delete an existing chapter. Chapters were previously
  // add-only (no way to fix a typo or remove a duplicate); this lets a
  // teacher edit the title in place or delete it entirely. Deleting a
  // chapter that still has materials tagged to it clears their tag rather
  // than silently orphaning them, and warns the teacher first.
  const renameChapter=async(chapter)=>{
    const title=chapterEditValue.trim();
    if(!title||title===chapter.title){setEditingChapterId(null);return;}
    setChapterBusy(chapter.id);
    await supabase.from("chapters").update({title}).eq("id",chapter.id);
    setChapterBusy(null);setEditingChapterId(null);
    if(onChaptersChanged) onChaptersChanged();
    load();
  };

  const deleteChapter=async(chapter)=>{
    const count=materials.filter((m)=>m.chapter_id===chapter.id).length;
    const msg=count>0
      ?`"${chapter.title}" मेटाउने? यसमा ट्याग गरिएका ${count} सामग्री फाइल अब कुनै अध्यायमा तोकिने छैनन्।`
      :`"${chapter.title}" मेटाउने?`;
    if(!confirm(msg))return;
    setChapterBusy(chapter.id);
    if(count>0) await supabase.from("materials").update({chapter_id:null}).eq("chapter_id",chapter.id);
    await supabase.from("chapters").delete().eq("id",chapter.id);
    setChapterBusy(null);
    if(onChaptersChanged) onChaptersChanged();
    load();
  };

  // NEW — accepts multiple files in one selection now (see the `multiple`
  // attribute on the file input below) and uploads them one after another,
  // reporting progress, instead of only ever taking files[0] and silently
  // ignoring the rest.
  const upload=async(e)=>{
    const files=Array.from(e.target.files||[]);
    if(!files.length)return;
    if(!uploadChapter.trim()){
      setError("पहिले माथि यो फाइल कुन अध्यायको हो भनी छान्नुहोस्, त्यसपछि फाइल छान्नुहोस्।");
      e.target.value="";
      return;
    }
    setUploading(true);setError("");
    const{data:{user}}=await supabase.auth.getUser();
    // Resolve the chapter once for the whole batch instead of once per file.
    const chapterId=await db.getOrCreateChapterId(uploadChapter.trim(),classLabel);
    const typeMap={pdf:"pdf",pptx:"pptx",ppt:"pptx",doc:"doc",docx:"doc",xlsx:"sheet",xls:"sheet",csv:"sheet",jpg:"image",jpeg:"image",png:"image",mp4:"video",mp3:"audio"};
    let failedNames=[];
    for(let i=0;i<files.length;i++){
      const file=files[i];
      setUploadProgress(files.length>1?{current:i+1,total:files.length,name:file.name}:null);
      const ext=file.name.split(".").pop().toLowerCase();
      const fileType=typeMap[ext]||"doc";
      let extracted_text="", extraction_status="not_needed";
      if(["docx","pptx","xlsx","xls","csv"].includes(ext)){
        const res=await extractTextFromFile(file);
        extracted_text=res.text;extraction_status=res.status;
        if(res.status==="failed") failedNames.push(`${file.name} (टेक्स्ट निकाल्न सकिएन)`);
      }else if(ext==="doc"){
        extraction_status="failed";
        failedNames.push(`${file.name} (.doc समर्थित छैन — .docx बनाएर फेरि पठाउनुहोस्)`);
      }
      const{path,error:upErr}=await db.uploadMaterialFile(file,user.id);
      if(upErr){failedNames.push(`${file.name} (${upErr.message})`);continue;}
      await db.insertMaterial({name:file.name,storage_path:path,file_type:fileType,size_bytes:file.size,tags:[],chapter_id:chapterId,category:uploadCategory,extracted_text,extraction_status,class_label:classLabel});
    }
    if(failedNames.length)setError(failedNames.join(" · "));
    setUploading(false);setUploadProgress(null);load();e.target.value="";
  };

  const deleteMat=async(mat)=>{
    if(!confirm(`"${mat.name}" मेटाउने?`))return;
    await db.deleteMaterial(mat.id,mat.storage_path);load();
  };

  // NEW — PDFs/docs/sheets now skip the in-app iframe/Google-viewer preview
  // entirely and open directly in a new tab. Embedding those in an <iframe>
  // depends on the browser having a native PDF plugin (desktop Chrome has
  // one; most mobile browsers/WebViews don't render it reliably inside an
  // iframe at all), which is what was causing "opens as a download instead
  // of previewing". Direct tab navigation is the one thing every browser —
  // mobile included — handles correctly for these file types.
  //
  // The blank tab is opened SYNCHRONOUSLY, in the same click, before any
  // `await` — opening it after the async URL fetch resolves gets treated as
  // an untrusted popup and silently blocked on many mobile browsers, which
  // is the other classic cause of "I tap it and nothing happens".
  const openPreview=(mat)=>{
    const directOpen=["pdf","doc","pptx","sheet"].includes(mat.file_type);
    const win=directOpen?window.open("","_blank"):null;
    if(!directOpen){setPreview(mat);setPreviewUrl("");setPreviewError("");}
    (async()=>{
      try{
        const url=await Promise.race([
          db.getMaterialUrl(mat.storage_path),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),12000)),
        ]);
        if(!url){
          win?.close();setPreview(mat);setPreviewUrl("");
          setPreviewError("यो फाइलको लिङ्क तयार गर्न सकिएन।");
          return;
        }
        if(directOpen){ if(win)win.location.href=url; else window.open(url,"_blank"); }
        else setPreviewUrl(url);
      }catch(e){
        win?.close();setPreview(mat);setPreviewUrl("");
        setPreviewError(e.message==="timeout"?"लिङ्क तयार गर्न धेरै समय लाग्यो। फेरि प्रयास गर्नुहोस्।":"लिङ्क तयार गर्दा त्रुटि भयो। फेरि प्रयास गर्नुहोस्।");
      }
    })();
  };

  // NEW: tag (or re-tag) an already-uploaded material's chapter + category.
  // If it's a docx/pptx/xlsx uploaded before this feature existed and has
  // no extracted_text yet, re-download it and extract now.
  const openTagEditor=(mat)=>{
    setTagging(mat);setTagValue(mat.chapters?.title||"");setTagCategory(mat.category||"other");setTagError("");
  };

  const [tagError,setTagError]=useState("");
  const saveTag=async()=>{
    if(!tagging||!tagValue.trim())return;
    setRetagging(true);setTagError("");
    try{
      const chapterId=await db.getOrCreateChapterId(tagValue.trim(),classLabel);
      let patch={chapter_id:chapterId, category:tagCategory, class_label:classLabel};
      const ext=tagging.name.split(".").pop().toLowerCase();
      if(!tagging.extracted_text && ["docx","pptx","xlsx","xls","csv"].includes(ext)){
        try{
          const blob=await db.downloadMaterialFile(tagging.storage_path);
          const file=new File([blob],tagging.name);
          const res=await extractTextFromFile(file);
          patch.extracted_text=res.text;patch.extraction_status=res.status;
        }catch(e){patch.extraction_status="failed";}
      }
      const{error:err}=await db.updateMaterial(tagging.id,patch);
      if(err)throw err;
      setRetagging(false);setTagging(null);load();
    }catch(e){
      // FIX — this used to have no error handling at all: if anything
      // above threw, retagging stayed stuck at "true" forever (button
      // permanently disabled) and the modal never closed or showed why —
      // it just sat there looking unresponsive.
      setRetagging(false);setTagError(e.message||"त्रुटि भयो। फेरि प्रयास गर्नुहोस्।");
    }
  };

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    let list=materials;
    if(categoryFilter!=="all") list=list.filter((m)=>(m.category||"other")===categoryFilter);
    if(chapterFilter==="untagged") list=list.filter((m)=>!m.chapter_id);
    else if(chapterFilter!=="all") list=list.filter((m)=>m.chapter_id===chapterFilter);
    if(q) list=list.filter((m)=>m.name.toLowerCase().includes(q));
    list=[...list].sort((a,b)=>{
      if(sortBy==="name") return a.name.localeCompare(b.name);
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
    return list;
  },[materials,query,categoryFilter,chapterFilter,sortBy]);

  const untaggedCount=materials.filter((m)=>!m.chapters?.title).length;
  const categoryCounts=useMemo(()=>{
    const counts={};
    CATEGORY_ORDER.forEach((k)=>{counts[k]=0;});
    materials.forEach((m)=>{const k=m.category||"other";counts[k]=(counts[k]||0)+1;});
    return counts;
  },[materials]);

  return(
    <div style={{padding:"18px 18px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:22,fontWeight:800,color:INK,letterSpacing:"-0.01em"}}>सामग्री पुस्तकालय</div>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={sync} disabled={syncing}>{syncing?"...":"सिंक"}</Button>
      </div>
      {error&&<ErrorMsg msg={error}/>}
      {untaggedCount>0&&(
        <div onClick={()=>setChapterFilter("untagged")} style={{background:WARN_BG,borderRadius:12,padding:"11px 16px",fontSize:16,color:WARN,margin:"12px 0",display:"flex",alignItems:"center",gap:8,fontWeight:600,cursor:"pointer"}}>
          <Tag size={15}/>{untaggedCount} फाइलमा अध्याय तोकिएको छैन — AI ले ती फाइल प्रयोग गर्न सक्दैन। हेर्न यहाँ थिच्नुहोस्।
        </div>
      )}

      <Card style={{marginBottom:16,marginTop:12}}>
        <div style={{fontSize:16.5,fontWeight:700,color:INK,marginBottom:10}}>नयाँ फाइल थप्नुहोस्</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.03em"}}>यो फाइल कस्तो प्रकारको हो?</div>
            <CategoryPicker value={uploadCategory} onChange={setUploadCategory}/>
          </div>
          <ChapterPicker value={uploadChapter} onChange={setUploadChapter} chapters={chapters||[]} onAddChapter={addChapterAndRefresh} placeholder="यो फाइल कुन अध्यायको हो? *"/>
          <label className="ss-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:uploadChapter.trim()?`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:SURFACE_2,color:uploadChapter.trim()?"#fff":INK_SOFT,border:uploadChapter.trim()?"none":`1.5px solid ${BORDER}`,borderRadius:12,padding:"13px",fontSize:16.5,fontWeight:700,cursor:uploadChapter.trim()?"pointer":"not-allowed",boxShadow:uploadChapter.trim()?SHADOW.accent:"none"}}>
            <Plus size={16}/>{uploading?(uploadProgress?`अपलोड हुँदै... (${uploadProgress.current}/${uploadProgress.total})`:"अपलोड र प्रशोधन गर्दै..."):"फाइल(हरू) छान्नुहोस्"}
            <input type="file" multiple onChange={upload} disabled={!uploadChapter.trim()||uploading} style={{display:"none"}} accept=".pdf,.pptx,.ppt,.doc,.docx,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.mp4,.mp3"/>
          </label>
          <div style={{fontSize:15,color:INK_SOFT}}>एकैचोटि धेरै फाइल छान्न मिल्छ — सबै यही अध्याय र प्रकारमा थपिनेछन्। PDF/तस्बिर सिधै AI लाई देखाइन्छ। Word/PowerPoint/Excel बाट टेक्स्ट स्वतः निकालिन्छ।</div>
        </div>
      </Card>

      <Card style={{marginBottom:16}}>
        <div onClick={()=>setShowChapterManage((v)=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <BookOpen size={17} color={ACCENT}/>
            <div style={{fontSize:16.5,fontWeight:700,color:INK}}>अध्याय व्यवस्थापन ({(chapters||[]).length})</div>
          </div>
          <ChevronDown size={18} color={INK_SOFT} style={{transform:showChapterManage?"rotate(180deg)":"none",transition:"transform 0.15s"}}/>
        </div>
        {showChapterManage&&(
          <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
            {(chapters||[]).length===0&&<div style={{fontSize:15,color:INK_SOFT,padding:"8px 2px"}}>अझै कुनै अध्याय थपिएको छैन।</div>}
            {(chapters||[]).map((c)=>(
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,background:SURFACE_2,borderRadius:10,padding:"8px 10px"}}>
                {editingChapterId===c.id?(
                  <>
                    <input autoFocus value={chapterEditValue} onChange={(e)=>setChapterEditValue(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&renameChapter(c)} className="ss-field" style={{flex:1,minWidth:0,borderRadius:8,padding:"7px 10px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE}}/>
                    <button className="ss-btn" onClick={()=>renameChapter(c)} disabled={chapterBusy===c.id} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:8,padding:"7px 11px",fontWeight:700,fontSize:14.5,cursor:"pointer",flexShrink:0,boxShadow:SHADOW.accent}}>✓</button>
                    <button className="ss-icon-btn" onClick={()=>setEditingChapterId(null)} style={{background:"none",border:"none",color:INK_SOFT,fontSize:14.5,cursor:"pointer",flexShrink:0}}>✕</button>
                  </>
                ):(
                  <>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:15.5,color:INK,fontWeight:600}}>{c.title}</div>
                      {chapterLinks[c.id]&&(
                        <div style={{fontSize:12.5,color:INK_SOFT,marginTop:2}}>📎{chapterLinks[c.id].materials} ❓{chapterLinks[c.id].questions} 🎲{chapterLinks[c.id].activities}</div>
                      )}
                    </div>
                    <button className="ss-icon-btn" onClick={()=>{setChapterFilter(c.id);setShowChapterManage(false);}} disabled={chapterBusy===c.id} style={{background:"none",border:"none",color:INK_SOFT,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="यो अध्यायका फाइल हेर्नुहोस्"><Search size={15}/></button>
                    <button className="ss-icon-btn" onClick={()=>{setEditingChapterId(c.id);setChapterEditValue(c.title);}} disabled={chapterBusy===c.id} style={{background:"none",border:"none",color:INK_SOFT,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="नाम बदल्नुहोस्"><PenSquare size={15}/></button>
                    <button className="ss-icon-btn" onClick={()=>deleteChapter(c)} disabled={chapterBusy===c.id} style={{background:"none",border:"none",color:DANGER,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="मेटाउनुहोस्"><Trash2 size={15}/></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:12,paddingBottom:2}}>
        <button onClick={()=>setCategoryFilter("all")} className="ss-chip" style={{padding:"8px 14px",borderRadius:999,background:categoryFilter==="all"?ACCENT:SURFACE,color:categoryFilter==="all"?"#fff":INK,fontWeight:700,fontSize:16,whiteSpace:"nowrap",cursor:"pointer",border:`1.5px solid ${categoryFilter==="all"?ACCENT:BORDER}`,boxShadow:categoryFilter==="all"?SHADOW.sm:"none"}}>सबै ({materials.length})</button>
        {CATEGORY_ORDER.map((key)=>{
          const meta=CATEGORY_META[key];const Icon=meta.icon;const active=categoryFilter===key;
          return(
            <button key={key} onClick={()=>setCategoryFilter(key)} className="ss-chip" style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:999,background:active?meta.color:SURFACE,color:active?"#fff":INK,fontWeight:700,fontSize:16,whiteSpace:"nowrap",cursor:"pointer",border:`1.5px solid ${active?meta.color:BORDER}`,boxShadow:active?SHADOW.sm:"none"}}><Icon size={13}/>{meta.label} ({categoryCounts[key]||0})</button>
          );
        })}
      </div>

      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 14px"}}>
          <Search size={16} color={INK_SOFT}/>
          <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="फाइल खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:16.5,flex:1,minWidth:0,background:"transparent",color:INK,caretColor:ACCENT,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}/>
        </div>
        {/* NEW — browse materials by chapter, same concept the Planner now
            uses, instead of only being able to filter by file category. */}
        <select value={chapterFilter} onChange={(e)=>setChapterFilter(e.target.value)} style={{border:`1px solid ${chapterFilter!=="all"?ACCENT:BORDER}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif",background:chapterFilter!=="all"?ACCENT_LIGHT:SURFACE,color:chapterFilter!=="all"?ACCENT:INK,fontWeight:600}}>
          <option value="all">सबै अध्याय</option>
          <option value="untagged">अध्याय नतोकिएका</option>
          {(chapters||[]).map((c)=><option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} style={{border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif",background:SURFACE,color:INK,fontWeight:600}}>
          <option value="newest">नयाँ पहिले</option>
          <option value="name">नाम अनुसार (क-ज्ञ)</option>
        </select>
      </div>

      {loading?<Spinner/>:filtered.length===0?(
        <EmptyState icon={FileText} text={query?`"${query}" फेला परेन।`:chapterFilter!=="all"?"यो फिल्टरमा कुनै फाइल छैन।":"यो श्रेणीमा फाइल थपिएको छैन।"}/>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
          {filtered.map((f)=>{
            const meta=FILE_TYPE_META[f.file_type]||FILE_TYPE_META.doc;const Icon=meta.icon;
            const catMeta=CATEGORY_META[f.category||"other"];const CatIcon=catMeta.icon;
            const needsExtraction=["doc","sheet","pptx"].includes(f.file_type);
            return(
              <Card key={f.id} accentColor={catMeta.color} style={{padding:14,paddingTop:46,position:"relative",overflow:"visible"}}>
                <PinBadge color={catMeta.color}/>
                <div style={{position:"absolute",top:6,right:6,display:"flex",gap:2,zIndex:2}}>
                  <button className="ss-btn" onClick={()=>openTagEditor(f)} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:f.chapters?.title?ACCENT:"#C7A34A",boxShadow:SHADOW.sm}} title="अध्याय/प्रकार तोक्नुहोस्"><Tag size={18}/></button>
                  <button className="ss-btn" onClick={()=>deleteMat(f)} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK_SOFT,boxShadow:SHADOW.sm}}><Trash2 size={18}/></button>
                </div>
                {/* FIX — onClick now lives only on this inner block, not on
                    the Card. The tag/delete buttons above are a sibling
                    with no shared clickable ancestor, so tapping them can
                    never also trigger the preview modal — no reliance on
                    stopPropagation timing at all. */}
                <div onClick={()=>openPreview(f)} style={{cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                    <div style={{width:40,height:40,borderRadius:11,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={19} color="#fff"/></div>
                    <div style={{fontSize:13.5,background:tint(catMeta.color,15),color:catMeta.color,padding:"3px 9px",borderRadius:999,fontWeight:700,display:"flex",alignItems:"center",gap:4,border:`1px solid color-mix(in srgb, ${catMeta.color} 30%, transparent)`}}><CatIcon size={11}/>{catMeta.label}</div>
                  </div>
                  <div style={{fontSize:16,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{f.name}</div>
                  <div style={{fontSize:14,color:INK_SOFT,marginBottom:6,fontWeight:600}}>{f.file_type?.toUpperCase()}</div>
                  {f.chapters?.title?(
                    <span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}}>{f.chapters.title}</span>
                  ):(
                    <span style={{fontSize:13.5,background:WARN_BG,color:WARN,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block"}}>अध्याय छैन</span>
                  )}
                  {needsExtraction&&f.extraction_status==="done"&&<div style={{fontSize:13.5,color:ACCENT,marginTop:5,fontWeight:700}}>✓ AI तयार</div>}
                  {needsExtraction&&f.extraction_status==="failed"&&<div style={{fontSize:13.5,color:DANGER,marginTop:5,fontWeight:700}}>⚠ टेक्स्ट निकाल्न सकिएन</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {preview&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPreview(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:20,maxWidth:640,width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:18,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:10}}>{preview.name}</div>
              <button className="ss-icon-btn" onClick={()=>setPreview(null)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,flexShrink:0}}><X size={20}/></button>
            </div>
            {!previewUrl&&!previewError?(
              <div style={{textAlign:"center",padding:20,color:INK_SOFT,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}><Spinner small/>लिङ्क तयार गर्दै...</div>
            ):previewError?(
              <div style={{textAlign:"center",padding:20,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <AlertCircle size={28} color={DANGER}/>
                <div style={{color:DANGER,fontSize:16,fontWeight:600}}>{previewError}</div>
                <button className="ss-btn" onClick={()=>openPreview(preview)} style={{display:"flex",alignItems:"center",gap:6,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:SHADOW.accent}}><RotateCw size={14}/>फेरि प्रयास गर्नुहोस्</button>
              </div>
            ):(
              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
                {preview.file_type==="image"&&(
                  <img src={previewUrl} alt={preview.name} style={{width:"100%",borderRadius:12}}/>
                )}
                {preview.file_type==="video"&&(
                  <video src={previewUrl} controls style={{width:"100%",borderRadius:12}}/>
                )}
                {preview.file_type==="audio"&&(
                  <audio src={previewUrl} controls style={{width:"100%"}}/>
                )}
                <Button variant="primary" onClick={()=>window.open(previewUrl,"_blank")} style={{width:"100%"}}>नयाँ ट्याबमा खोल्नुहोस् / डाउनलोड गर्नुहोस्</Button>
              </div>
            )}
          </div>
        </div>
      )}
      {tagging&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:65,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setTagging(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:24,maxWidth:420,width:"100%",maxHeight:"85vh",overflowY:"auto",WebkitOverflowScrolling:"touch",boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:18,fontWeight:700}}>अध्याय र प्रकार तोक्नुहोस्</div>
              <button className="ss-icon-btn" onClick={()=>setTagging(null)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={20}/></button>
            </div>
            <div style={{fontSize:16,color:INK_SOFT,marginBottom:14}}>{tagging.name}</div>
            {tagError&&<ErrorMsg msg={tagError}/>}
            <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.03em"}}>प्रकार</div>
            <CategoryPicker value={tagCategory} onChange={setTagCategory}/>
            <div style={{height:14}}/>
            <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.03em"}}>अध्याय</div>
            <ChapterPicker value={tagValue} onChange={setTagValue} chapters={chapters||[]} onAddChapter={addChapterAndRefresh} placeholder="— अध्याय छान्नुहोस् —"/>
            <div style={{height:16}}/>
            <Button variant="primary" onClick={saveTag} disabled={retagging} style={{width:"100%"}}>{retagging?"प्रशोधन गर्दै...":"सुरक्षित गर्नुहोस्"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeworkManager({ section, loading, homework, onRefresh }) {
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",total_students:30,remark:""});
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);
    await db.upsertHomework({...form,section_id:section?.id||null,checked_count:0});
    setSaving(false);setShowForm(false);setForm({title:"",total_students:30,remark:""});onRefresh();
  };
  const bump=async(hw,delta)=>{
    await db.upsertHomework({...hw,checked_count:Math.max(0,Math.min(hw.total_students,hw.checked_count+delta))});onRefresh();
  };
  const deleteHw=async(hw)=>{
    if(!confirm(`"${hw.title}" मेटाउने?`))return;
    await supabase.from("homework").delete().eq("id",hw.id);onRefresh();
  };
  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>गृहकार्य</div>
        <button className="ss-btn" onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input placeholder="गृहकार्यको शीर्षक" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <input type="number" placeholder="कुल विद्यार्थी" value={form.total_students} onChange={(e)=>setForm({...form,total_students:parseInt(e.target.value)||0})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <textarea placeholder="टिप्पणी" value={form.remark} onChange={(e)=>setForm({...form,remark:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:homework.length===0?<EmptyState icon={ListChecks} text="कुनै गृहकार्य छैन।"/>:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {homework.map((h)=>{
            const pct=h.total_students>0?Math.round((h.checked_count/h.total_students)*100):0;
            const done=h.checked_count>=h.total_students;
            return(
              <Card key={h.id} accentColor={done?ACCENT:MARIGOLD} style={{paddingTop:20,position:"relative",overflow:"visible"}}>
                <PinBadge color={done?ACCENT:MARIGOLD}/>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:17,fontWeight:700,color:INK}}>{h.title}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <span style={{fontSize:15,fontWeight:700,color:done?ACCENT:WARN,background:done?ACCENT_LIGHT:WARN_BG,padding:"3px 8px",borderRadius:999}}>{h.checked_count}/{h.total_students}</span>
                    <button className="ss-icon-btn" onClick={()=>deleteHw(h)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><Trash2 size={14}/></button>
                  </div>
                </div>
                <div style={{height:6,background:BORDER,borderRadius:99,marginBottom:10}}>
                  <div style={{height:6,width:`${pct}%`,background:done?ACCENT:MARIGOLD,borderRadius:99}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button className="ss-btn" onClick={()=>bump(h,-1)} style={{width:34,height:34,borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontSize:18.5,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{fontSize:16,color:INK_SOFT,fontWeight:600,flex:1}}>जाँच गर्नुहोस्</div>
                  <button className="ss-btn" onClick={()=>bump(h,1)} style={{width:34,height:34,borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontSize:18.5,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>+</button>
                </div>
                {h.remark&&<div style={{marginTop:10,background:SURFACE_2,borderRadius:8,padding:"8px 10px",fontSize:16,color:INK_SOFT}}>{h.remark}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeachingJournal({ lessons }) {
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({lesson_id:"",taught:"",difficulty:"",idea:"",mood:"good"});
  const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getJournalEntries();setEntries(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);
  const save=async()=>{
    if(!form.taught.trim()&&!form.difficulty.trim()&&!form.idea.trim())return;
    // FIX — the old "आजको पाठ" field was free-typed text that never
    // actually got saved (upsertJournalEntry silently dropped it — the
    // table links to a real lesson via lesson_id, which the form never
    // set). Every entry is now tied to an actual lesson plan, or left
    // unlinked on purpose if there's no matching lesson yet — either way
    // nothing typed here disappears anymore.
    setSaving(true);
    await db.upsertJournalEntry({lesson_id:form.lesson_id||null,taught:form.taught,difficulty:form.difficulty,idea:form.idea,mood:form.mood});
    setSaving(false);setShowForm(false);setForm({lesson_id:"",taught:"",difficulty:"",idea:"",mood:"good"});load();
  };
  return(
    <div style={{padding:"20px 20px 130px",maxWidth:820,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><Heart size={20} color={ACCENT}/>डायरी</div>
        {!showForm&&<button className="ss-btn" onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={14}/>थप</button>}
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div>
              <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:4}}>आजको पाठ (वैकल्पिक)</div>
              {(lessons||[]).length===0?(
                <div style={{fontSize:15,color:INK_SOFT,background:SURFACE_2,borderRadius:10,padding:"9px 12px"}}>अझै कुनै पाठ योजना बनाइएको छैन — पाठ योजनामा एउटा थपेपछि यहाँ छान्न सकिन्छ।</div>
              ):(
                <select value={form.lesson_id} onChange={(e)=>setForm({...form,lesson_id:e.target.value})} style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}>
                  <option value="">— कुनै पाठसँग नजोडी —</option>
                  {lessons.map((l)=><option key={l.id} value={l.id}>{l.chapters?.title||l.chapter_title?`${l.chapters?.title||l.chapter_title} — `:""}{l.title}</option>)}
                </select>
              )}
            </div>
            <textarea placeholder="के पढाइयो?" value={form.taught} onChange={(e)=>setForm({...form,taught:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <textarea placeholder="के गाह्रो भयो?" value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <textarea placeholder="अर्को पटककालागि सुझाव" value={form.idea} onChange={(e)=>setForm({...form,idea:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(MOOD_META).map(([key,m])=>{const Icon=m.icon;const active=form.mood===key;return(
                <button key={key} onClick={()=>setForm({...form,mood:key})} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"7px 8px",borderRadius:11,border:`1.5px solid ${active?m.color:`color-mix(in srgb, ${m.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${m.color} 14%, ${SURFACE})`:SURFACE,color:active?m.color:INK,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:active?`0 4px 10px color-mix(in srgb, ${m.color} 30%, transparent)`:"none"}}>
                  <div style={{width:22,height:22,borderRadius:7,background:`linear-gradient(160deg, ${m.color} 0%, color-mix(in srgb, ${m.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={11} color="#fff"/></div>
                  {m.label}
                </button>
              );})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:entries.length===0?<EmptyState icon={Heart} text="कुनै प्रविष्टि छैन।"/>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {entries.map((e)=>{const mood=MOOD_META[e.mood]||MOOD_META.okay;const MIcon=mood.icon;return(
            <Card key={e.id} accentColor={mood.color} style={{paddingTop:20,position:"relative",overflow:"visible"}}>
              <PinBadge color={mood.color}/>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:16.5,fontWeight:700,color:INK}}>{e.lessons?.title||e.entry_date}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,background:tint(mood.color,15),color:mood.color,padding:"3px 9px",borderRadius:999,fontSize:14.5,fontWeight:700}}><MIcon size={12}/>{mood.label}</div>
              </div>
              {e.taught&&<div style={{fontSize:16,color:INK,marginBottom:5}}><strong>के पढाइयो:</strong> {e.taught}</div>}
              {e.difficulty&&<div style={{fontSize:16,color:INK_SOFT,marginBottom:5}}><strong>गाह्रो:</strong> {e.difficulty}</div>}
              {e.idea&&<div style={{background:WARN_BG,borderRadius:8,padding:"7px 10px",fontSize:16,color:MARIGOLD_DARK}}>💡 {e.idea}</div>}
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

function AIAssistant({ lessons, classContext, classLabel }) {
  // FIX — this used to hard-pick lessons[0] with no way to change it, so
  // the assistant could silently be answering about the wrong chapter with
  // no indication why. A visible picker replaces the blind guess.
  const [lessonId,setLessonId]=useState(lessons[0]?.id||"");
  const lesson=lessons.find((l)=>l.id===lessonId)||null;
  const chapterTitle=lesson?.chapters?.title||lesson?.chapter_title||"";
  const [messages,setMessages]=useState([{role:"ai",text:lesson?`नमस्ते! म "${lesson.title}" पाठ, ट्याग गरिएका सामग्री, र पाठ्यपुस्तकबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस्।`:"नमस्ते! पहिले पाठ योजनामा एउटा पाठ थप्नुहोस्।"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [matchedCount,setMatchedCount]=useState(0);
  const bottomRef=useRef(null);
  const QUICK=["आजको पाठ बुझाउनुहोस्","उद्देश्यहरू देखाउनुहोस्","मुख्य प्रश्नहरू दिनुहोस्","क्रियाकलाप सुझाव दिनुहोस्","गृहकार्य के दिने?","शब्दावली सूची देखाउनुहोस्","मूल्याङ्कन कसरी गर्ने?"];
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  // NEW — switching lessons mid-conversation resets the chat with a fresh
  // greeting for the newly-picked lesson, so old answers about a different
  // chapter don't linger and get mistaken for being about the new one.
  useEffect(()=>{
    setMessages([{role:"ai",text:lesson?`नमस्ते! म "${lesson.title}" पाठ, ट्याग गरिएका सामग्री, र पाठ्यपुस्तकबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस्।`:"नमस्ते! पहिले पाठ योजनामा एउटा पाठ थप्नुहोस्।"}]);
  },[lessonId]);
  useEffect(()=>{
    if(chapterTitle){
      db.getChapterIdByTitle(chapterTitle,classLabel).then((id)=>{
        if(!id)return setMatchedCount(0);
        db.getMaterialsByChapter(id).then(({data})=>setMatchedCount((data||[]).length));
      });
    }
  },[chapterTitle,classLabel]);
  const send=async(text)=>{
    const t=text.trim();if(!t||loading)return;
    setMessages((prev)=>[...prev,{role:"user",text:t}]);setInput("");setLoading(true);
    try{
      const context=lesson?`पाठ: ${lesson.title}\nअध्याय: ${lesson.chapters?.title||lesson.chapter_title||""}\nउद्देश्य: ${(lesson.objectives||[]).join(", ")}\nशब्दावली: ${(lesson.vocabulary||[]).join(", ")}\nक्रियाकलाप: ${(lesson.activities||[]).join(", ")}\nगृहकार्य: ${lesson.homework||""}`: "कुनै पाठ छैन।";
      // NEW: pull in materials tagged to this lesson's chapter, alongside the global textbook
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      const reply=await gemini.chatWithAI(t,context,ctx,classContext);
      setMessages((prev)=>[...prev,{role:"ai",text:reply}]);
    }catch(e){setMessages((prev)=>[...prev,{role:"ai",text:"AI सँग जोडिन सकिएन: "+e.message}]);}
    setLoading(false);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 170px)",maxWidth:720,margin:"0 auto",width:"100%"}}>
      <div style={{padding:"14px 16px 8px"}}>
        <div style={{fontSize:19,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><Bot size={20} color={ACCENT}/>AI शिक्षण सहायक</div>
        {lessons.length>0&&(
          <select value={lessonId} onChange={(e)=>setLessonId(e.target.value)} style={{marginTop:6,width:"100%",borderRadius:10,padding:"8px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,fontWeight:600,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}>
            {lessons.map((l)=><option key={l.id} value={l.id}>{l.chapters?.title||l.chapter_title?`${l.chapters?.title||l.chapter_title} — `:""}{l.title}</option>)}
          </select>
        )}
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:15,color:INK_SOFT,marginTop:6,flexWrap:"wrap"}}>
          <Zap size={11} color={MARIGOLD}/>Google Gemini AI · {getTextbookPDF()?"पाठ्यपुस्तक लोड भएको ✓":"पाठ्यपुस्तक लोड भएको छैन (सेटिङमा अपलोड गर्नुहोस्)"}
          {chapterTitle&&<span>· "{chapterTitle}" का {matchedCount} सामग्री</span>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 16px",display:"flex",flexDirection:"column"}}>
        {messages.length<=1?(
          // NEW — instead of one greeting bubble sitting at the top of a mostly
          // empty scroll area (the "big empty space" problem), the idle chat
          // fills that space with the quick-prompts as a proper card grid, so
          // the screen has something useful to look at before the user types.
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:14,padding:"6px 2px 18px"}}>
            <div style={{maxWidth:"88%",background:SURFACE,color:INK,border:`1px solid ${BORDER}`,borderRadius:14,padding:"11px 14px",fontSize:16.5,lineHeight:1.6,boxShadow:SHADOW.raised}}>{messages[0]?.text}</div>
            <div>
              <SectionLabel icon={Zap} color={MARIGOLD_DARK}>छिटो सुरुवात</SectionLabel>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9}}>
                {QUICK.map((q,i)=>{const c=PALETTE[i%PALETTE.length];return(
                  <button key={q} onClick={()=>send(q)} className="ss-btn ss-card-hover" style={{textAlign:"left",background:SURFACE,border:`1px solid ${BORDER}`,borderLeft:`4px solid ${c}`,borderRadius:13,padding:"12px 13px",fontSize:15,fontWeight:600,color:INK,cursor:"pointer",boxShadow:SHADOW.raised,display:"flex",alignItems:"center",gap:8}}>
                    <Zap size={14} color={c} style={{flexShrink:0}}/>{q}
                  </button>
                );})}
              </div>
            </div>
          </div>
        ):(
          <>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
                <div style={{maxWidth:"88%",background:m.role==="user"?`linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:SURFACE,color:m.role==="user"?"#fff":INK,border:m.role==="ai"?`1px solid ${BORDER}`:"none",borderRadius:14,padding:"11px 14px",fontSize:16.5,lineHeight:1.6,whiteSpace:"pre-wrap",boxShadow:m.role==="ai"?SHADOW.sm:SHADOW.accent}}>{m.text}</div>
              </div>
            ))}
            {loading&&<div style={{display:"flex",marginBottom:10}}><div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"11px 14px",color:INK_SOFT,fontSize:16.5}}>सोच्दै छु...</div></div>}
          </>
        )}
        <div ref={bottomRef}/>
      </div>
      {messages.length>1&&(
        <div style={{padding:"8px 16px",display:"flex",gap:7,overflowX:"auto"}}>
          {QUICK.map((q)=><button className="ss-btn" key={q} onClick={()=>send(q)} style={{flexShrink:0,background:WARN_BG,color:MARIGOLD_DARK,border:"none",borderRadius:999,padding:"7px 12px",fontSize:15,fontWeight:600,whiteSpace:"nowrap",cursor:"pointer"}}>{q}</button>)}
        </div>
      )}
      <div style={{display:"flex",gap:8,padding:"8px 16px 16px"}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send(input)} placeholder="आफ्नो प्रश्न लेख्नुहोस्..." style={{flex:1,minWidth:0,border:`1px solid ${BORDER}`,borderRadius:999,padding:"12px 16px",fontSize:16.5,outline:"none",background:SURFACE_2,color:INK,caretColor:ACCENT,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}/>
        <button className="ss-btn" onClick={()=>send(input)} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:"50%",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,boxShadow:SHADOW.accent}}><Send size={17}/></button>
      </div>
    </div>
  );
}

function QuestionBank({ chapters, onAddChapter, classContext, classLabel }) {
  const [questions,setQuestions]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [selected,setSelected]=useState([]);
  const [showSet,setShowSet]=useState(false);
  const [saving,setSaving]=useState(false);
  const [query,setQuery]=useState("");
  const [diffFilter,setDiffFilter]=useState("सबै");
  const [form,setForm]=useState({text:"",type:"छोटो उत्तर",difficulty:"सजिलो",bloom:"सम्झना",chapter_title:"",options:"",answer:""});
  const [error,setError]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const TYPES=["छोटो उत्तर","बहुविकल्पीय","सत्य/असत्य","खाली ठाउँ","विश्लेषणात्मक","परिदृश्य आधारित"];
  const DIFFS=["सबै","सजिलो","मध्यम","कठिन"];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getQuestions();setQuestions(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    if(!form.chapter_title.trim()){setError("अध्यायको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const ctx=await getMaterialContext(form.chapter_title,classLabel);
      setMatchedCount(ctx.matchedCount||0);
      const results=await gemini.generateQuestions(form.chapter_title,ctx,classContext);
      if(results?.length){
        // FIX — resolve the real chapter_id once, before the loop, and save
        // it on every generated question. Previously only chapter_title
        // (free text) was saved, so these never actually showed up as
        // "linked" to the chapter anywhere else in the app.
        const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
        for(const q of results)await db.upsertQuestion({text:q.text,type:q.type||"छोटो उत्तर",difficulty:q.difficulty||"सजिलो",bloom_level:q.bloom||"सम्झना",chapter_title:form.chapter_title,chapter_id,options:q.options||[],correct_option:q.correct_option??null});
        load();setShowForm(false);
      }else setError("प्रश्न बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.text.trim()){setError("प्रश्न लेख्नुहोस्।");return;}
    setSaving(true);
    const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
    await db.upsertQuestion({text:form.text,type:form.type,difficulty:form.difficulty,bloom_level:form.bloom,chapter_title:form.chapter_title,chapter_id,options:form.options?form.options.split("\n").filter(Boolean):[],correct_option:form.answer?parseInt(form.answer)-1:null});
    setSaving(false);setShowForm(false);setForm({text:"",type:"छोटो उत्तर",difficulty:"सजिलो",bloom:"सम्झना",chapter_title:"",options:"",answer:""});load();
  };

  const deleteQ=async(id,e)=>{e.stopPropagation();if(!confirm("प्रश्न मेटाउने?"))return;await db.deleteQuestion(id);load();};
  const toggle=(id)=>setSelected((prev)=>prev.includes(id)?prev.filter((x)=>x!==id):[...prev,id]);
  const filtered=useMemo(()=>questions.filter((q)=>(diffFilter==="सबै"||q.difficulty===diffFilter)&&(!query.trim()||q.text.toLowerCase().includes(query.toLowerCase()))),[questions,query,diffFilter]);
  const selectedQs=questions.filter((q)=>selected.includes(q.id));

  return(<>
    <div className={showSet?"no-print":""} style={{padding:"20px 20px 150px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>प्रश्न बैंक</div>
        <button className="ss-btn" onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:16.5}}>प्रश्न थप्नुहोस्</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट प्रश्न बनाउनुहोस्"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <MaterialsHint count={matchedCount} chapterTitle={form.chapter_title}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् (AI का लागि अनिवार्य) —"/>
            <MaterialAttach chapterTitle={form.chapter_title} classLabel={classLabel}/>
            <textarea placeholder="प्रश्न (म्यानुअल)" value={form.text} onChange={(e)=>setForm({...form,text:e.target.value})} rows={3} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <select value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})} className="ss-field" style={{flex:1,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}>{TYPES.map((t)=><option key={t}>{t}</option>)}</select>
              <select value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} className="ss-field" style={{flex:1,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}>{"सजिलो,मध्यम,कठिन".split(",").map((d)=><option key={d}>{d}</option>)}</select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 14px",marginBottom:10}}>
        <Search size={16} color={INK_SOFT}/>
        <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="प्रश्न खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:16.5,flex:1,minWidth:0,background:"transparent",color:INK,caretColor:ACCENT,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}/>
      </div>
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14}}>
        {DIFFS.map((d)=><button key={d} onClick={()=>setDiffFilter(d)} style={{padding:"6px 12px",borderRadius:999,background:diffFilter===d?ACCENT:SURFACE,color:diffFilter===d?"#fff":INK,fontWeight:600,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(diffFilter===d?ACCENT:BORDER)}}>{d}</button>)}
      </div>
      {loading?<Spinner/>:filtered.length===0?<EmptyState icon={HelpCircle} text="कुनै प्रश्न छैन।"/>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map((q)=>{const isSel=selected.includes(q.id);const diffColor=q.difficulty==="सजिलो"?TEAL:q.difficulty==="कठिन"?ROSE:MARIGOLD_DARK;return(
            <Card key={q.id} onClick={()=>toggle(q.id)} accentColor={diffColor} style={{display:"flex",gap:10,paddingTop:24,position:"relative",overflow:"visible"}}>
              <PinBadge color={diffColor}/>
              <div style={{marginTop:2,flexShrink:0,color:isSel?ACCENT:INK_SOFT}}>{isSel?<CheckSquare size={18}/>:<Square size={18}/>}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:5}}>
                  <span style={{fontSize:14,background:ACCENT_LIGHT,color:ACCENT,padding:"2px 7px",borderRadius:5,fontWeight:700}}>{q.type}</span>
                  <span style={{fontSize:14,background:WARN_BG,color:MARIGOLD_DARK,padding:"2px 7px",borderRadius:5,fontWeight:600}}>{q.difficulty}</span>
                  {q.chapter_title&&<span style={{fontSize:14,color:INK_SOFT,fontWeight:600}}>{q.chapter_title}</span>}
                </div>
                <div style={{fontSize:16.5,color:INK,lineHeight:1.5}}>{q.text}</div>
                {q.options?.length>0&&<div style={{marginTop:6}}>{q.options.map((o,i)=><div key={i} style={{fontSize:16,color:i===q.correct_option?ACCENT:INK_SOFT,fontWeight:i===q.correct_option?700:400}}>{i+1}) {o}</div>)}</div>}
              </div>
              <button className="ss-icon-btn" onClick={(e)=>deleteQ(q.id,e)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,flexShrink:0}}><Trash2 size={14}/></button>
            </Card>
          );})}
        </div>
      )}
      {selected.length>0&&(
        <div className="no-print" style={{position:"fixed",bottom:64,left:0,right:0,display:"flex",justifyContent:"center",padding:"0 16px",zIndex:20}}>
          <button className="ss-btn" onClick={()=>setShowSet(true)} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:999,padding:"12px 20px",fontWeight:700,fontSize:16.5,display:"flex",alignItems:"center",gap:8,cursor:"pointer",boxShadow:SHADOW.accent}}><Shuffle size={16}/>{selected.length} प्रश्न — सेट बनाउनुहोस्</button>
        </div>
      )}
    </div>
    {showSet&&(
      <div className="print-area" style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowSet(false)}>
        <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:"18px 18px 0 0",padding:22,maxWidth:600,width:"100%",maxHeight:"80vh",overflowY:"auto"}}>
          <div className="no-print" style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:18,fontWeight:700}}>प्रश्न सेट ({selected.length})</div>
            <button className="ss-icon-btn" onClick={()=>setShowSet(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={20}/></button>
          </div>
          <ol style={{paddingLeft:18,margin:0,display:"flex",flexDirection:"column",gap:10}}>
            {selectedQs.map((q)=><li key={q.id} style={{fontSize:16.5,color:INK,lineHeight:1.5}}>{q.text}</li>)}
          </ol>
          <div className="no-print" style={{display:"flex",gap:8,marginTop:18}}>
            <button className="ss-btn" onClick={async()=>{await db.upsertQuestionSet({title:`सेट — ${new Date().toLocaleDateString("ne-NP")}`,question_ids:selected});setSelected([]);setShowSet(false);}} style={{flex:1,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:12,padding:"12px",fontWeight:700,fontSize:16.5,cursor:"pointer",boxShadow:SHADOW.accent}}>💾 सुरक्षित</button>
            <button className="ss-btn" onClick={()=>window.print()} style={{flex:1,background:`linear-gradient(180deg, #DDB054 0%, ${MARIGOLD} 100%)`,color:"#2A1E07",border:"none",borderRadius:12,padding:"12px",fontWeight:700,fontSize:16.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer",boxShadow:SHADOW.marigold}}><Printer size={16}/>प्रिन्ट</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function AssessmentBuilder({ chapters, onAddChapter, classContext, classLabel }) {
  const [assessments,setAssessments]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [form,setForm]=useState({title:"",type:"observation",rubric_text:"",due_date:"",chapter_title:""});
  const [error,setError]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const [printing,setPrinting]=useState(null);
  const TYPES=[{id:"observation",label:"अवलोकन",icon:ClipboardList},{id:"oral",label:"मौखिक",icon:MessageSquare},{id:"practical",label:"व्यावहारिक",icon:NotebookPen},{id:"project",label:"प्रोजेक्ट",icon:FolderKanban},{id:"activity",label:"क्रियाकलाप",icon:Gamepad2},{id:"portfolio",label:"पोर्टफोलियो",icon:BookOpen}];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getAssessments();setAssessments(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    const chapter=form.chapter_title||form.title;if(!chapter){setError("अध्याय लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const ctx=await getMaterialContext(chapter,classLabel);
      setMatchedCount(ctx.matchedCount||0);
      const prompt=`नेपाल ${classContext} "${chapter}" का लागि ${form.type} मूल्याङ्कन मापदण्ड भएको JSON array मात्र: [{"level":"उत्कृष्ट","desc":"..."},{"level":"राम्रो","desc":"..."},{"level":"सहयोग आवश्यक","desc":"..."}]`;
      const rubric=await gemini.generateRubric(prompt,ctx);
      if(rubric)setForm((prev)=>({...prev,rubric_text:rubric.map((r)=>`${r.level}: ${r.desc}`).join("\n")}));
      else setError("मूल्याङ्कन बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);
    const rubric=form.rubric_text?form.rubric_text.split("\n").filter(Boolean).map((line)=>{const[level,...rest]=line.split(":");return{level:level.trim(),desc:rest.join(":").trim()};}):[];
    // FIX — chapter_title was previously dropped entirely here, so an
    // assessment could never be linked to a chapter at all, even though the
    // form has a chapter picker for it. (Note: unlike Lessons/Questions/
    // Activities, assessments join on `lessons`, not `chapters` — see
    // getAssessments in db.js — so we save chapter_title only, matching the
    // column this table actually has.)
    await db.upsertAssessment({title:form.title,type:form.type,rubric,due_date:form.due_date||null,status:"pending",chapter_title:form.chapter_title});
    setSaving(false);setShowForm(false);setForm({title:"",type:"observation",rubric_text:"",due_date:"",chapter_title:""});load();
  };

  return(<>
    <div className={printing?"no-print":""} style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>मूल्याङ्कन</div>
        <button className="ss-btn" onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:16.5}}>नयाँ मूल्याङ्कन</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट rubric"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <MaterialsHint count={matchedCount} chapterTitle={form.chapter_title}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input placeholder="शीर्षक *" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् (AI का लागि) —"/>
            <MaterialAttach chapterTitle={form.chapter_title} classLabel={classLabel}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
              {TYPES.map((t,i)=>{const Icon=t.icon;const c=PALETTE[i%PALETTE.length];const active=form.type===t.id;return(
                <button key={t.id} onClick={()=>setForm({...form,type:t.id})} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"11px 6px",borderRadius:12,border:`1.5px solid ${active?c:`color-mix(in srgb, ${c} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${c} 14%, ${SURFACE})`:SURFACE,color:active?c:INK,fontWeight:600,fontSize:14.5,cursor:"pointer",boxShadow:active?`0 6px 14px color-mix(in srgb, ${c} 30%, transparent)`:SHADOW.sm}}>
                  <div style={{width:32,height:32,borderRadius:9,background:`linear-gradient(160deg, ${c} 0%, color-mix(in srgb, ${c} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${c} 40%, transparent)`}}><Icon size={15} color="#fff"/></div>
                  {t.label}
                </button>
              );})}
            </div>
            <textarea placeholder={"मापदण्ड:\nउत्कृष्ट: ...\nराम्रो: ...\nसहयोग आवश्यक: ..."} value={form.rubric_text} onChange={(e)=>setForm({...form,rubric_text:e.target.value})} rows={4} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <input type="date" value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:assessments.length===0?(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
          {TYPES.map((t,i)=>{const Icon=t.icon;const c=PALETTE[i%PALETTE.length];return<Card key={t.id} accentColor={c} onClick={()=>{setForm({...form,type:t.id});setShowForm(true);}} style={{paddingTop:24,position:"relative",overflow:"visible"}}><PinBadge color={c}/><div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(160deg, ${c} 0%, color-mix(in srgb, ${c} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${c} 40%, transparent)`}}><Icon size={18} color="#fff"/></div><div style={{fontWeight:700,fontSize:16}}>{t.label}</div></Card>;})}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {assessments.map((a)=>{const typeIdx=TYPES.findIndex((t)=>t.id===a.type);const typeInfo=TYPES[typeIdx]||TYPES[0];const Icon=typeInfo.icon;const typeColor=PALETTE[Math.max(typeIdx,0)%PALETTE.length];return(
            <Card key={a.id} accentColor={typeColor} style={{paddingTop:24,position:"relative",overflow:"visible"}}>
              <PinBadge color={typeColor}/>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(160deg, ${typeColor} 0%, color-mix(in srgb, ${typeColor} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${typeColor} 40%, transparent)`}}><Icon size={17} color="#fff"/></div>
                <div style={{minWidth:0,flex:1}}><div style={{fontSize:17,fontWeight:700,color:INK,overflowWrap:"break-word",wordBreak:"break-word"}}>{a.title}</div><div style={{fontSize:15,color:INK_SOFT}}>{typeInfo.label}{a.due_date?` · ${a.due_date}`:""}</div></div>
                <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();setPrinting(a);}} style={{flexShrink:0,background:"none",border:`1px solid ${BORDER}`,borderRadius:8,padding:"6px 10px",display:"flex",alignItems:"center",gap:4,color:INK_SOFT,fontSize:13.5,fontWeight:600,cursor:"pointer"}}><Printer size={13}/>प्रिन्ट</button>
              </div>
              {a.rubric?.length>0&&a.rubric.map((r,i)=><div key={i} style={{background:SURFACE_2,borderRadius:7,padding:"6px 10px",fontSize:16,marginBottom:5}}><strong style={{color:ACCENT}}>{r.level}:</strong> {r.desc}</div>)}
            </Card>
          );})}
        </div>
      )}
    </div>
    {printing&&(
      <PrintableSheet title={printing.title} subtitle={TYPES.find((t)=>t.id===printing.type)?.label} chip={printing.due_date} chipColor={MARIGOLD_DARK} onClose={()=>setPrinting(null)}>
        {(printing.rubric||[]).map((r,i)=>{const c=r.level==="उत्कृष्ट"?ACCENT:r.level==="सहयोग आवश्यक"?ROSE:MARIGOLD_DARK;return(
          <div key={i} style={{marginBottom:12}}>
            <div style={{fontWeight:700,color:c,fontSize:16.5,marginBottom:3}}>{r.level}</div>
            <div style={{fontSize:16.5,color:INK,lineHeight:1.6}}>{r.desc}</div>
          </div>
        );})}
        {(!printing.rubric||printing.rubric.length===0)&&<div style={{color:INK_SOFT}}>मूल्याङ्कन मापदण्ड थपिएको छैन।</div>}
      </PrintableSheet>
    )}
    </>
  );
}

function ActivitiesLibrary({ chapters, onAddChapter, classContext, classLabel }) {
  const [activities,setActivities]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [typeFilter,setTypeFilter]=useState("सबै");
  const [printing,setPrinting]=useState(null);
  const [form,setForm]=useState({title:"",type:"game",competency:"",duration:"",description:"",chapter_title:""});
  const [error,setError]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const TYPES=[{id:"game",label:"खेल",icon:Gamepad2},{id:"roleplay",label:"भूमिका अभिनय",icon:Users},{id:"project",label:"प्रोजेक्ट",icon:FolderKanban},{id:"map",label:"नक्सा",icon:MapIcon},{id:"debate",label:"बहस",icon:MessageSquare},{id:"presentation",label:"प्रस्तुति",icon:Presentation}];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getActivities();setActivities(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    if(!form.chapter_title.trim()){setError("अध्यायको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const ctx=await getMaterialContext(form.chapter_title,classLabel);
      setMatchedCount(ctx.matchedCount||0);
      const results=await gemini.generateActivities(form.chapter_title,ctx,classContext);
      if(results?.length){
        const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
        for(const a of results)await db.upsertActivity({title:a.title,type:a.type||"game",duration:a.duration,competency:a.competency,description:a.description,chapter_title:form.chapter_title,chapter_id});
        load();setShowForm(false);
      }
      else setError("क्रियाकलाप बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);
    const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
    await db.upsertActivity({...form,chapter_id});
    setSaving(false);setShowForm(false);setForm({title:"",type:"game",competency:"",duration:"",description:"",chapter_title:""});load();
  };
  const filtered=typeFilter==="सबै"?activities:activities.filter((a)=>a.type===typeFilter);

  return(<>
    <div className={printing?"no-print":""} style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>क्रियाकलाप</div>
        <button className="ss-btn" onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:16.5}}>नयाँ क्रियाकलाप</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट बनाउनुहोस्"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <MaterialsHint count={matchedCount} chapterTitle={form.chapter_title}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् (AI का लागि अनिवार्य) —"/>
            <MaterialAttach chapterTitle={form.chapter_title} classLabel={classLabel}/>
            <input placeholder="क्रियाकलापको नाम" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <input placeholder="क्षमता" value={form.competency} onChange={(e)=>setForm({...form,competency:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <input placeholder="समय" value={form.duration} onChange={(e)=>setForm({...form,duration:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <textarea placeholder="विवरण" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} rows={3} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {TYPES.map((t,i)=>{const Icon=t.icon;const c=PALETTE[i%PALETTE.length];const active=form.type===t.id;return(
                <button key={t.id} onClick={()=>setForm({...form,type:t.id})} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 12px 7px 7px",borderRadius:11,border:`1.5px solid ${active?c:`color-mix(in srgb, ${c} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${c} 14%, ${SURFACE})`:SURFACE,color:active?c:INK,fontWeight:600,fontSize:15.5,cursor:"pointer",boxShadow:active?`0 4px 10px color-mix(in srgb, ${c} 30%, transparent)`:"none"}}>
                  <div style={{width:24,height:24,borderRadius:7,background:`linear-gradient(160deg, ${c} 0%, color-mix(in srgb, ${c} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={12} color="#fff"/></div>
                  {t.label}
                </button>
              );})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14}}>
        <button onClick={()=>setTypeFilter("सबै")} style={{padding:"6px 12px",borderRadius:999,background:typeFilter==="सबै"?ACCENT:SURFACE,color:typeFilter==="सबै"?"#fff":INK,fontWeight:600,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(typeFilter==="सबै"?ACCENT:BORDER)}}>सबै</button>
        {TYPES.map((t,i)=>{const Icon=t.icon;const c=PALETTE[i%PALETTE.length];return<button key={t.id} onClick={()=>setTypeFilter(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:999,background:typeFilter===t.id?c:SURFACE,color:typeFilter===t.id?"#fff":INK,fontWeight:600,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(typeFilter===t.id?c:BORDER)}}><Icon size={13}/>{t.label}</button>;})}
      </div>
      {loading?<Spinner/>:filtered.length===0?<EmptyState icon={Gamepad2} text="कुनै क्रियाकलाप छैन।"/>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map((a)=>{const typeIdx=TYPES.findIndex((t)=>t.id===a.type);const typeInfo=TYPES[typeIdx]||TYPES[0];const Icon=typeInfo.icon;const typeColor=PALETTE[Math.max(typeIdx,0)%PALETTE.length];return(
            <Card key={a.id} accentColor={typeColor} style={{paddingTop:24,position:"relative",overflow:"visible"}}>
              <PinBadge color={typeColor}/>
              <div style={{display:"flex",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:`linear-gradient(160deg, ${typeColor} 0%, color-mix(in srgb, ${typeColor} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${typeColor} 40%, transparent)`}}><Icon size={19} color="#fff"/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}><div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:700,fontSize:16.5,color:INK}}>{a.title}</div>{a.duration&&<span style={{fontSize:15,color:INK_SOFT,flexShrink:0}}>{a.duration}</span>}</div>
                  {a.description&&<div style={{fontSize:16,color:INK_SOFT,lineHeight:1.5,marginTop:4}}>{a.description}</div>}
                  <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
                    {a.chapter_title&&<span style={{fontSize:14,background:WARN_BG,color:MARIGOLD_DARK,padding:"2px 7px",borderRadius:5,fontWeight:600}}>{a.chapter_title}</span>}
                    {a.competency&&<span style={{fontSize:14,background:ACCENT_LIGHT,color:ACCENT,padding:"2px 7px",borderRadius:5,fontWeight:600}}>{a.competency}</span>}
                    <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();setPrinting(a);}} style={{marginLeft:"auto",background:"none",border:`1px solid ${BORDER}`,borderRadius:8,padding:"4px 8px",display:"flex",alignItems:"center",gap:4,color:INK_SOFT,fontSize:13.5,fontWeight:600,cursor:"pointer"}}><Printer size={12}/>प्रिन्ट</button>
                  </div>
                </div>
              </div>
            </Card>
          );})}
        </div>
      )}
    </div>
    {printing&&(
      <PrintableSheet title={printing.title} subtitle={TYPES.find((t)=>t.id===printing.type)?.label} chip={printing.chapter_title} chipColor={PALETTE[Math.max(TYPES.findIndex((t)=>t.id===printing.type),0)%PALETTE.length]} onClose={()=>setPrinting(null)}>
        {printing.competency&&<div style={{marginBottom:10,fontSize:16,color:INK_SOFT}}><strong style={{color:INK}}>क्षमता:</strong> {printing.competency}</div>}
        {printing.duration&&<div style={{marginBottom:14,fontSize:16,color:INK_SOFT}}><strong style={{color:INK}}>समय:</strong> {printing.duration}</div>}
        <div style={{fontSize:17,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{printing.description||"विवरण थपिएको छैन।"}</div>
      </PrintableSheet>
    )}
    </>
  );
}

// NEW — lifted to module scope (was local to ResourceCreator) so both the
// generator and the Saved Resources library can share the same icon/color
// per template type instead of duplicating the list.
const RESOURCE_TEMPLATES=[
  {id:"worksheet",title:"कार्यपत्र",icon:FileText,color:ACCENT,prompt:(l,classContext)=>`${classContext} "${l?.title||""}" पाठका लागि अभ्यास कार्यपत्र नेपालीमा बनाउनुहोस्। उद्देश्य: ${(l?.objectives||[]).join(", ")}`},
  {id:"revision",title:"पुनरावलोकन",icon:ClipboardList,color:TEAL,prompt:(l,classContext)=>`${classContext} "${l?.title||""}" पाठको पुनरावलोकन पाना बनाउनुहोस्। मुख्य बुँदा, शब्दावली र प्रश्नहरू।`},
  {id:"flashcard",title:"फ्ल्यासकार्ड",icon:Copy,color:VIOLET,prompt:(l)=>`"${l?.title||""}" पाठका शब्दावलीहरू: ${(l?.vocabulary||[]).join(", ")} — फ्ल्यासकार्ड बनाउनुहोस्।`},
  {id:"mindmap",title:"अवधारणा नक्सा",icon:Brain,color:BLUE,prompt:(l)=>`"${l?.title||""}" पाठको अवधारणा नक्सा (text format) बनाउनुहोस्।`},
  {id:"vocab",title:"शब्दावली सूची",icon:Tag,color:ROSE,prompt:(l)=>`"${l?.title||""}" पाठका शब्दावलीहरू अर्थ र वाक्य प्रयोगसहित: ${(l?.vocabulary||[]).join(", ")}`},
  {id:"practice",title:"अभ्यास प्रश्न",icon:PenSquare,color:MARIGOLD_DARK,prompt:(l)=>`"${l?.title||""}" पाठका लागि १५ वटा विभिन्न प्रकारका अभ्यास प्रश्नहरू बनाउनुहोस्।`},
];
const resourceTemplateMeta=(id)=>RESOURCE_TEMPLATES.find((t)=>t.id===id)||{title:"स्रोत",icon:Wand2,color:MARIGOLD_DARK};

// NEW — groups the four AI-generation screens (Questions, Activities,
// Assessment, Resources) behind one nav item with internal tabs, instead of
// four separate items cluttering the "थप" menu. Same screens underneath,
// just fewer places to hunt for them.
function AITools({ lessons, chapters, onAddChapter, classContext, classLabel, initialTab, onInitialTabConsumed }) {
  const [tab,setTab]=useState("questions");
  // NEW — arriving here from a Search result: jump straight to the
  // relevant sub-tab instead of always opening on Question Bank.
  useEffect(()=>{
    if(!initialTab)return;
    setTab(initialTab);
    onInitialTabConsumed?.();
  },[initialTab,onInitialTabConsumed]);
  const TABS=[
    {id:"questions",label:"प्रश्न बैंक",icon:HelpCircle,color:VIOLET,bg:VIOLET_LIGHT},
    {id:"activities",label:"क्रियाकलाप",icon:Gamepad2,color:TEAL,bg:TEAL_LIGHT},
    {id:"assessment",label:"मूल्याङ्कन",icon:NotebookPen,color:BLUE,bg:BLUE_LIGHT},
    {id:"resources",label:"स्रोत",icon:Wand2,color:MARIGOLD_DARK,bg:WARN_BG},
    {id:"saved",label:"सुरक्षित",icon:BookMarked,color:ROSE,bg:ROSE_LIGHT},
  ];
  return(
    <div>
      <div className="no-print" style={{display:"flex",overflowX:"auto",background:SURFACE,borderBottom:`1px solid ${BORDER}`,position:"sticky",top:0,zIndex:8}}>
        {TABS.map((t)=>{const Icon=t.icon;const active=tab===t.id;return(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"13px 18px",border:"none",background:active?t.bg:"none",borderBottom:active?`3px solid ${t.color}`:"3px solid transparent",color:active?t.color:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer",whiteSpace:"nowrap",transition:"background .15s"}}><Icon size={16}/>{t.label}</button>
        );})}
      </div>
      {tab==="questions"&&<QuestionBank chapters={chapters} onAddChapter={onAddChapter} classContext={classContext} classLabel={classLabel}/>}
      {tab==="activities"&&<ActivitiesLibrary chapters={chapters} onAddChapter={onAddChapter} classContext={classContext} classLabel={classLabel}/>}
      {tab==="assessment"&&<AssessmentBuilder chapters={chapters} onAddChapter={onAddChapter} classContext={classContext} classLabel={classLabel}/>}
      {tab==="resources"&&<ResourceCreator lessons={lessons} classContext={classContext} classLabel={classLabel}/>}
      {tab==="saved"&&<SavedResources/>}
    </div>
  );
}

function ResourceCreator({ lessons, classContext, classLabel }) {
  const [active,setActive]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [generatedText,setGeneratedText]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const lesson=lessons[0];
  const chapterTitle=lesson?.chapters?.title||lesson?.chapter_title||"";

  const generate=async(template)=>{
    setActive(template);setGenerating(true);setGeneratedText("");setSaved(false);
    try{
      // NEW: use materials tagged to this lesson's chapter + the global textbook
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      setMatchedCount(ctx.matchedCount||0);
      const prompt=template.prompt(lesson,classContext);
      const text=(ctx.materialParts.length||ctx.pdfBase64)
        ?await gemini.generateWithMaterials(prompt,ctx.materialParts,ctx.pdfBase64)
        :await gemini.generateText(prompt);
      setGeneratedText(text);
    }catch(e){setGeneratedText("त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!active||!generatedText)return;
    setSaving(true);
    const title=lesson?`${active.title} — ${lesson.title}`:active.title;
    const{error}=await db.saveResource({title,template_id:active.id,chapter_title:chapterTitle||null,content:generatedText});
    setSaving(false);
    if(!error)setSaved(true);
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div className="no-print" style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><Wand2 size={20} color={ACCENT}/>स्रोत निर्माता</div>
      <div className="no-print" style={{fontSize:16,color:INK_SOFT,marginBottom:16}}>{lesson?`"${lesson.title}" — AI बाट स्वतः बनाइन्छ।`:"पहिले पाठ योजनामा पाठ थप्नुहोस्।"}</div>
      <div className="no-print"><MaterialsHint count={matchedCount} chapterTitle={chapterTitle}/></div>
      <div className="no-print" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:20}}>
        {RESOURCE_TEMPLATES.map((t)=>{const Icon=t.icon;return<Card key={t.id} onClick={()=>generate(t)} accentColor={t.color} style={{padding:14,paddingTop:24,position:"relative",overflow:"visible",border:active?.id===t.id?`2px solid ${t.color}`:`1px solid ${BORDER}`}}><PinBadge color={t.color}/><div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(160deg, ${t.color} 0%, color-mix(in srgb, ${t.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${t.color} 40%, transparent)`}}><Icon size={18} color="#fff"/></div><div style={{fontWeight:700,fontSize:16,color:INK}}>{t.title}</div></Card>;})}
      </div>
      {active&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontWeight:700,fontSize:17}}>{active.title}</div>
            {!generating&&generatedText&&(
              <div className="no-print" style={{display:"flex",gap:7}}>
                <button className="ss-btn" onClick={save} disabled={saving||saved} style={{display:"flex",alignItems:"center",gap:5,background:saved?ACCENT_LIGHT:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:saved?ACCENT:"#fff",border:"none",borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:16,cursor:saved?"default":"pointer",boxShadow:saved?"none":SHADOW.accent}}>{saved?<><CheckCircle2 size={14}/>सुरक्षित भयो</>:saving?"...":<><BookMarked size={14}/>सुरक्षित गर्नुहोस्</>}</button>
                <button className="ss-btn" onClick={()=>window.print()} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, #DDB054 0%, ${MARIGOLD} 100%)`,color:"#2A1E07",border:"none",borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:SHADOW.marigold}}><Printer size={14}/>प्रिन्ट</button>
              </div>
            )}
          </div>
          {generating?<div style={{display:"flex",alignItems:"center",gap:8,color:INK_SOFT,fontSize:16.5,padding:20}}><Spinner small/>AI बनाउँदैछ...</div>:(
            <pre style={{background:SURFACE_2,borderRadius:10,padding:14,fontSize:16,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'Inter','Noto Sans Devanagari',sans-serif",maxHeight:400,overflowY:"auto"}}>{generatedText}</pre>
          )}
        </Card>
      )}
    </div>
  );
}

// NEW — the library of previously-saved AI resources (worksheets, flashcards,
// mindmaps, etc.) so a generated document survives navigating away instead
// of vanishing. Decorated the same corkboard-pin way as the Materials library.
function SavedResources() {
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [viewing,setViewing]=useState(null);
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getSavedResources();setItems(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const remove=async(id,e)=>{
    e.stopPropagation();
    if(!confirm("यो सुरक्षित स्रोत मेटाउने?"))return;
    await db.deleteSavedResource(id);load();
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><BookMarked size={20} color={ROSE}/>सुरक्षित स्रोतहरू</div>
      <div style={{fontSize:16,color:INK_SOFT,marginBottom:16}}>AI बाट बनाएका र सुरक्षित गरेका कार्यपत्र, फ्ल्यासकार्ड, पुनरावलोकन पाना — पछि हेर्न वा प्रिन्ट गर्न।</div>
      {loading?<Spinner/>:items.length===0?(
        <EmptyState icon={BookMarked} text="अझै कुनै स्रोत सुरक्षित गरिएको छैन। स्रोत निर्माताबाट बनाएर 'सुरक्षित गर्नुहोस्' थिच्नुहोस्।"/>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
          {items.map((r)=>{
            const meta=resourceTemplateMeta(r.template_id);const Icon=meta.icon;
            return(
              <Card key={r.id} onClick={()=>setViewing(r)} accentColor={meta.color} style={{padding:14,paddingTop:46,position:"relative",overflow:"visible"}}>
                <PinBadge color={meta.color}/>
                <button className="ss-btn" onClick={(e)=>remove(r.id,e)} style={{position:"absolute",top:6,right:6,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK_SOFT,boxShadow:SHADOW.sm,zIndex:2}}><Trash2 size={16}/></button>
                <div style={{width:40,height:40,borderRadius:11,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:9,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={19} color="#fff"/></div>
                <div style={{fontSize:16,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{r.title}</div>
                {r.chapter_title&&<span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.chapter_title}</span>}
                <div style={{fontSize:13.5,color:INK_SOFT,marginTop:6,fontWeight:600}}>{r.created_at?new Date(r.created_at).toLocaleDateString("ne-NP"):""}</div>
              </Card>
            );
          })}
        </div>
      )}
      {viewing&&(
        <PrintableSheet title={viewing.title} subtitle={resourceTemplateMeta(viewing.template_id).title} chip={viewing.chapter_title} chipColor={resourceTemplateMeta(viewing.template_id).color} onClose={()=>setViewing(null)}>
          <pre style={{background:SURFACE_2,borderRadius:10,padding:14,fontSize:16,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}>{viewing.content}</pre>
        </PrintableSheet>
      )}
    </div>
  );
}

function DocumentSearch({ lessons, homework, classLabel, onOpenLesson, onGoMaterials, onGoAITools, onGoHomework }) {
  const [query,setQuery]=useState("");
  const [allQuestions,setAllQuestions]=useState([]);
  const [allActivities,setAllActivities]=useState([]);
  const [allMaterials,setAllMaterials]=useState([]);
  useEffect(()=>{
    db.getQuestions().then(({data})=>setAllQuestions(data||[]));
    db.getActivities().then(({data})=>setAllActivities(data||[]));
    db.getMaterials(classLabel).then(({data})=>setAllMaterials(data||[]));
  },[classLabel]);
  // FIX — results were pure display, tapping one did nothing. Each result
  // now knows how to jump to where it actually lives.
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();if(!q)return[];
    return[
      ...lessons.filter((l)=>l.title?.toLowerCase().includes(q)||(l.objectives||[]).some((o)=>o.toLowerCase().includes(q))).map((l)=>({kind:"पाठ",title:l.title,sub:l.chapters?.title||l.chapter_title||"",icon:ClipboardList,color:ACCENT,onClick:()=>onOpenLesson?.(l)})),
      ...allMaterials.filter((m)=>m.name?.toLowerCase().includes(q)||m.chapters?.title?.toLowerCase().includes(q)).map((m)=>({kind:"सामग्री",title:m.name,sub:(m.chapters?.title?m.chapters.title+" · ":"")+(m.file_type?.toUpperCase()||""),icon:FileText,color:DANGER,onClick:onGoMaterials})),
      ...allQuestions.filter((qq)=>qq.text?.toLowerCase().includes(q)).map((qq)=>({kind:"प्रश्न",title:qq.text,sub:qq.type+" · "+qq.difficulty,icon:HelpCircle,color:VIOLET,onClick:()=>onGoAITools?.("questions")})),
      ...allActivities.filter((a)=>a.title?.toLowerCase().includes(q)||a.description?.toLowerCase().includes(q)).map((a)=>({kind:"क्रियाकलाप",title:a.title,sub:a.chapter_title||"",icon:Gamepad2,color:TEAL,onClick:()=>onGoAITools?.("activities")})),
      ...homework.filter((h)=>h.title?.toLowerCase().includes(q)).map((h)=>({kind:"गृहकार्य",title:h.title,sub:`${h.checked_count}/${h.total_students}`,icon:ListChecks,color:WARN,onClick:onGoHomework})),
    ];
  },[query,lessons,allMaterials,allQuestions,allActivities,homework,onOpenLesson,onGoMaterials,onGoAITools,onGoHomework]);
  return(
    <div style={{padding:"20px 20px 130px",maxWidth:820,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4}}>सबैतिर खोज</div>
      <div style={{display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"12px 14px",marginBottom:14,marginTop:10}}>
        <Search size={17} color={INK_SOFT}/>
        <input autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="खोज्नुहोस्..." style={{border:"none",outline:"none",boxShadow:"none",WebkitAppearance:"none",appearance:"none",fontSize:17,flex:1,minWidth:0,background:"transparent",color:INK,caretColor:ACCENT,fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}/>
      </div>
      {!query.trim()?<EmptyState icon={Search} text="टाइप गर्नुहोस्..."/>:results.length===0?<EmptyState icon={Search} text={`"${query}" फेला परेन।`}/>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:15.5,color:INK_SOFT,marginBottom:4}}>{results.length} परिणाम</div>
          {results.map((r,i)=>{const Icon=r.icon;return<Card key={i} onClick={r.onClick} accentColor={r.color} style={{display:"flex",gap:10,alignItems:"center",paddingTop:22,position:"relative",overflow:"visible",cursor:r.onClick?"pointer":"default"}}><PinBadge color={r.color}/><div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(160deg, ${r.color} 0%, color-mix(in srgb, ${r.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${r.color} 40%, transparent)`}}><Icon size={17} color="#fff"/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,color:r.color,fontWeight:700,marginBottom:2}}>{r.kind}</div><div style={{fontSize:16.5,color:INK,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>{r.sub&&<div style={{fontSize:15,color:INK_SOFT}}>{r.sub}</div>}</div>{r.onClick&&<ChevronRight size={17} color={INK_SOFT} style={{flexShrink:0}}/>}</Card>;})}
        </div>
      )}
    </div>
  );
}

// NEW — Phase 3: date helpers for the calendar module (local dates, not
// UTC, so a day never shifts by one depending on timezone).
const fmtDate=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseDate=(s)=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};

function CalendarView({ classLabel }) {
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [selected,setSelected]=useState(fmtDate(today));
  const MONTHS=["जनवरी","फेब्रुअरी","मार्च","अप्रिल","मे","जुन","जुलाई","अगस्ट","सेप्टेम्बर","अक्टोबर","नोभेम्बर","डिसेम्बर"];
  const DAYS=["आ","सो","म","बु","बि","शु","श"];
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay();

  const [events,setEvents]=useState([]);
  const [assessments,setAssessments]=useState([]);
  const [loading,setLoading]=useState(true);
  const [activeCats,setActiveCats]=useState(()=>new Set(EVENT_CATEGORY_ORDER));
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);
    const [{data:ev},{data:as}]=await Promise.all([db.getCalendarEvents(classLabel),db.getAssessments()]);
    setEvents(ev||[]);
    setAssessments((as||[]).filter((a)=>a.due_date));
    setLoading(false);
  },[classLabel]);
  useEffect(()=>{load();},[load]);

  // NEW — teacher-added events and existing assessment due-dates (already
  // real dates in the database) merged into one shape, so "परीक्षा
  // तालिका" isn't a separate disconnected list — an assessment with a due
  // date IS an exam-schedule entry on this calendar automatically.
  const allItems=useMemo(()=>{
    const fromEvents=events.map((e)=>({id:`ev-${e.id}`,title:e.title,category:e.category,start:e.start_date,end:e.end_date||e.start_date,time:e.time,notes:e.notes,editable:true,raw:e}));
    const fromAssessments=assessments.map((a)=>({id:`as-${a.id}`,title:a.title,category:"exam",start:a.due_date,end:a.due_date,editable:false,raw:a}));
    return [...fromEvents,...fromAssessments];
  },[events,assessments]);

  const visibleItems=useMemo(()=>allItems.filter((i)=>activeCats.has(i.category)),[allItems,activeCats]);

  const itemsByDate=useMemo(()=>{
    const map={};
    for(const it of visibleItems){
      let d=parseDate(it.start);const end=parseDate(it.end);let guard=0;
      while(d<=end&&guard<62){
        (map[fmtDate(d)] ||= []).push(it);
        d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);guard++;
      }
    }
    return map;
  },[visibleItems]);

  const selectedItems=(itemsByDate[selected]||[]).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));

  const openNew=()=>{setEditing(null);setForm({title:"",category:"event",start_date:selected,end_date:"",multiDay:false,time:"",notes:"",allClasses:false});setShowForm(true);};
  const openEdit=(it)=>{if(!it.editable)return;const raw=it.raw;setEditing(raw);setForm({title:raw.title,category:raw.category,start_date:raw.start_date,end_date:raw.end_date||"",multiDay:!!raw.end_date,time:raw.time||"",notes:raw.notes||"",allClasses:!raw.class_label});setShowForm(true);};

  const saveEvent=async()=>{
    if(!form.title.trim()||!form.start_date)return;
    setSaving(true);
    const payload={
      ...(editing?{id:editing.id}:{}),
      title:form.title.trim(),
      category:form.category,
      start_date:form.start_date,
      end_date:form.multiDay&&form.end_date?form.end_date:null,
      time:form.time||null,
      notes:form.notes.trim()||null,
      class_label:form.allClasses?null:classLabel,
    };
    const{error}=await db.upsertCalendarEvent(payload);
    setSaving(false);
    if(!error){setShowForm(false);setEditing(null);load();}
  };

  const deleteEvent=async(raw)=>{
    if(!confirm(`"${raw.title}" मेटाउने?`))return;
    await db.deleteCalendarEvent(raw.id);
    load();
  };

  const toggleCat=(key)=>setActiveCats((prev)=>{const next=new Set(prev);next.has(key)?next.delete(key):next.add(key);return next;});

  const selectedLabel=(()=>{const d=parseDate(selected);return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;})();

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:640,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div style={{fontSize:20,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><CalendarDays size={20} color={ACCENT}/>पात्रो</div>
        <button className="ss-btn" onClick={openNew} style={{display:"flex",alignItems:"center",gap:6,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"9px 15px",fontWeight:700,fontSize:15.5,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={16}/>कार्यक्रम थप्नुहोस्</button>
      </div>

      {/* NEW — category filter chips, same visual language as Materials'
          category chips: tap to hide/show that category's dots on the
          grid and entries in the day list. */}
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14,paddingBottom:2}}>
        {EVENT_CATEGORY_ORDER.map((key)=>{
          const meta=EVENT_CATEGORY_META[key];const Icon=meta.icon;const active=activeCats.has(key);
          return(
            <button key={key} onClick={()=>toggleCat(key)} className="ss-chip" style={{display:"flex",alignItems:"center",gap:5,padding:"7px 13px",borderRadius:999,background:active?meta.color:SURFACE,color:active?"#fff":INK_SOFT,fontWeight:700,fontSize:14.5,whiteSpace:"nowrap",cursor:"pointer",border:`1.5px solid ${active?meta.color:BORDER}`,boxShadow:active?SHADOW.sm:"none"}}><Icon size={13}/>{meta.label}</button>
          );
        })}
      </div>

      <Card style={{marginBottom:14,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <button className="ss-btn" onClick={()=>{if(month===0){setMonth(11);setYear((y)=>y-1);}else setMonth((m)=>m-1);}} style={{background:WARN_BG,border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,cursor:"pointer",color:ACCENT,fontSize:18}}>‹</button>
          <div style={{textAlign:"center"}}>
            <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} style={{border:"none",fontWeight:700,fontSize:18,color:INK,cursor:"pointer",background:"transparent",fontFamily:"'Inter','Noto Sans Devanagari',sans-serif"}}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e)=>setYear(Number(e.target.value))} style={{border:"none",fontWeight:700,fontSize:18,color:INK,cursor:"pointer",background:"transparent",fontFamily:"'Inter','Noto Sans Devanagari',sans-serif",marginLeft:4}}>
              {Array.from({length:5},(_,i)=>today.getFullYear()-1+i).map((y)=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="ss-btn" onClick={()=>{if(month===11){setMonth(0);setYear((y)=>y+1);}else setMonth((m)=>m+1);}} style={{background:WARN_BG,border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,cursor:"pointer",color:ACCENT,fontSize:18}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
          {DAYS.map((d)=><div key={d} style={{textAlign:"center",fontSize:15,fontWeight:700,color:INK_SOFT,padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>i+1).map((day)=>{
            const dateStr=fmtDate(new Date(year,month,day));
            const isToday=dateStr===fmtDate(today);
            const isSel=dateStr===selected;
            const dayItems=itemsByDate[dateStr]||[];
            const dots=[...new Set(dayItems.map((i)=>i.category))].slice(0,3);
            return(
              <button key={day} className="ss-btn" onClick={()=>setSelected(dateStr)} style={{aspectRatio:1,borderRadius:8,border:"none",background:isToday?ACCENT:isSel?ACCENT_LIGHT:"transparent",color:isToday?"#fff":isSel?ACCENT:INK,fontWeight:isToday||isSel?700:400,fontSize:16.5,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:0}}>
                <span>{day}</span>
                {dots.length>0&&(
                  <span style={{display:"flex",gap:2,height:5}}>
                    {dots.map((cat)=><span key={cat} style={{width:5,height:5,borderRadius:"50%",background:isToday?"#fff":EVENT_CATEGORY_META[cat]?.color||INK_SOFT,flexShrink:0}}/>)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <SectionLabel icon={CalendarDays}>{selectedLabel}</SectionLabel>
      {loading?<Spinner/>:selectedItems.length===0?(
        <div style={{color:INK_SOFT,fontSize:16.5}}>यो दिन कुनै कार्यक्रम छैन।</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {selectedItems.map((it)=>{
            const meta=EVENT_CATEGORY_META[it.category]||EVENT_CATEGORY_META.event;const Icon=meta.icon;
            return(
              <Card key={it.id} accentColor={meta.color} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",paddingTop:20,position:"relative",overflow:"visible"}}>
                <PinBadge color={meta.color}/>
                <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={17} color="#fff"/></div>
                <div style={{flex:1,minWidth:0}} onClick={()=>openEdit(it)} title={it.editable?"सम्पादन गर्नुहोस्":""} className={it.editable?"ss-btn":""}>
                  <div style={{fontSize:16.5,color:INK,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.title}</div>
                  <div style={{fontSize:14,color:INK_SOFT,display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span>{meta.label}</span>{it.time&&<span>· {it.time}</span>}{!it.editable&&<span>· मूल्याङ्कनबाट</span>}{it.start!==it.end&&<span>· {parseDate(it.start).getDate()}–{parseDate(it.end).getDate()} {MONTHS[parseDate(it.end).getMonth()]}</span>}
                  </div>
                </div>
                {it.editable&&<button className="ss-icon-btn" onClick={()=>deleteEvent(it.raw)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,padding:4,flexShrink:0}}><Trash2 size={16}/></button>}
              </Card>
            );
          })}
        </div>
      )}

      {showForm&&form&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)",zIndex:70,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowForm(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:"20px 20px 0 0",padding:20,maxWidth:520,width:"100%",maxHeight:"85vh",overflowY:"auto",boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:19,fontWeight:800,color:INK}}>{editing?"कार्यक्रम सम्पादन":"नयाँ कार्यक्रम"}</div>
              <button className="ss-icon-btn" onClick={()=>setShowForm(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={20}/></button>
            </div>
            <input autoFocus value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="कार्यक्रमको नाम" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,marginBottom:10}}/>
            <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:12,paddingBottom:2}}>
              {EVENT_CATEGORY_ORDER.map((key)=>{
                const meta=EVENT_CATEGORY_META[key];const Icon=meta.icon;const active=form.category===key;
                return<button key={key} onClick={()=>setForm({...form,category:key})} className="ss-chip" style={{display:"flex",alignItems:"center",gap:5,padding:"7px 12px",borderRadius:999,background:active?meta.color:SURFACE,color:active?"#fff":INK_SOFT,fontWeight:700,fontSize:14,whiteSpace:"nowrap",cursor:"pointer",border:`1.5px solid ${active?meta.color:BORDER}`}}><Icon size={12}/>{meta.label}</button>;
              })}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginBottom:4}}>मिति</div>
                <input type="date" value={form.start_date} onChange={(e)=>setForm({...form,start_date:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              </div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginBottom:4}}>समय (वैकल्पिक)</div>
                <input type="time" value={form.time} onChange={(e)=>setForm({...form,time:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              </div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,cursor:"pointer",fontSize:15,color:INK,fontWeight:600}}>
              <input type="checkbox" checked={form.multiDay} onChange={(e)=>setForm({...form,multiDay:e.target.checked})}/> धेरै दिनसम्म चल्ने (जस्तै: बिदा)
            </label>
            {form.multiDay&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginBottom:4}}>अन्तिम मिति</div>
                <input type="date" value={form.end_date} min={form.start_date} onChange={(e)=>setForm({...form,end_date:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              </div>
            )}
            <label style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,cursor:"pointer",fontSize:15,color:INK,fontWeight:600}}>
              <input type="checkbox" checked={form.allClasses} onChange={(e)=>setForm({...form,allClasses:e.target.checked})}/> सबै कक्षाका लागि (विद्यालयब्यापी)
            </label>
            <textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="टिप्पणी (वैकल्पिक)" rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical",marginBottom:14}}/>
            <div style={{display:"flex",gap:8}}>
              {editing&&<button className="ss-btn" onClick={()=>{deleteEvent(editing);setShowForm(false);}} style={{padding:"11px 16px",borderRadius:10,border:`1px solid ${DANGER_BG}`,background:DANGER_BG,color:DANGER,fontWeight:700,cursor:"pointer"}}><Trash2 size={16}/></button>}
              <button className="ss-btn" onClick={saveEvent} disabled={saving||!form.title.trim()} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"सुरक्षित हुँदैछ...":"सुरक्षित गर्नुहोस्"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Settings({ session, sections, currentSection, onSectionAdded, onSectionUpdated, onSectionDeleted, theme, onToggleTheme, installPrompt, isStandalone, isIOS, onInstall, classLabel, subjectLabel, onClassChange, onSubjectChange, teacherName, onTeacherNameChange }) {
  const [nameDraft,setNameDraft]=useState(teacherName);
  const [nameMsg,setNameMsg]=useState("");
  const [classDraft,setClassDraft]=useState(classLabel);
  const [subjectDraft,setSubjectDraft]=useState(subjectLabel);
  const [classMsg,setClassMsg]=useState("");
  const [name,setName]=useState("");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [sectionMsg,setSectionMsg]=useState("");
  const [uploading,setUploading]=useState(false);
  const [pdfLoaded,setPdfLoaded]=useState(!!getTextbookPDF());
  const [repairBusy,setRepairBusy]=useState(null);
  const [repairMsg,setRepairMsg]=useState({});

  const runRepair=async(key,fn)=>{
    setRepairBusy(key);setRepairMsg((m)=>({...m,[key]:""}));
    try{
      const res=await fn((p)=>setRepairMsg((m)=>({...m,[key]:p.current?`...${p.current}`:"चलिरहेको..."})));
      if(res?.error) throw res.error;
      const parts=[];
      if("merged" in res) parts.push(`${res.merged} अध्याय गाभियो`,`${res.rowsUpdated} रेकर्ड सारियो`);
      if("fixed" in res) parts.push(`${res.fixed} मिलाइयो`,res.failed?`${res.failed} असफल`:null);
      if("repaired" in res) parts.push(`${res.repaired} मिलाइयो`);
      setRepairMsg((m)=>({...m,[key]:`✓ सम्पन्न — ${parts.filter(Boolean).join(", ")||"केही मिलाउन पर्ने भेटिएन"}`}));
    }catch(e){
      setRepairMsg((m)=>({...m,[key]:`त्रुटि: ${e.message||"असफल भयो"}`}));
    }finally{
      setRepairBusy(null);
    }
  };

  useEffect(()=>{
    gemini.loadTextbook(classLabel).then((b64)=>{
      window.__textbookPDF__=b64||null;
      setPdfLoaded(!!b64);
    });
  },[classLabel]);

  const saveName=()=>{
    onTeacherNameChange(nameDraft.trim());
    setNameMsg("सुरक्षित भयो!");
    setTimeout(()=>setNameMsg(""),2000);
  };

  const saveClassSubject=()=>{
    onClassChange(classDraft.trim()||"कक्षा ५");
    onSubjectChange(subjectDraft.trim()||"सामाजिक अध्ययन");
    setClassMsg("सुरक्षित भयो!");
    setTimeout(()=>setClassMsg(""),2000);
  };

  const addSection=async()=>{
    if(!name.trim())return;
    // NEW — nothing previously stopped adding the same section twice
    // (easy to do by accident on a slow connection with a double-tap).
    if(sections.some((s)=>s.name.trim().toLowerCase()===name.trim().toLowerCase())){
      setSectionMsg("यो नामको सेक्सन पहिल्यै छ।");setTimeout(()=>setSectionMsg(""),2500);return;
    }
    setSaving(true);
    const{data,error}=await db.createSection(name.trim());
    setSaving(false);
    if(error){setSectionMsg("त्रुटि: "+error.message);return;}
    onSectionAdded(data);setName("");setSectionMsg(`"${data.name}" थपियो!`);
    setTimeout(()=>setSectionMsg(""),2000);
  };

  // NEW — sections could only ever be added, never renamed or deleted
  // (same gap chapters had before that got fixed). Deleting un-assigns
  // rather than deletes any lesson/homework scoped to it — see
  // deleteSection in db.js.
  const [editingSectionId,setEditingSectionId]=useState(null);
  const [sectionEditValue,setSectionEditValue]=useState("");
  const [sectionBusy,setSectionBusy]=useState(null);
  const renameSection=async(s)=>{
    const newName=sectionEditValue.trim();
    if(!newName||newName===s.name){setEditingSectionId(null);return;}
    setSectionBusy(s.id);
    const{data,error}=await db.renameSection(s.id,newName);
    setSectionBusy(null);setEditingSectionId(null);
    if(!error)onSectionUpdated(data);
  };
  const deleteSectionHandler=async(s)=>{
    if(!confirm(`"${s.name}" सेक्सन मेटाउने? यसमा भएका पाठ/गृहकार्य कुनै सेक्सनमा नराखिने छन् (मेटिने छैनन्)।`))return;
    setSectionBusy(s.id);
    const{error}=await db.deleteSection(s.id);
    setSectionBusy(null);
    if(!error)onSectionDeleted(s.id);
  };

  const uploadTextbook=async(e)=>{
    const file=e.target.files[0];
    if(!file||file.type!=="application/pdf"){setMsg("PDF फाइल मात्र।");return;}
    setUploading(true);setMsg("पाठ्यपुस्तक लोड गर्दै... (ठूलो फाइलका लागि केही समय लाग्छ)");
    try{
      const b64=await gemini.fileToBase64(file);
      await gemini.saveTextbook(b64,classLabel);
      setTextbookPDF(b64);
      setPdfLoaded(true);
      setMsg(`"${file.name}" सफलतापूर्वक लोड भयो! अब AI ले यसबाट उत्तर दिनेछ।`);
    }catch(e){setMsg("त्रुटि: "+e.message);}
    setUploading(false);e.target.value="";
  };

  const clearTextbookHandler=async()=>{
    if(!confirm("पाठ्यपुस्तक PDF हटाउने? यसपछि AI ले यो पाठ्यपुस्तकबाट सामग्री बनाउन सक्दैन (छुट्टै ट्याग गरिएका सामग्री फाइलमा भने असर पर्दैन)।"))return;
    await gemini.clearTextbook(classLabel);
    window.__textbookPDF__=null;
    setPdfLoaded(false);
    setMsg("पाठ्यपुस्तक हटाइयो।");setTimeout(()=>setMsg(""),2000);
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:680,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><SettingsIcon size={20} color={ACCENT}/>सेटिङ</div>

      {!isStandalone&&(
        <Card style={{marginBottom:14,background:`linear-gradient(135deg, ${tint(TEAL,10)} 0%, ${tint(ACCENT,5)} 100%)`,border:`1.5px solid ${ACCENT_LIGHT}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg, ${TEAL}, ${ACCENT})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOW.accent}}><Zap size={21} color="#fff"/></div>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:INK}}>फोन र कम्प्युटरमा एप झैं इन्स्टल गर्नुहोस्</div>
              <div style={{fontSize:15,color:INK_SOFT,marginTop:1}}>ब्राउजर बिना, होम स्क्रिनबाट सिधै खोल्नुहोस्</div>
            </div>
          </div>
          {isIOS?(
            <div style={{fontSize:15.5,color:INK,lineHeight:1.7,background:SURFACE,borderRadius:12,padding:"12px 14px"}}>
              iPhone/iPad मा: तल्लो Share बटन थिच्नुहोस् (वर्गाकार + माथितिरको बाण) → <b>"Add to Home Screen"</b> छान्नुहोस् → <b>"Add"</b> थिच्नुहोस्।
            </div>
          ):installPrompt?(
            <Button variant="primary" icon={Zap} onClick={onInstall} style={{width:"100%"}}>अहिले इन्स्टल गर्नुहोस्</Button>
          ):(
            <div style={{fontSize:15,color:INK_SOFT,lineHeight:1.6}}>तपाईंको ब्राउजरको एड्रेस बार वा मेनुमा रहेको "इन्स्टल" वा "Add to Home Screen" विकल्प प्रयोग गर्नुहोस्।</div>
          )}
        </Card>
      )}

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={BookOpen}>कक्षा र विषय</SectionLabel>
        <div style={{fontSize:15,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>यहाँ बदल्दा एपभर (होम स्क्रिन, AI उत्पन्न सामग्री, पाठ योजना, प्रश्न, कार्यपत्र...) सोही कक्षा र विषय अनुसार लागू हुन्छ।</div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14,color:INK_SOFT,fontWeight:600,marginBottom:5}}>कक्षा</div>
            <input value={classDraft} onChange={(e)=>setClassDraft(e.target.value)} placeholder="जस्तै: कक्षा ६" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,color:INK_SOFT,fontWeight:600,marginBottom:5}}>विषय</div>
            <input value={subjectDraft} onChange={(e)=>setSubjectDraft(e.target.value)} placeholder="जस्तै: विज्ञान" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={saveClassSubject}>सुरक्षित गर्नुहोस्</Button>
        {classMsg&&<div style={{marginTop:8,fontSize:15,color:ACCENT,fontWeight:600}}>{classMsg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={Sun} color={MARIGOLD_DARK}>देखावट (उज्यालो / गाढा)</SectionLabel>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>theme!=="light"&&onToggleTheme()} className="ss-chip" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:12,border:`2px solid ${theme==="light"?ACCENT:BORDER}`,background:theme==="light"?ACCENT_LIGHT:SURFACE,color:theme==="light"?ACCENT:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer"}}><Sun size={17}/>उज्यालो</button>
          <button onClick={()=>theme!=="dark"&&onToggleTheme()} className="ss-chip" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:12,border:`2px solid ${theme==="dark"?ACCENT:BORDER}`,background:theme==="dark"?ACCENT_LIGHT:SURFACE,color:theme==="dark"?ACCENT:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer"}}><Moon size={17}/>गाढा</button>
        </div>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={BookMarked} color={TEAL}>पाठ्यपुस्तक PDF</SectionLabel>
        <div style={{fontSize:16,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>एकपटक PDF अपलोड गर्नुहोस् — AI ले सबैतिर यसबाट स्वतः सामग्री बनाउनेछ, साथै सामग्री खण्डमा अध्याय अनुसार ट्याग गरिएका फाइलहरू पनि प्रयोग हुन्छन्।</div>
        {pdfLoaded?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:10,padding:"10px 14px"}}>
              <BookMarked size={18} color={ACCENT}/>
              <div style={{fontSize:16.5,color:ACCENT,fontWeight:700}}>पाठ्यपुस्तक लोड भएको छ ✓</div>
            </div>
            <button className="ss-btn" onClick={clearTextbookHandler} style={{display:"flex",alignItems:"center",gap:6,background:DANGER_BG,color:DANGER,border:"none",borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:16,cursor:"pointer"}}><Trash2 size={15}/>पाठ्यपुस्तक हटाउनुहोस्</button>
          </div>
        ):(
          <label style={{display:"flex",alignItems:"center",gap:8,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"12px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer"}}>
            <BookMarked size={17}/>{uploading?"लोड गर्दै...":"पाठ्यपुस्तक PDF अपलोड गर्नुहोस्"}
            <input type="file" accept="application/pdf" onChange={uploadTextbook} style={{display:"none"}}/>
          </label>
        )}
        {msg&&<div style={{marginTop:10,fontSize:16,color:pdfLoaded?ACCENT:DANGER,fontWeight:600}}>{msg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={User} color={VIOLET}>खाता</SectionLabel>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:46,height:46,borderRadius:"50%",background:ACCENT,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18.5,fontWeight:700,flexShrink:0}}>{(teacherName?.[0]||session?.user?.email?.[0]||"श").toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,color:INK,fontSize:16.5,overflowWrap:"break-word",wordBreak:"break-word"}}>{teacherName||session?.user?.email||""}</div>
            <div style={{fontSize:15,color:INK_SOFT,overflowWrap:"break-word",wordBreak:"break-word"}}>{teacherName?session?.user?.email:`${classLabel} · ${subjectLabel}`}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={nameDraft} onChange={(e)=>setNameDraft(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&saveName()} placeholder="तपाईंको नाम" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          <button className="ss-btn" onClick={saveName} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer",boxShadow:SHADOW.accent}}>सुरक्षित</button>
        </div>
        {nameMsg&&<div style={{marginBottom:10,fontSize:15,color:ACCENT,fontWeight:600}}>{nameMsg}</div>}
        <button className="ss-btn" onClick={()=>{if(confirm("लगआउट गर्ने?"))db.signOut();}} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",borderRadius:10,border:`1px solid ${DANGER_BG}`,background:DANGER_BG,color:DANGER,fontWeight:700,fontSize:16.5,cursor:"pointer"}}><LogOut size={15}/>लगआउट</button>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={Layers} color={BLUE}>सेक्सनहरू</SectionLabel>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
          {sections.length===0?<div style={{fontSize:16,color:INK_SOFT}}>कुनै सेक्सन छैन।</div>:sections.map((s,i)=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:SURFACE_2,borderRadius:8,borderLeft:`3px solid ${PALETTE[i%PALETTE.length]}`}}>
              {editingSectionId===s.id?(
                <>
                  <input autoFocus value={sectionEditValue} onChange={(e)=>setSectionEditValue(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&renameSection(s)} className="ss-field" style={{flex:1,minWidth:0,borderRadius:8,padding:"7px 10px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE}}/>
                  <button className="ss-btn" onClick={()=>renameSection(s)} disabled={sectionBusy===s.id} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:8,padding:"7px 11px",fontWeight:700,fontSize:14.5,cursor:"pointer",flexShrink:0,boxShadow:SHADOW.accent}}>✓</button>
                  <button className="ss-icon-btn" onClick={()=>setEditingSectionId(null)} style={{background:"none",border:"none",color:INK_SOFT,fontSize:14.5,cursor:"pointer",flexShrink:0}}>✕</button>
                </>
              ):(
                <>
                  <div style={{width:8,height:8,borderRadius:"50%",background:PALETTE[i%PALETTE.length],flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:16.5,fontWeight:600,color:INK}}>{s.name}</div>
                  {currentSection?.id===s.id&&<span style={{fontSize:13,background:ACCENT_LIGHT,color:ACCENT,padding:"2px 8px",borderRadius:999,fontWeight:700,flexShrink:0}}>सक्रिय</span>}
                  <button className="ss-icon-btn" onClick={()=>{setEditingSectionId(s.id);setSectionEditValue(s.name);}} disabled={sectionBusy===s.id} style={{background:"none",border:"none",color:INK_SOFT,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="नाम बदल्नुहोस्"><PenSquare size={15}/></button>
                  <button className="ss-icon-btn" onClick={()=>deleteSectionHandler(s)} disabled={sectionBusy===s.id} style={{background:"none",border:"none",color:DANGER,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="मेटाउनुहोस्"><Trash2 size={15}/></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addSection()} placeholder="नयाँ सेक्सन (जस्तै: कक्षा ५ ख)" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          <button className="ss-btn" onClick={addSection} disabled={saving} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"थप"}</button>
        </div>
        {sectionMsg&&<div style={{marginTop:8,fontSize:15,color:sectionMsg.startsWith("त्रुटि")||sectionMsg.includes("पहिल्यै")?DANGER:ACCENT,fontWeight:600}}>{sectionMsg}</div>}
      </Card>

      {/* NEW — Phase 5: repairChapterTagging and repairMaterialContentTypes
          already existed in db.js but were never wired into any screen —
          a teacher had no way to actually run them. repairDuplicateChapters
          is the fix for the tagging bug itself: chapters that got
          accidentally duplicated by a race condition (same title, two
          different ids) get merged back into one, and every material/
          lesson/question/activity pointed at a duplicate gets reassigned
          to the surviving chapter. */}
      <Card style={{marginBottom:14}}>
        <SectionLabel icon={Wand2} color={VIOLET}>मर्मत उपकरण</SectionLabel>
        <div style={{fontSize:15,color:INK_SOFT,marginBottom:12,lineHeight:1.5}}>
          ट्याग गर्दा/अध्याय देखाउँदा समस्या आएमा यहाँबाट मर्मत गर्नुहोस्। यसले पुराना डाटा मात्र मिलाउँछ, केही मेटाउँदैन।
        </div>
        {[
          {key:"dupChapters",label:"दोहोरिएका अध्याय मिलाउनुहोस्",desc:"एउटै नामका दोहोरिएका अध्यायलाई एउटैमा गाभ्छ र सबै फाइल/पाठ/प्रश्न सोहीमा सार्छ।",fn:db.repairDuplicateChapters},
          {key:"chapterTag",label:"पुराना ट्याग मिलाउनुहोस्",desc:"पुरानो नामबाट मात्र बचेका पाठ/प्रश्न/क्रियाकलापलाई सही अध्यायसँग जोड्छ।",fn:db.repairChapterTagging},
          {key:"materialType",label:"फाइल प्रकार मिलाउनुहोस्",desc:"पुराना फाइलहरूको प्रकार (content type) मर्मत गर्छ।",fn:db.repairMaterialContentTypes},
        ].map((tool)=>(
          <div key={tool.key} style={{padding:"10px 0",borderBottom:`1px solid ${BORDER}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontSize:16,fontWeight:700,color:INK}}>{tool.label}</div>
                <div style={{fontSize:14,color:INK_SOFT}}>{tool.desc}</div>
              </div>
              <button className="ss-btn" disabled={repairBusy===tool.key} onClick={()=>runRepair(tool.key,tool.fn)} style={{background:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:15,cursor:"pointer",color:INK,flexShrink:0,boxShadow:SHADOW.sm}}>
                {repairBusy===tool.key?"चलिरहेको...":"चलाउनुहोस्"}
              </button>
            </div>
            {repairMsg[tool.key]&&<div style={{fontSize:14.5,color:ACCENT,fontWeight:600,marginTop:6}}>{repairMsg[tool.key]}</div>}
          </div>
        ))}
      </Card>

      <Card>
        <SectionLabel icon={SettingsIcon}>एपको बारेमा</SectionLabel>
        {[["नाम","शिक्षा साथी"],["संस्करण","3.1"],["AI","Google Gemini (निःशुल्क)"],["डाटाबेस","Supabase (निःशुल्क)"],["होस्टिङ","Vercel (निःशुल्क)"]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BORDER}`}}><div style={{fontSize:16,color:INK_SOFT}}>{l}</div><div style={{fontSize:16,fontWeight:600,color:INK}}>{v}</div></div>)}
      </Card>
    </div>
  );
}

export default function App() {
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [screen,setScreen]=useState("dashboard");
  const [activeLesson,setActiveLesson]=useState(null);
  const [activeLessonAutoPrint,setActiveLessonAutoPrint]=useState(false);
  // NEW — lets a lesson be opened for editing from OUTSIDE the Planner
  // screen (e.g. the "सम्पादन गर्नुहोस्" button inside the full-screen lesson
  // viewer): we switch to the Planner tab and hand it this id, and Planner
  // picks up editing from there. This is part of the interconnection fix —
  // screens now hand off to each other instead of being dead ends.
  const [editLessonId,setEditLessonId]=useState(null);
  // NEW — lets the Dashboard's "chapter prepared" card jump straight to the
  // Planner with that chapter already selected, instead of landing on an
  // empty Planner and making the teacher re-pick/re-type the same chapter
  // they just worked with.
  const [prefillChapter,setPrefillChapter]=useState(null);
  const goPlanner=useCallback((chapter)=>{setPrefillChapter(typeof chapter==="string"?chapter:null);setScreen("planner");},[]);
  // NEW — lets Search results jump straight into the right AI Tools
  // sub-tab (Question Bank / Activities / Assessment) instead of always
  // landing on Question Bank and making the teacher click around to find
  // what they searched for.
  const [aiToolsTab,setAiToolsTab]=useState(null);
  const goAITools=useCallback((tab)=>{setAiToolsTab(typeof tab==="string"?tab:null);setScreen("aitools");},[]);
  // NEW — one-click print from the Planner list: open the lesson AND print
  // it immediately, no second tap required.
  const openLesson=useCallback((l,opts)=>{setActiveLesson(l);setActiveLessonAutoPrint(!!opts?.autoPrint);},[]);
  const editLessonFromViewer=useCallback((l)=>{setActiveLesson(null);setEditLessonId(l.id);setScreen("planner");},[]);
  const [showMore,setShowMore]=useState(false);
  const [sections,setSections]=useState([]);
  const [currentSection,setCurrentSection]=useState(null);
  const [lessons,setLessons]=useState([]);
  const [homework,setHomework]=useState([]);
  const [lessonsLoading,setLessonsLoading]=useState(false);
  const [hwLoading,setHwLoading]=useState(false);
  const [synced,setSynced]=useState(false);
  const [chapters,setChapters]=useState([]);

  // NEW — installability. Chrome/Edge on both desktop and Android fire
  // "beforeinstallprompt" instead of showing their own UI automatically once
  // a PWA qualifies (valid manifest + service worker); we catch it, hold onto
  // it, and trigger it ourselves from a real "एप इन्स्टल गर्नुहोस्" button so
  // the option is actually visible instead of hiding in a browser menu.
  // iOS Safari never fires this event at all — there is no programmatic
  // install API there — so it gets manual "Add to Home Screen" steps instead.
  const [installPrompt,setInstallPrompt]=useState(null);
  const [isStandalone,setIsStandalone]=useState(false);
  const isIOS = typeof navigator!=="undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(()=>{
    const checkStandalone=()=>setIsStandalone(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true);
    checkStandalone();
    const onBIP=(e)=>{ e.preventDefault(); setInstallPrompt(e); };
    const onInstalled=()=>{ setInstallPrompt(null); setIsStandalone(true); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return()=>{ window.removeEventListener("beforeinstallprompt", onBIP); window.removeEventListener("appinstalled", onInstalled); };
  },[]);
  const promptInstall=async()=>{
    if(!installPrompt)return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // NEW — dark/light mode. The actual color values live in CSS variables
  // (see the <style> block below); this just toggles which set applies,
  // and remembers the choice for next time.
  const [theme,setTheme]=useState(()=>{
    try{ return localStorage.getItem("ss-theme")||"dark"; }catch{ return "dark"; }
  });
  useEffect(()=>{ try{ localStorage.setItem("ss-theme", theme); }catch{} },[theme]);
  const toggleTheme=()=>setTheme((t)=>t==="light"?"dark":"light");
  useEffect(()=>{ document.documentElement.setAttribute("data-theme", theme); },[theme]);

  // NEW — class/subject are no longer hardcoded. They're stored locally per
  // device (same pattern as the theme toggle above) and editable from
  // Settings, so the same app works for any class and any subject instead of
  // being permanently "कक्षा ५ · सामाजिक अध्ययन". Every AI prompt that used to
  // hardcode that string now reads classContext instead.
  const [classLabel,setClassLabelState]=useState(()=>{
    try{ return localStorage.getItem("ss-class")||"कक्षा ५"; }catch{ return "कक्षा ५"; }
  });
  const [subjectLabel,setSubjectLabelState]=useState(()=>{
    try{ return localStorage.getItem("ss-subject")||"सामाजिक अध्ययन"; }catch{ return "सामाजिक अध्ययन"; }
  });
  const setClassLabel=(v)=>{setClassLabelState(v);try{localStorage.setItem("ss-class",v);}catch{}};
  const setSubjectLabel=(v)=>{setSubjectLabelState(v);try{localStorage.setItem("ss-subject",v);}catch{}};
  const classContext=`${classLabel} ${subjectLabel}`.trim();

  // NEW — teacher's display name, used in Settings and the dashboard greeting
  // instead of a generic label / the account's raw email.
  const [teacherName,setTeacherNameState]=useState(()=>{
    try{ return localStorage.getItem("ss-teacher-name")||""; }catch{ return ""; }
  });
  const setTeacherName=(v)=>{setTeacherNameState(v);try{localStorage.setItem("ss-teacher-name",v);}catch{}};

  // NEW — inject the theme's CSS variables directly, once, on first mount.
  // This runs before the login screen or spinner ever renders (hooks always
  // run before the early `return`s below), so colors exist immediately no
  // matter what — it doesn't depend on index.html having been updated too.
  useEffect(()=>{
    if(document.getElementById("ss-theme-vars"))return;
    const style=document.createElement("style");
    style.id="ss-theme-vars";
    style.textContent=`
      [data-theme="light"]{--bg:#F7F4EB;--bg-grad:#ECE4CD;--surface:#FFFFFF;--surface-2:#FBF8EF;--ink:#141B2E;--ink-soft:#5B6478;--border:#E1DCC8;--accent:#20388F;--accent-dark:#152867;--accent-light:#E4E9F8;--marigold:#C98A1E;--marigold-dark:#9C6B12;--teal:#1B8C82;--teal-light:#E1F2F0;--violet:#7259B5;--violet-light:#EFE9FA;--blue:#3167B0;--blue-light:#E7EEFA;--rose:#B85C78;--rose-light:#F7E7ED;--danger:#B3261E;--danger-bg:#FBEAE6;--warn:#9C6B12;--warn-bg:#FBF0DA;--shadow-rgb:15,19,36;--card-sheen:rgba(255,255,255,0.8);}
      [data-theme="dark"]{--bg:#0B0F1A;--bg-grad:#121A2E;--surface:#161F33;--surface-2:#1E2A44;--ink:#EEF1F8;--ink-soft:#9AA3BD;--border:#2A3552;--accent:#4C6FE0;--accent-dark:#3050C4;--accent-light:#1B2647;--marigold:#F5A93F;--marigold-dark:#D68A1E;--teal:#3FB8C9;--teal-light:#122D36;--violet:#A98CE8;--violet-light:#241B3E;--blue:#5C93EA;--blue-light:#152540;--rose:#E88CA0;--rose-light:#3A1F2A;--danger:#F0685A;--danger-bg:#3A1E1A;--warn:#E8A23A;--warn-bg:#3A2A12;--shadow-rgb:2,4,12;--card-sheen:rgba(255,255,255,0.07);}
      html,body{background:radial-gradient(1100px 620px at 12% -8%, var(--bg-grad), var(--bg) 55%);}
    `;
    document.head.appendChild(style);
    document.documentElement.setAttribute("data-theme", theme);
  },[]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);

  // NEW — reloads whenever classLabel changes (not just once on mount), so
  // switching from "कक्षा ५" to "कक्षा ६" in Settings swaps in that class's
  // own textbook right away instead of keeping last year's in memory.
  useEffect(()=>{
    gemini.loadTextbook(classLabel).then((b64)=>{ window.__textbookPDF__=b64||null; });
  },[classLabel]);

  useEffect(()=>{
    if(!session)return;
    db.getSections().then(({data})=>{if(data?.length){setSections(data);setCurrentSection(data[0]);}});
  },[session]);

  // NEW — one shared list of real chapters, loaded once and passed down to
  // every screen that needs a chapter picker (Materials, Planner, Question
  // Bank, Activities, Assessment). This is what powers the dropdown instead
  // of everyone typing chapter names separately.
  const loadChapters=useCallback(async()=>{
    const{data}=await db.getChapters(classLabel);
    setChapters(data||[]);
  },[classLabel]);
  useEffect(()=>{ if(session) loadChapters(); },[session,loadChapters]);

  const addChapter=useCallback(async(title)=>{
    await db.getOrCreateChapterId(title,classLabel);
    await loadChapters();
  },[loadChapters,classLabel]);

  const loadLessons=useCallback(async()=>{
    setLessonsLoading(true);
    const{data}=await db.getLessons(currentSection?.id||null,classLabel);
    setLessons(data||[]);setLessonsLoading(false);setSynced(true);
    setTimeout(()=>setSynced(false),2000);
  },[currentSection,classLabel]);

  const loadHomework=useCallback(async()=>{
    setHwLoading(true);
    const{data}=await db.getHomework(currentSection?.id||null);
    setHomework(data||[]);setHwLoading(false);
  },[currentSection]);

  useEffect(()=>{if(session){loadLessons();loadHomework();}},[session,loadLessons,loadHomework]);

  const nav=[
    {id:"dashboard",label:"आज",icon:Home,color:ACCENT},
    {id:"ai",label:"AI",icon:Bot,color:VIOLET},
    {id:"planner",label:"योजना",icon:CalendarDays,color:TEAL},
    {id:"materials",label:"सामग्री",icon:BookOpen,color:MARIGOLD_DARK},
  ];
  const navMore=[
    {id:"aitools",label:"AI उपकरण",icon:Wand2,color:VIOLET},
    {id:"homework",label:"गृहकार्य",icon:ListChecks,color:BLUE},
    {id:"journal",label:"डायरी",icon:Heart,color:ROSE},
    {id:"search",label:"खोज",icon:Search,color:TEAL},
    {id:"calendar",label:"पात्रो",icon:CalendarDays,color:MARIGOLD_DARK},
    {id:"settings",label:"सेटिङ",icon:SettingsIcon,color:INK_SOFT},
  ];

  if(authLoading)return<div style={{minHeight:"100vh",background:"var(--bg,#F7F4EC)",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;
  if(!session)return<LoginScreen onLogin={setSession}/>;

  return(
    <div data-theme={theme} style={{fontFamily:"'Inter','Noto Sans Devanagari',sans-serif",background:PAPER,minHeight:"100vh",color:INK,fontSize:17,transition:"background .2s ease, color .2s ease"}}>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;-webkit-font-smoothing:antialiased;}
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        /* NEW — light/dark color tokens. Everything in the component tree
           reads these via var(--x), so toggling data-theme instantly
           re-colors the whole app with no per-component logic needed. */
        [data-theme="light"]{
          --bg:#F7F4EB; --bg-grad:#ECE4CD; --surface:#FFFFFF; --surface-2:#FBF8EF;
          --ink:#141B2E; --ink-soft:#5B6478; --border:#E1DCC8;
          --accent:#20388F; --accent-dark:#152867; --accent-light:#E4E9F8;
          --marigold:#C98A1E; --marigold-dark:#9C6B12;
          --teal:#1B8C82; --teal-light:#E1F2F0;
          --violet:#7259B5; --violet-light:#EFE9FA;
          --blue:#3167B0; --blue-light:#E7EEFA;
          --rose:#B85C78; --rose-light:#F7E7ED;
          --danger:#B3261E; --danger-bg:#FBEAE6;
          --warn:#9C6B12; --warn-bg:#FBF0DA;
          --shadow-rgb:15,19,36;
          --card-sheen:rgba(255,255,255,0.8);
        }
        [data-theme="dark"]{
          --bg:#0B0F1A; --bg-grad:#121A2E; --surface:#161F33; --surface-2:#1E2A44;
          --ink:#EEF1F8; --ink-soft:#9AA3BD; --border:#2A3552;
          --accent:#4C6FE0; --accent-dark:#3050C4; --accent-light:#1B2647;
          --marigold:#F5A93F; --marigold-dark:#D68A1E;
          --teal:#3FB8C9; --teal-light:#122D36;
          --violet:#A98CE8; --violet-light:#241B3E;
          --blue:#5C93EA; --blue-light:#152540;
          --rose:#E88CA0; --rose-light:#3A1F2A;
          --danger:#F0685A; --danger-bg:#3A1E1A;
          --warn:#E8A23A; --warn-bg:#3A2A12;
          --shadow-rgb:2,4,12;
          --card-sheen:rgba(255,255,255,0.07);
        }

        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes ss-fade-up{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .main-content > *{animation:ss-fade-up .32s cubic-bezier(.2,.7,.2,1) both;}

        /* Devanagari script needs more breathing room than Latin text to read
           well — matras and conjuncts clip against tight leading. */
        body,[data-theme]{line-height:1.55;}

        /* Elevated card + hover lift */
        .ss-card{transition:box-shadow .2s ease, transform .2s ease, background .2s ease, border-color .2s ease;}
        .ss-card-hover:hover{box-shadow:${SHADOW.raisedHover};transform:translateY(-3px);border-color:color-mix(in srgb, ${ACCENT} 25%, var(--border));}
        .ss-card-hover:active{transform:translateY(1px) scale(0.99);box-shadow:${SHADOW.sm};}
        .ss-btn{transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;}
        .ss-btn:hover{filter:brightness(1.04);}
        .ss-btn:active{transform:translateY(1px) scale(0.98);}

        /* Buttons — real hover/active feedback via CSS, not just JS */
        .ss-btn{transition:transform .12s ease, box-shadow .12s ease, filter .12s ease; -webkit-tap-highlight-color:transparent;}
        .ss-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.05);}
        .ss-btn:active:not(:disabled){transform:translateY(0px) scale(0.97);filter:brightness(0.98);}
        .ss-btn:focus-visible{outline:2px solid ${MARIGOLD};outline-offset:2px;}

        /* Icon-only utility buttons (edit/delete/print/close on cards) —
           these previously had zero feedback at all: same pixel before and
           after a tap. A soft round hover/press background makes them read
           as interactive instead of static glyphs. */
        .ss-icon-btn{border-radius:8px;padding:6px;transition:background .15s ease, transform .12s ease; -webkit-tap-highlight-color:transparent; display:inline-flex;}
        .ss-icon-btn:hover:not(:disabled){background:var(--surface-2);}
        .ss-icon-btn:active:not(:disabled){transform:scale(0.92);background:var(--border);}

        /* Inputs — consistent, modern resting + focus appearance across the
           whole app: rounded, softly bordered, with a visible focus ring
           instead of the harsh default browser outline. Scoped with
           :not([type=file]) so hidden upload inputs are untouched, and the
           handful of deliberately-borderless search/chat/calendar fields
           (which set background:transparent inline) are left alone since
           inline styles win over these defaults anyway. */
        input:not([type=file]),select,textarea{
          transition:border-color .15s ease, box-shadow .15s ease, background .15s ease;
          font-family:'Inter','Noto Sans Devanagari',sans-serif;
        }
        input::placeholder,textarea::placeholder{color:${INK_SOFT};opacity:0.75;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${ACCENT} !important;box-shadow:0 0 0 3px ${ACCENT_LIGHT};}
        input:hover:not(:focus):not(:disabled),textarea:hover:not(:focus):not(:disabled){border-color:${INK_SOFT};}

        /* Native <select> — replace the default OS arrow with a themed
           chevron and give it room to breathe; the stock browser arrow next
           to hand-styled borders/radii is what made dropdowns look cheap. */
        select{
          appearance:none; -webkit-appearance:none; -moz-appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B6557' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
          padding-right:34px !important; cursor:pointer;
        }

        /* Shared "field" look for standard form inputs/selects/textareas —
           a soft tinted fill (instead of stark white-on-white) makes it
           obvious at a glance where to type, which was missing before. */
        .ss-field{background:var(--surface-2);color:var(--ink);}
        .ss-field:focus{background:var(--surface);}

        /* Chips / filter pills */
        .ss-chip{transition:transform .12s ease, background .15s ease, color .15s ease, border-color .15s ease;}
        .ss-chip:hover{transform:translateY(-1px);}
        .ss-chip:active{transform:translateY(0) scale(0.96);}

        /* NEW — sidebar items were flat with no hover feedback at all on
           desktop (mouse) use. A soft tint on hover for inactive items. */
        .ss-nav-item{transition:background .15s ease, color .15s ease;}
        .ss-nav-item:hover{background:var(--surface-2) !important;color:var(--ink) !important;}

        ::-webkit-scrollbar{height:9px;width:9px;}
        ::-webkit-scrollbar-track{background:transparent;}

        /* NEW — printing. Anything with class "no-print" (header, nav,
           buttons) disappears on paper; "ss-print-area" content expands to
           fill the page cleanly, in plain black-on-white regardless of
           dark mode. */
        /* NEW — .print-only is the reverse of .no-print: invisible on
           screen, and the ONLY thing shown for elements that use it once
           printing actually starts. This is what makes "print the whole
           plan" work — see the print-only block in LessonMode. */
        .print-only{display:none;}
        @media print{
          @page{margin:1.6cm 1.4cm;}
          .no-print{display:none !important;}
          .print-only{display:block !important;}
          /* FIX — this was the actual cause of stray content (the lesson
             list, its status pills, edit/print/delete icons) appearing
             ABOVE the real printed page. LessonMode/PrintableSheet use
             position:fixed to sit on top of the screen visually, but
             print rendering does not reliably respect that the same way —
             many browsers print the fixed overlay AND the normal page
             flow behind it, stacked one after another. Hiding the
             underlying screen entirely during print is what actually
             prevents that, instead of only hoping position:fixed covers
             it visually. */
          .main-content,.desktop-sidebar,.mobile-bottom-nav{display:none !important;}
          body,[data-theme]{background:#fff !important;color:#000 !important;}
          .ss-print-area{box-shadow:none !important;border:none !important;}
        }
        ::-webkit-scrollbar-thumb{background:${INK_SOFT};opacity:0.35;border-radius:99px;}
        ::-webkit-scrollbar-thumb:hover{background:${INK_SOFT};}

        .desktop-sidebar{display:none;}
        .mobile-bottom-nav{display:flex;}
        .main-content{margin-left:0;padding-bottom:76px;}
        @media(min-width:860px){
          .desktop-sidebar{display:flex;}
          .mobile-bottom-nav{display:none !important;}
          .main-content{margin-left:232px;padding-bottom:24px;}
        }
      `}</style>

      <div className="no-print" style={{background:`linear-gradient(120deg, color-mix(in srgb, color-mix(in srgb, ${ACCENT} 8%, ${SURFACE}) 88%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, ${TEAL} 7%, ${SURFACE}) 88%, transparent) 100%)`,backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",borderBottom:`1px solid ${BORDER}`,padding:"13px 18px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10,boxShadow:"0 4px 16px rgba(var(--shadow-rgb),0.09)"}}>
        <img src="/icons/icon-64.png" alt="शिक्षा साथी" width={40} height={40} style={{borderRadius:12,boxShadow:SHADOW.accent,flexShrink:0}}/>
        <div style={{minWidth:0,overflow:"hidden"}}><div style={{fontWeight:800,fontSize:18.5,letterSpacing:"-0.015em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",background:`linear-gradient(100deg, ${ACCENT} 0%, ${TEAL} 100%)`,WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>शिक्षा साथी</div><div style={{fontSize:14.5,color:`color-mix(in srgb, ${ACCENT} 35%, ${INK_SOFT})`,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{classLabel} · {subjectLabel}</div></div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div title={lessonsLoading?"सिंक हुँदैछ...":synced?"सिंक भयो":"सिंक भएको"} style={{display:"flex",alignItems:"center",gap:4,fontSize:13.5,color:synced?ACCENT:INK_SOFT,fontWeight:700,transition:"color .3s",whiteSpace:"nowrap",background:synced?ACCENT_LIGHT:"transparent",padding:"5px 9px",borderRadius:999}}>
            <RefreshCw size={13} style={{animation:lessonsLoading?"spin 1s linear infinite":"none",flexShrink:0}}/>
            <span className="ss-sync-label">{lessonsLoading?"सिंक...":synced?"सिंक भयो ✓":"सिंक भएको"}</span>
          </div>
          <button onClick={toggleTheme} title={theme==="light"?"गाढा मोडमा जानुहोस्":"उज्यालो मोडमा जानुहोस्"} className="ss-btn" style={{background:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:10,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK,flexShrink:0}}>
            {theme==="light"?<Moon size={16}/>:<Sun size={16}/>}
          </button>
          <button onClick={()=>setScreen("settings")} className="ss-btn" style={{background:screen==="settings"?ACCENT_LIGHT:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:10,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:screen==="settings"?ACCENT:INK_SOFT,flexShrink:0}}><SettingsIcon size={17}/></button>
        </div>
      </div>

      <style>{`@media (max-width:420px){.ss-sync-label{display:none;}}`}</style>

      <div className="no-print"><SectionSelector sections={sections} current={currentSection} onChange={setCurrentSection} onAdd={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}}/></div>

      <div className="desktop-sidebar no-print" style={{position:"fixed",top:0,left:0,bottom:0,width:232,background:`linear-gradient(170deg, color-mix(in srgb, color-mix(in srgb, ${ACCENT} 6%, ${SURFACE}) 90%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, ${TEAL} 5%, ${SURFACE}) 90%, transparent) 100%)`,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderRight:`1px solid ${BORDER}`,flexDirection:"column",paddingTop:118,paddingLeft:12,paddingRight:12,zIndex:5,overflowY:"auto",gap:2}}>
        <div style={{fontSize:12.5,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:INK_SOFT,padding:"0 14px",marginBottom:6}}>मुख्य</div>
        {nav.map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} className={`ss-btn${active?"":" ss-nav-item"}`} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 14px",border:"none",background:active?`linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:"transparent",color:active?"#fff":INK_SOFT,fontWeight:active?700:600,fontSize:16,cursor:"pointer",textAlign:"left",width:"100%",borderRadius:12,boxShadow:active?SHADOW.accent:"none"}}>
            <Icon size={18} color={active?"#fff":n.color}/>{n.label}
          </button>
        );})}
        <div style={{height:1,background:BORDER,margin:"10px 4px"}}/>
        <div style={{fontSize:12.5,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:INK_SOFT,padding:"0 14px",marginBottom:6}}>थप</div>
        {navMore.map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} className={`ss-btn${active?"":" ss-nav-item"}`} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 14px",border:"none",background:active?`linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:"transparent",color:active?"#fff":INK_SOFT,fontWeight:active?700:600,fontSize:16,cursor:"pointer",textAlign:"left",width:"100%",borderRadius:12,boxShadow:active?SHADOW.accent:"none"}}>
            <Icon size={18} color={active?"#fff":n.color}/>{n.label}
          </button>
        );})}
      </div>

      <div className="main-content">
        {screen==="dashboard"&&<HomeScreen onOpenLesson={openLesson} onGoPlanner={goPlanner} onGoHomework={()=>setScreen("homework")} onGoMaterials={()=>setScreen("materials")} onGoAITools={goAITools} onGoSettings={()=>setScreen("settings")} section={currentSection} lessons={lessons} homework={homework} loading={lessonsLoading} chapters={chapters} teacherName={teacherName} onAddChapter={addChapter} classContext={classContext} classLabel={classLabel}/>}
        {screen==="planner"&&<Planner onOpenLesson={openLesson} section={currentSection} lessons={lessons} loading={lessonsLoading} onRefresh={loadLessons} chapters={chapters} onAddChapter={addChapter} classContext={classContext} classLabel={classLabel} editLessonId={editLessonId} onEditConsumed={()=>setEditLessonId(null)} prefillChapter={prefillChapter} onPrefillConsumed={()=>setPrefillChapter(null)}/>}
        {screen==="materials"&&<Materials chapters={chapters} onAddChapter={addChapter} onChaptersChanged={loadChapters} classLabel={classLabel}/>}
        {screen==="ai"&&<AIAssistant lessons={lessons} classContext={classContext} classLabel={classLabel}/>}
        {screen==="homework"&&<HomeworkManager section={currentSection} loading={hwLoading} homework={homework} onRefresh={loadHomework}/>}
        {screen==="journal"&&<TeachingJournal lessons={lessons}/>}
        {screen==="aitools"&&<AITools lessons={lessons} chapters={chapters} onAddChapter={addChapter} classContext={classContext} classLabel={classLabel} initialTab={aiToolsTab} onInitialTabConsumed={()=>setAiToolsTab(null)}/>}
        {screen==="search"&&<DocumentSearch lessons={lessons} homework={homework} classLabel={classLabel} onOpenLesson={openLesson} onGoMaterials={()=>setScreen("materials")} onGoAITools={goAITools} onGoHomework={()=>setScreen("homework")}/>}
        {screen==="calendar"&&<CalendarView classLabel={classLabel}/>}
        {screen==="settings"&&<Settings session={session} sections={sections} currentSection={currentSection} onSectionAdded={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}} onSectionUpdated={(s)=>{setSections((prev)=>prev.map((x)=>x.id===s.id?s:x));if(currentSection?.id===s.id)setCurrentSection(s);}} onSectionDeleted={(id)=>{setSections((prev)=>prev.filter((x)=>x.id!==id));if(currentSection?.id===id)setCurrentSection(sections.find((x)=>x.id!==id)||null);}} theme={theme} onToggleTheme={toggleTheme} installPrompt={installPrompt} isStandalone={isStandalone} isIOS={isIOS} onInstall={promptInstall} classLabel={classLabel} subjectLabel={subjectLabel} onClassChange={setClassLabel} onSubjectChange={setSubjectLabel} teacherName={teacherName} onTeacherNameChange={setTeacherName}/>}
      </div>

      <div className="mobile-bottom-nav no-print" style={{position:"fixed",bottom:0,left:0,right:0,background:`color-mix(in srgb, ${SURFACE} 94%, transparent)`,backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",borderTop:`1px solid ${BORDER}`,justifyContent:"space-around",padding:"7px 6px calc(7px + env(safe-area-inset-bottom))",zIndex:10,boxShadow:"0 -6px 20px rgba(0,0,0,0.07)"}}>
        {nav.map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} className="ss-btn" style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:active?n.color:INK_SOFT,fontSize:12.5,fontWeight:700,cursor:"pointer",padding:"5px 8px 3px",flex:1,borderRadius:14}}>
            <div style={{width:44,height:30,borderRadius:14,background:active?`linear-gradient(160deg, ${n.color} 0%, color-mix(in srgb, ${n.color} 70%, black) 100%)`:`linear-gradient(160deg, color-mix(in srgb, ${n.color} 18%, transparent) 0%, color-mix(in srgb, ${n.color} 7%, transparent) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:active?`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${n.color} 45%, transparent)`:"none",transition:"all .18s ease"}}><Icon size={19} color={active?"#fff":n.color}/></div>
            {n.label}
          </button>
        );})}
        <button onClick={()=>setShowMore(true)} className="ss-btn" style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:navMore.some((n)=>n.id===screen)?ROSE:INK_SOFT,fontSize:12.5,fontWeight:700,cursor:"pointer",padding:"5px 8px 3px",flex:1,borderRadius:14}}>
          <div style={{width:44,height:30,borderRadius:14,background:navMore.some((n)=>n.id===screen)?`linear-gradient(160deg, ${ROSE} 0%, color-mix(in srgb, ${ROSE} 70%, black) 100%)`:`linear-gradient(160deg, color-mix(in srgb, ${ROSE} 18%, transparent) 0%, color-mix(in srgb, ${ROSE} 7%, transparent) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:navMore.some((n)=>n.id===screen)?`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${ROSE} 45%, transparent)`:"none",transition:"all .18s ease"}}><Layers size={19} color={navMore.some((n)=>n.id===screen)?"#fff":ROSE}/></div>
          थप
        </button>
      </div>

      {showMore&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,13,10,0.55)",backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowMore(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:"24px 24px 0 0",padding:20,maxWidth:480,width:"100%",paddingBottom:"calc(40px + env(safe-area-inset-bottom))",boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:800}}>थप विशेषताहरू</div>
              <button className="ss-icon-btn" onClick={()=>setShowMore(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={22}/></button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {/* FIX — every tile used to be an identical bordered box with a
                  plain line icon; now each gets a glossy, colored 3D badge
                  (same recipe as the Materials file-type icons) so all six
                  are visually distinct from each other, not just from the
                  one active tile. */}
              {navMore.map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
                <button key={n.id} onClick={()=>{setScreen(n.id);setShowMore(false);}} className="ss-btn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"16px 6px",borderRadius:16,border:`1.5px solid ${active?n.color:`color-mix(in srgb, ${n.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${n.color} 14%, ${SURFACE})`:SURFACE,color:active?n.color:INK,cursor:"pointer",fontSize:15.5,fontWeight:700,boxShadow:active?`0 6px 16px color-mix(in srgb, ${n.color} 30%, transparent)`:SHADOW.sm}}>
                  <div style={{width:46,height:46,borderRadius:14,background:`linear-gradient(160deg, ${n.color} 0%, color-mix(in srgb, ${n.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${n.color} 40%, transparent)`}}><Icon size={22} color="#fff"/></div>
                  {n.label}
                </button>
              );})}
            </div>
          </div>
        </div>
      )}

      {activeLesson&&<LessonMode lesson={activeLesson} onClose={()=>{setActiveLesson(null);setActiveLessonAutoPrint(false);}} onEdit={editLessonFromViewer} autoPrint={activeLessonAutoPrint} classLabel={classLabel} teacherName={teacherName}/>}
    </div>
  );
}
