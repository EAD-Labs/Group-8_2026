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
import { assessmentTypeForStage, type GradeResult } from "@/lib/evaluation";
import { moduleQuizzes, type QuizQuestion } from "@/lib/quizzes";

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

type Panel = "dashboard" | "classroom" | "library" | "progress" | "quiz";
type Material = { id:string; title:string; file_name:string; status:string; page_count:number|null; extracted_summary:string|null; storage_path:string };
type MasteryRow = { module_slug:string; concept_slug:string; mastery_score:number };
type AttemptRow = { id:string; concept_slug:string; module_slug?:string; assessment_type:string; response_text:string; score:number|null; feedback:Record<string,any>; created_at:string };
type QuizQuestionResult = { question_id:string; concept_slug:string; selected:number; answer:number; correct:boolean; confidence:number; time_ms:number };
type EvaluationEventRow = { event_type:string; metadata:Record<string,any>; concept_slug:string; created_at:string };
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing ${label}`);
  return value;
}

const LOCAL_ATTEMPTS_KEY = "kyro_evaluation_attempts";
const LOCAL_EVENTS_KEY = "kyro_evaluation_events";
const LOCAL_MASTERY_KEY = "kyro_evaluation_mastery";

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function App() {
  const [panel,setPanel]=useState<Panel>("dashboard");
  const [moduleIndex,setModuleIndex]=useState(0); const [conceptIndex,setConceptIndex]=useState(1); const [stageIndex,setStageIndex]=useState(0);
  const [playing,setPlaying]=useState(false); const [speed,setSpeed]=useState(1); const [response,setResponse]=useState(""); const [attempted,setAttempted]=useState(false);
  const [question,setQuestion]=useState(""); const [answer,setAnswer]=useState(""); const [asking,setAsking]=useState(false); const [materials,setMaterials]=useState<Material[]>([]);
  const [user,setUser]=useState<User|null>(null); const [uploading,setUploading]=useState(false); const [authOpen,setAuthOpen]=useState(false); const [sourceOpen,setSourceOpen]=useState(false);
  const [points,setPoints]=useState(0); const [masteryRows,setMasteryRows]=useState<MasteryRow[]>([]);
  const [attemptRows,setAttemptRows]=useState<AttemptRow[]>([]); const [evaluationEvents,setEvaluationEvents]=useState<EvaluationEventRow[]>([]);
  const [sessionId,setSessionId]=useState<string|null>(null);
  const [quizAnswers,setQuizAnswers]=useState<Record<string,number>>({}); const [quizConfidence,setQuizConfidence]=useState<Record<string,number>>({}); const [quizStartedAt,setQuizStartedAt]=useState<Record<string,number>>({}); const [quizSubmitted,setQuizSubmitted]=useState(false); const [quizScore,setQuizScore]=useState<number|null>(null); const [quizMode,setQuizMode]=useState<"full"|"adaptive">("full"); const [quizQuestionSet,setQuizQuestionSet]=useState<QuizQuestion[]>([]); const [gradeResult,setGradeResult]=useState<(GradeResult&{gradedBy?:string})|null>(null); const [grading,setGrading]=useState(false); const [usefulFeedback,setUsefulFeedback]=useState<"useful"|"not_useful"|null>(null);
  const stageStartedAt=useRef(Date.now());
  const sessionConceptRef=useRef("");
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
  const quiz=moduleQuizzes[module.slug];
  const concept=required(module.concepts[conceptIndex] ?? module.concepts[0], "concept");
  const stage=required(concept.stages[stageIndex] ?? concept.stages[0], "lesson stage");

  useEffect(()=>{ supabase.auth.getUser().then(({data})=>setUser(data.user)); const {data}=supabase.auth.onAuthStateChange((_e,s)=>setUser(s?.user??null)); return ()=>data.subscription.unsubscribe(); },[]);
  useEffect(() => {
    // Evaluation data is always loaded from localStorage first so the
    // Report Card works even when the learner is signed out.
    const localAttempts = readLocal<AttemptRow[]>(LOCAL_ATTEMPTS_KEY, []);
    const localEvents = readLocal<EvaluationEventRow[]>(LOCAL_EVENTS_KEY, []);
    const localMastery = readLocal<MasteryRow[]>(LOCAL_MASTERY_KEY, []);

    setAttemptRows(localAttempts);
    setEvaluationEvents(localEvents);
    setMasteryRows(localMastery);

    if (!user) {
      setPoints(0);
      return;
    }

    // Keep the existing Supabase persistence for signed-in users.
    supabase
      .from("profiles")
      .select("points")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setPoints(data?.points ?? 0));

    supabase
      .from("concept_mastery")
      .select("module_slug,concept_slug,mastery_score")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (data?.length) setMasteryRows(data as MasteryRow[]);
      });

    supabase
      .from("assessment_attempts")
      .select("id,concept_slug,assessment_type,response_text,score,feedback,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data?.length) setAttemptRows(data as AttemptRow[]);
      });

    supabase
      .from("evaluation_events")
      .select("event_type,metadata,concept_slug,created_at")
      .eq("user_id", user.id)
      .eq("event_type", "useful_feedback")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data?.length) setEvaluationEvents(data as EvaluationEventRow[]);
      });
  }, [user]);
  useEffect(()=>{ if(!user) return; supabase.from("learning_materials").select("id,title,file_name,status,page_count,extracted_summary,storage_path").order("created_at",{ascending:false}).then(({data})=>setMaterials(data??[])); },[user]);
  useEffect(()=>{ if(!playing) return; const t=window.setTimeout(()=>setStageIndex(i=>i<concept.stages.length-1?i+1:i), Math.max(3500,9000/speed)); return ()=>window.clearTimeout(t); },[playing,stageIndex,speed,concept.stages.length]);
  useEffect(()=>{ setAttempted(false); setResponse(""); setAnswer(""); setGradeResult(null); setUsefulFeedback(null); stageStartedAt.current=Date.now(); },[stageIndex,conceptIndex,moduleIndex]);

  const logEvaluationEvent = async (
    event_type: string,
    metadata: Record<string, any> = {}
  ) => {
    const event: EvaluationEventRow = {
      event_type,
      metadata,
      concept_slug: concept.slug,
      created_at: new Date().toISOString(),
    };

    // Always persist evaluation events locally.
    const existing = readLocal<EvaluationEventRow[]>(LOCAL_EVENTS_KEY, []);
    const updated = [...existing, event];
    writeLocal(LOCAL_EVENTS_KEY, updated);
    setEvaluationEvents(updated);

    // Also persist to Supabase when signed in.
    if (user) {
      await supabase.from("evaluation_events").insert({
        user_id: user.id,
        session_id: sessionId,
        module_slug: module.slug,
        concept_slug: concept.slug,
        event_type,
        metadata,
      });
    }
  };

  useEffect(()=>{
    if(!user) return;
    let cancelled=false;
    const sessionKey=`${user.id}:${module.slug}:${concept.slug}`;
    if(sessionConceptRef.current===sessionKey) return;
    sessionConceptRef.current=sessionKey;
    setSessionId(null);
    supabase.from("learning_sessions").insert({user_id:user.id,module_slug:module.slug,concept_slug:concept.slug,dialogue_mode:"full",current_stage:0,completed:false,transcript:[],source_refs:[]}).select("id").single().then(({data})=>{
      if(cancelled) return;
      setSessionId(data?.id??null);
      if(data?.id){ void supabase.from("evaluation_events").insert({user_id:user.id,session_id:data.id,module_slug:module.slug,concept_slug:concept.slug,event_type:"concept_opened",metadata:{stage_count:concept.stages.length}}); }
    });
    return ()=>{cancelled=true;};
  },[user,module.slug,concept.slug,concept.stages.length]);

  useEffect(()=>{
    if(!user||!sessionId) return;
    void supabase.from("learning_sessions").update({current_stage:stageIndex,completed:stageIndex===concept.stages.length-1}).eq("id",sessionId);
    void logEvaluationEvent("stage_viewed",{stage_index:stageIndex,stage_kind:stage.kind});
  },[stageIndex,sessionId,user,concept.stages.length,stage.kind]);


  const stageProgress=Math.round(((stageIndex+1)/concept.stages.length)*100);
  const sourceSummary=materials[0]?.extracted_summary ?? "";
  const speakerName=stage.speaker==="teacher"?"Dr Rao":stage.speaker==="maya"?"Maya · foundational learner":"Arjun · probing learner";
  const speak=()=>{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(stage.text); u.rate=stage.speaker==="teacher"?.94:1.02; u.pitch=stage.speaker==="maya"?1.12:.94; speechSynthesis.speak(u); };
  const submitAttempt=async()=>{
    if(!response.trim()||grading) return;
    const assessmentType=assessmentTypeForStage(stage.kind);
    if(!assessmentType) return;
    setGrading(true); setAttempted(true); setPlaying(false);
    const timeOnStageMs=Date.now()-stageStartedAt.current;
    try{
      const reference=[concept.title,stage.text,stage.board,stage.hint??"",module.description].join("\n");
      const r=await fetch("/api/grade",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({response:response.trim(),assessmentType,conceptTitle:concept.title,prompt:stage.prompt??stage.text,reference})});
      const result=await r.json();
      if(!r.ok) throw new Error(result.message||"Could not grade this attempt.");
      setGradeResult(result);

      const now=new Date().toISOString();
      const localAttempt: AttemptRow = {
        id: crypto.randomUUID(),
        concept_slug: concept.slug,
        module_slug: module.slug,
        assessment_type: assessmentType,
        response_text: response.trim(),
        score: result.score,
        feedback: {...result,time_on_stage_ms:timeOnStageMs},
        created_at: now,
      };

      // Always save attempts locally so Report Card works signed out.
      const existingAttempts=readLocal<AttemptRow[]>(LOCAL_ATTEMPTS_KEY,[]);
      const updatedAttempts=[...existingAttempts,localAttempt];
      writeLocal(LOCAL_ATTEMPTS_KEY,updatedAttempts);
      setAttemptRows(updatedAttempts);

      await logEvaluationEvent("attempt_submitted",{
        assessment_type:assessmentType,
        score:result.score,
        time_on_stage_ms:timeOnStageMs,
        graded_by:result.gradedBy??"unknown",
      });

      // Persist the attempt to Supabase as well when signed in.
      if(user){
        await supabase.from("assessment_attempts").insert({
          user_id:user.id,
          session_id:sessionId,
          concept_slug:concept.slug,
          assessment_type:assessmentType,
          response_text:response.trim(),
          score:result.score,
          feedback:{...result,time_on_stage_ms:timeOnStageMs},
        });
      }

      if(assessmentType!=="prediction"){
        const current=masteryRows.find(r=>r.module_slug===module.slug&&r.concept_slug===concept.slug)?.mastery_score??0;
        const mastery=Math.round(current?current*0.35+result.score*0.65:result.score);
        const localMastery: MasteryRow={
          module_slug:module.slug,
          concept_slug:concept.slug,
          mastery_score:mastery,
        };

        const existingMastery=readLocal<MasteryRow[]>(LOCAL_MASTERY_KEY,[]);
        const updatedMastery=[
          ...existingMastery.filter(r=>!(r.module_slug===module.slug&&r.concept_slug===concept.slug)),
          localMastery,
        ];
        writeLocal(LOCAL_MASTERY_KEY,updatedMastery);
        setMasteryRows(updatedMastery);

        if(user){
          await supabase.from("concept_mastery").upsert({
            user_id:user.id,
            module_slug:module.slug,
            concept_slug:concept.slug,
            bloom_level:concept.bloom,
            mastery_score:mastery,
            updated_at:new Date().toISOString(),
          },{onConflict:"user_id,module_slug,concept_slug"});
        }
      }
    }catch(e){
      setGradeResult({score:0,feedback:e instanceof Error?e.message:"Could not grade this attempt.",strengths:[],next_step:"Try submitting again.",gradedBy:"error"});
    }finally{setGrading(false);}
  };

  const resetQuiz=(questions:QuizQuestion[], mode:"full"|"adaptive")=>{
    setQuizQuestionSet(questions); setQuizMode(mode); setQuizAnswers({}); setQuizConfidence({}); setQuizStartedAt(Object.fromEntries(questions.map(q=>[q.id,Date.now()]))); setQuizSubmitted(false); setQuizScore(null); setPanel("quiz");
  };
  const openQuiz=()=>{ if(!quiz) return; resetQuiz(quiz.questions,"full"); };
  const openAdaptivePractice=(mi:number, focusConcept?:string)=>{
    const targetModule=modules[mi]; const targetQuiz=moduleQuizzes[targetModule?.slug??""]; if(!targetModule||!targetQuiz) return;
    const scored=targetModule.concepts.map(c=>({c,score:masteryRows.find(r=>r.module_slug===targetModule.slug&&r.concept_slug===c.slug)?.mastery_score??0}));
    const weak=focusConcept ? scored.filter(x=>x.c.slug===focusConcept) : scored.filter(x=>x.score<70).sort((a,b)=>a.score-b.score);
    let questions=targetQuiz.questions.filter(q=>weak.some(x=>x.c.slug===q.conceptSlug));
    if(questions.length<3) questions=[...questions,...targetQuiz.questions.filter(q=>!questions.some(x=>x.id===q.id)).sort((a,b)=>(scored.find(x=>x.c.slug===a.conceptSlug)?.score??0)-(scored.find(x=>x.c.slug===b.conceptSlug)?.score??0)).slice(0,3-questions.length)];
    if(!questions.length) questions=targetQuiz.questions;
    setModuleIndex(mi); setConceptIndex(Math.max(0,targetModule.concepts.findIndex(c=>c.slug===questions[0]?.conceptSlug))); setStageIndex(0); resetQuiz(questions,"adaptive");
  };
  const submitQuiz=async()=>{
    const questions=quizQuestionSet.length?quizQuestionSet:(quiz?.questions??[]);
    if(!questions.length || quizSubmitted || Object.keys(quizAnswers).length!==questions.length || Object.keys(quizConfidence).length!==questions.length) return;
    const correct=questions.filter(q=>quizAnswers[q.id]===q.answer).length;
    const score=Math.round((correct/questions.length)*100);
    const now=new Date().toISOString();
    const questionResults:QuizQuestionResult[]=questions.map(q=>({question_id:q.id,concept_slug:q.conceptSlug,selected:quizAnswers[q.id],answer:q.answer,correct:quizAnswers[q.id]===q.answer,confidence:quizConfidence[q.id],time_ms:Math.max(0,Date.now()-(quizStartedAt[q.id]??Date.now()))}));
    const highWrong=questionResults.filter(r=>r.confidence===3&&!r.correct).length;
    const lowRight=questionResults.filter(r=>r.confidence===1&&r.correct).length;
    setQuizScore(score); setQuizSubmitted(true);
    const quizAttempt:AttemptRow={id:crypto.randomUUID(),concept_slug:`module:${module.slug}`,module_slug:module.slug,assessment_type:"module_quiz",response_text:JSON.stringify(quizAnswers),score,feedback:{quiz_title:module.title,correct,total:questions.length,mode:quizMode,question_results:questionResults,high_confidence_wrong:highWrong,low_confidence_correct:lowRight},created_at:now};
    const updated=[...readLocal<AttemptRow[]>(LOCAL_ATTEMPTS_KEY,[]),quizAttempt];
    writeLocal(LOCAL_ATTEMPTS_KEY,updated); setAttemptRows(updated);
    await logEvaluationEvent("module_quiz_submitted",{score,correct,total:questions.length,module_slug:module.slug,mode:quizMode,high_confidence_wrong:highWrong,low_confidence_correct:lowRight});

    // Every quiz answer becomes concept-level evidence. Correct answers increase mastery; wrong answers expose a weak concept.
    const existingMastery=readLocal<MasteryRow[]>(LOCAL_MASTERY_KEY,[]);
    let updatedMastery=[...existingMastery];
    for(const result of questionResults){
      const current=updatedMastery.find(r=>r.module_slug===module.slug&&r.concept_slug===result.concept_slug)?.mastery_score;
      const next=Math.round(current==null ? (result.correct?100:0) : current*0.6+(result.correct?100:0)*0.4);
      const row={module_slug:module.slug,concept_slug:result.concept_slug,mastery_score:next};
      updatedMastery=[...updatedMastery.filter(r=>!(r.module_slug===module.slug&&r.concept_slug===result.concept_slug)),row];
      const c=module.concepts.find(x=>x.slug===result.concept_slug);
      if(user) await supabase.from("concept_mastery").upsert({user_id:user.id,module_slug:module.slug,concept_slug:result.concept_slug,bloom_level:c?.bloom??"",mastery_score:next,updated_at:now},{onConflict:"user_id,module_slug,concept_slug"});
    }
    writeLocal(LOCAL_MASTERY_KEY,updatedMastery); setMasteryRows(updatedMastery);
    if(user){ await supabase.from("assessment_attempts").insert({user_id:user.id,session_id:sessionId,concept_slug:`module:${module.slug}`,assessment_type:"module_quiz",response_text:JSON.stringify(quizAnswers),score,feedback:quizAttempt.feedback}); setPoints(p=>p+score); }
  };
  const quizQuestionConcept=(q:QuizQuestion)=>module.concepts.find(c=>c.slug===q.conceptSlug)?.title ?? "Module concept";

  const sendUsefulFeedback=async(value:"useful"|"not_useful")=>{
    if(usefulFeedback) return;
    setUsefulFeedback(value);
    await logEvaluationEvent("useful_feedback",{value,stage:stage.kind,score:gradeResult?.score??null});
  };
  const ask=async()=>{ if(!question.trim()||asking) return; setAsking(true); setAnswer(""); try { const r=await fetch("/api/chat",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({question,context:concept.stages.slice(0,stageIndex+1).map(s=>`${s.speaker}: ${s.text}`).join("\n"),source:sourceSummary})}); if(!r.ok){const e=await r.json(); throw new Error(e.message);} const reader=r.body?.getReader(); const decoder=new TextDecoder(); if(reader){while(true){const {done,value}=await reader.read(); if(done)break; setAnswer(a=>a+decoder.decode(value,{stream:true}));}} } catch(e){setAnswer(e instanceof Error?e.message:"The teacher could not answer right now.");} finally{setAsking(false);} };
  const upload=async(file:File)=>{ if(!user){setAuthOpen(true);return;} setUploading(true); const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"-"); const path=`${user.id}/${crypto.randomUUID()}-${safe}`; const {error}=await supabase.storage.from("learning-materials").upload(path,file); if(!error){ const {data}=await supabase.from("learning_materials").insert({user_id:user.id,title:file.name.replace(/\.[^.]+$/,""),file_name:file.name,file_type:file.type||"application/octet-stream",storage_path:path,status:"ready",extracted_summary:`Uploaded course material: ${file.name}. Select it to ground your next classroom session.`}).select("id,title,file_name,status,page_count,extracted_summary,storage_path").single(); if(data)setMaterials(m=>[data,...m]); } setUploading(false); };
  const google=async()=>{await lovable.auth.signInWithOAuth("google",{redirect_uri:window.location.origin});};
  const heroMove=(e:ReactMouseEvent<HTMLButtonElement>)=>{const el=heroRef.current;if(!el)return;const r=el.getBoundingClientRect();el.style.setProperty("--x",`${e.clientX-r.left}px`);el.style.setProperty("--y",`${e.clientY-r.top}px`);};
  const openConcept=(mi:number,ci:number)=>{setModuleIndex(mi);setConceptIndex(ci);setStageIndex(0);setPanel("classroom");};
  const conceptsStarted=masteryRows.length; const conceptsRetained=masteryRows.filter(r=>r.mastery_score>=80).length; const openDoubts=masteryRows.filter(r=>r.mastery_score<60).length;
  const retainedPct=conceptsStarted?Math.round((conceptsRetained/conceptsStarted)*100):0;
  const scoredAttempts=attemptRows.filter(a=>typeof a.score==="number");
  const averageScore=scoredAttempts.length?Math.round(scoredAttempts.reduce((sum,a)=>sum+(a.score??0),0)/scoredAttempts.length):0;
  const predictionByConcept=new Map<string,AttemptRow>(); const postByConcept=new Map<string,{score:number;at:string}[]>();
  for(const a of scoredAttempts){
    if(a.assessment_type==="prediction"&&!predictionByConcept.has(a.concept_slug)) predictionByConcept.set(a.concept_slug,a);
    if(a.assessment_type!=="prediction" && a.assessment_type!=="module_quiz") { const list=postByConcept.get(a.concept_slug)??[]; list.push({score:a.score??0,at:a.created_at}); postByConcept.set(a.concept_slug,list); }
    if(a.assessment_type==="module_quiz" && Array.isArray(a.feedback?.question_results)) for(const qr of a.feedback.question_results as QuizQuestionResult[]){ const list=postByConcept.get(qr.concept_slug)??[]; list.push({score:qr.correct?100:0,at:a.created_at}); postByConcept.set(qr.concept_slug,list); }
  }
  const gainRows=modules.flatMap(m=>m.concepts.map(c=>{const pre=predictionByConcept.get(c.slug);const rows=postByConcept.get(c.slug)??[];const latest=rows[rows.length-1];return {slug:c.slug,title:c.title,module:m.title,moduleSlug:m.slug,pre:pre?.score??null,post:latest?.score??null,gain:pre&&latest?(latest.score-(pre.score??0)):null};}));
  const gainEvidence=gainRows.filter(r=>r.gain!==null); const learningGain=gainEvidence.length?Math.round(gainEvidence.reduce((sum,r)=>sum+(r.gain??0),0)/gainEvidence.length):0;
  const usefulCount=evaluationEvents.filter(e=>e.metadata?.value==="useful").length;
  const notUsefulCount=evaluationEvents.filter(e=>e.metadata?.value==="not_useful").length;
  const quizAttempts=scoredAttempts.filter(a=>a.assessment_type==="module_quiz");
  const quizResults=quizAttempts.flatMap(a=>Array.isArray(a.feedback?.question_results)?a.feedback.question_results as QuizQuestionResult[]:[]);
  const highConfidenceWrong=quizResults.filter(r=>r.confidence===3&&!r.correct).length;
  const lowConfidenceCorrect=quizResults.filter(r=>r.confidence===1&&r.correct).length;
  const confidenceAnswered=quizResults.length;
  const confidenceCalibration=confidenceAnswered?Math.round(100-(quizResults.reduce((sum,r)=>sum+Math.abs((r.confidence/3)-(r.correct?1:0)),0)/confidenceAnswered)*100):0;
  const weakestConcepts=modules.flatMap((m,mi)=>m.concepts.map(c=>({title:c.title,module:m.title,moduleSlug:m.slug,moduleIndex:mi,conceptSlug:c.slug,score:masteryRows.find(r=>r.module_slug===m.slug&&r.concept_slug===c.slug)?.mastery_score??0,hasEvidence:masteryRows.some(r=>r.module_slug===m.slug&&r.concept_slug===c.slug)}))).filter(c=>c.hasEvidence).sort((a,b)=>a.score-b.score).slice(0,5);
  const masteryRowsForReport=modules.flatMap((m,mi)=>m.concepts.map(c=>{const row=masteryRows.find(r=>r.module_slug===m.slug&&r.concept_slug===c.slug); const g=gainRows.find(x=>x.moduleSlug===m.slug&&x.conceptSlug===c.slug); return {...c,module:m.title,moduleSlug:m.slug,moduleIndex:mi,score:row?.mastery_score??0,pre:g?.pre??null,post:g?.post??null,gain:g?.gain??null};}));
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
      <header className="topbar"><div><span className="header-icon"><Sun/></span><div><strong>{panel==="dashboard"?"My Desk":panel==="classroom"?"Classroom":panel==="library"?"Class Library":panel==="quiz"?"Module Quiz":"Report Card"}</strong><small>{panel==="dashboard"?"Room 617 · Your learning space":panel==="classroom"?`${module.code} · ${concept.title}`:"AI KYRO"}</small></div></div><div className="top-actions"><span className="encouragement"><Sparkles/> Keep going!</span><span className="points">{points} points</span>{user?<Button variant="outline" onClick={()=>supabase.auth.signOut()}>Sign out</Button>:<Button variant="outline" onClick={()=>setAuthOpen(true)}>Sign in</Button>}</div></header>

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
          <aside className="class-transcript"><div className="transcript-header"><div><small>CLASS TRANSCRIPT</small><h2>Follow the discussion</h2></div><span><i/> LIVE</span></div><div className="transcript-list">{visibleStages.map((item,i)=><article key={`${item.speaker}-${i}`} className={i===stageIndex?"current":""}><span className={`transcript-avatar ${item.speaker}`}>{item.speaker==="teacher"?<GraduationCap/>:item.speaker==="maya"?<BookOpen/>:<Brain/>}</span><div><header><strong>{item.speaker==="teacher"?"Dr Rao":item.speaker==="maya"?"Maya":"Arjun"}</strong>{i===stageIndex&&<em>speaking</em>}</header><p>{item.text}</p></div></article>)}</div>{stage.prompt&&<div className="transcript-response"><small>YOUR GUESS, BEFORE THE ANSWER</small><p>{stage.prompt}</p><Textarea value={response} onChange={e=>setResponse(e.target.value)} placeholder="Type your reasoning…"/><div><Button variant="ghost" onClick={()=>setAttempted(true)} disabled={!response.trim()||grading}><CircleHelp/>Hint</Button><Button onClick={submitAttempt} disabled={!response.trim()||grading}>{grading?"Evaluating…":"Commit"}</Button></div>{attempted&&<div className="evaluation-feedback">{grading?<p className="feedback-text">Evaluating your reasoning…</p>:gradeResult&&<><div className="evaluation-score"><strong>{gradeResult.score}%</strong><span>{gradeResult.gradedBy==="ai"?"AI rubric":"fallback rubric"}</span></div><p className="feedback-text">{gradeResult.feedback}</p>{gradeResult.strengths.length>0&&<ul>{gradeResult.strengths.map((x,i)=><li key={i}>{x}</li>)}</ul>}<p className="feedback-next"><strong>Next:</strong> {gradeResult.next_step}</p></>}</div>}</div>}</aside>
        </div>
        <div className="question-bar"><Hand/><Textarea value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Raise your hand to ask Dr Rao a question…"/><Button size="icon" variant="ghost" className={listening==="question"?"listening":""} aria-label="Speak question" onClick={()=>dictate("question")}><Mic/></Button><Button size="icon" onClick={ask} disabled={asking||!question.trim()} aria-label="Send question"><Send/></Button></div>{answer&&<div className="teacher-answer"><strong>Dr Rao</strong><p>{answer}</p></div>}{gradeResult&&<div className="useful-check"><div><strong>Was this learning step useful?</strong><small>One tap helps us understand which classroom moments are helping.</small></div><div><Button size="sm" variant={usefulFeedback==="useful"?"default":"outline"} onClick={()=>sendUsefulFeedback("useful")} disabled={!!usefulFeedback}>Yes</Button><Button size="sm" variant={usefulFeedback==="not_useful"?"default":"outline"} onClick={()=>sendUsefulFeedback("not_useful")} disabled={!!usefulFeedback}>Not really</Button></div></div>}
        <div className="concept-strip">{module.concepts.map((c,i)=><Button variant="ghost" key={c.slug} className={i===conceptIndex?"active":""} onClick={()=>{setConceptIndex(i);setStageIndex(0)}}><span>{i+1}</span><div><strong>{c.title}</strong><small>{c.bloom} · {c.mastery}% mastery</small></div></Button>)}{quiz&&<Button className="module-quiz-button" onClick={openQuiz}><ClipboardCheck/><div><strong>Module Quiz</strong><small>{quiz.questions.length} questions · test yourself</small></div><ArrowRight/></Button>}</div>
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

    {panel==="quiz"&&<section className="page-view quiz-page">
      <div className="page-title"><div><small>{quizMode==="adaptive"?"TARGETED PRACTICE":"MODULE ASSESSMENT"}</small><h1>{module.title} {quizMode==="adaptive"?"weak-concept practice":"quiz"}</h1><p>{quizMode==="adaptive"?"These questions target the concepts currently showing the most difficulty.":"Check recall and application across the module. Answer every question and report your confidence so we can measure more than correctness."}</p></div><Button variant="outline" onClick={()=>setPanel("classroom")}><ChevronLeft/> Back to class</Button></div>
      {!quizQuestionSet.length?<div className="evaluation-empty"><ClipboardCheck/><strong>No quiz is available for this module yet.</strong><span>We have hardcoded quizzes for Thermodynamics and Probability & Statistics for now.</span></div>:<div className="quiz-shell">
        <div className="quiz-progress"><span>{quizSubmitted?"Completed":`${quizMode==="adaptive"?"Targeted · ":""}${quizQuestionSet.length} questions`}</span><span>{Object.keys(quizAnswers).length}/{quizQuestionSet.length} answered · {Object.keys(quizConfidence).length}/{quizQuestionSet.length} confidence</span></div>
        {quizQuestionSet.map((q,i)=><article className={`quiz-question ${quizSubmitted?"submitted":""}`} key={q.id}>
          <div className="quiz-question-head"><span>Q{i+1}</span><div><small>{quizQuestionConcept(q)}</small><h3>{q.question}</h3></div></div>
          <div className="quiz-options">{q.options.map((option,j)=><button type="button" key={option} className={`${quizAnswers[q.id]===j?"selected ":""}${quizSubmitted&&q.answer===j?"correct ":""}${quizSubmitted&&quizAnswers[q.id]===j&&q.answer!==j?"wrong":""}`} onClick={()=>{if(!quizSubmitted){setQuizAnswers(a=>({...a,[q.id]:j}));setQuizStartedAt(t=>t[q.id]?t:{...t,[q.id]:Date.now()});}}}><span>{String.fromCharCode(65+j)}</span>{option}</button>)}</div>
          <div className="confidence-row"><small>HOW CONFIDENT WERE YOU?</small><div>{[[1,"Guessing"],[2,"Somewhat"],[3,"Very confident"]].map(([v,label])=><button type="button" key={v} className={quizConfidence[q.id]===v?"active":""} disabled={quizSubmitted} onClick={()=>setQuizConfidence(c=>({...c,[q.id]:Number(v)}))}>{label}</button>)}</div></div>
          {quizSubmitted&&<div className={`quiz-explanation ${quizAnswers[q.id]===q.answer?"good":"needs-work"}`}><strong>{quizAnswers[q.id]===q.answer?"Correct":"Review this"}</strong><p>{q.explanation}</p><small>{quizConfidence[q.id]===3&&quizAnswers[q.id]!==q.answer?"High-confidence miss — revisit this concept.":quizConfidence[q.id]===1&&quizAnswers[q.id]===q.answer?"You knew it, but confidence was low — trust your evidence more.":"Confidence and correctness recorded for your Report Card."}</small></div>}
        </article>)}
        {!quizSubmitted?<Button className="quiz-submit" disabled={Object.keys(quizAnswers).length!==quizQuestionSet.length||Object.keys(quizConfidence).length!==quizQuestionSet.length} onClick={submitQuiz}>Submit quiz <ArrowRight/></Button>:<div className="quiz-result"><div><small>YOUR SCORE</small><strong>{quizScore}%</strong><span>{quizQuestionSet.filter(q=>quizAnswers[q.id]===q.answer).length} / {quizQuestionSet.length} correct</span></div><div><h3>{(quizScore??0)>=80?"Strong module understanding":"Good attempt — revisit the weaker concepts"}</h3><p>{quizMode==="adaptive"?"Targeted practice was saved as evidence for the weak concepts.":"Your answers, confidence, concept mastery and learning evidence are now in the Report Card."}</p><Button onClick={()=>setPanel("progress")}>View Report Card <ArrowRight/></Button></div></div>}
      </div>}
    </section>}

    {panel==="progress"&&<section className="page-view evaluation-page"><div className="page-title"><div><small>LEARNING EVIDENCE</small><h1>Is the classroom actually helping?</h1><p>Everything here is evidence from predictions, explanations, quizzes, confidence and targeted practice — not just activity.</p></div></div>
      <div className="metric-row"><div><small>ATTEMPTS SCORED</small><strong>{scoredAttempts.length}</strong><span>{quizAttempts.length} module quizzes · {scoredAttempts.filter(a=>a.assessment_type!=="module_quiz").length} classroom responses</span></div><div><small>AVERAGE SCORE</small><strong>{averageScore}%</strong><span>across all scored evidence</span></div><div><small>LEARNING GAIN</small><strong>{learningGain>0?"+":""}{learningGain}</strong><span>latest evidence minus first prediction</span></div></div>
      <div className="evaluation-summary-grid"><article className="evaluation-card"><small>CONCEPT MASTERY</small><h3>{conceptsStarted?Math.round(masteryRows.reduce((s,r)=>s+r.mastery_score,0)/masteryRows.length):"—"}%</h3><p>{conceptsRetained} strong concepts · {openDoubts} need attention</p></article><article className="evaluation-card"><small>CONFIDENCE CALIBRATION</small><h3>{confidenceAnswered?`${confidenceCalibration}% aligned`:"—"}</h3><p>{highConfidenceWrong} high-confidence misses · {lowConfidenceCorrect} low-confidence correct</p></article><article className="evaluation-card"><small>LEARNER SIGNAL</small><h3>{usefulCount+notUsefulCount?Math.round(usefulCount/(usefulCount+notUsefulCount)*100):"—"}% useful</h3><p>{usefulCount} useful · {notUsefulCount} not useful</p></article><article className="evaluation-card"><small>WEAKEST EVIDENCE</small><h3>{weakestConcepts.length?weakestConcepts[0].title:"No evidence yet"}</h3><p>{weakestConcepts.length?`${weakestConcepts[0].score}% mastery · practice recommended`:"Complete a checkpoint or quiz."}</p></article></div>

      <section className="evaluation-section"><div className="evaluation-section-head"><div><small>1 · CONCEPT-LEVEL MASTERY</small><h2>What do you actually know?</h2></div><span>Updated from every scored classroom response and quiz answer.</span></div><div className="mastery-table">{masteryRowsForReport.map(c=><article key={`${c.moduleSlug}-${c.slug}`}><div><strong>{c.title}</strong><span>{c.module} · {c.bloom}</span></div><div className="mastery-meter"><Progress value={c.score}/><b>{c.score}%</b></div><div className="gain-chip">{c.gain===null?"No pre-test":`${c.gain>=0?"+":""}${c.gain} gain`}</div></article>)}</div></section>

      <section className="evaluation-section"><div className="evaluation-section-head"><div><small>2 · PRE / POST LEARNING GAIN</small><h2>Did learning move the needle?</h2></div><span>First prediction compared with the latest checkpoint, teach-back, transfer or quiz evidence.</span></div><div className="gain-table">{gainEvidence.length?gainEvidence.map(r=><article key={r.slug}><div><strong>{r.title}</strong><span>{r.module}</span></div><div><small>BEFORE</small><b>{r.pre}%</b></div><ArrowRight/><div><small>AFTER</small><b>{r.post}%</b></div><strong className={r.gain!>=0?"positive":"negative"}>{r.gain!>=0?"+":""}{r.gain}</strong></article>):<div className="evaluation-empty"><TrendingUp/><strong>No matched pre/post evidence yet.</strong><span>Complete a prediction before a later checkpoint or quiz.</span></div>}</div></section>

      <section className="evaluation-section"><div className="evaluation-section-head"><div><small>3 · QUESTION ANALYTICS</small><h2>Where are mistakes happening?</h2></div><span>{quizResults.length} quiz answers analysed individually.</span></div><div className="analytics-grid"><div className="analytics-card"><strong>{quizResults.length?Math.round(quizResults.filter(r=>r.correct).length/quizResults.length*100):0}%</strong><span>question accuracy</span></div><div className="analytics-card"><strong>{highConfidenceWrong}</strong><span>high-confidence misses</span></div><div className="analytics-card"><strong>{lowConfidenceCorrect}</strong><span>low-confidence correct</span></div><div className="analytics-card"><strong>{quizResults.length?Math.round(quizResults.reduce((s,r)=>s+r.time_ms,0)/quizResults.length/1000):0}s</strong><span>average answer time</span></div></div><div className="progress-board analytics-list">{quizResults.length?quizResults.slice(-12).reverse().map((r,i)=>{const q=modules.flatMap(m=>moduleQuizzes[m.slug]?.questions??[]).find(x=>x.id===r.question_id);return <article key={`${r.question_id}-${i}`}><div><strong>{q?.question??r.question_id}</strong><span>{quizQuestionConcept(q??{conceptSlug:r.concept_slug} as QuizQuestion)}</span></div><span className={`analytics-status ${r.correct?"good":"bad"}`}>{r.correct?"Correct":"Incorrect"}</span><span>{r.confidence===3?"High":r.confidence===2?"Medium":"Low"} confidence</span><b>{Math.round(r.time_ms/1000)}s</b></article>;}):<div className="evaluation-empty"><ClipboardCheck/><strong>Quiz-level analytics will appear here.</strong><span>Take a module quiz with confidence ratings.</span></div>}</div></section>

      <section className="evaluation-section"><div className="evaluation-section-head"><div><small>4 · CONFIDENCE VS PERFORMANCE</small><h2>Do you know when you know?</h2></div><span>High-confidence wrong answers are potential misconceptions; low-confidence correct answers are knowledge you may be underestimating.</span></div><div className="confidence-grid"><div><strong>{highConfidenceWrong}</strong><span>⚠ High confidence + wrong</span><small>Prioritise these for review.</small></div><div><strong>{lowConfidenceCorrect}</strong><span>✓ Low confidence + correct</span><small>You may know more than you think.</small></div><div><strong>{confidenceCalibration}%</strong><span>Calibration signal</span><small>Alignment between confidence and correctness.</small></div></div></section>

      <section className="evaluation-section"><div className="evaluation-section-head"><div><small>5 · ADAPTIVE RETRY</small><h2>What should you practice next?</h2></div><span>Practice sets focus on the weakest concepts and automatically create new evidence when completed.</span></div><div className="adaptive-list">{weakestConcepts.length?weakestConcepts.map(c=><article key={`${c.moduleSlug}-${c.conceptSlug}`}><div><strong>{c.title}</strong><span>{c.module} · {c.score}% mastery</span></div><Progress value={c.score}/><Button onClick={()=>openAdaptivePractice(c.moduleIndex,c.conceptSlug)}>Practice this <ArrowRight/></Button></article>):<div className="evaluation-empty"><Target/><strong>No weak concept identified yet.</strong><span>Complete a quiz or scored classroom response first.</span></div>}</div></section>

      <section className="evaluation-section"><div className="evaluation-section-head"><div><small>OVERALL VERDICT</small><h2>Is the classroom helping?</h2></div></div><div className="verdict-card"><div><strong>{learningGain>10?"Yes — evidence shows meaningful learning gain.":learningGain>0?"Promising — learning is moving upward.":scoredAttempts.length?"Not enough evidence yet — keep measuring.":"Start a quiz or checkpoint to generate evidence."}</strong><p>{conceptsStarted?`${conceptsRetained} of ${conceptsStarted} assessed concepts are at or above 80% mastery.`:"No concept mastery has been established yet."} {highConfidenceWrong?`There are ${highConfidenceWrong} high-confidence misses worth reviewing.`:"Confidence data does not currently flag a major mismatch."}</p></div><Button onClick={()=>setPanel("classroom")}>Keep learning <ArrowRight/></Button></div></section>
    </section>}

      {authOpen&&<div className="modal-backdrop"><div className="auth-dialog"><Button size="icon" variant="ghost" className="modal-close" onClick={()=>setAuthOpen(false)}><X/></Button><span className="brand-mark">AK</span><h2>Keep your learning with you</h2><p>Sign in to save materials, sessions, mastery and review schedules across devices.</p><Button className="google" onClick={google}>Continue with Google</Button><small>Your uploads remain private to your account.</small></div></div>}
    </div>
  </main>;
}
