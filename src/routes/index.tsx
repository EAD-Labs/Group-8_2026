import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BarChart3, Beaker, BookOpen, Brain, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, Clock3, FileText, Flame, GraduationCap, Hand, HelpCircle, Library, Lightbulb, Leaf, Mic, Pause, Pencil, Play, Plus, Send, Settings, Sigma, Sparkles, Sun, Target, TrendingUp, Upload, Volume2, X, Zap } from "lucide-react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { modules as baseModules, arc, type Module } from "@/lib/curriculum";
import { ClassroomScene } from "@/components/classroom/ClassroomScene";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [
    { title: "AI KYRO — Metacognitive Classroom" },
    { name: "description", content: "Learn complete university topics through an interactive AI classroom grounded in your own materials." },
    { property: "og:title", content: "AI KYRO — Metacognitive Classroom" },
    { property: "og:description", content: "An immersive AI classroom for active, measurable learning." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: App,
});

type Panel = "dashboard" | "classroom" | "library" | "progress";
type Material = { id:string; title:string; file_name:string; status:string; page_count:number|null; extracted_summary:string|null; storage_path:string };
type MasteryRow = { module_slug:string; concept_slug:string; mastery_score:number };
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

function App() {
  const [panel,setPanel]=useState<Panel>("dashboard");
  const [moduleIndex,setModuleIndex]=useState(0); const [conceptIndex,setConceptIndex]=useState(1); const [stageIndex,setStageIndex]=useState(0);
  const [playing,setPlaying]=useState(false); const [speed,setSpeed]=useState(1); const [response,setResponse]=useState(""); const [attempted,setAttempted]=useState(false);
  const [question,setQuestion]=useState(""); const [answer,setAnswer]=useState(""); const [asking,setAsking]=useState(false); const [materials,setMaterials]=useState<Material[]>([]);
  const [user,setUser]=useState<User|null>(null); const [uploading,setUploading]=useState(false); const [authOpen,setAuthOpen]=useState(false); const [sourceOpen,setSourceOpen]=useState(false);
  const [points,setPoints]=useState(0); const [masteryRows,setMasteryRows]=useState<MasteryRow[]>([]);
  const inputRef=useRef<HTMLInputElement>(null); const heroRef=useRef<HTMLButtonElement>(null);
  const [customModules,setCustomModules]=useState<Module[]>([]);
  useEffect(()=>{ try{ setCustomModules(JSON.parse(localStorage.getItem("kyro_custom_modules")||"[]")); }catch{} },[]);
  const modules=[...baseModules,...customModules];
  const [topic,setTopic]=useState(""); const [attachments,setAttachments]=useState<File[]>([]); const [generating,setGenerating]=useState(false); const [genError,setGenError]=useState(""); const [listening,setListening]=useState<null|"topic"|"question">(null);
  const attachRef=useRef<HTMLInputElement>(null); const recRef=useRef<{stop:()=>void}|null>(null);
  const dictate=(target:"topic"|"question")=>{ if(listening){recRef.current?.stop();return;} const W=window as unknown as Record<string, new()=>any>; const SR=W["SpeechRecognition"]||W["webkitSpeechRecognition"]; if(!SR){setGenError("Voice input isn't supported in this browser. Try Chrome or Edge.");return;} const r=new SR(); r.lang="en-IN"; r.interimResults=true; r.continuous=true; const base=(target==="topic"?topic:question); r.onresult=(e:any)=>{ let t=""; for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript; const v=(base?base+" ":"")+t; target==="topic"?setTopic(v):setQuestion(v); }; r.onend=()=>setListening(null); r.onerror=()=>setListening(null); recRef.current=r; setListening(target); r.start(); };
  const generateModule=async()=>{ if(!topic.trim()&&!attachments.length) return; setGenerating(true); setGenError(""); try{ const texts:string[]=[]; for(const f of attachments){ if(f.type.startsWith("text/")||/\.(txt|md|csv)$/i.test(f.name)) texts.push(`[${f.name}]\n${(await f.text()).slice(0,6000)}`); else texts.push(`[${f.name}] (${f.type||"file"} attached)`); if(user) await upload(f); }
    const r=await fetch("/api/generate-module",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic:topic.trim(),material:texts.join("\n\n").slice(0,12000)})}); const d=await r.json(); if(!r.ok) throw new Error(d.message||"Could not build the module.");
    const slug=`custom-${Date.now()}`; const mod:Module={slug,code:"MY "+(customModules.length+1),title:d.title,description:d.description,concepts:d.concepts.map((c:any,i:number)=>({slug:`${slug}-${i}`,title:c.title,bloom:c.bloom,duration:12,mastery:0,stages:arc(c.title,c.definition,c.misconception,c.example,c.equation,c.transfer)}))};
    const next=[...customModules,mod]; setCustomModules(next); localStorage.setItem("kyro_custom_modules",JSON.stringify(next)); setTopic(""); setAttachments([]);
  }catch(e){ setGenError(e instanceof Error?e.message:"Something went wrong."); } setGenerating(false); };
  const module=required(modules[moduleIndex] ?? modules[0], "module");
  const concept=required(module.concepts[conceptIndex] ?? module.concepts[0], "concept");
  const stage=required(concept.stages[stageIndex] ?? concept.stages[0], "lesson stage");

  useEffect(()=>{ supabase.auth.getUser().then(({data})=>setUser(data.user)); const {data}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user??null)); return ()=>data.subscription.unsubscribe(); },[]);
  useEffect(()=>{ if(!user){setPoints(0);setMasteryRows([]);return;} supabase.from("profiles").select("points").eq("id",user.id).single().then(({data})=>setPoints(data?.points??0)); supabase.from("concept_mastery").select("module_slug,concept_slug,mastery_score").eq("user_id",user.id).then(({data})=>setMasteryRows(data??[])); },[user]);
  useEffect(()=>{ if(!user) return; supabase.from("learning_materials").select("id,title,file_name,status,page_count,extracted_summary,storage_path").order("created_at",{ascending:false}).then(({data})=>setMaterials(data??[])); },[user]);
  useEffect(()=>{ if(!playing) return; const t=window.setTimeout(()=>setStageIndex(i=>i<concept.stages.length-1?i+1:i), Math.max(3500,9000/speed)); return ()=>window.clearTimeout(t); },[playing,stageIndex,speed,concept.stages.length]);
  useEffect(()=>{ setAttempted(false); setResponse(""); setAnswer(""); },[stageIndex,conceptIndex,moduleIndex]);

  const stageProgress=Math.round(((stageIndex+1)/concept.stages.length)*100);
  const sourceSummary=materials[0]?.extracted_summary ?? "";
  const speakerName=stage.speaker==="teacher"?"Dr Rao":stage.speaker==="maya"?"Maya · foundational learner":"Arjun · probing learner";
  const speak=()=>{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(stage.text); u.rate=stage.speaker==="teacher"?.94:1.02; u.pitch=stage.speaker==="maya"?1.12:.94; speechSynthesis.speak(u); };
  const submitAttempt=()=>{ if(!response.trim()) return; setAttempted(true); setPlaying(false); };
  const ask=async()=>{ if(!question.trim()||asking) return; setAsking(true); setAnswer(""); try { const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question,context:concept.stages.slice(0,stageIndex+1).map(s=>`${s.speaker}: ${s.text}`).join("\n"),source:sourceSummary})}); if(!r.ok){const e=await r.json(); throw new Error(e.message);} const reader=r.body?.getReader(); const decoder=new TextDecoder(); if(reader){while(true){const {done,value}=await reader.read(); if(done)break; setAnswer(a=>a+decoder.decode(value,{stream:true}));}} } catch(e){setAnswer(e instanceof Error?e.message:"The teacher could not answer right now.");} finally{setAsking(false);} };
  const upload=async(file:File)=>{ if(!user){setAuthOpen(true);return;} setUploading(true); const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-"); const path=`${user.id}/${crypto.randomUUID()}-${safe}`; const {error}=await supabase.storage.from("learning-materials").upload(path,file); if(!error){ const {data}=await supabase.from("learning_materials").insert({user_id:user.id,title:file.name.replace(/\.[^.]+$/,""),file_name:file.name,file_type:file.type||"application/octet-stream",storage_path:path,status:"ready",extracted_summary:`Uploaded course material: ${file.name}. Select it to ground your next classroom session.`}).select("id,title,file_name,status,page_count,extracted_summary,storage_path").single(); if(data)setMaterials(m=>[data,...m]); } setUploading(false); };
  const google=async()=>{await lovable.auth.signInWithOAuth("google",{redirect_uri:window.location.origin});};
  const heroMove=(e:ReactMouseEvent<HTMLButtonElement>)=>{const el=heroRef.current;if(!el)return;const r=el.getBoundingClientRect();el.style.setProperty("--x",`${e.clientX-r.left}px`);el.style.setProperty("--y",`${e.clientY-r.top}px`);};
  const openConcept=(mi:number,ci:number)=>{setModuleIndex(mi);setConceptIndex(ci);setStageIndex(0);setPanel("classroom");};
  const conceptsStarted=masteryRows.length; const conceptsRetained=masteryRows.filter(r=>r.mastery_score>=100).length; const openDoubts=masteryRows.filter(r=>r.mastery_score<60).length;
  const retainedPct=conceptsStarted?Math.round((conceptsRetained/conceptsStarted)*100):0;
  const firstName=user?.email?.split("@")[0];
  const hour=new Date().getHours(); const dayWord=hour<12?"MORNING":hour<17?"AFTERNOON":"EVENING";

  const visibleStages=concept.stages.slice(0,stageIndex+1);

  return <main className="app-shell">
    <aside className="main-sidebar">
      <div className="brand"><span className="brand-mark"><Sun/></span><div><strong>AI KYRO</strong><small>Learn · Think · Grow</small></div></div>
      <div className="room-card"><span><BookOpen/></span><div><strong>Room 617</strong><small>Your learning space</small></div><b>›</b></div>
      <nav aria-label="Primary"><Button variant="ghost" className={panel==="dashboard"?"active":""} onClick={()=>setPanel("dashboard")}><BookOpen/><span>My Desk</span></Button><Button variant="ghost" className={panel==="classroom"?"active":""} onClick={()=>setPanel("classroom")}><GraduationCap/><span>Classroom</span></Button><Button variant="ghost" className={panel==="library"?"active":""} onClick={()=>setPanel("library")}><Library/><span>Class Library</span></Button><Button variant="ghost" className={panel==="progress"?"active":""} onClick={()=>setPanel("progress")}><TrendingUp/><span>Report Card</span></Button></nav>
      <div className="sidebar-note"><i/><p>Small steps<br/>build big ideas.</p><Sparkles/></div>
      <div className="sidebar-profile"><span>{user?.email?.charAt(0).toUpperCase()??"S"}</span><div><strong>{user?.email?.split("@")[0]??"Student"}</strong><small>Keep exploring</small></div><Settings/></div>
    </aside>

    <div className="app-content">
      <header className="topbar"><div><span className="header-icon"><Sun/></span><div><strong>{panel==="dashboard"?"My Desk":panel==="classroom"?"Classroom":panel==="library"?"Class Library":"Report Card"}</strong><small>{panel==="dashboard"?"Room 617 · Your learning space":panel==="classroom"?`${module.code} · ${concept.title}`:"AI KYRO"}</small></div></div><div className="top-actions"><span className="encouragement"><Sparkles/> Keep going!</span><span className="points">{points} points</span>{user?<Button variant="outline" onClick={()=>supabase.auth.signOut()}>Sign out</Button>:<Button variant="outline" onClick={()=>setAuthOpen(true)}>Sign in</Button>}</div></header>

      {panel==="dashboard"&&<div className="kyro-dashboard">
        <section className="dashboard-greeting">
          <div>
            <div className="eyebrow"><Sun size={14}/> GOOD {dayWord}{user?", STUDENT":""}</div>
            <h2 className="kyro-title">Welcome back{firstName?`, ${firstName}`:""}.</h2>
            <p className="kyro-subtitle">{conceptsStarted>0?`${conceptsRetained} of ${conceptsStarted} concept${conceptsStarted===1?"":"s"} retained so far.`:"A good day to learn something new."}</p>
          </div>
          <div className="desk-note"><Pencil size={15}/><span>Small steps build big ideas.</span></div>
        </section>
        <button ref={heroRef} onMouseMove={heroMove} onClick={()=>setPanel("classroom")} className="classroom-hero group">
          <div className="hero-window-glow"/>
          <div className="hero-sunbeam beam-one"/><div className="hero-sunbeam beam-two"/>
          <div className="hero-window"><div className="window-sky"/><div className="window-cross horizontal"/><div className="window-cross vertical"/><div className="window-trees"/></div>
          <div className="hero-clock"><span>10</span><i/><span>2</span><b/><span>4</span><em/><span>8</span></div>
          <div className="hero-board">
            <div className="board-pin pin-a"/><div className="board-pin pin-b"/>
            <span className="board-kicker"><BookOpen size={13}/> TODAY'S LESSON</span>
            <strong>Think → question → test</strong>
            <div className="board-rule"/>
            <p>No answer is accepted<br/>without a second thought.</p>
            <span className="board-smile">☼</span>
            <div className="chalk-lines"><i/><i/><i/></div>
          </div>
          <div className="hero-copy">
            <div className="hero-mini"><span className="sun-doodle">☼</span> NEXT PERIOD</div>
            <h1>Step into the<br/><span>classroom.</span></h1>
            <p>Pick a concept and learn through a live teacher–student discussion. Predict, explain, challenge, and test your thinking.</p>
            <span className="hero-cta">Enter class <ArrowRight size={16}/></span>
            <span className="hero-meta"><Clock3 size={13}/> ~10 min · interactive</span>
          </div>
          <div className="hero-desk desk-books"><span/><span/><span/><i/></div>
          <div className="hero-desk desk-pencil"><i/><b/><em/></div>
          <div className="hero-plant"><Leaf size={35}/><span/><i/><b/></div>
          <div className="hero-cursor-light"/>
        </button>
        <section className="stats-ribbon">
          <div className="stat-pill"><span className="stat-icon gold"><Sparkles size={16}/></span><strong>{points}</strong><small>points</small></div>
          <div className="stat-pill"><span className="stat-icon green"><Flame size={16}/></span><strong>{conceptsRetained}<small>/{conceptsStarted}</small></strong><small>retained</small></div>
          <div className="stat-pill"><span className="stat-icon violet"><ClipboardCheck size={16}/></span><strong>{openDoubts}</strong><small>open doubt{openDoubts===1?"":"s"}</small></div>
          <button className="stats-progress" onClick={()=>setPanel("progress")}><BarChart3 size={16}/> View learning progress <ArrowRight size={14}/></button>
        </section>
        <div className="dashboard-grid">
          <main className="dashboard-main">
            <section>
              <div className="section-heading">
                <div><span className="section-icon book"><BookOpen size={17}/></span><div><h3>Continue Learning</h3><p>Pick up where your thinking left off.</p></div></div>
                <button onClick={()=>setPanel("classroom")}>View all <ArrowRight size={14}/></button>
              </div>
              <div className="module-grid">
                {modules.map((mod,index)=>{
                  const Icon=mod.slug.includes("thermo")?Beaker:Sigma;
                  const explored=masteryRows.filter(r=>r.module_slug===mod.slug).length;
                  return <article key={mod.slug} className="module-card group">
                    <div className={index%2?"module-visual module-visual-gold":"module-visual module-visual-green"}>
                      <span className="module-badge">{explored>0?"IN PROGRESS":"NEXT UP"}</span>
                      <Icon className="module-main-icon" size={42} strokeWidth={1.35}/>
                      <span className="module-scribble">{explored>0?"keep going →":"new idea"}</span>
                      <span className="module-shape shape-one"/><span className="module-shape shape-two"/>
                    </div>
                    <div className="module-body">
                      <div className="module-title-row"><h4>{mod.title}</h4><span className="module-arrow"><ArrowRight size={15}/></span></div>
                      <p>{mod.concepts.length} concepts · build it step by step</p>
                      <div className="module-progress"><span style={{width:`${Math.min(82,22+explored*12)}%`}}/></div>
                      <span className="module-progress-label">{explored} / {mod.concepts.length} concepts explored</span>
                      {mod.concepts.slice(0,2).map((c,ci)=>(
                        <button key={c.slug} className="concept-row" onClick={()=>openConcept(index,ci)}>
                          <span className="concept-dot"/><span className="concept-name">{c.title}</span>
                          <span className="bloom-tag">{c.bloom}</span><ArrowRight size={13}/>
                        </button>
                      ))}
                    </div>
                  </article>;
                })}
              </div>
            </section>
            <section className="journey-card">
              <div className="section-heading compact"><div><span className="section-icon journey"><Target size={17}/></span><div><h3>Your Learning Journey</h3><p>Progress, not perfection.</p></div></div></div>
              <div className="journey-content">
                <div className="progress-ring" style={{"--progress":`${retainedPct}%`} as CSSProperties}><div><strong>{retainedPct}%</strong><span>retained</span></div></div>
                <div className="journey-copy"><strong>{conceptsRetained} concepts retained</strong><span>{conceptsStarted} concepts explored so far</span><em>“Curiosity first. Answers second.”</em></div>
                <div className="journey-mini"><span><Flame size={15}/>Streak</span><strong>{conceptsRetained}</strong><small>concepts</small></div>
                <div className="journey-mini"><span><Brain size={15}/>Thinking</span><strong>{openDoubts}</strong><small>open doubts</small></div>
              </div>
            </section>
            <section>
              <div className="section-heading compact"><div><span className="section-icon practice"><Zap size={17}/></span><div><h3>Quick Practice</h3><p>Short activities to keep your mind sharp.</p></div></div></div>
              <div className="practice-grid">
                <button onClick={()=>setPanel("classroom")} className="practice-card yellow"><span><Lightbulb size={19}/></span><div><strong>Concept Check</strong><small>Quick, focused questions</small></div><ArrowRight size={15}/></button>
                <button onClick={()=>openConcept(0,0)} className="practice-card coral"><span><Target size={19}/></span><div><strong>Mixed Practice</strong><small>Variety of concepts</small></div><ArrowRight size={15}/></button>
                <button onClick={()=>setPanel("progress")} className="practice-card blue"><span><ClipboardCheck size={19}/></span><div><strong>Past Progress</strong><small>See what needs review</small></div><ArrowRight size={15}/></button>
              </div>
            </section>
          </main>
          <aside className="dashboard-rail">
            <div className="rail-card lesson-card">
              <div className="rail-title"><span><Clock3 size={16}/> Today at a glance</span><span className="rail-live">LIVE</span></div>
              <div className="rail-timeline">
                <div className="timeline-item active"><span className="timeline-dot"/><div><small>NOW</small><strong>Interactive classroom</strong><p>Think → question → test</p></div></div>
                <div className="timeline-item"><span className="timeline-dot"/><div><small>NEXT</small><strong>{materials.length?`${materials.length} source${materials.length>1?"s":""} ready`:"Keep exploring"}</strong><p>{materials.length?"Your material can ground the next class.":"Choose a concept from your desk."}</p></div></div>
              </div>
              <button onClick={()=>setPanel("library")} className="rail-link">Open class library <ArrowRight size={14}/></button>
            </div>
            <div className="rail-card activity-card">
              <div className="rail-title"><span><CheckCircle2 size={16}/> Your desk</span></div>
              <div className="desk-stat"><span className="desk-stat-icon yellow"><Sparkles size={15}/></span><div><strong>{points}</strong><small>learning points</small></div></div>
              <div className="desk-stat"><span className="desk-stat-icon green"><Leaf size={15}/></span><div><strong>{conceptsRetained}</strong><small>concepts retained</small></div></div>
              <div className="desk-stat"><span className="desk-stat-icon violet"><HelpCircle size={15}/></span><div><strong>{openDoubts}</strong><small>open doubts to revisit</small></div></div>
            </div>
            <div className="quote-note"><span className="pin"/><span className="quote-icon">✦</span><p>“The goal isn't to know everything. It's to notice what you don't know yet.”</p><small>— AI KYRO</small></div>
          </aside>
        </div>
        <div className="kyro-footer"><span/> ET 617 · Metacognitive AI Scaffold <span/></div>
      </div>}

      {panel==="classroom"&&<div className="classroom-page">
        <div className="classroom-toolbar"><div><span>NOW LEARNING</span><strong>{module.title}</strong><small>{concept.title} · {concept.bloom}</small></div><div className="module-tabs">{modules.map((m,i)=><Button size="sm" variant="ghost" key={m.slug} className={i===moduleIndex?"active":""} onClick={()=>{setModuleIndex(i);setConceptIndex(0);setStageIndex(0)}}>{m.code}</Button>)}</div><Button variant="outline" onClick={speak}><Volume2/> Read aloud</Button></div>
        <div className="classroom-layout">
          <section className="classroom-stage"><div className="scene"><ClassroomScene speaker={stage.speaker} board={stage.board}/><div className="scene-top"><span className="live-dot"><i/> LIVE CLASS</span><span>{concept.title}</span><Button variant="ghost" onClick={()=>setSourceOpen(!sourceOpen)}><FileText/> {materials.length?`${materials.length} sources`:"Course source"}</Button></div><div className="speaker-card"><div className={`speaker-avatar ${stage.speaker}`}>{stage.speaker==="teacher"?<GraduationCap/>:stage.speaker==="maya"?<BookOpen/>:<Brain/>}</div><div><small>{stage.label}</small><strong>{speakerName}</strong><p>{stage.text}</p></div></div>{sourceOpen&&<div className="source-drawer"><div><strong>Sources in this class</strong><Button size="icon" variant="ghost" onClick={()=>setSourceOpen(false)} aria-label="Close sources"><X/></Button></div>{materials.length?materials.map(m=><article key={m.id}><FileText/><div><b>{m.title}</b><small>{m.file_name}</small></div><span>Ready</span></article>):<p>This lesson uses the verified AI KYRO pilot curriculum. Add your own slides to ground the next class.</p>}</div>}</div>
            <div className="transport"><div><Button size="icon" variant="outline" onClick={()=>setStageIndex(i=>Math.max(0,i-1))} aria-label="Previous turn"><ChevronLeft/></Button><Button size="icon" onClick={()=>setPlaying(p=>!p)} aria-label={playing?"Pause":"Play"}>{playing?<Pause/>:<Play/>}</Button><Button size="icon" variant="outline" onClick={()=>setStageIndex(i=>Math.min(concept.stages.length-1,i+1))} aria-label="Next turn"><ChevronRight/></Button></div><div className="timeline"><Progress value={stageProgress}/><small>Class discussion · {stageIndex+1} of {concept.stages.length}</small></div><Button variant="outline" className="speed" onClick={()=>setSpeed(s=>s===1?1.5:s===1.5?2:1)}>{speed}×</Button></div>
          </section>
          <aside className="class-transcript"><div className="transcript-header"><div><small>CLASS TRANSCRIPT</small><h2>Follow the discussion</h2></div><span><i/> LIVE</span></div><div className="transcript-list">{visibleStages.map((item,i)=><article key={`${item.speaker}-${i}`} className={i===stageIndex?"current":""}><span className={`transcript-avatar ${item.speaker}`}>{item.speaker==="teacher"?<GraduationCap/>:item.speaker==="maya"?<BookOpen/>:<Brain/>}</span><div><header><strong>{item.speaker==="teacher"?"Dr Rao":item.speaker==="maya"?"Maya":"Arjun"}</strong>{i===stageIndex&&<em>speaking</em>}</header><p>{item.text}</p></div></article>)}</div>{stage.prompt&&<div className="transcript-response"><small>YOUR GUESS, BEFORE THE ANSWER</small><p>{stage.prompt}</p><Textarea value={response} onChange={e=>setResponse(e.target.value)} placeholder="Type your reasoning…"/><div><Button variant="ghost" onClick={()=>setAttempted(true)} disabled={!response.trim()}><CircleHelp/>Hint</Button><Button onClick={submitAttempt} disabled={!response.trim()}>Commit</Button></div>{attempted&&<p className="feedback-text">{stage.hint??"State the principle, connect it to this situation, then test your conclusion."}</p>}</div>}</aside>
        </div>
        <div className="question-bar"><Hand/><Textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Raise your hand to ask Dr Rao a question…"/><Button size="icon" variant="ghost" className={listening==="question"?"listening":""} aria-label="Speak question" onClick={()=>dictate("question")}><Mic/></Button><Button size="icon" onClick={ask} disabled={asking||!question.trim()} aria-label="Send question"><Send/></Button></div>{answer&&<div className="teacher-answer"><strong>Dr Rao</strong><p>{answer}</p></div>}
        <div className="concept-strip">{module.concepts.map((c,i)=><Button variant="ghost" key={c.slug} className={i===conceptIndex?"active":""} onClick={()=>{setConceptIndex(i);setStageIndex(0)}}><span>{i+1}</span><div><strong>{c.title}</strong><small>{c.bloom} · {c.mastery}% mastery</small></div></Button>)}</div>
      </div>}

    {panel==="library"&&<section className="page-view"><div className="page-title"><div><small>PERSONAL KNOWLEDGE BASE</small><h1>Learn from your own material</h1><p>Bring slides, notes, readings or diagrams. AI KYRO turns them into a complete classroom—not a summary.</p></div><input ref={inputRef} hidden type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.png,.jpg,.jpeg" onChange={e=>{const f=e.target.files?.[0];if(f)upload(f)}}/></div>
<div className="module-composer"><h2><Sparkles size={18}/> Add a module with AI</h2><p>Describe a topic, and optionally attach your slides or notes. Speak instead of typing if you like.</p>
{attachments.length>0&&<div className="attach-chips">{attachments.map((f,i)=><span key={i}><FileText size={14}/>{f.name}<button aria-label={`Remove ${f.name}`} onClick={()=>setAttachments(a=>a.filter((_,j)=>j!==i))}><X size={12}/></button></span>)}</div>}
<div className="composer-bar"><button className="composer-icon" aria-label="Attach files (optional)" onClick={()=>attachRef.current?.click()}><Plus/></button><input ref={attachRef} hidden multiple type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.png,.jpg,.jpeg" onChange={e=>{const fs=Array.from(e.target.files??[]);setAttachments(a=>[...a,...fs]);e.target.value="";}}/>
<input className="composer-input" value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")generateModule()}} placeholder={listening==="topic"?"Listening…":"e.g. Heat engines and the Carnot cycle"}/>
<button className={`composer-icon ${listening==="topic"?"listening":""}`} aria-label="Speak topic" onClick={()=>dictate("topic")}><Mic/></button>
<button className="composer-send" aria-label="Generate module" disabled={generating||(!topic.trim()&&!attachments.length)} onClick={generateModule}>{generating?<Clock3/>:<ArrowRight/>}</button></div>
{generating&&<small className="composer-note">Building your concept sequence…</small>}{genError&&<small className="composer-note error">{genError}</small>}
{customModules.length>0&&<div className="custom-modules">{customModules.map(m=><article key={m.slug} className="material-card"><Brain/><div><small>{m.code} · {m.concepts.length} CONCEPTS</small><h3>{m.title}</h3><p>{m.description}</p></div><Button onClick={()=>{setModuleIndex(modules.findIndex(x=>x.slug===m.slug));setConceptIndex(0);setStageIndex(0);setPanel("classroom")}}>Start class</Button></article>)}</div>}
</div><div className="material-grid">{materials.map(m=><article key={m.id} className="material-card"><FileText/><div><small>{m.status.toUpperCase()}</small><h3>{m.title}</h3><p>{m.extracted_summary}</p><span>{m.file_name}</span></div><Button onClick={()=>{setPanel("classroom");setSourceOpen(true)}}>Build class</Button></article>)}{!materials.length&&<div className="empty-material"><Library/><h3>Your materials will appear here</h3><p>Sign in and upload a file to create a grounded class.</p></div>}</div></section>}

    {panel==="progress"&&<section className="page-view"><div className="page-title"><div><small>LEARNING EVIDENCE</small><h1>Your understanding, not your streak</h1><p>Mastery grows from explanation, transfer and delayed recall—not from opening a lesson.</p></div></div><div className="metric-row"><div><small>CONCEPTS ACTIVE</small><strong>7</strong><span>across 2 modules</span></div><div><small>READY TO REVIEW</small><strong>3</strong><span>from your doubt log</span></div><div><small>TRANSFER SCORE</small><strong>72%</strong><span>+9 this week</span></div></div><div className="progress-board">{modules.flatMap(m=>m.concepts).filter(c=>c.mastery>0).map(c=><article key={c.slug}><div><strong>{c.title}</strong><span>{c.bloom}</span></div><Progress value={c.mastery}/><b>{c.mastery}%</b></article>)}</div></section>}

      {authOpen&&<div className="modal-backdrop"><div className="auth-dialog"><Button size="icon" variant="ghost" className="modal-close" onClick={()=>setAuthOpen(false)}><X/></Button><span className="brand-mark">AK</span><h2>Keep your learning with you</h2><p>Sign in to save materials, sessions, mastery and review schedules across devices.</p><Button className="google" onClick={google}>Continue with Google</Button><small>Your uploads remain private to your account.</small></div></div>}
    </div>
  </main>;
}
