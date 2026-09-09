"use client";

import { FormEvent, useState } from "react";
import { RotateCcw, Send, ShieldCheck, Sparkles } from "lucide-react";

type Turn = { role: "fan" | "aurelius"; text: string };
type Result = { decision: { action: string; replyText: string | null; confidence: number; intent: string; sentiment: string; conversationStage: string; handoffReason: string | null; riskFlags: string[] }; model: string | null; diagnostics: { recentMessagesUsed: number; memoryRecordsLoaded: number; summaryUsed: boolean; contextCharacters: number; estimatedHistoricalCharactersAvoided: number; validation: string } };

export default function PlaygroundPage() {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/playground", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: nextMessage, history: turns.map((turn) => `${turn.role}: ${turn.text}`) }) });
      const payload = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate a test response.");
      setTurns((current) => [...current, { role: "fan", text: nextMessage }, ...(payload.decision.replyText ? [{ role: "aurelius" as const, text: payload.decision.replyText }] : [])]);
      setResult(payload); setMessage("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to generate a test response."); }
    finally { setBusy(false); }
  }

  function reset() { setTurns([]); setResult(null); setError(""); setMessage(""); }

  return <main className="playground-shell"><header className="playground-header"><div><p className="truth-eyebrow">TEST DATA / SIMULATION</p><h1>Playground</h1><p>Test the same bounded context and structured AI decision path without touching Fanvue, production fans, analytics, or memory.</p></div><button className="truth-secondary" onClick={reset}><RotateCcw size={15} /> New test</button></header><div className="playground-grid"><section className="playground-chat"><div className="playground-chat-title"><div><strong>Simulated fan</strong><small>Isolated test session</small></div><ShieldCheck size={18} /></div><div className="playground-transcript">{turns.length === 0 ? <div className="playground-blank"><Sparkles size={23} /><p>Send a message as a simulated fan to begin.</p></div> : turns.map((turn, index) => <div className={`playground-bubble ${turn.role}`} key={`${turn.role}-${index}`}><small>{turn.role === "fan" ? "Simulated fan" : "Aurelius draft"}</small><p>{turn.text}</p></div>)}</div><form className="playground-composer" onSubmit={submit}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a simulated fan message..." maxLength={5000} aria-label="Simulated fan message" /><button className="truth-primary" disabled={busy || !message.trim()}>{busy ? "Generating..." : "Generate"}<Send size={15} /></button></form>{error && <p className="playground-error" role="alert">{error}</p>}</section><aside className="playground-inspector"><p className="truth-eyebrow">AI INSPECTOR</p><h2>Structured decision</h2>{result ? <><div className="inspector-result"><span>Action</span><strong>{result.decision.action}</strong></div><dl><div><dt>Intent</dt><dd>{result.decision.intent}</dd></div><div><dt>Confidence</dt><dd>{Math.round(result.decision.confidence * 100)}%</dd></div><div><dt>Sentiment</dt><dd>{result.decision.sentiment}</dd></div><div><dt>Stage</dt><dd>{result.decision.conversationStage}</dd></div><div><dt>Model</dt><dd>{result.model ?? "Setup required"}</dd></div><div><dt>Validation</dt><dd>{result.diagnostics.validation}</dd></div></dl><div className="inspector-note"><strong>Context budget</strong><span>{result.diagnostics.recentMessagesUsed} recent messages · {result.diagnostics.memoryRecordsLoaded} memories · {result.diagnostics.contextCharacters} characters</span><span>{result.diagnostics.estimatedHistoricalCharactersAvoided} historical characters avoided (approx.)</span></div>{result.decision.handoffReason && <div className="inspector-warning">Handoff: {result.decision.handoffReason}</div>}</> : <p className="playground-muted">Diagnostics appear after a real xAI response. No fallback or invented response is shown when xAI is unavailable.</p>}</aside></div></main>;
}
