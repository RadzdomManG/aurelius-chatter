"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
      if (error) throw error;
      setMessage("Check your email for a secure sign-in link.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send a magic link.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell"><section className="auth-card"><div className="brand auth-brand"><span className="brand-mark">A</span><span>Aurelius <em>Chatter</em></span></div><p className="eyebrow">PRIVATE CONVERSATION DESK</p><h1>Welcome back.</h1><p className="muted">Sign in to continue to your workspace.</p><form onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="primary-button auth-submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button></form><button className="magic-link" onClick={sendMagicLink} disabled={busy || !email}>Send a magic link instead</button>{message && <p className="auth-message" role="status">{message}</p>}</section></main>;
}