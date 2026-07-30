"use client";

import { useState } from "react";
import { signInWithPassword, signInWithMagicLink } from "@/app/login/actions";

// Client form so the same e-mail value drives both the password sign-in and
// the passwordless magic-link action.
export function LoginForm() {
  const [email, setEmail] = useState("");

  return (
    <div className="mt-5 space-y-4">
      <form action={signInWithPassword} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">
            E-mailadres
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="jij@voorbeeld.nl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Wachtwoord
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="input"
            placeholder="••••••••"
          />
        </div>
        <button type="submit" className="btn-primary w-full">
          Inloggen
        </button>
      </form>

      <form action={signInWithMagicLink}>
        <input type="hidden" name="email" value={email} />
        <button type="submit" className="btn-ghost w-full text-xs">
          Of stuur mij een inloglink
        </button>
      </form>
    </div>
  );
}
