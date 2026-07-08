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
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as db from "./db";
import * as gemini from "./gemini";

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

const getTextbookPDF = () => window.__textbookPDF__ || null;
const setTextbookPDF = (b64) => { window.__textbookPDF__ = b64; };

function Card({ children, onClick, style }) {
  return (
    <div onClick={onClick} style={{ background:"#fff", border:"1px solid #ECE6D8", borderRadius:16, padding:18, cursor:onClick?"pointer":"default", transition:"box-shadow .15s", ...style }}
      onMouseEnter={(e)=>{ if(onClick) e.currentTarget.style.boxShadow="0 6px 20px rgba(31,77,61,0.08)"; }}
      onMouseLeave={(e)=>{ if(onClick) e.currentTarget.style.boxShadow="none"; }}>
      {children}
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize:13, letterSpacing:"0.08em", textTransform:"uppercase", color:"#8A8275", marginBottom:10, fontWeight:600 }}>{children}</div>;
}
function StatusPill({ status }) {
  const map = { ready:{label:"तयार",bg:"#E4EFE6",color:ACCENT}, prep:{label:"तयारी चाहिने",bg:"#FBEBD3",color:"#9A5B12"}, missing:{label:"सुरु नभएको",bg:"#F6E1DC",color:"#A23C2A"} };
  const s = map[status]||map.prep;
  return <span style={{ background:s.bg, color:s.color, fontSize:12, fontWeight:700, padding:"3px 10px", borderRadius:999 }}>{s.label}</span>;
}
function Spinner({ small }) {
  return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:small?0:40 }}><Loader size={small?18:28} color={ACCENT} style={{ animation:"spin 1s linear infinite" }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;
}
function ErrorMsg({ msg }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, background:"#F6E1DC", borderRadius:10, padding:"10px 14px", fontSize:13.5, color:"#A23C2A", margin:"10px 0" }}><AlertCircle size={16}/>{msg}</div>;
}
function AIButton({ label, onClick, loading }) {
  return <button onClick={onClick} disabled={loading} style={{ display:"flex", alignItems:"center", gap:6, background:"#E4EFE6", color:ACCENT, border:"none", borderRadius:10, padding:"8px 14px", fontSize:13, fontWeight:700, cursor:loading?"wait":"pointer" }}>{loading?<Spinner small/>:<Zap size={14}/>}{label}</button>;
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
    <div style={{minHeight:"100vh",background:PAPER,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:60,height:60,borderRadius:18,background:ACCENT,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:700,margin:"0 auto 14px"}}>सि</div>
          <div style={{fontSize:26,fontWeight:700,color:INK}}>शिक्षा साथी</div>
          <div style={{fontSize:14,color:"#8A8275",marginTop:4}}>कक्षा ५ · सामाजिक अध्ययन</div>
        </div>
        <Card>
          <div style={{fontSize:17,fontWeight:700,color:INK,marginBottom:16}}>{mode==="login"?"लगइन":"नयाँ खाता"}</div>
          {error&&<ErrorMsg msg={error}/>}
          {success&&<div style={{background:"#E4EFE6",borderRadius:10,padding:"10px 14px",fontSize:13.5,color:ACCENT,marginBottom:10}}>{success}</div>}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <input type="email" placeholder="इमेल" value={email} onChange={(e)=>setEmail(e.target.value)} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"12px 14px",fontSize:15,fontFamily:"Inter,sans-serif",outline:"none"}}/>
            <input type="password" placeholder="पासवर्ड" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handle()} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"12px 14px",fontSize:15,fontFamily:"Inter,sans-serif",outline:"none"}}/>
            <button onClick={handle} disabled={loading} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:12,padding:"13px",fontWeight:700,fontSize:15,cursor:"pointer",opacity:loading?0.7:1}}>{loading?"...":mode==="login"?"लगइन":"खाता बनाउनुहोस्"}</button>
          </div>
          <div style={{textAlign:"center",marginTop:14,fontSize:13.5,color:"#8A8275"}}>
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
    <div style={{padding:"10px 16px",background:"#fff",borderBottom:"1px solid #ECE6D8"}}>
      <div style={{display:"flex",gap:8,overflowX:"auto",alignItems:"center"}}>
        {sections.map((s)=>(
          <button key={s.id} onClick={()=>onChange(s)} style={{padding:"6px 14px",borderRadius:999,border:"none",fontWeight:700,fontSize:13,whiteSpace:"nowrap",cursor:"pointer",background:current?.id===s.id?ACCENT:"#F4EFE3",color:current?.id===s.id?"#fff":"#7A6F3E"}}>{s.name}</button>
        ))}
        {adding?(
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <input autoFocus value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&save()} placeholder="जस्तै: ५ क" style={{border:"1px solid #ECE6D8",borderRadius:8,padding:"6px 10px",fontSize:13,width:100,fontFamily:"Inter,sans-serif"}}/>
            <button onClick={save} disabled={loading} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,fontSize:13,cursor:"pointer"}}>{loading?"...":"थप"}</button>
            <button onClick={()=>setAdding(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#8A8275"}}><X size={16}/></button>
          </div>
        ):(
          <button onClick={()=>setAdding(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:999,border:"1px dashed #C7BFAE",background:"none",color:"#8A8275",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}><Plus size={13}/>थप</button>
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
      <div style={{background:ACCENT,color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={onClose} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:10,padding:10,display:"flex",cursor:"pointer"}}><ChevronLeft size={20}/></button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,opacity:0.75}}>{lesson.chapters?.title||lesson.chapter_title||""}</div>
          <div style={{fontSize:18,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lesson.title}</div>
        </div>
        <Sparkles size={18} style={{opacity:0.8,flexShrink:0}}/>
      </div>
      {(objectives.length>0||vocabulary.length>0)&&(
        <div style={{padding:"12px 16px 8px",background:"#fff",borderBottom:"1px solid #ECE6D8"}}>
          <div style={{fontSize:12,color:"#6B6557",marginBottom:5,fontWeight:600}}>आजको उद्देश्य</div>
          <ul style={{margin:0,paddingLeft:16,fontSize:14,color:INK,lineHeight:1.6}}>{objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>{vocabulary.map((v)=><span key={v} style={{background:"#F4EFE3",color:"#7A6F3E",fontSize:12,fontWeight:600,padding:"3px 8px",borderRadius:6}}>{v}</span>)}</div>
        </div>
      )}
      <div style={{display:"flex",overflowX:"auto",background:"#fff",borderBottom:"1px solid #ECE6D8"}}>
        {tabs.map((t)=>{const Icon=t.icon;const active=tab===t.id;return<button key={t.id} onClick={()=>setTab(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"11px 12px",border:"none",background:"none",borderBottom:active?`3px solid ${ACCENT}`:"3px solid transparent",color:active?ACCENT:"#8A8275",fontWeight:600,fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}><Icon size={15}/>{t.label}</button>;})}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:16,maxWidth:720,margin:"0 auto",width:"100%"}}>
        {tab==="sequence"&&(<div><SectionLabel>पढाउने क्रम</SectionLabel>{sequence.length===0?<div style={{color:"#8A8275"}}>पढाउने क्रम थपिएको छैन।</div>:(<ol style={{margin:0,paddingLeft:0,listStyle:"none"}}>{sequence.map((s,i)=>(<li key={i} style={{display:"flex",gap:12,padding:"12px 0",borderBottom:i<sequence.length-1?"1px solid #ECE6D8":"none"}}><div style={{width:26,height:26,borderRadius:"50%",background:"#E4EFE6",color:ACCENT,fontWeight:700,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div><div style={{fontSize:15,color:INK,lineHeight:1.5,paddingTop:2}}>{s}</div></li>))}</ol>)}{lesson.notes&&<div style={{marginTop:14,background:"#FBEBD3",borderRadius:10,padding:12}}><div style={{fontSize:12,fontWeight:700,color:"#9A5B12",marginBottom:3}}>नोट</div><div style={{fontSize:14,color:"#5E4622"}}>{lesson.notes}</div></div>}</div>)}
        {tab==="questions"&&<div><SectionLabel>कक्षामा सोध्नुहोस्</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:8}}>{keyQuestions.length===0?<div style={{color:"#8A8275"}}>प्रश्नहरू थपिएका छैनन्।</div>:keyQuestions.map((q,i)=><Card key={i}><div style={{fontSize:15,color:INK}}>{q}</div></Card>)}</div></div>}
        {tab==="activities"&&<div><SectionLabel>क्रियाकलापहरू</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:8}}>{activities.length===0?<div style={{color:"#8A8275"}}>क्रियाकलापहरू थपिएका छैनन्।</div>:activities.map((a,i)=><Card key={i}><div style={{fontSize:15,color:INK}}>{a}</div></Card>)}</div></div>}
        {tab==="homework"&&<div><SectionLabel>दिने गृहकार्य</SectionLabel><Card><div style={{fontSize:15,color:INK,lineHeight:1.6}}>{lesson.homework||"गृहकार्य थपिएको छैन।"}</div></Card></div>}
        {tab==="rubric"&&<div><SectionLabel>मूल्याङ्कन मापदण्ड</SectionLabel>{rubric.length===0?<div style={{color:"#8A8275"}}>मूल्याङ्कन मापदण्ड थपिएको छैन।</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{rubric.map((r,i)=><Card key={i}><div style={{fontWeight:700,color:ACCENT,fontSize:14,marginBottom:3}}>{r.level}</div><div style={{fontSize:14,color:INK}}>{r.desc}</div></Card>)}</div>}</div>}
      </div>
    </div>
  );
}

function Dashboard({ onOpenLesson, onGoPlanner, onGoHomework, section, lessons, homework, loading }) {
  const today=lessons.find((l)=>l.status==="ready")||lessons[0];
  const pending=lessons.filter((l)=>l.status!=="ready").slice(0,3);
  const hwPending=homework.filter((h)=>h.checked_count<h.total_students).slice(0,3);
  if(loading)return<Spinner/>;
  return(
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      {today?(
        <div style={{background:`linear-gradient(135deg,${ACCENT},#143329)`,borderRadius:18,padding:20,color:"#fff",marginBottom:20}}>
          <div style={{fontSize:12,opacity:0.75}}>{today.chapters?.title||today.chapter_title||""}</div>
          <div style={{fontSize:22,fontWeight:700,margin:"5px 0"}}>{today.title}</div>
          <button onClick={()=>onOpenLesson(today)} style={{background:MARIGOLD,color:"#2A1E07",border:"none",borderRadius:12,padding:"12px 20px",fontSize:15,fontWeight:700,display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginTop:12}}><Sparkles size={17}/>आजको पाठ सुरु गर्नुहोस्</button>
        </div>
      ):(
        <Card style={{marginBottom:20,textAlign:"center",padding:28}}>
          <div style={{color:"#8A8275",fontSize:14}}>{section?"पाठ योजनामा पाठ थप्नुहोस्।":"माथिबाट सेक्सन छान्नुहोस्।"}</div>
          <button onClick={onGoPlanner} style={{marginTop:12,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontWeight:700,cursor:"pointer"}}>+ पाठ थप्नुहोस्</button>
        </Card>
      )}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><ClipboardList size={16} color={ACCENT}/><div style={{fontWeight:700,color:INK,fontSize:14}}>तयारी चाहिने</div></div>
          {pending.length===0?<div style={{fontSize:13,color:"#8A8275"}}>सबै तयार! ✓</div>:pending.map((l)=>(
            <div key={l.id} onClick={onGoPlanner} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:"1px solid #F3EFE3",cursor:"pointer"}}>
              <div style={{fontSize:13.5,color:INK,fontWeight:600}}>{l.title}</div><StatusPill status={l.status}/>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><CheckCircle2 size={16} color={ACCENT}/><div style={{fontWeight:700,color:INK,fontSize:14}}>जाँच्नुपर्ने गृहकार्य</div></div>
          {hwPending.length===0?<div style={{fontSize:13,color:"#8A8275"}}>सबै जाँच भयो! ✓</div>:hwPending.map((h)=>(
            <div key={h.id} onClick={onGoHomework} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderTop:"1px solid #F3EFE3",cursor:"pointer"}}>
              <div style={{fontSize:13.5,color:INK}}>{h.title}</div><div style={{fontSize:12,color:"#8A8275",fontWeight:600}}>{h.checked_count}/{h.total_students}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Planner({ onOpenLesson, section, lessons, loading, onRefresh }) {
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",status:"missing",chapter_title:"",objectives:"",vocabulary:"",sequence:"",key_questions:"",activities:"",homework:"",notes:""});
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");

  const autoGenerate=async()=>{
    const chapter=form.chapter_title||form.title;
    if(!chapter.trim()){setError("पहिले अध्याय वा पाठको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const result=await gemini.generateLessonPlan(chapter,getTextbookPDF());
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
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>पाठ योजना</div>
        <button onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ पाठ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:15}}>नयाँ पाठ</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट स्वतः बनाउनुहोस्"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            {[["title","पाठको नाम *"],["chapter_title","अध्याय"],["homework","गृहकार्य"],["notes","नोट"]].map(([f,p])=>(
              <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            ))}
            {[["objectives","उद्देश्यहरू (प्रत्येक नयाँ लाइनमा)"],["vocabulary","शब्दावली (कमाले छुट्याउनुहोस्)"],["sequence","पढाउने क्रम (प्रत्येक नयाँ लाइनमा)"],["key_questions","मुख्य प्रश्नहरू (प्रत्येक नयाँ लाइनमा)"],["activities","क्रियाकलापहरू (प्रत्येक नयाँ लाइनमा)"]].map(([f,p])=>(
              <textarea key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} rows={3} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            ))}
            <div style={{display:"flex",gap:8}}>
              {["missing","prep","ready"].map((s)=><button key={s} onClick={()=>setForm({...form,status:s})} style={{flex:1,padding:"8px",borderRadius:10,border:`2px solid ${form.status===s?ACCENT:"#ECE6D8"}`,background:form.status===s?"#E4EFE6":"#fff",cursor:"pointer"}}><StatusPill status={s}/></button>)}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:lessons.length===0?<div style={{textAlign:"center",color:"#8A8275",padding:40}}>कुनै पाठ छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {lessons.map((l)=>(
            <Card key={l.id} onClick={()=>onOpenLesson(l)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:12,color:"#8A8275",fontWeight:600,marginBottom:2}}>{l.chapters?.title||l.chapter_title||""}</div>
                  <div style={{fontSize:15.5,fontWeight:700,color:INK}}>{l.title}</div>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <StatusPill status={l.status}/>
                  <button onClick={(e)=>deleteLesson(l.id,e)} style={{background:"none",border:"none",cursor:"pointer",color:"#C7BFAE",padding:4}}><Trash2 size={15}/></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Materials() {
  const [materials,setMaterials]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [query,setQuery]=useState("");
  const [preview,setPreview]=useState(null);
  const [previewUrl,setPreviewUrl]=useState("");
  const [error,setError]=useState("");
  const [syncing,setSyncing]=useState(false);

  const load=useCallback(async()=>{
    setLoading(true);const{data}=await db.getMaterials();setMaterials(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const sync=async()=>{setSyncing(true);await load();setSyncing(false);};

  const upload=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    setUploading(true);setError("");
    const{data:{user}}=await supabase.auth.getUser();
    const ext=file.name.split(".").pop().toLowerCase();
    const typeMap={pdf:"pdf",pptx:"pptx",ppt:"pptx",doc:"doc",docx:"doc",xlsx:"sheet",xls:"sheet",jpg:"image",jpeg:"image",png:"image",mp4:"video",mp3:"audio"};
    const{path,error:upErr}=await db.uploadMaterialFile(file,user.id);
    if(upErr){setError(upErr.message);setUploading(false);return;}
    await db.insertMaterial({name:file.name,storage_path:path,file_type:typeMap[ext]||"doc",size_bytes:file.size,tags:[]});
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

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return materials;
    return materials.filter((m)=>m.name.toLowerCase().includes(q));
  },[materials,query]);

  return(
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>सामग्री पुस्तकालय</div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={sync} disabled={syncing} style={{display:"flex",alignItems:"center",gap:5,background:"#F4EFE3",color:"#7A6F3E",border:"none",borderRadius:10,padding:"8px 12px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            <RefreshCw size={14} style={{animation:syncing?"spin 1s linear infinite":"none"}}/>{syncing?"...":"सिंक"}
          </button>
          <label style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            <Plus size={14}/>{uploading?"अपलोड...":"फाइल थप"}
            <input type="file" onChange={upload} style={{display:"none"}} accept=".pdf,.pptx,.ppt,.doc,.docx,.xlsx,.jpg,.jpeg,.png,.mp4,.mp3"/>
          </label>
        </div>
      </div>
      {error&&<ErrorMsg msg={error}/>}
      <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #ECE6D8",borderRadius:12,padding:"11px 14px",marginBottom:14,marginTop:10}}>
        <Search size={16} color="#A39B8B"/>
        <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="फाइल खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:14.5,flex:1,background:"transparent",fontFamily:"Inter,sans-serif"}}/>
      </div>
      {loading?<Spinner/>:filtered.length===0?(
        <div style={{textAlign:"center",color:"#8A8275",padding:40}}>{query?`"${query}" फेला परेन।`:"फाइल थपिएको छैन।"}</div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
          {filtered.map((f)=>{
            const meta=FILE_TYPE_META[f.file_type]||FILE_TYPE_META.doc;const Icon=meta.icon;
            return(
              <Card key={f.id} onClick={()=>openPreview(f)} style={{padding:12,position:"relative"}}>
                <button onClick={(e)=>deleteMat(f,e)} style={{position:"absolute",top:8,right:8,background:"none",border:"none",cursor:"pointer",color:"#C7BFAE"}}><Trash2 size={13}/></button>
                <div style={{width:36,height:36,borderRadius:8,background:meta.color+"1A",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><Icon size={18} color={meta.color}/></div>
                <div style={{fontSize:12.5,fontWeight:600,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3,paddingRight:16}}>{f.name}</div>
                <div style={{fontSize:11,color:"#8A8275"}}>{f.file_type?.toUpperCase()}</div>
                <div style={{display:"flex",alignItems:"center",gap:3,fontSize:11.5,color:ACCENT,fontWeight:700,marginTop:6}}><Eye size={11}/>हेर्नुहोस्</div>
              </Card>
            );
          })}
        </div>
      )}
      {preview&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPreview(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:"#fff",borderRadius:16,padding:22,maxWidth:440,width:"100%"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:15,fontWeight:700}}>{preview.name}</div>
              <button onClick={()=>setPreview(null)} style={{background:"none",border:"none",cursor:"pointer",color:"#8A8275"}}><X size={18}/></button>
            </div>
            {previewUrl?<a href={previewUrl} target="_blank" rel="noreferrer" style={{display:"block",background:ACCENT,color:"#fff",borderRadius:12,padding:"13px",fontWeight:700,fontSize:15,textAlign:"center",textDecoration:"none"}}>फाइल खोल्नुहोस्</a>:<div style={{textAlign:"center",padding:20,color:"#8A8275"}}>लिङ्क तयार गर्दै...</div>}
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
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>गृहकार्य</div>
        <button onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input placeholder="गृहकार्यको शीर्षक" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <input type="number" placeholder="कुल विद्यार्थी" value={form.total_students} onChange={(e)=>setForm({...form,total_students:parseInt(e.target.value)||0})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="टिप्पणी" value={form.remark} onChange={(e)=>setForm({...form,remark:e.target.value})} rows={2} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:homework.length===0?<div style={{textAlign:"center",color:"#8A8275",padding:40}}>कुनै गृहकार्य छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {homework.map((h)=>{
            const pct=h.total_students>0?Math.round((h.checked_count/h.total_students)*100):0;
            const done=h.checked_count>=h.total_students;
            return(
              <Card key={h.id}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:15,fontWeight:700,color:INK}}>{h.title}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:700,color:done?ACCENT:"#9A5B12",background:done?"#E4EFE6":"#FBEBD3",padding:"3px 8px",borderRadius:999}}>{h.checked_count}/{h.total_students}</span>
                    <button onClick={()=>deleteHw(h)} style={{background:"none",border:"none",cursor:"pointer",color:"#C7BFAE"}}><Trash2 size={14}/></button>
                  </div>
                </div>
                <div style={{height:6,background:"#F0EBDD",borderRadius:99,marginBottom:10}}>
                  <div style={{height:6,width:`${pct}%`,background:done?ACCENT:MARIGOLD,borderRadius:99}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button onClick={()=>bump(h,-1)} style={{width:34,height:34,borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontSize:18,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{fontSize:13,color:"#6B6557",fontWeight:600,flex:1}}>जाँच गर्नुहोस्</div>
                  <button onClick={()=>bump(h,1)} style={{width:34,height:34,borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontSize:18,fontWeight:700,cursor:"pointer"}}>+</button>
                </div>
                {h.remark&&<div style={{marginTop:10,background:"#FAF7EE",borderRadius:8,padding:"8px 10px",fontSize:13,color:"#6B6557"}}>{h.remark}</div>}
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
    <div style={{padding:"16px 16px 120px",maxWidth:720,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><Heart size={20} color={ACCENT}/>डायरी</div>
        {!showForm&&<button onClick={()=>setShowForm(true)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>थप</button>}
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input placeholder="आजको पाठ" value={form.lesson_title} onChange={(e)=>setForm({...form,lesson_title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="के पढाइयो?" value={form.taught} onChange={(e)=>setForm({...form,taught:e.target.value})} rows={2} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <textarea placeholder="के गाह्रो भयो?" value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} rows={2} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <textarea placeholder="अर्को पटककालागि सुझाव" value={form.idea} onChange={(e)=>setForm({...form,idea:e.target.value})} rows={2} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(MOOD_META).map(([key,m])=>{const Icon=m.icon;return<button key={key} onClick={()=>setForm({...form,mood:key})} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:5,padding:"8px",borderRadius:10,border:form.mood===key?`2px solid ${m.color}`:"1px solid #ECE6D8",background:form.mood===key?m.color+"15":"#fff",color:m.color,fontSize:12,fontWeight:700,cursor:"pointer"}}><Icon size={13}/>{m.label}</button>;})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:entries.length===0?<div style={{textAlign:"center",color:"#8A8275",padding:40}}>कुनै प्रविष्टि छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {entries.map((e)=>{const mood=MOOD_META[e.mood]||MOOD_META.okay;const MIcon=mood.icon;return(
            <Card key={e.id}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:14.5,fontWeight:700,color:INK}}>{e.lessons?.title||e.entry_date}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,background:mood.color+"15",color:mood.color,padding:"3px 9px",borderRadius:999,fontSize:11.5,fontWeight:700}}><MIcon size={12}/>{mood.label}</div>
              </div>
              {e.taught&&<div style={{fontSize:13.5,color:INK,marginBottom:5}}><strong>के पढाइयो:</strong> {e.taught}</div>}
              {e.difficulty&&<div style={{fontSize:13.5,color:"#6B6557",marginBottom:5}}><strong>गाह्रो:</strong> {e.difficulty}</div>}
              {e.idea&&<div style={{background:"#F4EFE3",borderRadius:8,padding:"7px 10px",fontSize:13,color:"#7A6F3E"}}>💡 {e.idea}</div>}
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

function AIAssistant({ lessons }) {
  const lesson=lessons[0];
  const [messages,setMessages]=useState([{role:"ai",text:lesson?`नमस्ते! म "${lesson.title}" पाठ र पाठ्यपुस्तकबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस्।`:"नमस्ते! पहिले पाठ योजनामा एउटा पाठ थप्नुहोस्।"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const bottomRef=useRef(null);
  const QUICK=["आजको पाठ बुझाउनुहोस्","उद्देश्यहरू देखाउनुहोस्","मुख्य प्रश्नहरू दिनुहोस्","क्रियाकलाप सुझाव दिनुहोस्","गृहकार्य के दिने?","शब्दावली सूची देखाउनुहोस्","मूल्याङ्कन कसरी गर्ने?"];
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  const send=async(text)=>{
    const t=text.trim();if(!t||loading)return;
    setMessages((prev)=>[...prev,{role:"user",text:t}]);setInput("");setLoading(true);
    try{
      const context=lesson?`पाठ: ${lesson.title}\nअध्याय: ${lesson.chapters?.title||""}\nउद्देश्य: ${(lesson.objectives||[]).join(", ")}\nशब्दावली: ${(lesson.vocabulary||[]).join(", ")}\nक्रियाकलाप: ${(lesson.activities||[]).join(", ")}\nगृहकार्य: ${lesson.homework||""}`: "कुनै पाठ छैन।";
      const reply=await gemini.chatWithAI(t,context,getTextbookPDF());
      setMessages((prev)=>[...prev,{role:"ai",text:reply}]);
    }catch(e){setMessages((prev)=>[...prev,{role:"ai",text:"AI सँग जोडिन सकिएन: "+e.message}]);}
    setLoading(false);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 170px)",maxWidth:720,margin:"0 auto",width:"100%"}}>
      <div style={{padding:"14px 16px 8px"}}>
        <div style={{fontSize:19,fontWeight:700,color:INK,display:"flex",alignItems:"center",gap:8}}><Bot size={20} color={ACCENT}/>AI शिक्षण सहायक</div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#8A8275",marginTop:3}}>
          <Zap size={11} color={MARIGOLD}/>Google Gemini AI · {getTextbookPDF()?"पाठ्यपुस्तक लोड भएको ✓":"पाठ्यपुस्तक लोड भएको छैन (सेटिङमा अपलोड गर्नुहोस्)"}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 16px"}}>
        {messages.map((m,i)=>(
          <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
            <div style={{maxWidth:"88%",background:m.role==="user"?ACCENT:"#fff",color:m.role==="user"?"#fff":INK,border:m.role==="ai"?"1px solid #ECE6D8":"none",borderRadius:14,padding:"11px 14px",fontSize:14.5,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",marginBottom:10}}><div style={{background:"#fff",border:"1px solid #ECE6D8",borderRadius:14,padding:"11px 14px",color:"#8A8275",fontSize:14}}>सोच्दै छु...</div></div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"8px 16px",display:"flex",gap:7,overflowX:"auto"}}>
        {QUICK.map((q)=><button key={q} onClick={()=>send(q)} style={{flexShrink:0,background:"#F4EFE3",color:"#7A6F3E",border:"none",borderRadius:999,padding:"7px 12px",fontSize:12,fontWeight:600,whiteSpace:"nowrap",cursor:"pointer"}}>{q}</button>)}
      </div>
      <div style={{display:"flex",gap:8,padding:"8px 16px 16px"}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send(input)} placeholder="आफ्नो प्रश्न लेख्नुहोस्..." style={{flex:1,border:"1px solid #ECE6D8",borderRadius:999,padding:"12px 16px",fontSize:14,outline:"none",fontFamily:"Inter,sans-serif"}}/>
        <button onClick={()=>send(input)} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:"50%",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}><Send size={17}/></button>
      </div>
    </div>
  );
}

function QuestionBank() {
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
  const TYPES=["छोटो उत्तर","बहुविकल्पीय","सत्य/असत्य","खाली ठाउँ","विश्लेषणात्मक","परिदृश्य आधारित"];
  const DIFFS=["सबै","सजिलो","मध्यम","कठिन"];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getQuestions();setQuestions(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    if(!form.chapter_title.trim()){setError("अध्यायको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const results=await gemini.generateQuestions(form.chapter_title,getTextbookPDF());
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
    <div style={{padding:"16px 16px 140px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>प्रश्न बैंक</div>
        <button onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14}}>प्रश्न थप्नुहोस्</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट प्रश्न बनाउनुहोस्"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input placeholder="अध्याय (AI का लागि अनिवार्य)" value={form.chapter_title} onChange={(e)=>setForm({...form,chapter_title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="प्रश्न (म्यानुअल)" value={form.text} onChange={(e)=>setForm({...form,text:e.target.value})} rows={3} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <select value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})} style={{flex:1,border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}>{TYPES.map((t)=><option key={t}>{t}</option>)}</select>
              <select value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} style={{flex:1,border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}>{"सजिलो,मध्यम,कठिन".split(",").map((d)=><option key={d}>{d}</option>)}</select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #ECE6D8",borderRadius:12,padding:"10px 14px",marginBottom:10}}>
        <Search size={16} color="#A39B8B"/>
        <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="प्रश्न खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:14,flex:1,background:"transparent",fontFamily:"Inter,sans-serif"}}/>
      </div>
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14}}>
        {DIFFS.map((d)=><button key={d} onClick={()=>setDiffFilter(d)} style={{padding:"6px 12px",borderRadius:999,background:diffFilter===d?ACCENT:"#fff",color:diffFilter===d?"#fff":INK,fontWeight:600,fontSize:12.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(diffFilter===d?ACCENT:"#ECE6D8")}}>{d}</button>)}
      </div>
      {loading?<Spinner/>:filtered.length===0?<div style={{textAlign:"center",color:"#8A8275",padding:40}}>कुनै प्रश्न छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map((q)=>{const isSel=selected.includes(q.id);return(
            <Card key={q.id} onClick={()=>toggle(q.id)} style={{display:"flex",gap:10}}>
              <div style={{marginTop:2,flexShrink:0,color:isSel?ACCENT:"#C7BFAE"}}>{isSel?<CheckSquare size={18}/>:<Square size={18}/>}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:5}}>
                  <span style={{fontSize:11,background:"#E4EFE6",color:ACCENT,padding:"2px 7px",borderRadius:5,fontWeight:700}}>{q.type}</span>
                  <span style={{fontSize:11,background:"#F4EFE3",color:"#7A6F3E",padding:"2px 7px",borderRadius:5,fontWeight:600}}>{q.difficulty}</span>
                  {q.chapter_title&&<span style={{fontSize:11,color:"#A39B8B",fontWeight:600}}>{q.chapter_title}</span>}
                </div>
                <div style={{fontSize:14.5,color:INK,lineHeight:1.5}}>{q.text}</div>
                {q.options?.length>0&&<div style={{marginTop:6}}>{q.options.map((o,i)=><div key={i} style={{fontSize:13,color:i===q.correct_option?ACCENT:"#6B6557",fontWeight:i===q.correct_option?700:400}}>{i+1}) {o}</div>)}</div>}
              </div>
              <button onClick={(e)=>deleteQ(q.id,e)} style={{background:"none",border:"none",cursor:"pointer",color:"#C7BFAE",flexShrink:0}}><Trash2 size={14}/></button>
            </Card>
          );})}
        </div>
      )}
      {selected.length>0&&(
        <div style={{position:"fixed",bottom:64,left:0,right:0,display:"flex",justifyContent:"center",padding:"0 16px",zIndex:20}}>
          <button onClick={()=>setShowSet(true)} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:999,padding:"12px 20px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",gap:8,cursor:"pointer",boxShadow:"0 8px 20px rgba(31,77,61,0.25)"}}><Shuffle size={16}/>{selected.length} प्रश्न — सेट बनाउनुहोस्</button>
        </div>
      )}
      {showSet&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowSet(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:22,maxWidth:600,width:"100%",maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:17,fontWeight:700}}>प्रश्न सेट ({selected.length})</div>
              <button onClick={()=>setShowSet(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#8A8275"}}><X size={20}/></button>
            </div>
            <ol style={{paddingLeft:18,margin:0,display:"flex",flexDirection:"column",gap:10}}>
              {selectedQs.map((q)=><li key={q.id} style={{fontSize:14,color:INK,lineHeight:1.5}}>{q.text}</li>)}
            </ol>
            <div style={{display:"flex",gap:8,marginTop:18}}>
              <button onClick={async()=>{await db.upsertQuestionSet({title:`सेट — ${new Date().toLocaleDateString("ne-NP")}`,question_ids:selected});setSelected([]);setShowSet(false);}} style={{flex:1,background:ACCENT,color:"#fff",border:"none",borderRadius:12,padding:"12px",fontWeight:700,fontSize:14,cursor:"pointer"}}>💾 सुरक्षित</button>
              <button onClick={()=>window.print()} style={{flex:1,background:MARIGOLD,color:"#2A1E07",border:"none",borderRadius:12,padding:"12px",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer"}}><Printer size={16}/>प्रिन्ट</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssessmentBuilder() {
  const [assessments,setAssessments]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [form,setForm]=useState({title:"",type:"observation",rubric_text:"",due_date:"",chapter_title:""});
  const [error,setError]=useState("");
  const TYPES=[{id:"observation",label:"अवलोकन",icon:ClipboardList},{id:"oral",label:"मौखिक",icon:MessageSquare},{id:"practical",label:"व्यावहारिक",icon:NotebookPen},{id:"project",label:"प्रोजेक्ट",icon:FolderKanban},{id:"activity",label:"क्रियाकलाप",icon:Gamepad2},{id:"portfolio",label:"पोर्टफोलियो",icon:BookOpen}];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getAssessments();setAssessments(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    const chapter=form.chapter_title||form.title;if(!chapter){setError("अध्याय लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const prompt=`नेपाल कक्षा ५ "${chapter}" का लागि ${form.type} मूल्याङ्कन मापदण्ड JSON मात्र: [{"level":"उत्कृष्ट","desc":"..."},{"level":"राम्रो","desc":"..."},{"level":"सहयोग आवश्यक","desc":"..."}]`;
      const text=getTextbookPDF()?await gemini.generateWithPDF(prompt,getTextbookPDF()):await gemini.generateText(prompt);
      const rubric=gemini.parseJSON(text);
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
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>मूल्याङ्कन</div>
        <button onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14}}>नयाँ मूल्याङ्कन</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट rubric"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input placeholder="शीर्षक *" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <input placeholder="अध्याय (AI का लागि)" value={form.chapter_title} onChange={(e)=>setForm({...form,chapter_title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7}}>
              {TYPES.map((t)=>{const Icon=t.icon;return<button key={t.id} onClick={()=>setForm({...form,type:t.id})} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 6px",borderRadius:10,border:`2px solid ${form.type===t.id?ACCENT:"#ECE6D8"}`,background:form.type===t.id?"#E4EFE6":"#fff",color:form.type===t.id?ACCENT:INK,fontWeight:600,fontSize:11.5,cursor:"pointer"}}><Icon size={15}/>{t.label}</button>;})}
            </div>
            <textarea placeholder={"मापदण्ड:\nउत्कृष्ट: ...\nराम्रो: ...\nसहयोग आवश्यक: ..."} value={form.rubric_text} onChange={(e)=>setForm({...form,rubric_text:e.target.value})} rows={4} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <input type="date" value={form.due_date} onChange={(e)=>setForm({...form,due_date:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:assessments.length===0?(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
          {TYPES.map((t)=>{const Icon=t.icon;return<Card key={t.id} onClick={()=>{setForm({...form,type:t.id});setShowForm(true);}}><div style={{width:36,height:36,borderRadius:8,background:"#E4EFE6",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><Icon size={18} color={ACCENT}/></div><div style={{fontWeight:700,fontSize:13}}>{t.label}</div></Card>;})}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {assessments.map((a)=>{const typeInfo=TYPES.find((t)=>t.id===a.type)||TYPES[0];const Icon=typeInfo.icon;return(
            <Card key={a.id}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:"#E4EFE6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={17} color={ACCENT}/></div>
                <div><div style={{fontSize:15,fontWeight:700,color:INK}}>{a.title}</div><div style={{fontSize:12,color:"#8A8275"}}>{typeInfo.label}{a.due_date?` · ${a.due_date}`:""}</div></div>
              </div>
              {a.rubric?.length>0&&a.rubric.map((r,i)=><div key={i} style={{background:"#FAF7EE",borderRadius:7,padding:"6px 10px",fontSize:13,marginBottom:5}}><strong style={{color:ACCENT}}>{r.level}:</strong> {r.desc}</div>)}
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

function ActivitiesLibrary() {
  const [activities,setActivities]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [typeFilter,setTypeFilter]=useState("सबै");
  const [form,setForm]=useState({title:"",type:"game",competency:"",duration:"",description:"",chapter_title:""});
  const [error,setError]=useState("");
  const TYPES=[{id:"game",label:"खेल",icon:Gamepad2},{id:"roleplay",label:"भूमिका अभिनय",icon:Users},{id:"project",label:"प्रोजेक्ट",icon:FolderKanban},{id:"map",label:"नक्सा",icon:MapIcon},{id:"debate",label:"बहस",icon:MessageSquare},{id:"presentation",label:"प्रस्तुति",icon:Presentation}];
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getActivities();setActivities(data||[]);setLoading(false);},[]);
  useEffect(()=>{load();},[load]);

  const autoGenerate=async()=>{
    if(!form.chapter_title.trim()){setError("अध्यायको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const results=await gemini.generateActivities(form.chapter_title,getTextbookPDF());
      if(results?.length){for(const a of results)await db.upsertActivity({title:a.title,type:a.type||"game",duration:a.duration,competency:a.competency,description:a.description,chapter_title:form.chapter_title});load();setShowForm(false);}
      else setError("क्रियाकलाप बनाउन सकिएन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{if(!form.title.trim())return;setSaving(true);await db.upsertActivity({...form});setSaving(false);setShowForm(false);setForm({title:"",type:"game",competency:"",duration:"",description:"",chapter_title:""});load();};
  const filtered=typeFilter==="सबै"?activities:activities.filter((a)=>a.type===typeFilter);

  return(
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontSize:20,fontWeight:700,color:INK}}>क्रियाकलाप</div>
        <button onClick={()=>setShowForm(!showForm)} style={{display:"flex",alignItems:"center",gap:5,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:700,cursor:"pointer"}}><Plus size={14}/>नयाँ</button>
      </div>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:700,fontSize:14}}>नयाँ क्रियाकलाप</div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट बनाउनुहोस्"} onClick={autoGenerate} loading={generating}/>
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <input placeholder="अध्याय (AI का लागि अनिवार्य)" value={form.chapter_title} onChange={(e)=>setForm({...form,chapter_title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <input placeholder="क्रियाकलापको नाम" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <input placeholder="क्षमता" value={form.competency} onChange={(e)=>setForm({...form,competency:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <input placeholder="समय" value={form.duration} onChange={(e)=>setForm({...form,duration:e.target.value})} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif"}}/>
            <textarea placeholder="विवरण" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} rows={3} style={{border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",resize:"vertical"}}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
              {TYPES.map((t)=>{const Icon=t.icon;return<button key={t.id} onClick={()=>setForm({...form,type:t.id})} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 10px",borderRadius:10,border:`2px solid ${form.type===t.id?ACCENT:"#ECE6D8"}`,background:form.type===t.id?"#E4EFE6":"#fff",color:form.type===t.id?ACCENT:INK,fontWeight:600,fontSize:12.5,cursor:"pointer"}}><Icon size={14}/>{t.label}</button>;})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} style={{flex:1,padding:"10px",borderRadius:10,border:"1px solid #ECE6D8",background:"#fff",fontWeight:600,cursor:"pointer"}}>रद्द</button>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      <div style={{display:"flex",gap:7,overflowX:"auto",marginBottom:14}}>
        <button onClick={()=>setTypeFilter("सबै")} style={{padding:"6px 12px",borderRadius:999,background:typeFilter==="सबै"?ACCENT:"#fff",color:typeFilter==="सबै"?"#fff":INK,fontWeight:600,fontSize:12.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(typeFilter==="सबै"?ACCENT:"#ECE6D8")}}>सबै</button>
        {TYPES.map((t)=>{const Icon=t.icon;return<button key={t.id} onClick={()=>setTypeFilter(t.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",borderRadius:999,background:typeFilter===t.id?ACCENT:"#fff",color:typeFilter===t.id?"#fff":INK,fontWeight:600,fontSize:12.5,whiteSpace:"nowrap",cursor:"pointer",border:"1px solid "+(typeFilter===t.id?ACCENT:"#ECE6D8")}}><Icon size={13}/>{t.label}</button>;})}
      </div>
      {loading?<Spinner/>:filtered.length===0?<div style={{textAlign:"center",color:"#8A8275",padding:40}}>कुनै क्रियाकलाप छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map((a)=>{const typeInfo=TYPES.find((t)=>t.id===a.type)||TYPES[0];const Icon=typeInfo.icon;return(
            <Card key={a.id}>
              <div style={{display:"flex",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:"#E4EFE6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={19} color={ACCENT}/></div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontWeight:700,fontSize:14.5,color:INK}}>{a.title}</div>{a.duration&&<span style={{fontSize:12,color:"#8A8275"}}>{a.duration}</span>}</div>
                  {a.description&&<div style={{fontSize:13.5,color:"#6B6557",lineHeight:1.5,marginTop:4}}>{a.description}</div>}
                  <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
                    {a.chapter_title&&<span style={{fontSize:11,background:"#F4EFE3",color:"#7A6F3E",padding:"2px 7px",borderRadius:5,fontWeight:600}}>{a.chapter_title}</span>}
                    {a.competency&&<span style={{fontSize:11,background:"#E4EFE6",color:ACCENT,padding:"2px 7px",borderRadius:5,fontWeight:600}}>{a.competency}</span>}
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

function ResourceCreator({ lessons }) {
  const [active,setActive]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [generatedText,setGeneratedText]=useState("");
  const lesson=lessons[0];
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
      const text=getTextbookPDF()?await gemini.generateWithPDF(template.prompt(lesson),getTextbookPDF()):await gemini.generateText(template.prompt(lesson));
      setGeneratedText(text);
    }catch(e){setGeneratedText("त्रुटि: "+e.message);}
    setGenerating(false);
  };

  return(
    <div style={{padding:"16px 16px 120px",maxWidth:920,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4,display:"flex",alignItems:"center",gap:8}}><Wand2 size={20} color={ACCENT}/>स्रोत निर्माता</div>
      <div style={{fontSize:13,color:"#8A8275",marginBottom:16}}>{lesson?`"${lesson.title}" — AI बाट स्वतः बनाइन्छ।`:"पहिले पाठ योजनामा पाठ थप्नुहोस्।"}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:20}}>
        {TEMPLATES.map((t)=>{const Icon=t.icon;return<Card key={t.id} onClick={()=>generate(t)} style={{padding:14,border:active?.id===t.id?`2px solid ${ACCENT}`:"1px solid #ECE6D8"}}><div style={{width:36,height:36,borderRadius:8,background:"#E4EFE6",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}><Icon size={18} color={ACCENT}/></div><div style={{fontWeight:700,fontSize:13,color:INK}}>{t.title}</div></Card>;})}
      </div>
      {active&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:15}}>{active.title}</div>
            {!generating&&generatedText&&<button onClick={()=>window.print()} style={{display:"flex",alignItems:"center",gap:5,background:MARIGOLD,color:"#2A1E07",border:"none",borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:13,cursor:"pointer"}}><Printer size={14}/>प्रिन्ट</button>}
          </div>
          {generating?<div style={{display:"flex",alignItems:"center",gap:8,color:"#8A8275",fontSize:14,padding:20}}><Spinner small/>AI बनाउँदैछ...</div>:(
            <pre style={{background:"#FAF7EE",borderRadius:10,padding:14,fontSize:13.5,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"Inter,sans-serif",maxHeight:400,overflowY:"auto"}}>{generatedText}</pre>
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
      ...lessons.filter((l)=>l.title?.toLowerCase().includes(q)||(l.objectives||[]).some((o)=>o.toLowerCase().includes(q))).map((l)=>({kind:"पाठ",title:l.title,sub:l.chapter_title||"",icon:ClipboardList,color:ACCENT})),
      ...allMaterials.filter((m)=>m.name?.toLowerCase().includes(q)).map((m)=>({kind:"सामग्री",title:m.name,sub:m.file_type?.toUpperCase()||"",icon:FileText,color:"#A23C2A"})),
      ...allQuestions.filter((qq)=>qq.text?.toLowerCase().includes(q)).map((qq)=>({kind:"प्रश्न",title:qq.text,sub:qq.type+" · "+qq.difficulty,icon:HelpCircle,color:"#6B3FA0"})),
      ...allActivities.filter((a)=>a.title?.toLowerCase().includes(q)||a.description?.toLowerCase().includes(q)).map((a)=>({kind:"क्रियाकलाप",title:a.title,sub:a.chapter_title||"",icon:Gamepad2,color:"#1B7A4A"})),
      ...homework.filter((h)=>h.title?.toLowerCase().includes(q)).map((h)=>({kind:"गृहकार्य",title:h.title,sub:`${h.checked_count}/${h.total_students}`,icon:ListChecks,color:"#9A5B12"})),
    ];
  },[query,lessons,allMaterials,allQuestions,allActivities,homework]);
  return(
    <div style={{padding:"16px 16px 120px",maxWidth:720,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:4}}>सबैतिर खोज</div>
      <div style={{display:"flex",alignItems:"center",gap:8,background:"#fff",border:"1px solid #ECE6D8",borderRadius:14,padding:"12px 14px",marginBottom:14,marginTop:10}}>
        <Search size={17} color="#A39B8B"/>
        <input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:15,flex:1,background:"transparent",fontFamily:"Inter,sans-serif"}}/>
      </div>
      {!query.trim()?<div style={{textAlign:"center",color:"#A39B8B",padding:40,fontSize:14}}>टाइप गर्नुहोस्...</div>:results.length===0?<div style={{textAlign:"center",color:"#8A8275",padding:40}}>"{query}" फेला परेन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:12.5,color:"#8A8275",marginBottom:4}}>{results.length} परिणाम</div>
          {results.map((r,i)=>{const Icon=r.icon;return<Card key={i} style={{display:"flex",gap:10,alignItems:"center"}}><div style={{width:36,height:36,borderRadius:8,background:r.color+"1A",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={17} color={r.color}/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:11,color:r.color,fontWeight:700,marginBottom:2}}>{r.kind}</div><div style={{fontSize:14,color:INK,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>{r.sub&&<div style={{fontSize:12,color:"#8A8275"}}>{r.sub}</div>}</div></Card>;})}
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
    <div style={{padding:"16px 16px 120px",maxWidth:500,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:14,display:"flex",alignItems:"center",gap:8}}><CalendarDays size={20} color={ACCENT}/>पात्रो</div>
      <Card style={{marginBottom:14,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}} style={{background:"#F4EFE3",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,cursor:"pointer",color:ACCENT,fontSize:16}}>‹</button>
          <div style={{textAlign:"center"}}>
            <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} style={{border:"none",fontWeight:700,fontSize:16,color:INK,cursor:"pointer",background:"transparent",fontFamily:"Inter,sans-serif"}}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e)=>setYear(Number(e.target.value))} style={{border:"none",fontWeight:700,fontSize:16,color:INK,cursor:"pointer",background:"transparent",fontFamily:"Inter,sans-serif",marginLeft:4}}>
              {Array.from({length:5},(_,i)=>today.getFullYear()-1+i).map((y)=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}} style={{background:"#F4EFE3",border:"none",borderRadius:8,padding:"6px 12px",fontWeight:700,cursor:"pointer",color:ACCENT,fontSize:16}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
          {DAYS.map((d)=><div key={d} style={{textAlign:"center",fontSize:12,fontWeight:700,color:"#8A8275",padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth},(_,i)=>i+1).map((day)=>{
            const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
            const isSel=day===selected;
            return<button key={day} onClick={()=>setSelected(day)} style={{aspectRatio:1,borderRadius:8,border:"none",background:isToday?ACCENT:isSel?"#E4EFE6":"transparent",color:isToday?"#fff":isSel?ACCENT:INK,fontWeight:isToday||isSel?700:400,fontSize:14,cursor:"pointer"}}>{day}</button>;
          })}
        </div>
      </Card>
      <SectionLabel>आजका कार्यहरू</SectionLabel>
      {[...lessons.slice(0,3).map((l)=>({type:"पाठ",title:l.title,color:ACCENT,bg:"#E4EFE6"})),...homework.filter((h)=>h.checked_count<h.total_students).slice(0,2).map((h)=>({type:"गृहकार्य",title:h.title,color:"#9A5B12",bg:"#FBEBD3"}))].length===0?<div style={{color:"#8A8275",fontSize:14}}>कुनै कार्य छैन।</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {[...lessons.slice(0,3).map((l)=>({type:"पाठ",title:l.title,color:ACCENT,bg:"#E4EFE6"})),...homework.filter((h)=>h.checked_count<h.total_students).slice(0,2).map((h)=>({type:"गृहकार्य",title:h.title,color:"#9A5B12",bg:"#FBEBD3"}))].map((item,i)=>(
            <Card key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px"}}>
              <span style={{fontSize:11,fontWeight:700,color:item.color,background:item.bg,padding:"3px 8px",borderRadius:5,flexShrink:0}}>{item.type}</span>
              <div style={{fontSize:14,color:INK,fontWeight:600}}>{item.title}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Settings({ session, sections, onSectionAdded }) {
  const [name,setName]=useState("");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [uploading,setUploading]=useState(false);
  const [pdfLoaded,setPdfLoaded]=useState(!!getTextbookPDF());

  // Check IndexedDB on mount
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
    <div style={{padding:"16px 16px 120px",maxWidth:600,margin:"0 auto"}}>
      <div style={{fontSize:20,fontWeight:700,color:INK,marginBottom:16,display:"flex",alignItems:"center",gap:8}}><SettingsIcon size={20} color={ACCENT}/>सेटिङ</div>

      <Card style={{marginBottom:14}}>
        <SectionLabel>पाठ्यपुस्तक PDF</SectionLabel>
        <div style={{fontSize:13.5,color:"#6B6557",marginBottom:12,lineHeight:1.6}}>एकपटक PDF अपलोड गर्नुहोस् — AI ले सबैतिर यसबाट स्वतः सामग्री बनाउनेछ।</div>
        {pdfLoaded?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"#E4EFE6",borderRadius:10,padding:"10px 14px"}}>
              <BookMarked size={18} color={ACCENT}/>
              <div style={{fontSize:14,color:ACCENT,fontWeight:700}}>पाठ्यपुस्तक लोड भएको छ ✓</div>
            </div>
            <button onClick={clearTextbookHandler} style={{display:"flex",alignItems:"center",gap:6,background:"#F6E1DC",color:"#A23C2A",border:"none",borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:13.5,cursor:"pointer"}}><Trash2 size={15}/>पाठ्यपुस्तक हटाउनुहोस्</button>
          </div>
        ):(
          <label style={{display:"flex",alignItems:"center",gap:8,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"12px 16px",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            <BookMarked size={17}/>{uploading?"लोड गर्दै...":"पाठ्यपुस्तक PDF अपलोड गर्नुहोस्"}
            <input type="file" accept="application/pdf" onChange={uploadTextbook} style={{display:"none"}}/>
          </label>
        )}
        {msg&&<div style={{marginTop:10,fontSize:13.5,color:pdfLoaded?ACCENT:"#A23C2A",fontWeight:600}}>{msg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel>खाता</SectionLabel>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:46,height:46,borderRadius:"50%",background:ACCENT,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,flexShrink:0}}>{session?.user?.email?.[0]?.toUpperCase()||"श"}</div>
          <div><div style={{fontWeight:700,color:INK,fontSize:14}}>{session?.user?.email||""}</div><div style={{fontSize:12,color:"#8A8275"}}>कक्षा ५ · सामाजिक अध्ययन</div></div>
        </div>
        <button onClick={()=>db.signOut()} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",borderRadius:10,border:"1px solid #F6E1DC",background:"#FFF5F3",color:"#A23C2A",fontWeight:700,fontSize:14,cursor:"pointer"}}><LogOut size={15}/>लगआउट</button>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel>सेक्सनहरू</SectionLabel>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
          {sections.length===0?<div style={{fontSize:13.5,color:"#8A8275"}}>कुनै सेक्सन छैन।</div>:sections.map((s)=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"#FAF7EE",borderRadius:8}}><div style={{width:8,height:8,borderRadius:"50%",background:ACCENT}}/><div style={{fontSize:14,fontWeight:600,color:INK}}>{s.name}</div></div>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addSection()} placeholder="नयाँ सेक्सन (जस्तै: कक्षा ५ ख)" style={{flex:1,border:"1px solid #ECE6D8",borderRadius:10,padding:"10px 12px",fontSize:14,fontFamily:"Inter,sans-serif",outline:"none"}}/>
          <button onClick={addSection} disabled={saving} style={{background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:14,cursor:"pointer"}}>{saving?"...":"थप"}</button>
        </div>
      </Card>

      <Card>
        <SectionLabel>एपको बारेमा</SectionLabel>
        {[["नाम","शिक्षा साथी"],["संस्करण","3.0"],["AI","Google Gemini (निःशुल्क)"],["डाटाबेस","Supabase (निःशुल्क)"],["होस्टिङ","Vercel (निःशुल्क)"]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #F3EFE3"}}><div style={{fontSize:13.5,color:"#8A8275"}}>{l}</div><div style={{fontSize:13.5,fontWeight:600,color:INK}}>{v}</div></div>)}
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

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    // Load textbook PDF from IndexedDB on startup
    gemini.loadTextbook().then((b64)=>{ if(b64) window.__textbookPDF__=b64; });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!session)return;
    db.getSections().then(({data})=>{if(data?.length){setSections(data);setCurrentSection(data[0]);}});
  },[session]);

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
    {id:"homework",label:"गृहकार्य",icon:ListChecks},
    {id:"journal",label:"डायरी",icon:Heart},
    {id:"questions",label:"प्रश्न बैंक",icon:HelpCircle},
    {id:"assessment",label:"मूल्याङ्कन",icon:NotebookPen},
    {id:"activities",label:"क्रियाकलाप",icon:Gamepad2},
    {id:"resources",label:"स्रोत",icon:Wand2},
    {id:"search",label:"खोज",icon:Search},
    {id:"calendar",label:"पात्रो",icon:CalendarDays},
    {id:"settings",label:"सेटिङ",icon:SettingsIcon},
  ];

  if(authLoading)return<div style={{minHeight:"100vh",background:PAPER,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;
  if(!session)return<LoginScreen onLogin={setSession}/>;

  return(
    <div style={{fontFamily:"Inter,sans-serif",background:PAPER,minHeight:"100vh",color:INK}}>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;}
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .desktop-sidebar{display:none;}
        .mobile-bottom-nav{display:flex;}
        .main-content{margin-left:0;padding-bottom:70px;}
        @media(min-width:860px){
          .desktop-sidebar{display:flex;}
          .mobile-bottom-nav{display:none !important;}
          .main-content{margin-left:220px;padding-bottom:20px;}
        }
      `}</style>

      {/* Top bar */}
      <div style={{background:"#fff",borderBottom:"1px solid #ECE6D8",padding:"12px 16px",display:"flex",alignItems:"center",gap:10,position:"sticky",top:0,zIndex:10}}>
        <div style={{width:32,height:32,borderRadius:9,background:ACCENT,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14}}>सि</div>
        <div><div style={{fontWeight:700,fontSize:15}}>शिक्षा साथी</div><div style={{fontSize:11,color:"#8A8275"}}>कक्षा ५ · सामाजिक अध्ययन</div></div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:synced?ACCENT:"#A39B8B",fontWeight:600,transition:"color .3s"}}>
            <RefreshCw size={12} style={{animation:lessonsLoading?"spin 1s linear infinite":"none"}}/>
            {lessonsLoading?"सिंक...":synced?"सिंक भयो ✓":"सिंक भएको"}
          </div>
          <button onClick={()=>setScreen("settings")} style={{background:"none",border:"none",cursor:"pointer",color:screen==="settings"?ACCENT:"#8A8275"}}><SettingsIcon size={18}/></button>
        </div>
      </div>

      {/* Section selector */}
      <SectionSelector sections={sections} current={currentSection} onChange={setCurrentSection} onAdd={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}}/>

      {/* Desktop sidebar */}
      <div className="desktop-sidebar" style={{position:"fixed",top:0,left:0,bottom:0,width:220,background:"#fff",borderRight:"1px solid #ECE6D8",flexDirection:"column",paddingTop:110,zIndex:5,overflowY:"auto"}}>
        {[...nav,...navMore].map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",border:"none",background:active?"#E4EFE6":"transparent",color:active?ACCENT:"#6B6557",fontWeight:active?700:500,fontSize:13.5,cursor:"pointer",textAlign:"left",width:"100%",borderRadius:0}}>
            <Icon size={17}/>{n.label}
          </button>
        );})}
      </div>

      {/* Main content */}
      <div className="main-content">
        {screen==="dashboard"&&<Dashboard onOpenLesson={setActiveLesson} onGoPlanner={()=>setScreen("planner")} onGoHomework={()=>setScreen("homework")} section={currentSection} lessons={lessons} homework={homework} loading={lessonsLoading}/>}
        {screen==="planner"&&<Planner onOpenLesson={setActiveLesson} section={currentSection} lessons={lessons} loading={lessonsLoading} onRefresh={loadLessons}/>}
        {screen==="materials"&&<Materials/>}
        {screen==="ai"&&<AIAssistant lessons={lessons}/>}
        {screen==="homework"&&<HomeworkManager section={currentSection} loading={hwLoading} homework={homework} onRefresh={loadHomework}/>}
        {screen==="journal"&&<TeachingJournal/>}
        {screen==="questions"&&<QuestionBank/>}
        {screen==="assessment"&&<AssessmentBuilder/>}
        {screen==="activities"&&<ActivitiesLibrary/>}
        {screen==="resources"&&<ResourceCreator lessons={lessons}/>}
        {screen==="search"&&<DocumentSearch lessons={lessons} homework={homework}/>}
        {screen==="calendar"&&<CalendarView lessons={lessons} homework={homework}/>}
        {screen==="settings"&&<Settings session={session} sections={sections} onSectionAdded={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}}/>}
      </div>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav" style={{position:"fixed",bottom:0,left:0,right:0,background:"#fff",borderTop:"1px solid #ECE6D8",justifyContent:"space-around",padding:"6px 0",zIndex:10}}>
        {nav.map((n)=>{const Icon=n.icon;const active=screen===n.id;return<button key={n.id} onClick={()=>setScreen(n.id)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:active?ACCENT:"#A39B8B",fontSize:10,fontWeight:600,cursor:"pointer",padding:"3px 6px",flex:1}}><Icon size={19}/>{n.label}</button>;})}
        <button onClick={()=>setShowMore(true)} style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:navMore.some((n)=>n.id===screen)?ACCENT:"#A39B8B",fontSize:10,fontWeight:600,cursor:"pointer",padding:"3px 6px",flex:1}}><Layers size={19}/>थप</button>
      </div>

      {/* More sheet (mobile only) */}
      {showMore&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",zIndex:60,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowMore(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:"#fff",borderRadius:"18px 18px 0 0",padding:18,maxWidth:480,width:"100%",paddingBottom:40}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:700}}>थप विशेषताहरू</div>
              <button onClick={()=>setShowMore(false)} style={{background:"none",border:"none",cursor:"pointer",color:"#8A8275"}}><X size={20}/></button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {navMore.map((n)=>{const Icon=n.icon;return<button key={n.id} onClick={()=>{setScreen(n.id);setShowMore(false);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 6px",borderRadius:12,border:"1px solid #ECE6D8",background:screen===n.id?"#E4EFE6":"#fff",color:screen===n.id?ACCENT:INK,cursor:"pointer",fontSize:12,fontWeight:600}}><Icon size={20}/>{n.label}</button>;})}
            </div>
          </div>
        </div>
      )}

      {activeLesson&&<LessonMode lesson={activeLesson} onClose={()=>setActiveLesson(null)}/>}
    </div>
  );
}
