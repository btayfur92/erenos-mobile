"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { login, type LoginState } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const [show, setShow] = useState(false);
  const error = state.error ?? notice;

  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="username">
          Kullanıcı adı
        </label>
        <input
          id="username"
          name="username"
          className="input"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </div>
      <div>
        <label className="field-label" htmlFor="password">
          Şifre
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            className="input pr-12"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted"
            aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>
      {error && (
        <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full py-3.5" disabled={pending}>
        {pending && <Loader2 size={18} className="animate-spin" />}
        Giriş yap
      </button>
    </form>
  );
}
