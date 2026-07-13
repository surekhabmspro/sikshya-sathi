import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BookOpen, CalendarDays, CheckCircle2, ClipboardList, ChevronLeft,
  Sparkles, FileText, Users, MessageSquare, PenSquare, Layers, Clock,
  X, Home, NotebookPen, Search, Image as ImageIcon, Video, Music,
  FileSpreadsheet, Presentation, Tag, Eye, HelpCircle, CheckSquare,
  Square, Printer, Shuffle, Bot, Send, Lock, ListChecks, Plus, Smile,
  Meh, Frown, Heart, Gamepad2, FolderKanban, Map as MapIcon, Wand2,
  Brain, Copy, ChevronRight, LogOut, User, AlertCircle, Loader,
  Settings as SettingsIcon, Trash2, RefreshCw, BookMarked, Zap,
  Sun, Moon, Lightbulb,
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

// Elevation scale — used for the "premium, elevated" card/button look.
const SHADOW = {
  sm: "0 1px 2px rgba(var(--shadow-rgb),0.06), 0 1px 1px rgba(var(--shadow-rgb),0.04)",
  md: "0 4px 14px rgba(var(--shadow-rgb),0.10), 0 1px 3px rgba(var(--shadow-rgb),0.08)",
  lg: "0 12px 28px rgba(var(--shadow-rgb),0.18), 0 4px 10px rgba(var(--shadow-rgb),0.10)",
  accent: "0 8px 20px rgba(31,77,61,0.28)",
  marigold: "0 8px 20px rgba(217,142,43,0.32)",
};

const FILE_TYPE_META = {
  pdf:   { icon: FileText,        color: "#A23C2A" },
  pptx:  { icon: Presentation,    color: "#D98E2B" },
  doc:   { icon: FileText,        color: "#2C5F9E" },
  image: { icon: ImageIcon,       color: "#9A5B12" },
  video: { icon: Video,           color: "#6B3FA0" },
  audio: { icon: Music,           color: "#1F4D3D" },
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
  other:       { label: "अन्य",              icon: FileText,      color: INK_SOFT },
};
const CATEGORY_ORDER = ["lesson_plan","presentation","qa_solution","exercise","other"];

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
async function getMaterialContext(chapterTitle) {
  if (!chapterTitle || !chapterTitle.trim()) {
    return { pdfBase64: getTextbookPDF(), materialParts: [], matchedCount: 0 };
  }
  const chapterId = await db.getChapterIdByTitle(chapterTitle.trim());
  if (!chapterId) return { pdfBase64: getTextbookPDF(), materialParts: [], matchedCount: 0 };
  const { data: materials } = await db.getMaterialsByChapter(chapterId);
  const materialParts = await gemini.buildMaterialParts(materials || [], db.downloadMaterialFile);
  return { pdfBase64: getTextbookPDF(), materialParts, matchedCount: (materials || []).length };
}

// NEW — a real elevated, "premium" button with hover lift, active press,
// and a soft focus ring, done in plain inline styles + a couple of CSS
// classes injected globally (see the <style> block in App()) so :hover and
// :active actually work instead of relying only on JS mouse handlers.
function Button({ children, onClick, variant="primary", size="md", disabled, style, icon:Icon, type }) {
  const variants = {
    primary:   { background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`, color:"#fff", border:"none", boxShadow:SHADOW.accent },
    marigold:  { background:`linear-gradient(180deg, #E39A34 0%, ${MARIGOLD} 100%)`, color:"#2A1E07", border:"none", boxShadow:SHADOW.marigold },
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
        borderRadius:12, fontWeight:700, fontFamily:"Inter,sans-serif",
        cursor:disabled?"wait":"pointer", opacity:disabled?0.7:1,
        ...variants[variant], ...sizes[size], ...style,
      }}>
      {Icon&&<Icon size={size==="lg"?19:size==="sm"?14:16}/>}
      {children}
    </button>
  );
}

function Card({ children, onClick, style }) {
  return (
    <div onClick={onClick}
      className={onClick?"ss-card ss-card-hover":"ss-card"}
      style={{ background:SURFACE, border:`1px solid ${BORDER}`, borderRadius:18, padding:24, cursor:onClick?"pointer":"default", boxShadow:SHADOW.sm, ...style }}>
      {children}
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize:16, letterSpacing:"0.06em", textTransform:"uppercase", color:INK_SOFT, marginBottom:11, fontWeight:700 }}>{children}</div>;
}
function StatusPill({ status }) {
  const map = { ready:{label:"तयार",bg:ACCENT_LIGHT,color:ACCENT}, prep:{label:"तयारी चाहिने",bg:WARN_BG,color:WARN}, missing:{label:"सुरु नभएको",bg:DANGER_BG,color:DANGER} };
  const s = map[status]||map.prep;
  return <span style={{ background:s.bg, color:s.color, fontSize:15.5, fontWeight:700, padding:"4px 12px", borderRadius:999 }}>{s.label}</span>;
}
function Spinner({ small }) {
  return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:small?0:40 }}><Loader size={small?18:28} color={ACCENT} style={{ animation:"spin 1s linear infinite" }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;
}
function ErrorMsg({ msg }) {
  return <div style={{ display:"flex", alignItems:"center", gap:9, background:DANGER_BG, borderRadius:12, padding:"12px 15px", fontSize:16, color:DANGER, margin:"10px 0", fontWeight:500 }}><AlertCircle size={17}/>{msg}</div>;
}
function AIButton({ label, onClick, loading }) {
  return <Button variant="ghost" size="sm" onClick={onClick} disabled={loading} icon={loading?undefined:Zap}>{loading?<><Spinner small/> {label}</>:label}</Button>;
}
function MaterialsHint({ count, chapterTitle }) {
  if (!chapterTitle || !chapterTitle.trim()) return null;
  return (
    <div style={{ fontSize:15, color: count>0?ACCENT:WARN, background: count>0?"#E4EFE6":"#FBEBD3", borderRadius:8, padding:"6px 10px", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
      <FileText size={13}/>
      {count>0?`"${chapterTitle}" मा ट्याग गरिएका ${count} फाइल AI ले प्रयोग गर्दैछ`:`"${chapterTitle}" मा कुनै सामग्री ट्याग गरिएको छैन`}
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
        style={{width:"100%",border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",background:SURFACE,color:value?INK:INK_SOFT}}>
        <option value="">{placeholder||"— अध्याय छान्नुहोस् —"}</option>
        {chapters.map((c)=><option key={c.id} value={c.title}>{c.title}</option>)}
        <option value="__new__">+ नयाँ अध्याय थप्नुहोस्</option>
      </select>
      {showAdd&&(
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input autoFocus value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submitNew()} placeholder="नयाँ अध्यायको नाम लेख्नुहोस्" style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
          <button onClick={submitNew} disabled={adding||!newTitle.trim()} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16,cursor:"pointer"}}>{adding?"...":"थप्नुहोस्"}</button>
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
      <div style={{width:28,height:28,borderRadius:"50%",background:done?ACCENT:WARN_BG,color:done?"#fff":"#7A6F3E",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16,flexShrink:0}}>{done?"✓":num}</div>
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
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const handle=async()=>{
    setError("");setSuccess("");setLoading(true);
    const fn=mode==="login"?db.signIn:db.signUp;
    const{data,error:err}=await fn(email,password);
    setLoading(false);
    if(err){setError(err.message);return;}
    if(mode==="signup"){setSuccess("इमेल जाँच गरी प्रमाणित गर्नुहोस्।");setMode("login");}
    else onLogin(data.session);
  };
  return(
    <div style={{minHeight:"100vh",background:`radial-gradient(circle at 20% 15%, ${ACCENT_LIGHT} 0%, ${PAPER} 45%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:72,height:72,borderRadius:22,background:`linear-gradient(135deg, ${TEAL} 0%, ${ACCENT} 55%, ${ACCENT_DARK} 100%)`,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,margin:"0 auto 18px",boxShadow:SHADOW.accent}}>सि</div>
          <div style={{fontSize:29,fontWeight:800,color:INK,letterSpacing:"-0.02em"}}>शिक्षा साथी</div>
          <div style={{fontSize:16.5,color:INK_SOFT,marginTop:5,fontWeight:500}}>कक्षा ५ · सामाजिक अध्ययन</div>
        </div>
        <Card style={{boxShadow:SHADOW.lg,padding:26}}>
          <div style={{fontSize:19,fontWeight:800,color:INK,marginBottom:18}}>{mode==="login"?"लगइन":"नयाँ खाता"}</div>
          {error&&<ErrorMsg msg={error}/>}
          {success&&<div style={{background:ACCENT_LIGHT,borderRadius:12,padding:"11px 15px",fontSize:16,color:ACCENT,marginBottom:10,fontWeight:600}}>{success}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:13}}>
            <input type="email" placeholder="इमेल" value={email} onChange={(e)=>setEmail(e.target.value)} style={{border:`1.5px solid ${BORDER}`,borderRadius:12,padding:"13px 15px",fontSize:17,fontFamily:"Inter,sans-serif",outline:"none"}}/>
            <input type="password" placeholder="पासवर्ड" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handle()} style={{border:`1.5px solid ${BORDER}`,borderRadius:12,padding:"13px 15px",fontSize:17,fontFamily:"Inter,sans-serif",outline:"none"}}/>
            <Button variant="primary" size="lg" onClick={handle} disabled={loading} style={{width:"100%",marginTop:4}}>{loading?"...":mode==="login"?"लगइन":"खाता बनाउनुहोस्"}</Button>
          </div>
          <div style={{textAlign:"center",marginTop:18,fontSize:16,color:INK_SOFT}}>
            {mode==="login"?<><span>खाता छैन? </span><span onClick={()=>setMode("signup")} style={{color:ACCENT,fontWeight:700,cursor:"pointer"}}>नयाँ बनाउनुहोस्</span></>:<><span>खाता छ? </span><span onClick={()=>setMode("login")} style={{color:ACCENT,fontWeight:700,cursor:"pointer"}}>लगइन</span></>}
          </div>
        </Card>
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
    <div style={{padding:"10px 16px",background:SURFACE,borderBottom:`1px solid ${BORDER}`}}>
      <div style={{display:"flex",gap:8,overflowX:"auto",alignItems:"center"}}>
        {sections.map((s)=>(
          <button key={s.id} onClick={()=>onChange(s)} style={{padding:"6px 14px",borderRadius:999,border:"none",fontWeight:700,fontSize:16,whiteSpace:"nowrap",cursor:"pointer",background:current?.id===s.id?ACCENT:WARN_BG,color:current?.id===s.id?"#fff":"#7A6F3E"}}>{s.name}</button>
        ))}
        {adding?(
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <input autoFocus value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&save()} placeholder="जस्तै: ५ क" style={{border:`1px solid ${BORDER}`,borderRadius:8,padding:"6px 10px",fontSize:16,width:100,fontFamily:"Inter,sans-serif"}}/>
            <button onClick={save} disabled={loading} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:16,cursor:"pointer"}}>{loading?"...":"थप"}</button>
            <button onClick={()=>setAdding(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={16}/></button>
          </div>
        ):(
          <button onClick={()=>setAdding(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:999,border:`1px dashed ${INK_SOFT}`,background:"none",color:INK_SOFT,fontSize:15,fontWeight:600,cursor:"pointer",flexShrink:0}}><Plus size={13}/>थप</button>
        )}
      </div>
    </div>
  );
}

function LessonMode({ lesson, onClose }) {
  const [tab,setTab]=useState("sequence");
  const tabs=[{id:"sequence",label:"पढाउने",icon:ClipboardList},{id:"questions",label:"प्रश्नहरू",icon:MessageSquare},{id:"activities",label:"क्रियाकलाप",icon:Users},{id:"homework",label:"गृहकार्य",icon:PenSquare},{id:"rubric",label:"मूल्याङ्कन",icon:Layers}];
  const objectives=lesson.objectives||[];
  const vocabulary=lesson.vocabulary||[];
  const sequence=lesson.sequence||[];
  const keyQuestions=lesson.key_questions||[];
  const activities=lesson.activities||[];
  const rubric=lesson.rubric||[];
  return(
    <div style={{position:"fixed",inset:0,background:PAPER,zIndex:50,display:"flex",flexDirection:"column"}}>
      <div className="no-print" style={{background:ACCENT,color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer"}}><ChevronLeft size={20}/></button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,opacity:0.75}}>{lesson.chapters?.title||lesson.chapter_title||""}</div>
          <div style={{fontSize:18.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lesson.title}</div>
        </div>
        <button onClick={()=>window.print()} title="प्रिन्ट गर्नुहोस्" style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer",flexShrink:0}}><Printer size={19}/></button>
      </div>
      {(objectives.length>0||vocabulary.length>0)&&(
        <div className="no-print" style={{padding:"12px 16px 8px",background:SURFACE,borderBottom:`1px solid ${BORDER}`}}>
          <div style={{fontSize:15,color:INK_SOFT,marginBottom:5,fontWeight:600}}>आजको उद्देश्य</div>
          <ul style={{margin:0,paddingLeft:16,fontSize:16.5,color:INK,lineHeight:1.6}}>{objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{vocabulary.map((v)=><span key={v} style={{background:WARN_BG,color:MARIGOLD_DARK,fontSize:15,fontWeight:600,padding:"3px 8px",borderRadius:6}}>{v}</span>)}</div>
        </div>
      )}
      <div className="no-print" style={{display:"flex",overflowX:"auto",background:SURFACE,borderBottom:`1px solid ${BORDER}`}}>
        {tabs.map((t)=>{const Icon=t.icon;const active=tab===t.id;return<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"11px 12px",border:"none",background:"none",borderBottom:active?`3px solid ${ACCENT}`:"3px solid transparent",color:active?ACCENT:INK_SOFT,fontWeight:600,fontSize:16,cursor:"pointer",whiteSpace:"nowrap"}}><Icon size={15}/>{t.label}</button>;})}
      </div>
      <div className="no-print" style={{flex:1,overflowY:"auto",padding:16,maxWidth:720,margin:"0 auto",width:"100%"}}>
        {tab==="sequence"&&(<div><SectionLabel>पढाउने क्रम</SectionLabel>{sequence.length===0?<div style={{color:INK_SOFT}}>पढाउने क्रम थपिएको छैन।</div>:(<ol style={{margin:0,paddingLeft:0,listStyle:"none"}}>{sequence.map((s,i)=>(<li key={i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:i<sequence.length-1?`1px solid ${BORDER}`:"none"}}><div style={{width:26,height:26,borderRadius:"50%",background:ACCENT_LIGHT,color:ACCENT,fontWeight:700,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div><div style={{fontSize:17,color:INK,lineHeight:1.5,paddingTop:2}}>{s}</div></li>))}</ol>)}{lesson.notes&&<div style={{marginTop:14,background:WARN_BG,borderRadius:10,padding:12}}><div style={{fontSize:15,fontWeight:700,color:WARN,marginBottom:3}}>नोट</div><div style={{fontSize:16.5,color:"#5E4622"}}>{lesson.notes}</div></div>}</div>)}
        {tab==="questions"&&<div><SectionLabel>कक्षामा सोध्नुहोस्</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:8}}>{keyQuestions.length===0?<div style={{color:INK_SOFT}}>प्रश्नहरू थपिएका छैनन्।</div>:keyQuestions.map((q,i)=><Card key={i}><div style={{fontSize:17,color:INK}}>{q}</div></Card>)}</div></div>}
        {tab==="activities"&&<div><SectionLabel>क्रियाकलापहरू</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:8}}>{activities.length===0?<div style={{color:INK_SOFT}}>क्रियाकलापहरू थपिएका छैनन्।</div>:activities.map((a,i)=><Card key={i}><div style={{fontSize:17,color:INK}}>{a}</div></Card>)}</div></div>}
        {tab==="homework"&&<div><SectionLabel>दिने गृहकार्य</SectionLabel><Card><div style={{fontSize:17,color:INK,lineHeight:1.6}}>{lesson.homework||"गृहकार्य थपिएको छैन।"}</div></Card></div>}
        {tab==="rubric"&&<div><SectionLabel>मूल्याङ्कन मापदण्ड</SectionLabel>{rubric.length===0?<div style={{color:INK_SOFT}}>मूल्याङ्कन मापदण्ड थपिएको छैन।</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{rubric.map((r,i)=><Card key={i}><div style={{fontWeight:700,color:ACCENT,fontSize:16.5,marginBottom:3}}>{r.level}</div><div style={{fontSize:16.5,color:INK}}>{r.desc}</div></Card>)}</div>}</div>}
      </div>
    </div>
  );
}

function StatCard({ icon:Icon, value, label, color, onClick, accent }) {
  return (
    <Card onClick={onClick} style={{padding:18, background: accent?`linear-gradient(135deg, ${color}12, ${color}05)`:SURFACE}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:12,background:color+"1E",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <Icon size={22} color={color}/>
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:26,fontWeight:800,color:INK,lineHeight:1.1}}>{value}</div>
          <div style={{fontSize:15.5,color:INK_SOFT,fontWeight:600,marginTop:2}}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

function Dashboard({ onOpenLesson, onGoPlanner, onGoHomework, onGoMaterials, section, lessons, homework, loading, chapters }) {
  const today=lessons.find((l)=>l.status==="ready")||lessons[0];
  const pending=lessons.filter((l)=>l.status!=="ready").slice(0,4);
  const hwPending=homework.filter((h)=>h.checked_count<h.total_students).slice(0,4);
  const readyCount=lessons.filter((l)=>l.status==="ready").length;
  const [materialsCount,setMaterialsCount]=useState(0);
  const [briefing,setBriefing]=useState("");
  const [briefingLoading,setBriefingLoading]=useState(false);
  useEffect(()=>{ db.getMaterials().then(({data})=>setMaterialsCount((data||[]).length)); },[]);
  useEffect(()=>{ setBriefing(""); },[today?.id]);

  const generateBriefing=async()=>{
    if(!today)return;
    setBriefingLoading(true);setBriefing("");
    try{
      const chapterTitle=today.chapters?.title||today.chapter_title||"";
      const ctx=await getMaterialContext(chapterTitle);
      const prompt=`तपाईं एक शिक्षकलाई कक्षा सुरु हुनुभन्दा पहिले छिटो याद दिलाउँदै हुनुहुन्छ। पाठ: "${today.title}" (अध्याय: "${chapterTitle}")। उद्देश्य: ${(today.objectives||[]).join(", ")||"उल्लेख छैन"}। ३-४ वाक्यमा छोटो, व्यावहारिक ब्रिफिङ दिनुहोस् — के मुख्य कुरा सम्झाउने, कुन गतिविधि सुरु गर्ने, र विद्यार्थीलाई के सोध्ने। सिधै नेपालीमा लेख्नुहोस्, कुनै heading नराख्नुहोस्।`;
      const text=(ctx.materialParts.length||ctx.pdfBase64)?await gemini.generateWithMaterials(prompt,ctx.materialParts,ctx.pdfBase64):await gemini.generateText(prompt);
      setBriefing(text.trim());
    }catch(e){setBriefing("AI ब्रिफिङ ल्याउन सकिएन: "+e.message);}
    setBriefingLoading(false);
  };

  if(loading)return<Spinner/>;
  return(
    <div style={{padding:"18px 18px 130px",maxWidth:1040,margin:"0 auto"}}>
      <GetStartedCard chapters={chapters||[]} materialsCount={materialsCount} lessons={lessons} onGoMaterials={onGoMaterials} onGoPlanner={onGoPlanner}/>

      {today?(
        <div style={{background:`linear-gradient(135deg,${TEAL} 0%, ${ACCENT} 60%, ${ACCENT_DARK} 100%)`,borderRadius:20,padding:26,color:"#fff",marginBottom:22,boxShadow:SHADOW.accent,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,0.06)"}}/>
          <div style={{fontSize:15.5,opacity:0.8,fontWeight:600,letterSpacing:"0.03em",textTransform:"uppercase"}}>{today.chapters?.title||today.chapter_title||""}</div>
          <div style={{fontSize:25,fontWeight:800,margin:"6px 0 4px",letterSpacing:"-0.01em"}}>{today.title}</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}>
            <Button variant="marigold" size="lg" icon={Sparkles} onClick={()=>onOpenLesson(today)}>आजको पाठ सुरु गर्नुहोस्</Button>
            <button onClick={generateBriefing} disabled={briefingLoading} className="ss-btn" style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.16)",color:"#fff",border:"1.5px solid rgba(255,255,255,0.35)",borderRadius:12,padding:"12px 18px",fontWeight:700,fontSize:16,cursor:briefingLoading?"wait":"pointer"}}>
              {briefingLoading?<Spinner small/>:<Lightbulb size={17}/>}AI ब्रिफिङ
            </button>
          </div>
          {briefing&&(
            <div style={{marginTop:16,background:"rgba(255,255,255,0.14)",borderRadius:14,padding:16,fontSize:16,lineHeight:1.65,backdropFilter:"blur(2px)"}}>
              {briefing}
            </div>
          )}
        </div>
      ):(
        <Card style={{marginBottom:22,textAlign:"center",padding:34}}>
          <div style={{color:INK_SOFT,fontSize:17,marginBottom:14}}>{section?"पाठ योजनामा पाठ थप्नुहोस्।":"माथिबाट सेक्सन छान्नुहोस्।"}</div>
          <Button variant="primary" icon={Plus} onClick={onGoPlanner}>पाठ थप्नुहोस्</Button>
        </Card>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:22}}>
        <StatCard icon={BookOpen} value={chapters?.length||0} label="अध्यायहरू" color={ACCENT} accent onClick={onGoMaterials}/>
        <StatCard icon={FileText} value={materialsCount} label="सामग्री फाइल" color={ROSE} accent onClick={onGoMaterials}/>
        <StatCard icon={ClipboardList} value={lessons.length} label="कुल पाठ" color={MARIGOLD} accent onClick={onGoPlanner}/>
        <StatCard icon={CheckCircle2} value={readyCount} label="तयार पाठ" color={TEAL} accent onClick={onGoPlanner}/>
        <StatCard icon={ListChecks} value={homework.length} label="गृहकार्य" color={VIOLET} accent onClick={onGoHomework}/>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><ClipboardList size={17} color={ACCENT}/><div style={{fontWeight:700,color:INK,fontSize:17}}>तयारी चाहिने</div></div>
          {pending.length===0?<div style={{fontSize:16,color:INK_SOFT}}>सबै तयार! ✓</div>:pending.map((l)=>(
            <div key={l.id} onClick={onGoPlanner} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 2px",borderTop:`1px solid ${BORDER}`,cursor:"pointer"}}>
              <div style={{fontSize:16.5,color:INK,fontWeight:600}}>{l.title}</div><StatusPill status={l.status}/>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><CheckCircle2 size={17} color={ACCENT}/><div style={{fontWeight:700,color:INK,fontSize:17}}>जाँच्नुपर्ने गृहकार्य</div></div>
          {hwPending.length===0?<div style={{fontSize:16,color:INK_SOFT}}>सबै जाँच भयो! ✓</div>:hwPending.map((h)=>(
            <div key={h.id} onClick={onGoHomework} style={{display:"flex",justifyContent:"space-between",padding:"10px 2px",borderTop:`1px solid ${BORDER}`,cursor:"pointer"}}>
              <div style={{fontSize:16.5,color:INK}}>{h.title}</div><div style={{fontSize:15.5,color:INK_SOFT,fontWeight:700}}>{h.checked_count}/{h.total_students}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Planner({ onOpenLesson, section, lessons, loading, onRefresh, chapters, onAddChapter }) {
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",status:"missing",chapter_title:"",objectives:"",vocabulary:"",sequence:"",key_questions:"",activities:"",homework:"",notes:""});
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);

  const autoGenerate=async()=>{
    const chapter=form.chapter_title||form.title;
    if(!chapter.trim()){setError("पहिले अध्याय वा पाठको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      // NEW: pulls in the global textbook PDF *and* every material tagged to this chapter
      const ctx=await getMaterialContext(chapter);
      setMatchedCount(ctx.matchedCount||0);
      const result=await gemini.generateLessonPlan(chapter,ctx);
      if(result){
        setForm((prev)=>({...prev,
          objectives:(result.objectives||[]).join("\n"),
          vocabulary:(result.vocabulary||[]).join(", "),
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
    setSaving(true);setError("");
    const payload={...form,section_id:section?.id||null,
      objectives:form.objectives.split("\n").filter(Boolean),
      vocabulary:form.vocabulary.split(",").map((v)=>v.trim()).filter(Boolean),
      sequence:form.sequence.split("\n").filter(Boolean),
      key_questions:form.key_questions.split("\n").filter(Boolean),
      activities:form.activities.split("\n").filter(Boolean),
    };
    const{error:err}=await db.upsertLesson(payload);
    setSaving(false);
    if(err){setError(err.message);return;}
    setShowForm(false);
    setForm({title:"",status:"missing",chapter_title:"",objectives:"",vocabulary:"",sequence:"",key_questions:"",activities:"",homework:"",notes:""});
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
        <button onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ पाठ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:17}}>नयाँ पाठ</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट स्वतः बनाउनुहोस्"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <MaterialsHint count={matchedCount} chapterTitle={form.chapter_title}/>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {[["title","पाठको नाम *"]].map(([f,p])=>(
              <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            ))}
            <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् —"/>
            {[["homework","गृहकार्य"],["notes","नोट"]].map(([f,p])=>(
              <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            ))}
            {[["objectives","उद्देश्यहरू (प्रत्येक नयाँ लाइनमा)"],["vocabulary","शब्दावली (कमाले छुट्याउनुहोस्)"],["sequence","पढाउने क्रम (प्रत्येक नयाँ लाइनमा)"],["key_questions","मुख्य प्रश्नहरू (प्रत्येक नयाँ लाइनमा)"],["activities","क्रियाकलापहरू (प्रत्येक नयाँ लाइनमा)"]].map(([f,p])=>(
              <textarea key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} rows={3} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            ))}
            <div style={{display:"flex",gap:8}}>
              {["missing","prep","ready"].map((s)=><button key={s} onClick={()=>setForm({...form,status:s})} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${form.status===s?ACCENT:BORDER}`,background:form.status===s?"#E4EFE6":"#fff",cursor:"pointer"}}><StatusPill status={s}/></button>)}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:lessons.length===0?<div style={{textAlign:"center",color:INK_SOFT,padding:40}}>कुनै पाठ छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lessons.map((l)=>(
            <Card key={l.id} onClick={()=>onOpenLesson(l)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:15,color:INK_SOFT,fontWeight:600,marginBottom:2}}>{l.chapters?.title||l.chapter_title||""}</div>
                  <div style={{fontSize:17.5,fontWeight:700,color:INK}}>{l.title}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <StatusPill status={l.status}/>
                  <button onClick={(e)=>deleteLesson(l.id,e)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,padding:4}}><Trash2 size={15}/></button>
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
          <button key={key} type="button" onClick={()=>onChange(key)} className="ss-chip" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"10px 6px",borderRadius:12,border:`2px solid ${active?meta.color:BORDER}`,background:active?meta.color+"14":"#fff",color:active?meta.color:INK_SOFT,fontWeight:700,fontSize:15,cursor:"pointer"}}>
            <Icon size={17}/>{meta.label}
          </button>
        );
      })}
    </div>
  );
}

function Materials({ chapters, onAddChapter, onChaptersChanged }) {
  const [materials,setMaterials]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [query,setQuery]=useState("");
  const [preview,setPreview]=useState(null);
  const [previewUrl,setPreviewUrl]=useState("");
  const [error,setError]=useState("");
  const [syncing,setSyncing]=useState(false);
  const [uploadChapter,setUploadChapter]=useState("");
  const [uploadCategory,setUploadCategory]=useState("lesson_plan");
  const [tagging,setTagging]=useState(null);
  const [tagValue,setTagValue]=useState("");
  const [tagCategory,setTagCategory]=useState("other");
  const [retagging,setRetagging]=useState(false);
  const [categoryFilter,setCategoryFilter]=useState("all");
  const [sortBy,setSortBy]=useState("newest");

  const load=useCallback(async()=>{
    setLoading(true);const{data}=await db.getMaterials();setMaterials(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const sync=async()=>{setSyncing(true);await load();setSyncing(false);};

  const addChapterAndRefresh=async(title)=>{
    await onAddChapter(title);
    if(onChaptersChanged) onChaptersChanged();
  };

  const upload=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    if(!uploadChapter.trim()){
      setError("पहिले माथि यो फाइल कुन अध्यायको हो भनी छान्नुहोस्, त्यसपछि फाइल छान्नुहोस्।");
      e.target.value="";
      return;
    }
    setUploading(true);setError("");
    const{data:{user}}=await supabase.auth.getUser();
    const ext=file.name.split(".").pop().toLowerCase();
    const typeMap={pdf:"pdf",pptx:"pptx",ppt:"pptx",doc:"doc",docx:"doc",xlsx:"sheet",xls:"sheet",csv:"sheet",jpg:"image",jpeg:"image",png:"image",mp4:"video",mp3:"audio"};
    const fileType=typeMap[ext]||"doc";

    // NEW: extract text client-side for docx/pptx/xlsx so the AI can actually
    // read it later (Gemini can't take these formats directly like PDFs/images).
    let extracted_text="", extraction_status="not_needed";
    if(["docx","pptx","xlsx","xls","csv"].includes(ext)){
      const res=await extractTextFromFile(file);
      extracted_text=res.text;extraction_status=res.status;
      if(res.status==="failed") setError(`"${file.name}" बाट टेक्स्ट निकाल्न सकिएन। फाइल अपलोड भइरहन्छ, तर AI ले यो प्रयोग गर्न सक्दैन।`);
    }else if(ext==="doc"){
      extraction_status="failed";
      setError(`पुरानो .doc ढाँचा समर्थित छैन — कृपया Word मा ".docx" बनाएर फेरि अपलोड गर्नुहोस्।`);
    }

    // NEW: resolve the typed chapter name to your real chapters table (create
    // it if it doesn't exist yet), so the material links properly via chapter_id.
    const chapterId=await db.getOrCreateChapterId(uploadChapter.trim());

    const{path,error:upErr}=await db.uploadMaterialFile(file,user.id);
    if(upErr){setError(upErr.message);setUploading(false);return;}
    await db.insertMaterial({name:file.name,storage_path:path,file_type:fileType,size_bytes:file.size,tags:[],chapter_id:chapterId,category:uploadCategory,extracted_text,extraction_status});
    setUploading(false);load();e.target.value="";
  };

  const deleteMat=async(mat,e)=>{
    e.stopPropagation();
    if(!confirm(`"${mat.name}" मेटाउने?`))return;
    await db.deleteMaterial(mat.id,mat.storage_path);load();
  };

  const openPreview=async(mat)=>{
    setPreview(mat);setPreviewUrl("");
    const url=await db.getMaterialUrl(mat.storage_path);
    setPreviewUrl(url||"");
  };

  // NEW: tag (or re-tag) an already-uploaded material's chapter + category.
  // If it's a docx/pptx/xlsx uploaded before this feature existed and has
  // no extracted_text yet, re-download it and extract now.
  const openTagEditor=(mat,e)=>{
    e.stopPropagation();
    setTagging(mat);setTagValue(mat.chapters?.title||"");setTagCategory(mat.category||"other");
  };

  const saveTag=async()=>{
    if(!tagging||!tagValue.trim())return;
    setRetagging(true);
    const chapterId=await db.getOrCreateChapterId(tagValue.trim());
    let patch={chapter_id:chapterId, category:tagCategory};
    const ext=tagging.name.split(".").pop().toLowerCase();
    if(!tagging.extracted_text && ["docx","pptx","xlsx","xls","csv"].includes(ext)){
      try{
        const blob=await db.downloadMaterialFile(tagging.storage_path);
        const file=new File([blob],tagging.name);
        const res=await extractTextFromFile(file);
        patch.extracted_text=res.text;patch.extraction_status=res.status;
      }catch(e){patch.extraction_status="failed";}
    }
    await db.updateMaterial(tagging.id,patch);
    setRetagging(false);setTagging(null);load();
  };

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    let list=materials;
    if(categoryFilter!=="all") list=list.filter((m)=>(m.category||"other")===categoryFilter);
    if(q) list=list.filter((m)=>m.name.toLowerCase().includes(q));
    list=[...list].sort((a,b)=>{
      if(sortBy==="name") return a.name.localeCompare(b.name);
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
    return list;
  },[materials,query,categoryFilter,sortBy]);

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
        <div style={{background:WARN_BG,borderRadius:12,padding:"11px 16px",fontSize:16,color:WARN,margin:"12px 0",display:"flex",alignItems:"center",gap:8,fontWeight:600}}>
          <Tag size={15}/>{untaggedCount} फाइलमा अध्याय तोकिएको छैन — AI ले ती फाइल प्रयोग गर्न सक्दैन। तल फाइलमा 🏷️ थिचेर तोक्नुहोस्।
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
          <label className="ss-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:uploadChapter.trim()?`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:"#D8D2C0",color:"#fff",border:"none",borderRadius:12,padding:"13px",fontSize:16.5,fontWeight:700,cursor:uploadChapter.trim()?"pointer":"not-allowed",boxShadow:uploadChapter.trim()?SHADOW.accent:"none"}}>
            <Plus size={16}/>{uploading?"अपलोड र प्रशोधन गर्दै...":"फाइल छान्नुहोस्"}
            <input type="file" onChange={upload} disabled={!uploadChapter.trim()||uploading} style={{display:"none"}} accept=".pdf,.pptx,.ppt,.doc,.docx,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.mp4,.mp3"/>
          </label>
          <div style={{fontSize:15,color:INK_SOFT}}>PDF/तस्बिर सिधै AI लाई देखाइन्छ। Word/PowerPoint/Excel बाट टेक्स्ट स्वतः निकालिन्छ।</div>
        </div>
      </Card>

      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:12,paddingBottom:2}}>
        <button onClick={()=>setCategoryFilter("all")} className="ss-chip" style={{padding:"8px 14px",borderRadius:999,background:categoryFilter==="all"?ACCENT:"#fff",color:categoryFilter==="all"?"#fff":INK,fontWeight:700,fontSize:16,whiteSpace:"nowrap",cursor:"pointer",border:`1.5px solid ${categoryFilter==="all"?ACCENT:BORDER}`,boxShadow:categoryFilter==="all"?SHADOW.sm:"none"}}>सबै ({materials.length})</button>
        {CATEGORY_ORDER.map((key)=>{
          const meta=CATEGORY_META[key];const Icon=meta.icon;const active=categoryFilter===key;
          return(
            <button key={key} onClick={()=>setCategoryFilter(key)} className="ss-chip" style={{display:"flex",alignItems:"center",gap:5,padding:"8px 14px",borderRadius:999,background:active?meta.color:"#fff",color:active?"#fff":INK,fontWeight:700,fontSize:16,whiteSpace:"nowrap",cursor:"pointer",border:`1.5px solid ${active?meta.color:BORDER}`,boxShadow:active?SHADOW.sm:"none"}}><Icon size={13}/>{meta.label} ({categoryCounts[key]||0})</button>
          );
        })}
      </div>

      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 14px"}}>
          <Search size={16} color={INK_SOFT}/>
          <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="फाइल खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:16.5,flex:1,background:"transparent",fontFamily:"Inter,sans-serif"}}/>
        </div>
        <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} style={{border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"Inter,sans-serif",background:SURFACE,color:INK,fontWeight:600}}>
          <option value="newest">नयाँ पहिले</option>
          <option value="name">नाम अनुसार (क-ज्ञ)</option>
        </select>
      </div>

      {loading?<Spinner/>:filtered.length===0?(
        <div style={{textAlign:"center",color:INK_SOFT,padding:50,fontSize:16.5}}>{query?`"${query}" फेला परेन।`:"यो श्रेणीमा फाइल थपिएको छैन।"}</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
          {filtered.map((f)=>{
            const meta=FILE_TYPE_META[f.file_type]||FILE_TYPE_META.doc;const Icon=meta.icon;
            const catMeta=CATEGORY_META[f.category||"other"];const CatIcon=catMeta.icon;
            const needsExtraction=["doc","sheet","pptx"].includes(f.file_type);
            return(
              <Card key={f.id} onClick={()=>openPreview(f)} style={{padding:14,paddingTop:46,position:"relative"}}>
                <div style={{position:"absolute",top:6,right:6,display:"flex",gap:2,zIndex:2}}>
                  <button onClick={(e)=>openTagEditor(f,e)} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:f.chapters?.title?ACCENT:"#C7A34A",boxShadow:SHADOW.sm}} title="अध्याय/प्रकार तोक्नुहोस्"><Tag size={18}/></button>
                  <button onClick={(e)=>deleteMat(f,e)} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK_SOFT,boxShadow:SHADOW.sm}}><Trash2 size={18}/></button>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                  <div style={{width:36,height:36,borderRadius:9,background:meta.color+"1A",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={18} color={meta.color}/></div>
                  <div style={{fontSize:13.5,background:catMeta.color+"18",color:catMeta.color,padding:"3px 8px",borderRadius:6,fontWeight:700,display:"flex",alignItems:"center",gap:4}}><CatIcon size={11}/>{catMeta.label}</div>
                </div>
                <div style={{fontSize:16,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{f.name}</div>
                <div style={{fontSize:14,color:INK_SOFT,marginBottom:6,fontWeight:600}}>{f.file_type?.toUpperCase()}</div>
                {f.chapters?.title?(
                  <span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 8px",borderRadius:6,fontWeight:700,display:"inline-block"}}>{f.chapters.title}</span>
                ):(
                  <span style={{fontSize:13.5,background:WARN_BG,color:WARN,padding:"3px 8px",borderRadius:6,fontWeight:700,display:"inline-block"}}>अध्याय छैन</span>
                )}
                {needsExtraction&&f.extraction_status==="done"&&<div style={{fontSize:13.5,color:ACCENT,marginTop:5,fontWeight:700}}>✓ AI तयार</div>}
                {needsExtraction&&f.extraction_status==="failed"&&<div style={{fontSize:13.5,color:DANGER,marginTop:5,fontWeight:700}}>⚠ टेक्स्ट निकाल्न सकिएन</div>}
              </Card>
            );
          })}
        </div>
      )}
      {preview&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPreview(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:20,maxWidth:640,width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:18,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:10}}>{preview.name}</div>
              <button onClick={()=>setPreview(null)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,flexShrink:0}}><X size={20}/></button>
            </div>
            {!previewUrl?(
              <div style={{textAlign:"center",padding:20,color:INK_SOFT}}>लिङ्क तयार गर्दै...</div>
            ):(
              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
                {preview.file_type==="pdf"&&(
                  <iframe src={previewUrl} title={preview.name} style={{width:"100%",height:"65vh",border:`1px solid ${BORDER}`,borderRadius:12}}/>
                )}
                {preview.file_type==="image"&&(
                  <img src={previewUrl} alt={preview.name} style={{width:"100%",borderRadius:12}}/>
                )}
                {preview.file_type==="video"&&(
                  <video src={previewUrl} controls style={{width:"100%",borderRadius:12}}/>
                )}
                {preview.file_type==="audio"&&(
                  <audio src={previewUrl} controls style={{width:"100%"}}/>
                )}
                {(preview.file_type==="doc"||preview.file_type==="pptx"||preview.file_type==="sheet")&&(
                  <iframe src={`https://docs.google.com/gview?url=${encodeURIComponent(previewUrl)}&embedded=true`} title={preview.name} style={{width:"100%",height:"65vh",border:`1px solid ${BORDER}`,borderRadius:12}}/>
                )}
                <Button variant="primary" onClick={()=>window.open(previewUrl,"_blank")} style={{width:"100%"}}>नयाँ ट्याबमा खोल्नुहोस् / डाउनलोड गर्नुहोस्</Button>
                {(preview.file_type==="doc"||preview.file_type==="pptx"||preview.file_type==="sheet")&&(
                  <div style={{fontSize:14.5,color:INK_SOFT,textAlign:"center"}}>माथिको प्रिभ्यू नदेखिए, केही सेकेन्ड पर्खनुहोस् वा माथिको बटनबाट खोल्नुहोस्।</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {tagging&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setTagging(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:24,maxWidth:420,width:"100%",boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:18,fontWeight:700}}>अध्याय र प्रकार तोक्नुहोस्</div>
              <button onClick={()=>setTagging(null)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={20}/></button>
            </div>
            <div style={{fontSize:16,color:INK_SOFT,marginBottom:14}}>{tagging.name}</div>
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
        <button onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input placeholder="गृहकार्यको शीर्षक" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <input type="number" placeholder="कुल विद्यार्थी" value={form.total_students} onChange={(e)=>setForm({...form,total_students:parseInt(e.target.value)||0})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="टिप्पणी" value={form.remark} onChange={(e)=>setForm({...form,remark:e.target.value})} rows={2} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:homework.length===0?<div style={{textAlign:"center",color:INK_SOFT,padding:40}}>कुनै गृहकार्य छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {homework.map((h)=>{
            const pct=h.total_students>0?Math.round((h.checked_count/h.total_students)*100):0;
            const done=h.checked_count>=h.total_students;
            return(
              <Card key={h.id}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:17,fontWeight:700,color:INK}}>{h.title}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:15,fontWeight:700,color:done?ACCENT:WARN,background:done?"#E4EFE6":"#FBEBD3",padding:"3px 8px",borderRadius:999}}>{h.checked_count}/{h.total_students}</span>
                    <button onClick={()=>deleteHw(h)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><Trash2 size={14}/></button>
                  </div>
                </div>
                <div style={{height:6,background:BORDER,borderRadius:99,marginBottom:10}}>
                  <div style={{height:6,width:`${pct}%`,background:done?ACCENT:MARIGOLD,borderRadius:99}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={()=>bump(h,-1)} style={{width:34,height:34,borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontSize:18.5,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{fontSize:16,color:INK_SOFT,fontWeight:600,flex:1}}>जाँच गर्नुहोस्</div>
                  <button onClick={()=>bump(h,1)} style={{width:34,height:34,borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontSize:18.5,fontWeight:700,cursor:"pointer"}}>+</button>
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

function TeachingJournal() {
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({lesson_title:"",taught:"",difficulty:"",idea:"",mood:"good"});
  const [saving,setSaving]=useState(false);
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getJournalEntries();setEntries(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);
  const save=async()=>{
    if(!form.lesson_title.trim())return;setSaving(true);
    await db.upsertJournalEntry({taught:form.taught,difficulty:form.difficulty,idea:form.idea,mood:form.mood});
    setSaving(false);setShowForm(false);setForm({lesson_title:"",taught:"",difficulty:"",idea:"",mood:"good"});load();
  };
  return(
    <div style={{padding:"20px 20px 130px",maxWidth:820,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><Heart size={20} color={ACCENT}/>डायरी</div>
        {!showForm&&<button onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>थप</button>}
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input placeholder="आजको पाठ" value={form.lesson_title} onChange={(e)=>setForm({...form,lesson_title:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="के पढाइयो?" value={form.taught} onChange={(e)=>setForm({...form,taught:e.target.value})} rows={2} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <textarea placeholder="के गाह्रो भयो?" value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} rows={2} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <textarea placeholder="अर्को पटककालागि सुझाव" value={form.idea} onChange={(e)=>setForm({...form,idea:e.target.value})} rows={2} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(MOOD_META).map(([key,m])=>{const Icon=m.icon;return<button key={key} onClick={()=>setForm({...form,mood:key})} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"8px",borderRadius:10,border:form.mood===key?`2px solid ${m.color}`:`1px solid ${BORDER}`,background:form.mood===key?m.color+"15":"#fff",color:m.color,fontSize:15,fontWeight:700,cursor:"pointer"}}><Icon size={13}/>{m.label}</button>;})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:entries.length===0?<div style={{textAlign:"center",color:INK_SOFT,padding:40}}>कुनै प्रविष्टि छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {entries.map((e)=>{const mood=MOOD_META[e.mood]||MOOD_META.okay;const MIcon=mood.icon;return(
            <Card key={e.id}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:16.5,fontWeight:700,color:INK}}>{e.lessons?.title||e.entry_date}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,background:mood.color+"15",color:mood.color,padding:"3px 9px",borderRadius:999,fontSize:14.5,fontWeight:700}}><MIcon size={12}/>{mood.label}</div>
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

function AIAssistant({ lessons }) {
  const lesson=lessons[0];
  const chapterTitle=lesson?.chapters?.title||lesson?.chapter_title||"";
  const [messages,setMessages]=useState([{role:"ai",text:lesson?`नमस्ते! म "${lesson.title}" पाठ, ट्याग गरिएका सामग्री, र पाठ्यपुस्तकबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस्।`:"नमस्ते! पहिले पाठ योजनामा एउटा पाठ थप्नुहोस्।"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [matchedCount,setMatchedCount]=useState(0);
  const bottomRef=useRef(null);
  const QUICK=["आजको पाठ बुझाउनुहोस्","उद्देश्यहरू देखाउनुहोस्","मुख्य प्रश्नहरू दिनुहोस्","क्रियाकलाप सुझाव दिनुहोस्","गृहकार्य के दिने?","शब्दावली सूची देखाउनुहोस्","मूल्याङ्कन कसरी गर्ने?"];
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{
    if(chapterTitle){
      db.getChapterIdByTitle(chapterTitle).then((id)=>{
        if(!id)return setMatchedCount(0);
        db.getMaterialsByChapter(id).then(({data})=>setMatchedCount((data||[]).length));
      });
    }
  },[chapterTitle]);
  const send=async(text)=>{
    const t=text.trim();if(!t||loading)return;
    setMessages((prev)=>[...prev,{role:"user",text:t}]);setInput("");setLoading(true);
    try{
      const context=lesson?`पाठ: ${lesson.title}\nअध्याय: ${lesson.chapters?.title||lesson.chapter_title||""}\nउद्देश्य: ${(lesson.objectives||[]).join(", ")}\nशब्दावली: ${(lesson.vocabulary||[]).join(", ")}\nक्रियाकलाप: ${(lesson.activities||[]).join(", ")}\nगृहकार्य: ${lesson.homework||""}`: "कुनै पाठ छैन।";
      // NEW: pull in materials tagged to this lesson's chapter, alongside the global textbook
      const ctx=await getMaterialContext(chapterTitle);
      const reply=await gemini.chatWithAI(t,context,ctx);
      setMessages((prev)=>[...prev,{role:"ai",text:reply}]);
    }catch(e){setMessages((prev)=>[...prev,{role:"ai",text:"AI सँग जोडिन सकिएन: "+e.message}]);}
    setLoading(false);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 170px)",maxWidth:720,margin:"0 auto",width:"100%"}}>
      <div style={{padding:"14px 16px 8px"}}>
        <div style={{fontSize:19,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><Bot size={20} color={ACCENT}/>AI शिक्षण सहायक</div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:15,color:INK_SOFT,marginTop:3,flexWrap:"wrap"}}>
          <Zap size={11} color={MARIGOLD}/>Google Gemini AI · {getTextbookPDF()?"पाठ्यपुस्तक लोड भएको ✓":"पाठ्यपुस्तक लोड भएको छैन (सेटिङमा अपलोड गर्नुहोस्)"}
          {chapterTitle&&<span>· "{chapterTitle}" का {matchedCount} सामग्री</span>}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 16px"}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
            <div style={{maxWidth:"88%",background:m.role==="user"?ACCENT:"#fff",color:m.role==="user"?"#fff":INK,border:m.role==="ai"?`1px solid ${BORDER}`:"none",borderRadius:14,padding:"11px 14px",fontSize:16.5,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",marginBottom:10}}><div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"11px 14px",color:INK_SOFT,fontSize:16.5}}>सोच्दै छु...</div></div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"8px 16px",display:"flex",gap:7,overflowX:"auto"}}>
        {QUICK.map((q)=><button key={q} onClick={()=>send(q)} style={{flexShrink:0,background:WARN_BG,color:MARIGOLD_DARK,border:"none",borderRadius:999,padding:"7px 12px",fontSize:15,fontWeight:600,whiteSpace:"nowrap",cursor:"pointer"}}>{q}</button>)}
      </div>
      <div style={{display:"flex",gap:8,padding:"8px 16px 16px"}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send(input)} placeholder="आफ्नो प्रश्न लेख्नुहोस्..." style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:999,padding:"12px 16px",fontSize:16.5,outline:"none",fontFamily:"Inter,sans-serif"}}/>
        <button onClick={()=>send(input)} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:"50%",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}><Send size={17}/></button>
      </div>
    </div>
  );
}

function QuestionBank({ chapters, onAddChapter }) {
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
      const ctx=await getMaterialContext(form.chapter_title);
      setMatchedCount(ctx.matchedCount||0);
      const results=await gemini.generateQuestions(form.chapter_title,ctx);
      if(results?.length){
        for(const q of results)await db.upsertQuestion({text:q.text,type:q.type||"छोटो उत्तर",difficulty:q.difficulty||"सजिलो",bloom_level:q.bloom||"सम्झना",chapter_title:form.chapter_title,options:q.options||[],correct_option:q.correct_option??null});
        load();setShowForm(false);
      }else setError("प्रश्न बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.text.trim()){setError("प्रश्न लेख्नुहोस्।");return;}
    setSaving(true);
    await db.upsertQuestion({text:form.text,type:form.type,difficulty:form.difficulty,bloom_level:form.bloom,chapter_title:form.chapter_title,options:form.options?form.options.split("\n").filter(Boolean):[],correct_option:form.answer?parseInt(form.answer)-1:null});
    setSaving(false);setShowForm(false);setForm({text:"",type:"छोटो उत्तर",difficulty:"सजिलो",bloom:"सम्झना",chapter_title:"",options:"",answer:""});load();
  };

  const deleteQ=async(id,e)=>{e.stopPropagation();if(!confirm("प्रश्न मेटाउने?"))return;await db.deleteQuestion(id);load();};
  const toggle=(id)=>setSelected((prev)=>prev.includes(id)?prev.filter((x)=>x!==id):[...prev,id]);
  const filtered=useMemo(()=>questions.filter((q)=>(diffFilter==="सबै"||q.difficulty===diffFilter)&&(!query.trim()||q.text.toLowerCase().includes(query.toLowerCase()))),[questions,query,diffFilter]);
  const selectedQs=questions.filter((q)=>selected.includes(q.id));

  return(
    <div style={{padding:"20px 20px 150px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>प्रश्न बैंक</div>
        <button onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
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
            <textarea placeholder="प्रश्न (म्यानुअल)" value={form.text} onChange={(e)=>setForm({...form,text:e.target.value})} rows={3} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <select value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})} style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}>{TYPES.map((t)=><option key={t}>{t}</option>)}</select>
              <select value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}>{"सजिलो,मध्यम,कठिन".split(",").map((d)=><option key={d}>{d}</option>)}</select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"10px 14px",marginBottom:10}}>
        <Search size={16} color={INK_SOFT}/>
        <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="प्रश्न खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:16.5,flex:1,background:"transparent",fontFamily:"Inter,sans-serif"}}/>
      </div>
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14}}>
        {DIFFS.map((d)=><button key={d} onClick={()=>setDiffFilter(d)} style={{padding:"6px 12px",borderRadius:999,background:diffFilter===d?ACCENT:"#fff",color:diffFilter===d?"#fff":INK,fontWeight:600,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(diffFilter===d?ACCENT:BORDER)}}>{d}</button>)}
      </div>
      {loading?<Spinner/>:filtered.length===0?<div style={{textAlign:"center",color:INK_SOFT,padding:40}}>कुनै प्रश्न छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map((q)=>{const isSel=selected.includes(q.id);return(
            <Card key={q.id} onClick={()=>toggle(q.id)} style={{display:"flex",gap:10}}>
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
              <button onClick={(e)=>deleteQ(q.id,e)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT,flexShrink:0}}><Trash2 size={14}/></button>
            </Card>
          );})}
        </div>
      )}
      {selected.length>0&&(
        <div style={{position:"fixed",bottom:64,left:0,right:0,display:"flex",justifyContent:"center",padding:"0 16px",zIndex:20}}>
          <button onClick={()=>setShowSet(true)} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:999,padding:"12px 20px",fontWeight:700,fontSize:16.5,display:"flex",alignItems:"center",gap:8,cursor:"pointer",boxShadow:"0 8px 20px rgba(31,77,61,0.25)"}}><Shuffle size={16}/>{selected.length} प्रश्न — सेट बनाउनुहोस्</button>
        </div>
      )}
      {showSet&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowSet(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:"18px 18px 0 0",padding:22,maxWidth:600,width:"100%",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:18,fontWeight:700}}>प्रश्न सेट ({selected.length})</div>
              <button onClick={()=>setShowSet(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={20}/></button>
            </div>
            <ol style={{paddingLeft:18,margin:0,display:"flex",flexDirection:"column",gap:10}}>
              {selectedQs.map((q)=><li key={q.id} style={{fontSize:16.5,color:INK,lineHeight:1.5}}>{q.text}</li>)}
            </ol>
            <div style={{display:"flex",gap:8,marginTop:18}}>
              <button onClick={async()=>{await db.upsertQuestionSet({title:`सेट — ${new Date().toLocaleDateString("ne-NP")}`,question_ids:selected});setSelected([]);setShowSet(false);}} style={{flex:1,background:ACCENT,color:"#fff",border:"none",borderRadius:12,padding:"12px",fontWeight:700,fontSize:16.5,cursor:"pointer"}}>💾 सुरक्षित</button>
              <button onClick={()=>window.print()} style={{flex:1,background:MARIGOLD,color:"#2A1E07",border:"none",borderRadius:12,padding:"12px",fontWeight:700,fontSize:16.5,display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer"}}><Printer size={16}/>प्रिन्ट</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssessmentBuilder({ chapters, onAddChapter }) {
  const [assessments,setAssessments]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [form,setForm]=useState({title:"",type:"observation",rubric_text:"",due_date:"",chapter_title:""});
  const [error,setError]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const TYPES=[{id:"observation",label:"अवलोकन",icon:ClipboardList},{id:"oral",label:"मौखिक",icon:MessageSquare},{id:"practical",label:"व्यावहारिक",icon:NotebookPen},{id:"project",label:"प्रोजेक्ट",icon:FolderKanban},{id:"activity",label:"क्रियाकलाप",icon:Gamepad2},{id:"portfolio",label:"पोर्टफोलियो",icon:BookOpen}];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getAssessments();setAssessments(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    const chapter=form.chapter_title||form.title;if(!chapter){setError("अध्याय लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const ctx=await getMaterialContext(chapter);
      setMatchedCount(ctx.matchedCount||0);
      const prompt=`नेपाल कक्षा ५ "${chapter}" का लागि ${form.type} मूल्याङ्कन मापदण्ड भएको JSON array मात्र: [{"level":"उत्कृष्ट","desc":"..."},{"level":"राम्रो","desc":"..."},{"level":"सहयोग आवश्यक","desc":"..."}]`;
      const rubric=await gemini.generateRubric(prompt,ctx);
      if(rubric)setForm((prev)=>({...prev,rubric_text:rubric.map((r)=>`${r.level}: ${r.desc}`).join("\n")}));
      else setError("मूल्याङ्कन बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);
    const rubric=form.rubric_text?form.rubric_text.split("\n").filter(Boolean).map((line)=>{const[level,...rest]=line.split(":");return{level:level.trim(),desc:rest.join(":").trim()};}):[];
    await db.upsertAssessment({title:form.title,type:form.type,rubric,due_date:form.due_date||null,status:"pending"});
    setSaving(false);setShowForm(false);setForm({title:"",type:"observation",rubric_text:"",due_date:"",chapter_title:""});load();
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>मूल्याङ्कन</div>
        <button onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
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
            <input placeholder="शीर्षक *" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} chapters={chapters||[]} onAddChapter={onAddChapter} placeholder="— अध्याय छान्नुहोस् (AI का लागि) —"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
              {TYPES.map((t)=>{const Icon=t.icon;return<button key={t.id} onClick={()=>setForm({...form,type:t.id})} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 6px",borderRadius:10,border:`2px solid ${form.type===t.id?ACCENT:BORDER}`,background:form.type===t.id?"#E4EFE6":"#fff",color:form.type===t.id?ACCENT:INK,fontWeight:600,fontSize:14.5,cursor:"pointer"}}><Icon size={15}/>{t.label}</button>;})}
            </div>
            <textarea placeholder={"मापदण्ड:\nउत्कृष्ट: ...\nराम्रो: ...\nसहयोग आवश्यक: ..."} value={form.rubric_text} onChange={(e)=>setForm({...form,rubric_text:e.target.value})} rows={4} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <input type="date" value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:assessments.length===0?(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
          {TYPES.map((t)=>{const Icon=t.icon;return<Card key={t.id} onClick={()=>{setForm({...form,type:t.id});setShowForm(true);}}><div style={{width:36,height:36,borderRadius:8,background:ACCENT_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><Icon size={18} color={ACCENT}/></div><div style={{fontWeight:700,fontSize:16}}>{t.label}</div></Card>;})}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {assessments.map((a)=>{const typeInfo=TYPES.find((t)=>t.id===a.type)||TYPES[0];const Icon=typeInfo.icon;return(
            <Card key={a.id}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:ACCENT_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={17} color={ACCENT}/></div>
                <div><div style={{fontSize:17,fontWeight:700,color:INK}}>{a.title}</div><div style={{fontSize:15,color:INK_SOFT}}>{typeInfo.label}{a.due_date?` · ${a.due_date}`:""}</div></div>
              </div>
              {a.rubric?.length>0&&a.rubric.map((r,i)=><div key={i} style={{background:SURFACE_2,borderRadius:7,padding:"6px 10px",fontSize:16,marginBottom:5}}><strong style={{color:ACCENT}}>{r.level}:</strong> {r.desc}</div>)}
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

function ActivitiesLibrary({ chapters, onAddChapter }) {
  const [activities,setActivities]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [typeFilter,setTypeFilter]=useState("सबै");
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
      const ctx=await getMaterialContext(form.chapter_title);
      setMatchedCount(ctx.matchedCount||0);
      const results=await gemini.generateActivities(form.chapter_title,ctx);
      if(results?.length){for(const a of results)await db.upsertActivity({title:a.title,type:a.type||"game",duration:a.duration,competency:a.competency,description:a.description,chapter_title:form.chapter_title});load();setShowForm(false);}
      else setError("क्रियाकलाप बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{if(!form.title.trim())return;setSaving(true);await db.upsertActivity({...form});setSaving(false);setShowForm(false);setForm({title:"",type:"game",competency:"",duration:"",description:"",chapter_title:""});load();};
  const filtered=typeFilter==="सबै"?activities:activities.filter((a)=>a.type===typeFilter);

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>क्रियाकलाप</div>
        <button onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:16,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
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
            <input placeholder="क्रियाकलापको नाम" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <input placeholder="क्षमता" value={form.competency} onChange={(e)=>setForm({...form,competency:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <input placeholder="समय" value={form.duration} onChange={(e)=>setForm({...form,duration:e.target.value})} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="विवरण" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} rows={3} style={{border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {TYPES.map((t)=>{const Icon=t.icon;return<button key={t.id} onClick={()=>setForm({...form,type:t.id})} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 10px",borderRadius:10,border:`2px solid ${form.type===t.id?ACCENT:BORDER}`,background:form.type===t.id?"#E4EFE6":"#fff",color:form.type===t.id?ACCENT:INK,fontWeight:600,fontSize:15.5,cursor:"pointer"}}><Icon size={14}/>{t.label}</button>;})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14}}>
        <button onClick={()=>setTypeFilter("सबै")} style={{padding:"6px 12px",borderRadius:999,background:typeFilter==="सबै"?ACCENT:"#fff",color:typeFilter==="सबै"?"#fff":INK,fontWeight:600,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(typeFilter==="सबै"?ACCENT:BORDER)}}>सबै</button>
        {TYPES.map((t)=>{const Icon=t.icon;return<button key={t.id} onClick={()=>setTypeFilter(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:999,background:typeFilter===t.id?ACCENT:"#fff",color:typeFilter===t.id?"#fff":INK,fontWeight:600,fontSize:15.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(typeFilter===t.id?ACCENT:BORDER)}}><Icon size={13}/>{t.label}</button>;})}
      </div>
      {loading?<Spinner/>:filtered.length===0?<div style={{textAlign:"center",color:INK_SOFT,padding:40}}>कुनै क्रियाकलाप छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map((a)=>{const typeInfo=TYPES.find((t)=>t.id===a.type)||TYPES[0];const Icon=typeInfo.icon;return(
            <Card key={a.id}>
              <div style={{display:"flex",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:ACCENT_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={19} color={ACCENT}/></div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontWeight:700,fontSize:16.5,color:INK}}>{a.title}</div>{a.duration&&<span style={{fontSize:15,color:INK_SOFT}}>{a.duration}</span>}</div>
                  {a.description&&<div style={{fontSize:16,color:INK_SOFT,lineHeight:1.5,marginTop:4}}>{a.description}</div>}
                  <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                    {a.chapter_title&&<span style={{fontSize:14,background:WARN_BG,color:MARIGOLD_DARK,padding:"2px 7px",borderRadius:5,fontWeight:600}}>{a.chapter_title}</span>}
                    {a.competency&&<span style={{fontSize:14,background:ACCENT_LIGHT,color:ACCENT,padding:"2px 7px",borderRadius:5,fontWeight:600}}>{a.competency}</span>}
                  </div>
                </div>
              </div>
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

// NEW — groups the four AI-generation screens (Questions, Activities,
// Assessment, Resources) behind one nav item with internal tabs, instead of
// four separate items cluttering the "थप" menu. Same screens underneath,
// just fewer places to hunt for them.
function AITools({ lessons, chapters, onAddChapter }) {
  const [tab,setTab]=useState("questions");
  const TABS=[
    {id:"questions",label:"प्रश्न बैंक",icon:HelpCircle,color:VIOLET,bg:VIOLET_LIGHT},
    {id:"activities",label:"क्रियाकलाप",icon:Gamepad2,color:TEAL,bg:TEAL_LIGHT},
    {id:"assessment",label:"मूल्याङ्कन",icon:NotebookPen,color:BLUE,bg:BLUE_LIGHT},
    {id:"resources",label:"स्रोत",icon:Wand2,color:MARIGOLD_DARK,bg:WARN_BG},
  ];
  return(
    <div>
      <div style={{display:"flex",overflowX:"auto",background:SURFACE,borderBottom:`1px solid ${BORDER}`,position:"sticky",top:0,zIndex:8}}>
        {TABS.map((t)=>{const Icon=t.icon;const active=tab===t.id;return(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:7,padding:"13px 18px",border:"none",background:active?t.bg:"none",borderBottom:active?`3px solid ${t.color}`:"3px solid transparent",color:active?t.color:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer",whiteSpace:"nowrap",transition:"background .15s"}}><Icon size={16}/>{t.label}</button>
        );})}
      </div>
      {tab==="questions"&&<QuestionBank chapters={chapters} onAddChapter={onAddChapter}/>}
      {tab==="activities"&&<ActivitiesLibrary chapters={chapters} onAddChapter={onAddChapter}/>}
      {tab==="assessment"&&<AssessmentBuilder chapters={chapters} onAddChapter={onAddChapter}/>}
      {tab==="resources"&&<ResourceCreator lessons={lessons}/>}
    </div>
  );
}

function ResourceCreator({ lessons }) {
  const [active,setActive]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [generatedText,setGeneratedText]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const lesson=lessons[0];
  const chapterTitle=lesson?.chapters?.title||lesson?.chapter_title||"";
  const TEMPLATES=[
    {id:"worksheet",title:"कार्यपत्र",icon:FileText,prompt:(l)=>`कक्षा ५ सामाजिक अध्ययन "${l?.title||""}" पाठका लागि अभ्यास कार्यपत्र नेपालीमा बनाउनुहोस्। उद्देश्य: ${(l?.objectives||[]).join(", ")}`},
    {id:"revision",title:"पुनरावलोकन",icon:ClipboardList,prompt:(l)=>`कक्षा ५ "${l?.title||""}" पाठको पुनरावलोकन पाना बनाउनुहोस्। मुख्य बुँदा, शब्दावली र प्रश्नहरू।`},
    {id:"flashcard",title:"फ्ल्यासकार्ड",icon:Copy,prompt:(l)=>`"${l?.title||""}" पाठका शब्दावलीहरू: ${(l?.vocabulary||[]).join(", ")} — फ्ल्यासकार्ड बनाउनुहोस्।`},
    {id:"mindmap",title:"अवधारणा नक्सा",icon:Brain,prompt:(l)=>`"${l?.title||""}" पाठको अवधारणा नक्सा (text format) बनाउनुहोस्।`},
    {id:"vocab",title:"शब्दावली सूची",icon:Tag,prompt:(l)=>`"${l?.title||""}" पाठका शब्दावलीहरू अर्थ र वाक्य प्रयोगसहित: ${(l?.vocabulary||[]).join(", ")}`},
    {id:"practice",title:"अभ्यास प्रश्न",icon:PenSquare,prompt:(l)=>`"${l?.title||""}" पाठका लागि १५ वटा विभिन्न प्रकारका अभ्यास प्रश्नहरू बनाउनुहोस्।`},
  ];

  const generate=async(template)=>{
    setActive(template);setGenerating(true);setGeneratedText("");
    try{
      // NEW: use materials tagged to this lesson's chapter + the global textbook
      const ctx=await getMaterialContext(chapterTitle);
      setMatchedCount(ctx.matchedCount||0);
      const prompt=template.prompt(lesson);
      const text=(ctx.materialParts.length||ctx.pdfBase64)
        ?await gemini.generateWithMaterials(prompt,ctx.materialParts,ctx.pdfBase64)
        :await gemini.generateText(prompt);
      setGeneratedText(text);
    }catch(e){setGeneratedText("त्रुटि: "+e.message);}
    setGenerating(false);
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><Wand2 size={20} color={ACCENT}/>स्रोत निर्माता</div>
      <div style={{fontSize:16,color:INK_SOFT,marginBottom:16}}>{lesson?`"${lesson.title}" — AI बाट स्वतः बनाइन्छ।`:"पहिले पाठ योजनामा पाठ थप्नुहोस्।"}</div>
      <MaterialsHint count={matchedCount} chapterTitle={chapterTitle}/>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:20}}>
        {TEMPLATES.map((t)=>{const Icon=t.icon;return<Card key={t.id} onClick={()=>generate(t)} style={{padding:14,border:active?.id===t.id?`2px solid ${ACCENT}`:`1px solid ${BORDER}`}}><div style={{width:36,height:36,borderRadius:8,background:ACCENT_LIGHT,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><Icon size={18} color={ACCENT}/></div><div style={{fontWeight:700,fontSize:16,color:INK}}>{t.title}</div></Card>;})}
      </div>
      {active&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:17}}>{active.title}</div>
            {!generating&&generatedText&&<button onClick={()=>window.print()} style={{display:"flex",alignItems:"center",gap:5,background:MARIGOLD,color:"#2A1E07",border:"none",borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:16,cursor:"pointer"}}><Printer size={14}/>प्रिन्ट</button>}
          </div>
          {generating?<div style={{display:"flex",alignItems:"center",gap:8,color:INK_SOFT,fontSize:16.5,padding:20}}><Spinner small/>AI बनाउँदैछ...</div>:(
            <pre style={{background:SURFACE_2,borderRadius:10,padding:14,fontSize:16,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"Inter,sans-serif",maxHeight:400,overflowY:"auto"}}>{generatedText}</pre>
          )}
        </Card>
      )}
    </div>
  );
}

function DocumentSearch({ lessons, homework }) {
  const [query,setQuery]=useState("");
  const [allQuestions,setAllQuestions]=useState([]);
  const [allActivities,setAllActivities]=useState([]);
  const [allMaterials,setAllMaterials]=useState([]);
  useEffect(()=>{
    db.getQuestions().then(({data})=>setAllQuestions(data||[]));
    db.getActivities().then(({data})=>setAllActivities(data||[]));
    db.getMaterials().then(({data})=>setAllMaterials(data||[]));
  },[]);
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();if(!q)return[];
    return[
      ...lessons.filter((l)=>l.title?.toLowerCase().includes(q)||(l.objectives||[]).some((o)=>o.toLowerCase().includes(q))).map((l)=>({kind:"पाठ",title:l.title,sub:l.chapters?.title||l.chapter_title||"",icon:ClipboardList,color:ACCENT})),
      ...allMaterials.filter((m)=>m.name?.toLowerCase().includes(q)||m.chapters?.title?.toLowerCase().includes(q)).map((m)=>({kind:"सामग्री",title:m.name,sub:(m.chapters?.title?m.chapters.title+" · ":"")+(m.file_type?.toUpperCase()||""),icon:FileText,color:DANGER})),
      ...allQuestions.filter((qq)=>qq.text?.toLowerCase().includes(q)).map((qq)=>({kind:"प्रश्न",title:qq.text,sub:qq.type+" · "+qq.difficulty,icon:HelpCircle,color:"#6B3FA0"})),
      ...allActivities.filter((a)=>a.title?.toLowerCase().includes(q)||a.description?.toLowerCase().includes(q)).map((a)=>({kind:"क्रियाकलाप",title:a.title,sub:a.chapter_title||"",icon:Gamepad2,color:"#1B7A4A"})),
      ...homework.filter((h)=>h.title?.toLowerCase().includes(q)).map((h)=>({kind:"गृहकार्य",title:h.title,sub:`${h.checked_count}/${h.total_students}`,icon:ListChecks,color:WARN})),
    ];
  },[query,lessons,allMaterials,allQuestions,allActivities,homework]);
  return(
    <div style={{padding:"20px 20px 130px",maxWidth:820,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4}}>सबैतिर खोज</div>
      <div style={{display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"12px 14px",marginBottom:14,marginTop:10}}>
        <Search size={17} color={INK_SOFT}/>
        <input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:17,flex:1,background:"transparent",fontFamily:"Inter,sans-serif"}}/>
      </div>
      {!query.trim()?<div style={{textAlign:"center",color:INK_SOFT,padding:40,fontSize:16.5}}>टाइप गर्नुहोस्...</div>:results.length===0?<div style={{textAlign:"center",color:INK_SOFT,padding:40}}>"{query}" फेला परेन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:15.5,color:INK_SOFT,marginBottom:4}}>{results.length} परिणाम</div>
          {results.map((r,i)=>{const Icon=r.icon;return<Card key={i} style={{display:"flex",gap:10,alignItems:"center"}}><div style={{width:36,height:36,borderRadius:8,background:r.color+"1A",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={17} color={r.color}/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,color:r.color,fontWeight:700,marginBottom:2}}>{r.kind}</div><div style={{fontSize:16.5,color:INK,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>{r.sub&&<div style={{fontSize:15,color:INK_SOFT}}>{r.sub}</div>}</div></Card>;})}
        </div>
      )}
    </div>
  );
}

function CalendarView({ lessons, homework }) {
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const MONTHS=["जनवरी","फेब्रुअरी","मार्च","अप्रिल","मे","जुन","जुलाई","अगस्ट","सेप्टेम्बर","अक्टोबर","नोभेम्बर","डिसेम्बर"];
  const DAYS=["आ","सो","म","बु","बि","शु","श"];
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay();
  const [selected,setSelected]=useState(today.getDate());

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:560,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><CalendarDays size={20} color={ACCENT}/>पात्रो</div>
      <Card style={{marginBottom:14,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}} style={{background:WARN_BG,border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,cursor:"pointer",color:ACCENT,fontSize:18}}>‹</button>
          <div style={{textAlign:"center"}}>
            <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} style={{border:"none",fontWeight:700,fontSize:18,color:INK,cursor:"pointer",background:"transparent",fontFamily:"Inter,sans-serif"}}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e)=>setYear(Number(e.target.value))} style={{border:"none",fontWeight:700,fontSize:18,color:INK,cursor:"pointer",background:"transparent",fontFamily:"Inter,sans-serif",marginLeft:4}}>
              {Array.from({length:5},(_,i)=>today.getFullYear()-1+i).map((y)=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}} style={{background:WARN_BG,border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,cursor:"pointer",color:ACCENT,fontSize:18}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
          {DAYS.map((d)=><div key={d} style={{textAlign:"center",fontSize:15,fontWeight:700,color:INK_SOFT,padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>i+1).map((day)=>{
            const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
            const isSel=day===selected;
            return<button key={day} onClick={()=>setSelected(day)} style={{aspectRatio:1,borderRadius:8,border:"none",background:isToday?ACCENT:isSel?"#E4EFE6":"transparent",color:isToday?"#fff":isSel?ACCENT:INK,fontWeight:isToday||isSel?700:400,fontSize:16.5,cursor:"pointer"}}>{day}</button>;
          })}
        </div>
      </Card>
      <SectionLabel>आजका कार्यहरू</SectionLabel>
      {[...lessons.slice(0,3).map((l)=>({type:"पाठ",title:l.title,color:ACCENT,bg:ACCENT_LIGHT})),...homework.filter((h)=>h.checked_count<h.total_students).slice(0,2).map((h)=>({type:"गृहकार्य",title:h.title,color:WARN,bg:WARN_BG}))].length===0?<div style={{color:INK_SOFT,fontSize:16.5}}>कुनै कार्य छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[...lessons.slice(0,3).map((l)=>({type:"पाठ",title:l.title,color:ACCENT,bg:ACCENT_LIGHT})),...homework.filter((h)=>h.checked_count<h.total_students).slice(0,2).map((h)=>({type:"गृहकार्य",title:h.title,color:WARN,bg:WARN_BG}))].map((item,i)=>(
            <Card key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>
              <span style={{fontSize:14,fontWeight:700,color:item.color,background:item.bg,padding:"3px 8px",borderRadius:5,flexShrink:0}}>{item.type}</span>
              <div style={{fontSize:16.5,color:INK,fontWeight:600}}>{item.title}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Settings({ session, sections, onSectionAdded, theme, onToggleTheme }) {
  const [name,setName]=useState("");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [uploading,setUploading]=useState(false);
  const [pdfLoaded,setPdfLoaded]=useState(!!getTextbookPDF());

  useEffect(()=>{
    gemini.loadTextbook().then((b64)=>{
      if(b64){window.__textbookPDF__=b64;setPdfLoaded(true);}
    });
  },[]);

  const addSection=async()=>{
    if(!name.trim())return;setSaving(true);
    const{data,error}=await db.createSection(name.trim());
    setSaving(false);
    if(error){setMsg("त्रुटि: "+error.message);return;}
    onSectionAdded(data);setName("");setMsg(`"${data.name}" थपियो!`);
    setTimeout(()=>setMsg(""),2000);
  };

  const uploadTextbook=async(e)=>{
    const file=e.target.files[0];
    if(!file||file.type!=="application/pdf"){setMsg("PDF फाइल मात्र।");return;}
    setUploading(true);setMsg("पाठ्यपुस्तक लोड गर्दै... (ठूलो फाइलका लागि केही समय लाग्छ)");
    try{
      const b64=await gemini.fileToBase64(file);
      await gemini.saveTextbook(b64);
      setTextbookPDF(b64);
      setPdfLoaded(true);
      setMsg(`"${file.name}" सफलतापूर्वक लोड भयो! अब AI ले यसबाट उत्तर दिनेछ।`);
    }catch(e){setMsg("त्रुटि: "+e.message);}
    setUploading(false);e.target.value="";
  };

  const clearTextbookHandler=async()=>{
    await gemini.clearTextbook();
    window.__textbookPDF__=null;
    setPdfLoaded(false);
    setMsg("पाठ्यपुस्तक हटाइयो।");setTimeout(()=>setMsg(""),2000);
  };

  return(
    <div style={{padding:"20px 20px 130px",maxWidth:680,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><SettingsIcon size={20} color={ACCENT}/>सेटिङ</div>

      <Card style={{marginBottom:14}}>
        <SectionLabel>देखावट (उज्यालो / गाढा)</SectionLabel>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>theme!=="light"&&onToggleTheme()} className="ss-chip" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:12,border:`2px solid ${theme==="light"?ACCENT:BORDER}`,background:theme==="light"?ACCENT_LIGHT:SURFACE,color:theme==="light"?ACCENT:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer"}}><Sun size={17}/>उज्यालो</button>
          <button onClick={()=>theme!=="dark"&&onToggleTheme()} className="ss-chip" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:12,border:`2px solid ${theme==="dark"?ACCENT:BORDER}`,background:theme==="dark"?ACCENT_LIGHT:SURFACE,color:theme==="dark"?ACCENT:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer"}}><Moon size={17}/>गाढा</button>
        </div>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel>पाठ्यपुस्तक PDF</SectionLabel>
        <div style={{fontSize:16,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>एकपटक PDF अपलोड गर्नुहोस् — AI ले सबैतिर यसबाट स्वतः सामग्री बनाउनेछ, साथै सामग्री खण्डमा अध्याय अनुसार ट्याग गरिएका फाइलहरू पनि प्रयोग हुन्छन्।</div>
        {pdfLoaded?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:10,padding:"10px 14px"}}>
              <BookMarked size={18} color={ACCENT}/>
              <div style={{fontSize:16.5,color:ACCENT,fontWeight:700}}>पाठ्यपुस्तक लोड भएको छ ✓</div>
            </div>
            <button onClick={clearTextbookHandler} style={{display:"flex",alignItems:"center",gap:6,background:DANGER_BG,color:DANGER,border:"none",borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:16,cursor:"pointer"}}><Trash2 size={15}/>पाठ्यपुस्तक हटाउनुहोस्</button>
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
        <SectionLabel>खाता</SectionLabel>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:46,height:46,borderRadius:"50%",background:ACCENT,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18.5,fontWeight:700,flexShrink:0}}>{session?.user?.email?.[0]?.toUpperCase()||"श"}</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,color:INK,fontSize:16.5,overflowWrap:"break-word",wordBreak:"break-word"}}>{session?.user?.email||""}</div><div style={{fontSize:15,color:INK_SOFT}}>कक्षा ५ · सामाजिक अध्ययन</div></div>
        </div>
        <button onClick={()=>db.signOut()} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",borderRadius:10,border:`1px solid ${DANGER_BG}`,background:DANGER_BG,color:DANGER,fontWeight:700,fontSize:16.5,cursor:"pointer"}}><LogOut size={15}/>लगआउट</button>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel>सेक्सनहरू</SectionLabel>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
          {sections.length===0?<div style={{fontSize:16,color:INK_SOFT}}>कुनै सेक्सन छैन।</div>:sections.map((s)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:SURFACE_2,borderRadius:8}}><div style={{width:8,height:8,borderRadius:"50%",background:ACCENT}}/><div style={{fontSize:16.5,fontWeight:600,color:INK}}>{s.name}</div></div>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addSection()} placeholder="नयाँ सेक्सन (जस्तै: कक्षा ५ ख)" style={{flex:1,border:`1px solid ${BORDER}`,borderRadius:10,padding:"10px 12px",fontSize:16.5,fontFamily:"Inter,sans-serif",outline:"none"}}/>
          <button onClick={addSection} disabled={saving} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer"}}>{saving?"...":"थप"}</button>
        </div>
      </Card>

      <Card>
        <SectionLabel>एपको बारेमा</SectionLabel>
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
  const [showMore,setShowMore]=useState(false);
  const [sections,setSections]=useState([]);
  const [currentSection,setCurrentSection]=useState(null);
  const [lessons,setLessons]=useState([]);
  const [homework,setHomework]=useState([]);
  const [lessonsLoading,setLessonsLoading]=useState(false);
  const [hwLoading,setHwLoading]=useState(false);
  const [synced,setSynced]=useState(false);
  const [chapters,setChapters]=useState([]);

  // NEW — dark/light mode. The actual color values live in CSS variables
  // (see the <style> block below); this just toggles which set applies,
  // and remembers the choice for next time.
  const [theme,setTheme]=useState(()=>{
    try{ return localStorage.getItem("ss-theme")||"light"; }catch{ return "light"; }
  });
  useEffect(()=>{ try{ localStorage.setItem("ss-theme", theme); }catch{} },[theme]);
  const toggleTheme=()=>setTheme((t)=>t==="light"?"dark":"light");
  useEffect(()=>{ document.documentElement.setAttribute("data-theme", theme); },[theme]);

  // NEW — inject the theme's CSS variables directly, once, on first mount.
  // This runs before the login screen or spinner ever renders (hooks always
  // run before the early `return`s below), so colors exist immediately no
  // matter what — it doesn't depend on index.html having been updated too.
  useEffect(()=>{
    if(document.getElementById("ss-theme-vars"))return;
    const style=document.createElement("style");
    style.id="ss-theme-vars";
    style.textContent=`
      [data-theme="light"]{--bg:#F7F4EC;--surface:#FFFFFF;--surface-2:#FDFBF6;--ink:#211E1A;--ink-soft:#6B6557;--border:#E7E1D3;--accent:#1F4D3D;--accent-dark:#153728;--accent-light:#E8F3EC;--marigold:#D98E2B;--marigold-dark:#B9741A;--teal:#0E8A87;--teal-light:#E1F5F3;--violet:#7A4FC2;--violet-light:#F0E9FA;--blue:#2E6FBE;--blue-light:#E8F1FC;--rose:#C4436B;--rose-light:#FBE9EF;--danger:#B3402C;--danger-bg:#FBEAE6;--warn:#9A5B12;--warn-bg:#FCF0DA;--shadow-rgb:33,30,26;}
      [data-theme="dark"]{--bg:#14181A;--surface:#1E2528;--surface-2:#242C2F;--ink:#EDEAE3;--ink-soft:#A39C90;--border:#333C3F;--accent:#3FAE8F;--accent-dark:#276954;--accent-light:#1C3833;--marigold:#E8A44A;--marigold-dark:#C98A34;--teal:#3FC2BD;--teal-light:#173B39;--violet:#A886E8;--violet-light:#2B2242;--blue:#6FA3E8;--blue-light:#1E2E42;--rose:#E58AA8;--rose-light:#3A2028;--danger:#E5715A;--danger-bg:#3A2320;--warn:#E0A94E;--warn-bg:#3A2E18;--shadow-rgb:0,0,0;}
      html,body{background:var(--bg);}
    `;
    document.head.appendChild(style);
    document.documentElement.setAttribute("data-theme", theme);
  },[]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    gemini.loadTextbook().then((b64)=>{ if(b64) window.__textbookPDF__=b64; });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session)return;
    db.getSections().then(({data})=>{if(data?.length){setSections(data);setCurrentSection(data[0]);}});
  },[session]);

  // NEW — one shared list of real chapters, loaded once and passed down to
  // every screen that needs a chapter picker (Materials, Planner, Question
  // Bank, Activities, Assessment). This is what powers the dropdown instead
  // of everyone typing chapter names separately.
  const loadChapters=useCallback(async()=>{
    const{data}=await db.getChapters();
    setChapters(data||[]);
  },[]);
  useEffect(()=>{ if(session) loadChapters(); },[session,loadChapters]);

  const addChapter=useCallback(async(title)=>{
    await db.getOrCreateChapterId(title);
    await loadChapters();
  },[loadChapters]);

  const loadLessons=useCallback(async()=>{
    setLessonsLoading(true);
    const{data}=await db.getLessons(currentSection?.id||null);
    setLessons(data||[]);setLessonsLoading(false);setSynced(true);
    setTimeout(()=>setSynced(false),2000);
  },[currentSection]);

  const loadHomework=useCallback(async()=>{
    setHwLoading(true);
    const{data}=await db.getHomework(currentSection?.id||null);
    setHomework(data||[]);setHwLoading(false);
  },[currentSection]);

  useEffect(()=>{if(session){loadLessons();loadHomework();}},[session,loadLessons,loadHomework]);

  const nav=[
    {id:"dashboard",label:"आज",icon:Home},
    {id:"ai",label:"AI",icon:Bot},
    {id:"planner",label:"योजना",icon:CalendarDays},
    {id:"materials",label:"सामग्री",icon:BookOpen},
  ];
  const navMore=[
    {id:"aitools",label:"AI उपकरण",icon:Wand2},
    {id:"homework",label:"गृहकार्य",icon:ListChecks},
    {id:"journal",label:"डायरी",icon:Heart},
    {id:"search",label:"खोज",icon:Search},
    {id:"calendar",label:"पात्रो",icon:CalendarDays},
    {id:"settings",label:"सेटिङ",icon:SettingsIcon},
  ];

  if(authLoading)return<div style={{minHeight:"100vh",background:"var(--bg,#F7F4EC)",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;
  if(!session)return<LoginScreen onLogin={setSession}/>;

  return(
    <div data-theme={theme} style={{fontFamily:"Inter,sans-serif",background:PAPER,minHeight:"100vh",color:INK,fontSize:17,transition:"background .2s ease, color .2s ease"}}>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;-webkit-font-smoothing:antialiased;}
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        /* NEW — light/dark color tokens. Everything in the component tree
           reads these via var(--x), so toggling data-theme instantly
           re-colors the whole app with no per-component logic needed. */
        [data-theme="light"]{
          --bg:#F7F4EC; --surface:#FFFFFF; --surface-2:#FDFBF6;
          --ink:#211E1A; --ink-soft:#6B6557; --border:#E7E1D3;
          --accent:#1F4D3D; --accent-dark:#153728; --accent-light:#E8F3EC;
          --marigold:#D98E2B; --marigold-dark:#B9741A;
          --teal:#0E8A87; --teal-light:#E1F5F3;
          --violet:#7A4FC2; --violet-light:#F0E9FA;
          --blue:#2E6FBE; --blue-light:#E8F1FC;
          --rose:#C4436B; --rose-light:#FBE9EF;
          --danger:#B3402C; --danger-bg:#FBEAE6;
          --warn:#9A5B12; --warn-bg:#FCF0DA;
          --shadow-rgb:33,30,26;
        }
        [data-theme="dark"]{
          --bg:#14181A; --surface:#1E2528; --surface-2:#242C2F;
          --ink:#EDEAE3; --ink-soft:#A39C90; --border:#333C3F;
          --accent:#3FAE8F; --accent-dark:#276954; --accent-light:#1C3833;
          --marigold:#E8A44A; --marigold-dark:#C98A34;
          --teal:#3FC2BD; --teal-light:#173B39;
          --violet:#A886E8; --violet-light:#2B2242;
          --blue:#6FA3E8; --blue-light:#1E2E42;
          --rose:#E58AA8; --rose-light:#3A2028;
          --danger:#E5715A; --danger-bg:#3A2320;
          --warn:#E0A94E; --warn-bg:#3A2E18;
          --shadow-rgb:0,0,0;
        }

        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes ss-fade-up{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .main-content > *{animation:ss-fade-up .28s ease both;}

        /* Elevated card + hover lift */
        .ss-card{transition:box-shadow .2s ease, transform .2s ease, background .2s ease;}
        .ss-card-hover:hover{box-shadow:${SHADOW.lg};transform:translateY(-2px);}
        .ss-card-hover:active{transform:translateY(0px) scale(0.995);}

        /* Buttons — real hover/active feedback via CSS, not just JS */
        .ss-btn{transition:transform .12s ease, box-shadow .12s ease, filter .12s ease; -webkit-tap-highlight-color:transparent;}
        .ss-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.04);}
        .ss-btn:active:not(:disabled){transform:translateY(0px) scale(0.97);filter:brightness(0.98);}
        .ss-btn:focus-visible{outline:2px solid ${MARIGOLD};outline-offset:2px;}

        /* Inputs — consistent focus ring across the app */
        input,select,textarea{transition:border-color .15s ease, box-shadow .15s ease;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${ACCENT} !important;box-shadow:0 0 0 3px ${ACCENT_LIGHT};}

        /* Chips / filter pills */
        .ss-chip{transition:transform .12s ease, background .15s ease, color .15s ease;}
        .ss-chip:hover{transform:translateY(-1px);}
        .ss-chip:active{transform:translateY(0) scale(0.96);}

        ::-webkit-scrollbar{height:8px;width:8px;}
        ::-webkit-scrollbar-track{background:transparent;}

        /* NEW — printing. Anything with class "no-print" (header, nav,
           buttons) disappears on paper; "ss-print-area" content expands to
           fill the page cleanly, in plain black-on-white regardless of
           dark mode. */
        @media print{
          .no-print{display:none !important;}
          .main-content{margin-left:0 !important;padding-bottom:0 !important;}
          body,[data-theme]{background:#fff !important;color:#000 !important;}
          .ss-print-area{box-shadow:none !important;border:none !important;}
        }
        ::-webkit-scrollbar-thumb{background:#D8CFB8;border-radius:99px;}

        .desktop-sidebar{display:none;}
        .mobile-bottom-nav{display:flex;}
        .main-content{margin-left:0;padding-bottom:76px;}
        @media(min-width:860px){
          .desktop-sidebar{display:flex;}
          .mobile-bottom-nav{display:none !important;}
          .main-content{margin-left:232px;padding-bottom:24px;}
        }
      `}</style>

      <div className="no-print" style={{background:`linear-gradient(180deg, ${SURFACE} 0%, ${SURFACE_2} 100%)`,borderBottom:`1px solid ${BORDER}`,padding:"14px 18px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10,boxShadow:SHADOW.sm}}>
        <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(135deg, ${TEAL} 0%, ${ACCENT} 55%, ${ACCENT_DARK} 100%)`,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,boxShadow:SHADOW.accent,flexShrink:0}}>सि</div>
        <div style={{minWidth:0,overflow:"hidden"}}><div style={{fontWeight:800,fontSize:18,letterSpacing:"-0.01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>शिक्षा साथी</div><div style={{fontSize:15,color:INK_SOFT,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>कक्षा ५ · सामाजिक अध्ययन</div></div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div title={lessonsLoading?"सिंक हुँदैछ...":synced?"सिंक भयो":"सिंक भएको"} style={{display:"flex",alignItems:"center",gap:4,fontSize:14.5,color:synced?ACCENT:INK_SOFT,fontWeight:700,transition:"color .3s",whiteSpace:"nowrap"}}>
            <RefreshCw size={14} style={{animation:lessonsLoading?"spin 1s linear infinite":"none",flexShrink:0}}/>
            <span className="ss-sync-label">{lessonsLoading?"सिंक...":synced?"सिंक भयो ✓":"सिंक भएको"}</span>
          </div>
          <button onClick={toggleTheme} title={theme==="light"?"गाढा मोडमा जानुहोस्":"उज्यालो मोडमा जानुहोस्"} style={{background:BORDER,border:"none",borderRadius:9,width:34,height:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK,flexShrink:0}}>
            {theme==="light"?<Moon size={16}/>:<Sun size={16}/>}
          </button>
          <button onClick={()=>setScreen("settings")} style={{background:"none",border:"none",cursor:"pointer",color:screen==="settings"?ACCENT:INK_SOFT,flexShrink:0}}><SettingsIcon size={19}/></button>
        </div>
      </div>

      <style>{`@media (max-width:420px){.ss-sync-label{display:none;}}`}</style>
      
      </div>

      <div className="no-print"><SectionSelector sections={sections} current={currentSection} onChange={setCurrentSection} onAdd={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}}/></div>

      <div className="desktop-sidebar no-print" style={{position:"fixed",top:0,left:0,bottom:0,width:232,background:SURFACE,borderRight:`1px solid ${BORDER}`,flexDirection:"column",paddingTop:118,paddingLeft:10,paddingRight:10,zIndex:5,overflowY:"auto",gap:3}}>
        {[...nav,...navMore].map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} className="ss-btn" style={{display:"flex",alignItems:"center",gap:11,padding:"11px 14px",border:"none",background:active?`linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:"transparent",color:active?"#fff":INK_SOFT,fontWeight:active?700:600,fontSize:16.5,cursor:"pointer",textAlign:"left",width:"100%",borderRadius:12,boxShadow:active?SHADOW.accent:"none"}}>
            <Icon size={18}/>{n.label}
          </button>
        );})}
      </div>

      <div className="main-content">
        {screen==="dashboard"&&<Dashboard onOpenLesson={setActiveLesson} onGoPlanner={()=>setScreen("planner")} onGoHomework={()=>setScreen("homework")} onGoMaterials={()=>setScreen("materials")} section={currentSection} lessons={lessons} homework={homework} loading={lessonsLoading} chapters={chapters}/>}
        {screen==="planner"&&<Planner onOpenLesson={setActiveLesson} section={currentSection} lessons={lessons} loading={lessonsLoading} onRefresh={loadLessons} chapters={chapters} onAddChapter={addChapter}/>}
        {screen==="materials"&&<Materials chapters={chapters} onAddChapter={addChapter} onChaptersChanged={loadChapters}/>}
        {screen==="ai"&&<AIAssistant lessons={lessons}/>}
        {screen==="homework"&&<HomeworkManager section={currentSection} loading={hwLoading} homework={homework} onRefresh={loadHomework}/>}
        {screen==="journal"&&<TeachingJournal/>}
        {screen==="aitools"&&<AITools lessons={lessons} chapters={chapters} onAddChapter={addChapter}/>}
        {screen==="search"&&<DocumentSearch lessons={lessons} homework={homework}/>}
        {screen==="calendar"&&<CalendarView lessons={lessons} homework={homework}/>}
        {screen==="settings"&&<Settings session={session} sections={sections} onSectionAdded={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}} theme={theme} onToggleTheme={toggleTheme}/>}
      </div>

      <div className="mobile-bottom-nav no-print" style={{position:"fixed",bottom:0,left:0,right:0,background:SURFACE,borderTop:`1px solid ${BORDER}`,justifyContent:"space-around",padding:"8px 4px",zIndex:10,boxShadow:"0 -4px 16px rgba(33,30,26,0.06)"}}>
        {nav.map((n)=>{const Icon=n.icon;const active=screen===n.id;return<button key={n.id} onClick={()=>setScreen(n.id)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,color:active?ACCENT:INK_SOFT,fontSize:13.5,fontWeight:700,cursor:"pointer",padding:"4px 6px",flex:1,transition:"color .15s"}}><Icon size={20}/>{n.label}</button>;})}
        <button onClick={()=>setShowMore(true)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:3,color:navMore.some((n)=>n.id===screen)?ACCENT:INK_SOFT,fontSize:13.5,fontWeight:700,cursor:"pointer",padding:"4px 6px",flex:1}}><Layers size={20}/>थप</button>
      </div>

      {showMore&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowMore(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:"22px 22px 0 0",padding:20,maxWidth:480,width:"100%",paddingBottom:44,boxShadow:SHADOW.lg}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:18,fontWeight:800}}>थप विशेषताहरू</div>
              <button onClick={()=>setShowMore(false)} style={{background:"none",border:"none",cursor:"pointer",color:INK_SOFT}}><X size={22}/></button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {navMore.map((n)=>{const Icon=n.icon;const active=screen===n.id;return<button key={n.id} onClick={()=>{setScreen(n.id);setShowMore(false);}} className="ss-btn" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"16px 6px",borderRadius:14,border:`1.5px solid ${active?ACCENT:BORDER}`,background:active?ACCENT_LIGHT:"#fff",color:active?ACCENT:INK,cursor:"pointer",fontSize:15.5,fontWeight:700,boxShadow:active?SHADOW.sm:"none"}}><Icon size={22}/>{n.label}</button>;})}
            </div>
          </div>
        </div>
      )}

      {activeLesson&&<LessonMode lesson={activeLesson} onClose={()=>setActiveLesson(null)}/>}
    </div>
  );
}
