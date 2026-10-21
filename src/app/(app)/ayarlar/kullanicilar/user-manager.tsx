"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { Sheet } from "@/components/sheet";
import type { Profile } from "@/lib/types";
import { normalizeUsername } from "@/lib/config";
import { createUser, resetPassword, updateUser, type UserActionResult } from "./actions";

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join("");
}

export function UserManager({ users, currentUserId }: { users: Profile[]; currentUserId: string }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);

  return (
    <>
      <button onClick={() => setAdding(true)} className="btn-primary w-full">
        <Plus size={18} /> Yeni kullanıcı
      </button>

      <ul className="card mt-4 divide-y divide-line/70">
        {users.map((u) => (
          <li key={u.id}>
            <button onClick={() => setEditing(u)} className="flex w-full items-center gap-3 p-4 text-left">
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[14px] font-semibold ${
                  u.active ? "bg-brand-50 text-brand-700" : "bg-canvas text-muted"
                }`}
              >
                {(u.full_name || u.username).slice(0, 1).toLocaleUpperCase("tr-TR")}
              </span>
              <span className="min-w-0 flex-1">
                <b className={`block truncate text-[15px] font-semibold ${u.active ? "" : "text-muted line-through"}`}>
                  {u.full_name || u.username}
                </b>
                <span className="text-[13px] text-muted">@{u.username}</span>
              </span>
              {u.is_admin && (
                <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[11px] font-semibold text-brand-700">
                  <ShieldCheck size={13} /> Yönetici
                </span>
              )}
              {!u.active && <span className="rounded-full bg-canvas px-2 py-1 text-[11px] font-semibold text-muted">Pasif</span>}
            </button>
          </li>
        ))}
      </ul>

      <AddUserSheet open={adding} onClose={() => setAdding(false)} />
      {editing && <EditUserSheet user={editing} self={editing.id === currentUserId} onClose={() => setEditing(null)} />}
    </>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<UserActionResult>();
  const run = (fn: () => Promise<UserActionResult>, onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) onOk?.();
    });
  return { pending, result, run, setResult };
}

function Result({ r }: { r?: UserActionResult }) {
  if (!r) return null;
  return r.ok ? (
    r.message ? <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700">{r.message}</p> : null
  ) : (
    <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{r.error}</p>
  );
}

function AddUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pending, result, run, setResult } = useRun();
  const [form, setForm] = useState({ username: "", full_name: "", password: randomPassword(), is_admin: false });
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const close = () => {
    setCreated(null);
    setResult(undefined);
    setForm({ username: "", full_name: "", password: randomPassword(), is_admin: false });
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Yeni kullanıcı">
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Kullanıcı oluşturuldu. Bu bilgileri kişiyle paylaşın:</p>
          <div className="space-y-2 rounded-2xl bg-canvas p-4 font-mono text-[15px]">
            <p>
              <span className="text-muted">Kullanıcı adı:</span> <b>{created.username}</b>
            </p>
            <p>
              <span className="text-muted">Şifre:</span> <b>{created.password}</b>
            </p>
          </div>
          <button
            className="btn-secondary w-full"
            onClick={() => navigator.clipboard?.writeText(`Kullanıcı adı: ${created.username}\nŞifre: ${created.password}`)}
          >
            Kopyala
          </button>
          <button className="btn-primary w-full" onClick={close}>
            Tamam
          </button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => createUser(form),
              () => setCreated({ username: normalizeUsername(form.username), password: form.password }),
            );
          }}
        >
          <div>
            <label className="field-label">Ad soyad</label>
            <input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div>
            <label className="field-label">Kullanıcı adı</label>
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="ör. ahmet.yilmaz"
              required
            />
          </div>
          <div>
            <label className="field-label">Şifre</label>
            <div className="flex gap-2">
              <input className="input font-mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              <button type="button" className="btn-secondary px-3" onClick={() => setForm({ ...form, password: randomPassword() })}>
                Üret
              </button>
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-canvas p-3.5 text-sm">
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} className="h-5 w-5 accent-brand-600" />
            <span>
              <b className="block font-semibold">Yönetici</b>
              <span className="text-muted">Kullanıcı ekleyip yönetebilir.</span>
            </span>
          </label>
          <Result r={result} />
          <button className="btn-primary w-full" disabled={pending}>
            {pending && <Loader2 size={18} className="animate-spin" />} Oluştur
          </button>
        </form>
      )}
    </Sheet>
  );
}

function EditUserSheet({ user, self, onClose }: { user: Profile; self: boolean; onClose: () => void }) {
  const { pending, result, run } = useRun();
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username);
  const changed = fullName.trim() !== user.full_name || normalizeUsername(username) !== user.username;

  return (
    <Sheet open onClose={onClose} title={user.full_name || user.username}>
      <div className="space-y-5">
        <div className="space-y-3">
          <div>
            <label className="field-label">Ad soyad</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Kullanıcı adı</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <button
            className="btn-primary w-full"
            disabled={pending || !changed || !fullName.trim()}
            onClick={() => run(() => updateUser(user.id, { full_name: fullName.trim(), username }))}
          >
            Bilgileri kaydet
          </button>
        </div>
        <div>
          <label className="field-label">Yeni şifre</label>
          <div className="flex gap-2">
            <input className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="En az 6 karakter" />
            <button type="button" className="btn-secondary px-3" onClick={() => setPassword(randomPassword())}>
              Üret
            </button>
          </div>
          <button
            className="btn-primary mt-2 w-full"
            disabled={pending || !password}
            onClick={() => run(() => resetPassword(user.id, password))}
          >
            <KeyRound size={17} /> Şifreyi değiştir
          </button>
        </div>
        {!self && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" disabled={pending} onClick={() => run(() => updateUser(user.id, { is_admin: !user.is_admin }), onClose)}>
              <ShieldCheck size={17} /> {user.is_admin ? "Yöneticiliği kaldır" : "Yönetici yap"}
            </button>
            <button
              className={user.active ? "btn bg-accent-50 text-accent-700" : "btn bg-emerald-50 text-emerald-700"}
              disabled={pending}
              onClick={() => run(() => updateUser(user.id, { active: !user.active }), onClose)}
            >
              {user.active ? <UserX size={17} /> : <UserCheck size={17} />} {user.active ? "Pasife al" : "Aktif et"}
            </button>
            <p className="col-span-2 text-[12px] text-muted">
              Yönetici yapılan kullanıcı sizinle aynı yetkilere sahip olur: kullanıcı ekleyebilir, düzenleyebilir ve yönetici atayabilir.
            </p>
          </div>
        )}
        <Result r={result} />
      </div>
    </Sheet>
  );
}
