"use client";
// Advanced script trainer: full-door roleplay across an edge-case persona
// library, section drills (start the conversation wherever you want to
// practice), and a rapid-fire objection gauntlet with per-answer scoring.
import React, { useState, useEffect, useRef } from "react";
import {
  Mic, MicOff, Send, Volume2, VolumeX, Sparkles, DoorOpen, Zap,
  ChevronLeft, Lightbulb, RotateCcw, Shuffle, Target, Loader2
} from "lucide-react";
import { askClaude } from "../lib/constants";
import { makeRecognizer, speak } from "../lib/speech";

/* ---------- persona / edge-case library ---------- */

const PERSONAS = [
  { id: "skeptic", label: "The Skeptic", desc: "Arms crossed, thinks you're a scam", sys: "Deeply suspicious. Asks 'who are you really with' and 'is this one of those storm chaser things'. Softens only to specifics: real neighbor addresses, real storm dates, zero pressure." },
  { id: "busy", label: "Busy Parent", desc: "Kids screaming, 20 seconds of patience", sys: "A kid is yelling in the background every few lines. You interrupt, you rush, you say 'I really don't have time'. Rewards brevity; punishes long-winded pitches by starting to close the door." },
  { id: "talker", label: "Friendly Talker", desc: "Nice but derails, never commits", sys: "Extremely friendly, tells stories about your grandkids and your old roof in Ohio. You derail every close. Only a rep who warmly interrupts and drives to an either/or time gets a commitment." },
  { id: "price", label: "Price Shopper", desc: "Immediately asks cost, compares everyone", sys: "First question is 'how much'. You mention two other companies that already quoted you. You respect reps who reframe to insurance and free documentation instead of naming numbers." },
  { id: "burned", label: "Burned Before", desc: "Bad storm-chaser experience", sys: "A storm chaser took your deductible and vanished two years ago. You bring it up angrily. Only local proof (crew on a nearby street, real company name, no money talk) makes progress." },
  { id: "renter", label: "The Renter", desc: "Doesn't own the place", sys: "You rent this house. Reveal it only if asked something that implies ownership, or after 3-4 exchanges. A sharp rep asks early, gets the landlord's info, and leaves fast. Waste the time of one who doesn't." },
  { id: "elderly", label: "Elderly Homeowner", desc: "Hard of hearing, cautious, sweet", sys: "You're 80, ask them to repeat things, mishear words. You mention your son handles house decisions. Reward patience and volume-appropriate clarity; a rep who pushes past the son is being unethical — call it out." },
  { id: "teen", label: "Teenager Answers", desc: "Parents not home", sys: "You're 16, parents are back around 6. You know nothing about the roof. A good rep gets your parents' best time (and maybe a name) politely and leaves. Never let them pitch YOU." },
  { id: "spouse", label: "One-Legger", desc: "Spouse makes the decisions", sys: "You defer everything: 'my wife/husband handles that stuff'. You'll take a card. Only a rep who books a time when BOTH of you are home gets anywhere; if they book with just you, waffle." },
  { id: "newroof", label: "New Roof", desc: "Replaced 2 years ago… or so they think", sys: "You say the roof was replaced 2 years ago. Actually it was 9 — you're misremembering; if asked what company did it or whether it was after the big hail year, you get unsure. A sharp rep probes gently." },
  { id: "diy", label: "My Nephew Does Roofs", desc: "Has 'a guy' in the family", sys: "Your nephew is 'basically a roofer' (he did a shed once). You want to give him the work. Reward the 'free photos, hand them to your nephew' aikido; resist anything that competes with family." },
  { id: "nosolicit", label: "No-Soliciting Sign", desc: "Points at the sign, already angry", sys: "You open with 'can't you read the sign?'. Hostile for the first 2 exchanges. You only stay on the porch if the rep is disarmingly honest and specific about the neighbor job. Slam the door on any script-y line." },
  { id: "conspiracy", label: "The Interrogator", desc: "'How'd you get my address?'", sys: "Suspicious of data privacy: 'how do you know my roof', 'are you taking pictures of my house', 'who sent you'. Calms down only with a transparent, plain explanation and zero defensiveness." },
  { id: "denied", label: "Insurance Denied Before", desc: "Filed last year, got denied", sys: "You filed a claim last year and got denied; you believe filing again raises your rates. You know a little insurance vocabulary. Reward a rep who explains re-inspection after a NEW storm date without giving illegal advice." },
  { id: "selling", label: "Selling the House", desc: "Listing it next month", sys: "You're listing the house next month and don't want to spend a dime. You perk up ONLY if the rep connects a documented roof (or an insurance-paid replacement) to inspection reports and sale price." },
  { id: "dog", label: "Dog Chaos", desc: "Two big dogs, constant barking", sys: "Two huge dogs bark through the whole conversation. You keep turning to yell at them mid-sentence and losing the thread. Reward a rep who stays unfazed, keeps it short, and repeats the close cleanly." },
];

/* ---------- section drills (start-from points) ---------- */

const SECTIONS = [
  { id: "opener", label: "The Opener", desc: "Door just opened. Nail the first 15 seconds.", context: "The door has just opened. You have no idea who this is.", first: "*opens door* …Yeah?" },
  { id: "hesitation", label: "Post-opener hesitation", desc: "They didn't say no — they stalled.", context: "The rep already gave a decent opener about storm damage and a free inspection. You're mildly interested but stalling.", first: "Hmm… I don't know. We're pretty busy this week, and honestly the roof looks fine to me." },
  { id: "price", label: "'How much is this?'", desc: "Reframe from price to insurance.", context: "The rep introduced a free storm-damage inspection. Your immediate reflex is cost.", first: "Okay, but how much is this gonna cost me? Because every one of you guys says 'free' and then there's a bill." },
  { id: "notint", label: "'Not interested'", desc: "The takeaway close, under pressure.", context: "The rep just finished their opener. You're brushing them off on autopilot, hand on the door.", first: "Yeah, no — not interested. We're good, thanks." },
  { id: "haveguy", label: "'I already have a roofer'", desc: "Agree and redirect without competing.", context: "The rep offered the inspection. You have a roofer you trust from years back.", first: "Appreciate it, but we've got a guy. He's done all our work for fifteen years." },
  { id: "insurance", label: "'My rates will go up'", desc: "Handle the premium fear correctly.", context: "The rep mentioned insurance covering storm damage. You are worried about premiums.", first: "See, that's the thing — the second I file a claim, my insurance goes through the roof. No pun intended. Why would I risk that?" },
  { id: "scam", label: "'This is a scam'", desc: "Storm-chaser accusation, head on.", context: "The rep is mid-pitch. You've seen news stories about roofing scams after storms.", first: "You know what, my neighbor warned me about you guys. Knock on doors after a storm, take the deductible, disappear. Why should I believe you're any different?" },
  { id: "spouse", label: "Spouse lock-in", desc: "Get BOTH homeowners at the sit.", context: "You've agreed a roof look makes sense. The rep now needs a time when both homeowners are home. You keep offering times when your spouse is out.", first: "Sure, come by whenever. Tomorrow at noon works — my husband's at work but I'll be here." },
  { id: "close", label: "The either/or close", desc: "Land the time without a yes/no.", context: "The conversation went well. You're warm and basically convinced — but if the rep asks a yes/no question or gets vague about timing, you drift and say you'll 'call them'.", first: "Alright, you make a decent case. So… what, I call you guys when we're ready or how's this work?" },
  { id: "reknock", label: "Re-knock (said no before)", desc: "New reason, new frame — 2 weeks later.", context: "This rep knocked two weeks ago and you said no. They're back. If they reuse the old pitch, shut it down. A genuinely NEW reason (neighbor's approval, adjuster on the street) reopens you.", first: "*opens door, recognizes you* You again? I told you last time we're not interested." },
  { id: "callback", label: "Callback follow-through", desc: "They found your door hanger.", context: "You found the rep's door hanger saying they saw something on the left side of your roofline. Curiosity got you — but you're guarded.", first: "Hey, you're the one who left that note, right? What exactly did you see on my roof?" },
  { id: "comeback", label: "'Just leave a card'", desc: "Convert the brush-off into a time.", context: "The rep gave the opener. You're using the classic polite escape.", first: "Tell you what — just leave a card and if we're interested we'll give you a call, okay?" },
];

/* ---------- objection gauntlet ---------- */

const OBJECTIONS = [
  "Not interested. *starts closing the door*",
  "How much is this going to cost me?",
  "We already have a roofer we trust.",
  "If I file a claim my insurance rates will skyrocket.",
  "You're one of those storm chasers, aren't you?",
  "The roof is fine. It's not even that old.",
  "I need to talk to my wife first.",
  "Just leave a card and we'll call you.",
  "My insurance already denied a roof claim last year.",
  "We're selling the house — not putting a dime into it.",
  "I don't do business with door-to-door people. Ever.",
  "My nephew does roofing, he'll take care of it.",
  "How did you even get into this neighborhood? There's a gate.",
  "I'm renting — you'd have to talk to the landlord.",
  "We just got the roof done two years ago.",
  "I've had three of you guys knock this week. Three.",
  "Can't you read the no-soliciting sign?",
  "I'm literally walking out the door right now.",
  "What's in it for you? Nobody does free inspections.",
  "The last company took our deductible and disappeared.",
];

const BASE_RULES = `You are roleplaying a homeowner in a door-to-door sales training simulator for a roofing/storm-damage appointment setter.
Rules: Stay fully in character as the homeowner. Reply in 1-3 short spoken sentences, natural and realistic — interruptions, hesitation, real objections, occasional *actions in asterisks*. Never break character, never give coaching, never mention being an AI. If the rep is pushy or robotic, get colder. If the rep genuinely earns it, agree to a specific appointment time (with both homeowners when that applies) — do not agree before they earn it.`;

const DIFF_RULES = {
  easy: "Difficulty: EASY — warm up if the rep is decent; one objection max before softening.",
  medium: "Difficulty: MEDIUM — need 2-3 genuinely good moves before softening; raise at least two different objections.",
  hard: "Difficulty: HARD — stack objections, threaten to close the door at least once, test the rep's close twice, and only agree if they are excellent.",
};

/* ---------- component ---------- */

export default function TrainTab() {
  const [mode, setMode] = useState(null); // null | 'full' | 'section' | 'gauntlet'
  const [difficulty, setDifficulty] = useState("medium");

  if (mode === "full") return <FullDoor difficulty={difficulty} back={() => setMode(null)} />;
  if (mode === "section") return <SectionDrill difficulty={difficulty} back={() => setMode(null)} />;
  if (mode === "gauntlet") return <Gauntlet back={() => setMode(null)} />;

  return (
    <div className="p-4 space-y-3">
      <div className="bg-slate-900 text-white rounded-2xl p-4">
        <div className="disp text-lg font-extrabold uppercase flex items-center gap-2"><Mic size={18} className="text-amber-400" /> Door trainer</div>
        <p className="text-sm text-slate-300 mt-1">Talk with the mic like a real knock, or type. Three ways to train — full doors, one section at a time, or rapid-fire objections.</p>
      </div>

      <div className="flex gap-2">
        {["easy", "medium", "hard"].map((d) => (
          <button key={d} onClick={() => setDifficulty(d)} className={`flex-1 py-2 rounded-xl disp font-bold uppercase text-sm ${difficulty === d ? "bg-amber-500 text-white" : "bg-white text-slate-500"}`}>{d}</button>
        ))}
      </div>

      <ModeCard onClick={() => setMode("full")} icon={DoorOpen} title="Full door" color="text-amber-500"
        desc={`Complete knock, opener to close. ${PERSONAS.length} personas covering the edge cases — renters, no-soliciting signs, denied claims, one-leggers, teens, dogs.`} />
      <ModeCard onClick={() => setMode("section")} icon={Target} color="text-emerald-500" title="Drill a section"
        desc={`Pick where the conversation starts — the opener, "how much", spouse lock-in, the either/or close, a re-knock — and rep that exact moment over and over.`} />
      <ModeCard onClick={() => setMode("gauntlet")} icon={Zap} color="text-rose-500" title="Objection gauntlet"
        desc={`Rapid fire: ${OBJECTIONS.length} real objections thrown at you one after another. Each answer scored /10 with the exact better line.`} />
    </div>
  );
}

const ModeCard = ({ onClick, icon: Icon, title, desc, color }) => (
  <button onClick={onClick} className="knockbtn w-full bg-white rounded-2xl shadow-sm p-4 text-left flex items-start gap-3">
    <Icon size={24} className={`${color} shrink-0 mt-0.5`} />
    <div>
      <div className="font-semibold text-[15px]">{title}</div>
      <div className="text-xs text-slate-500 leading-relaxed mt-0.5">{desc}</div>
    </div>
  </button>
);

/* ---------- full door ---------- */

function FullDoor({ difficulty, back }) {
  const [persona, setPersona] = useState(null);
  const [curveballs, setCurveballs] = useState(true);

  if (!persona) return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={back} className="text-sm text-slate-500 flex items-center"><ChevronLeft size={16} /> Modes</button>
        <button onClick={() => setPersona(PERSONAS[Math.floor(Math.random() * PERSONAS.length)])}
          className="text-xs bg-slate-900 text-white rounded-full px-3 py-1.5 font-bold flex items-center gap-1"><Shuffle size={13} /> Random door</button>
      </div>
      <label className="bg-white rounded-2xl shadow-sm p-3 flex items-center justify-between text-sm">
        <span className="font-semibold">Throw curveballs mid-conversation</span>
        <input type="checkbox" checked={curveballs} onChange={(e) => setCurveballs(e.target.checked)} className="w-5 h-5 accent-amber-500" />
      </label>
      <div className="space-y-2">
        {PERSONAS.map((p) => (
          <button key={p.id} onClick={() => setPersona(p)} className="knockbtn w-full bg-white rounded-2xl shadow-sm p-3.5 text-left flex items-center justify-between">
            <div>
              <div className="font-semibold">{p.label}</div>
              <div className="text-xs text-slate-500">{p.desc}</div>
            </div>
            <DoorOpen size={18} className="text-amber-500 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );

  const sys = `${BASE_RULES}
Persona: ${persona.label} — ${persona.desc}. ${persona.sys}
${DIFF_RULES[difficulty]}
${curveballs ? "Curveball: once, somewhere in the middle of the conversation, inject a realistic interruption (phone rings, kid runs out, neighbor waves, rain starts, dog bolts) and see if the rep recovers the thread." : ""}`;

  return <Sim title={`${persona.label} · ${difficulty}`} sys={sys} seed={[]} onExit={() => setPersona(null)}
    intro="🚪 The door opens… make your opener." />;
}

/* ---------- section drills ---------- */

function SectionDrill({ difficulty, back }) {
  const [section, setSection] = useState(null);

  if (!section) return (
    <div className="p-4 space-y-3">
      <button onClick={back} className="text-sm text-slate-500 flex items-center"><ChevronLeft size={16} /> Modes</button>
      <p className="text-xs text-slate-500 px-1">Pick the exact moment to practice. The sim drops you straight into it — rep it, restart it, rep it again.</p>
      <div className="space-y-2">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSection(s)} className="knockbtn w-full bg-white rounded-2xl shadow-sm p-3.5 text-left flex items-center justify-between">
            <div>
              <div className="font-semibold">{s.label}</div>
              <div className="text-xs text-slate-500">{s.desc}</div>
            </div>
            <Target size={18} className="text-emerald-500 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );

  const sys = `${BASE_RULES}
${DIFF_RULES[difficulty]}
This is a SECTION DRILL. The conversation is already at this exact stage: ${section.context}
Your first line has already been said: "${section.first}"
Keep the whole exchange focused on this stage. If the rep handles it well, resolve the stage realistically (agree, soften, or give the info) within a few exchanges rather than dragging the conversation to other topics.`;

  return <Sim key={section.id} title={section.label} sys={sys}
    seed={[{ role: "assistant", content: section.first }]}
    onExit={() => setSection(null)} intro={null} />;
}

/* ---------- shared live sim ---------- */

function Sim({ title, sys, seed, onExit, intro }) {
  const [msgs, setMsgs] = useState(seed);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tts, setTts] = useState(true);
  const [listening, setListening] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState("");
  const recRef = useRef(null);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, feedback, hint]);
  useEffect(() => { if (tts && seed[0]) speak(seed[0].content); }, []);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput(""); setHint("");
    const next = [...msgs, { role: "user", content: t }];
    setMsgs(next); setBusy(true);
    try {
      const reply = await askClaude(next, sys, { effort: "low" });
      setMsgs([...next, { role: "assistant", content: reply }]);
      if (tts) speak(reply);
    } catch { setMsgs([...next, { role: "assistant", content: "(connection hiccup — say that again)" }]); }
    setBusy(false);
  };

  const listen = () => {
    if (listening) { recRef.current?.stop(); return; }
    const r = makeRecognizer((t) => send(t), () => setListening(false));
    if (!r) { alert("Voice input isn't supported in this browser — type instead."); return; }
    recRef.current = r; setListening(true); r.start();
  };

  const getHint = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const transcript = msgs.map((m) => `${m.role === "user" ? "REP" : "HOMEOWNER"}: ${m.content}`).join("\n") || "(conversation hasn't started)";
      const h = await askClaude(
        [{ role: "user", content: `Door-knocking roleplay in progress. Situation: ${title}. Transcript:\n${transcript}\n\nWhisper ONE line the rep should say next, and a 5-10 word reason. Format: LINE: "..." — WHY: ...` }],
        "You are an elite door-to-door sales coach whispering in the rep's earpiece. One line only.");
      setHint(h);
    } catch { setHint("Coach unavailable — trust your gut."); }
    setBusy(false);
  };

  const grade = async () => {
    if (msgs.length < 2 || busy) return;
    setBusy(true);
    try {
      const transcript = msgs.map((m) => `${m.role === "user" ? "REP" : "HOMEOWNER"}: ${m.content}`).join("\n");
      const fb = await askClaude(
        [{ role: "user", content: `Score this door-knocking roleplay for the REP (an appointment setter). Scenario: ${title}. Transcript:\n${transcript}\n\nGive a rubric, 0-2 points each (total /10):\n1) Opener / frame control\n2) Discovery & damage specifics\n3) Objection handling\n4) Close control (either/or time, no yes/no questions)\n5) Both-homeowners lock-in\nThen: Best moment. Biggest miss. One exact line to say differently (write the line). Under 170 words, coach-style, blunt.` }],
        "You are an elite door-to-door sales coach. Be direct, specific, and practical.");
      setFeedback(fb);
    } catch { setFeedback("Couldn't reach the coach — try again."); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>
      <div className="px-4 py-2 flex items-center justify-between bg-white border-b border-slate-200">
        <button onClick={onExit} className="text-xs text-slate-500 flex items-center"><ChevronLeft size={14} /> Back</button>
        <div className="disp font-bold uppercase text-sm truncate px-2">{title}</div>
        <div className="flex gap-1.5 items-center">
          <button onClick={() => { setMsgs(seed); setFeedback(""); setHint(""); }} className="text-slate-500 p-1" title="Restart"><RotateCcw size={16} /></button>
          <button onClick={() => setTts(!tts)} className="text-slate-500 p-1">{tts ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <button onClick={grade} className="text-xs bg-slate-900 text-white rounded-full px-3 py-1 font-bold">Score me</button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {msgs.length === 0 && intro && <p className="text-center text-slate-400 text-sm mt-10">{intro}</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "ml-auto bg-amber-500 text-white" : "bg-white shadow-sm"}`}>{m.content}</div>
        ))}
        {busy && <div className="bg-white shadow-sm rounded-2xl px-3 py-2 text-sm w-16 text-slate-400">…</div>}
        {hint && <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3 text-xs whitespace-pre-wrap"><b className="disp uppercase">Earpiece:</b> {hint}</div>}
        {feedback && <div className="bg-slate-900 text-slate-100 rounded-2xl p-3 text-sm whitespace-pre-wrap"><div className="disp font-bold uppercase text-amber-400 mb-1 flex items-center gap-1"><Sparkles size={14} /> Coach's card</div>{feedback}</div>}
        <div ref={endRef} />
      </div>
      <div className="p-3 bg-white border-t border-slate-200 flex gap-2">
        <button onClick={getHint} disabled={busy} className="knockbtn rounded-xl px-3 bg-emerald-50 text-emerald-600 disabled:opacity-40" title="Coach hint"><Lightbulb size={20} /></button>
        <button onClick={listen} className={`knockbtn rounded-xl px-4 ${listening ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600"}`}>{listening ? <MicOff size={20} /> : <Mic size={20} />}</button>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Speak or type your line…"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-amber-500" />
        <button onClick={() => send()} className="knockbtn rounded-xl bg-amber-500 text-white px-4"><Send size={18} /></button>
      </div>
    </div>
  );
}

/* ---------- objection gauntlet ---------- */

function Gauntlet({ back }) {
  const [order, setOrder] = useState(() => [...OBJECTIONS].sort(() => Math.random() - 0.5));
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState("answer"); // answer | scored | done
  const [scores, setScores] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tts, setTts] = useState(true);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const objection = order[i];
  useEffect(() => { if (tts && phase === "answer" && objection) speak(objection.replace(/\*[^*]*\*/g, "")); }, [i, phase]);

  const submit = async (text) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    setInput(""); setBusy(true);
    try {
      const out = await askClaude(
        [{ role: "user", content: `Objection drill for a roofing/storm-damage appointment setter.\nHOMEOWNER OBJECTION: "${objection}"\nREP'S RESPONSE: "${t}"\n\nScore the response 0-10 (10 = agrees + redirects + ends on an either/or time or clear next step; deduct for arguing, price talk, robotic lines, yes/no closes, giving up). Reply in EXACTLY this format:\nSCORE: n/10\nWHY: one blunt sentence\nBETTER: the exact line a top rep would say` }],
        "You are an elite door-to-door sales coach grading objection handling. Strict but fair. Follow the output format exactly.");
      const scoreMatch = out.match(/SCORE:\s*(\d+(?:\.\d+)?)/i);
      const score = scoreMatch ? Math.min(10, parseFloat(scoreMatch[1])) : null;
      setScores((s) => [...s, { objection, response: t, score, out }]);
      setLastResult({ score, out });
      setPhase("scored");
    } catch {
      setLastResult({ score: null, out: "Couldn't reach the coach — hit next and keep going." });
      setPhase("scored");
    }
    setBusy(false);
  };

  const next = () => {
    if (i + 1 >= order.length) { setPhase("done"); return; }
    setI(i + 1); setPhase("answer"); setLastResult(null);
  };

  const listen = () => {
    if (listening) { recRef.current?.stop(); return; }
    const r = makeRecognizer((t) => submit(t), () => setListening(false));
    if (!r) { alert("Voice input isn't supported in this browser — type instead."); return; }
    recRef.current = r; setListening(true); r.start();
  };

  const graded = scores.filter((s) => s.score !== null);
  const avg = graded.length ? (graded.reduce((a, s) => a + s.score, 0) / graded.length).toFixed(1) : "—";

  if (phase === "done" || (phase !== "answer" && i + 1 >= order.length && lastResult === null)) {
    const worst = [...graded].sort((a, b) => a.score - b.score).slice(0, 3);
    return (
      <div className="p-4 space-y-3">
        <button onClick={back} className="text-sm text-slate-500 flex items-center"><ChevronLeft size={16} /> Modes</button>
        <div className="bg-slate-900 text-white rounded-2xl p-5 text-center">
          <div className="disp uppercase font-bold text-slate-300 text-sm">Gauntlet complete</div>
          <div className="disp text-5xl font-extrabold text-amber-400 mt-1">{avg}<span className="text-lg text-slate-400">/10</span></div>
          <div className="text-xs text-slate-400 mt-1">{graded.length} objections answered</div>
        </div>
        {worst.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <div className="disp font-bold uppercase text-sm text-slate-500">Drill these again</div>
            {worst.map((w, idx) => (
              <div key={idx} className="text-xs border-b border-slate-100 last:border-0 pb-2">
                <div className="font-semibold text-slate-700">"{w.objection}" — {w.score}/10</div>
                <div className="text-slate-500 whitespace-pre-wrap mt-1">{w.out.split(/BETTER:/i)[1] ? "Better: " + w.out.split(/BETTER:/i)[1].trim() : w.out}</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => { setOrder([...OBJECTIONS].sort(() => Math.random() - 0.5)); setI(0); setScores([]); setPhase("answer"); setLastResult(null); }}
          className="knockbtn w-full bg-amber-500 text-white rounded-2xl p-4 disp font-extrabold uppercase">Run it again</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 130px)" }}>
      <div className="px-4 py-2 flex items-center justify-between bg-white border-b border-slate-200">
        <button onClick={back} className="text-xs text-slate-500 flex items-center"><ChevronLeft size={14} /> Quit</button>
        <div className="disp font-bold uppercase text-sm">Gauntlet · {i + 1}/{order.length}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTts(!tts)} className="text-slate-500">{tts ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          <span className="text-xs font-bold text-amber-600">avg {avg}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="bg-white shadow-sm rounded-2xl p-4">
          <div className="text-[11px] uppercase font-bold text-rose-500 mb-1 flex items-center gap-1"><Zap size={12} /> Objection {i + 1}</div>
          <p className="text-[15px] font-medium leading-relaxed">{objection}</p>
        </div>

        {phase === "scored" && lastResult && (
          <div className="bg-slate-900 text-slate-100 rounded-2xl p-4">
            {lastResult.score !== null && (
              <div className={`disp text-3xl font-extrabold ${lastResult.score >= 8 ? "text-emerald-400" : lastResult.score >= 5 ? "text-amber-400" : "text-rose-400"}`}>{lastResult.score}/10</div>
            )}
            <p className="text-sm whitespace-pre-wrap leading-relaxed mt-1">{lastResult.out.replace(/^SCORE:.*\n?/i, "")}</p>
          </div>
        )}
        {busy && <div className="bg-white shadow-sm rounded-2xl px-3 py-2 text-sm w-24 text-slate-400">grading…</div>}
      </div>

      <div className="p-3 bg-white border-t border-slate-200">
        {phase === "answer" ? (
          <div className="flex gap-2">
            <button onClick={listen} className={`knockbtn rounded-xl px-4 ${listening ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600"}`}>{listening ? <MicOff size={20} /> : <Mic size={20} />}</button>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Fire back — voice or type…"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-rose-400" />
            <button onClick={() => submit()} disabled={busy} className="knockbtn rounded-xl bg-rose-500 text-white px-4 disabled:opacity-40"><Send size={18} /></button>
          </div>
        ) : (
          <button onClick={next} className="knockbtn w-full bg-amber-500 text-white rounded-xl py-3.5 disp font-extrabold uppercase">
            {i + 1 >= order.length ? "See results" : "Next objection →"}
          </button>
        )}
      </div>
    </div>
  );
}
