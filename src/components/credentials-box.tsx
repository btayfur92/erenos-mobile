"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { BASE_PATH } from "@/lib/config";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Eski tarayıcılar veya izin verilmeyen durumlar için yedek yol
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    return ok;
  }
}

/** Kullanıcı adı ve şifreyi gösterir; tek dokunuşla adresle birlikte panoya kopyalar. */
export function CredentialsBox({ username, password }: { username: string; password: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  const copy = async () => {
    const text = `Erenos Medikal Mobil\nAdres: ${window.location.origin}${BASE_PATH || "/"}\nKullanıcı adı: ${username}\nŞifre: ${password}`;
    setState((await copyText(text)) ? "ok" : "fail");
  };

  return (
    <div className="space-y-2">
      <div className="space-y-2 rounded-2xl bg-canvas p-4 font-mono text-[15px]">
        <p>
          <span className="text-muted">Kullanıcı adı:</span> <b className="select-all">{username}</b>
        </p>
        <p>
          <span className="text-muted">Şifre:</span> <b className="select-all">{password}</b>
        </p>
      </div>
      <button type="button" onClick={copy} className={`btn-secondary w-full ${state === "ok" ? "text-emerald-700" : ""}`}>
        {state === "ok" ? <Check size={18} /> : <Copy size={18} />}
        {state === "ok" ? "Kopyalandı" : state === "fail" ? "Kopyalanamadı, elle seçin" : "Bilgileri kopyala"}
      </button>
    </div>
  );
}
