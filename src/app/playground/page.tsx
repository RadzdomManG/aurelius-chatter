"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw, Send, ShieldCheck, Sparkles } from "lucide-react";

type Turn = { role: "fan" | "aurelius"; text: string };
type Result = { decision: { action: string; replyText: string | null; confidence: number; intent: string; sentiment: string; conversationStage: string; handoffReason: string | null; riskFlags: string[] }; model: string | null; diagnostics: { recentMessagesUsed: number; memoryRecordsLoaded: number; summaryUsed: boolean; contextCharacters: number; estimatedHistoricalCharactersAvoided: number; validation: string } };
type Persona = { id: string; display_name: string; instructions?: string; active?: boolean };
type Model = { id: string; display_name: string; persona_profiles: Persona[] | Persona | null };

export default function PlaygroundPage() {
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    async function loadModels() {
      try {
        const response = await fetch("/api/models");
        const payload = await response.json() as { models?: Model[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Models could not be loaded.");
        const nextModels = payload.models ?? [];
        setModels(nextModels);
        setSelectedModelId(nextModels[0]?.id ?? "");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Models could not be loaded.");
      } finally {
        setModelsLoading(false);
      }
    }
    void loadModels();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (!nextMessage || busy || !selectedModelId) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/playground", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelId: selectedModelId, message: nextMessage, history: turns.map((turn) => `${turn.role}: ${turn.text}`) }) });
      const payload = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to generate a test response.");
      setTurns((current) => [...current, { role: "fan", text: nextMessage }, ...(payload.decision.replyText ? [{ role: "aurelius" as const, text: payload.decision.replyText }] : [])]);
      setResult(payload); setMessage("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to generate a test response."); }
    finally { setBusy(false); }
  }

  function reset() { setTurns([]); setResult(null); setError(""); setMessage(""); }
  function selectModel(modelId: string) { setSelectedModelId(modelId); reset(); }

  const selectedModel = models.find((model) => model.id === selectedModelId) ?? null;
  const selectedPersona = selectedModel ? (Array.isArray(selectedModel.persona_profiles) ? selectedModel.persona_profiles.find((persona) => persona.active) ?? selectedModel.persona_profiles[0] : selectedModel.persona_profiles) : null;

  return <main className="playground-shell"><Link className="workspace-back playground-back" href="/"><ArrowLeft size={15} /> Back to inbox</Link><header className="playground-header"><div><p className="truth-eyebrow">TEST DATA / SIMULATION</p><h1>Playground</h1><p>Test how your saved model personas respond without sending anything to Fanvue.</p></div><button className="truth-secondary" onClick={reset}><RotateCcw size={15} /> New test</button></header><section className="playground-config"><label>Model to test<select value={selectedModelId} onChange={(event) => selectModel(event.target.value)} disabled={modelsLoading || models.length === 0} aria-label="Model to test"><option value="">{modelsLoading ? "Loading models..." : "Select a model"}</option>{models.map((model) => <option value={model.id} key={model.id}>{model.display_name}</option>)}</select></label>{selectedModel ? <div><span>Persona: {selectedPersona?.display_name ?? "No active persona"}</span><strong>Testing: {selectedModel.display_name}</strong></div> : modelsLoading ? <p>Loading your models...</p> : <div><span>No models available yet.</span><Link className="truth-secondary" href="/models">Add model</Link></div>}</section><div className="playground-grid"><section className="playground-chat"><div className="playground-chat-title"><div><strong>Simulated fan</strong><small>{selectedModel ? `Testing: ${selectedModel.display_name}` : "Isolated test session"}</small></div><ShieldCheck size={18} /></div><div className="playground-transcript">{turns.length === 0 ? <div className="playground-blank"><Sparkles size={23} /><p>{selectedModel ? "Send a message as a simulated fan to begin." : "No models available yet."}</p>{!modelsLoading && models.length === 0 && <Link className="truth-primary" href="/models">Add model</Link>}</div> : turns.map((turn, index) => <div className={`playground-bubble ${turn.role}`} key={`${turn.role}-${index}`}><small>{turn.role === "fan" ? "Simulated fan" : "Aurelius draft"}</small><p>{turn.text}</p></div>)}</div><form className="playground-composer" onSubmit={submit}><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a simulated fan message..." maxLength={5000} aria-label="Simulated fan message" disabled={!selectedModelId} /><button className="truth-primary" disabled={busy || !message.trim() || !selectedModelId}>{busy ? "Generating..." : "Generate"}<Send size={15} /></button></form>{error && <p className="playground-error" role="alert">{error}</p>}</section><aside className="playground-inspector"><p className="truth-eyebrow">AI INSPECTOR</p><h2>Structured decision</h2>{result ? <><div className="inspector-result"><span>Action</span><strong>{result.decision.action}</strong></div><dl><div><dt>Intent</dt><dd>{result.decision.intent}</dd></div><div><dt>Confidence</dt><dd>{Math.round(result.decision.confidence * 100)}%</dd></div><div><dt>Sentiment</dt><dd>{result.decision.sentiment}</dd></div><div><dt>Stage</dt><dd>{result.decision.conversationStage}</dd></div><div><dt>Model</dt><dd>{result.model ?? "Setup required"}</dd></div><div><dt>Validation</dt><dd>{result.diagnostics.validation}</dd></div></dl><div className="inspector-note"><strong>Context budget</strong><span>{result.diagnostics.recentMessagesUsed} recent messages · {result.diagnostics.memoryRecordsLoaded} memories · {result.diagnostics.contextCharacters} characters</span><span>{result.diagnostics.estimatedHistoricalCharactersAvoided} historical characters avoided (approx.)</span></div>{result.decision.handoffReason && <div className="inspector-warning">Handoff: {result.decision.handoffReason}</div>}</> : <p className="playground-muted">Diagnostics appear after a real xAI response. No fallback or invented response is shown when xAI is unavailable.</p>}</aside></div></main>;
}
