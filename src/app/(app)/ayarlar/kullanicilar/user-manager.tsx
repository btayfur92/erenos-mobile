"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Plus, UserCheck, UserX } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { CredentialsBox } from "@/components/credentials-box";
import { ROLE_LABEL, USER_ROLES, type Profile, type UserRole } from "@/lib/types";
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
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${u.is_admin ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-700"}`}
              >
                {ROLE_LABEL[u.role]}
              </span>
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
    r.message ? (
      <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-700">{r.message}</p>
    ) : null
  ) : (
    <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{r.error}</p>
  );
}

/** Kullanıcı tipi seçimi: her tipin altında ne yapabildiği yazar. */
function RolePicker({ value, onChange, disabled }: { value: UserRole; onChange: (r: UserRole) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Kullanıcı tipi" className="grid grid-cols-2 gap-2">
      {USER_ROLES.map((r) => (
        <button
          key={r.value}
          type="button"
          role="radio"
          aria-checked={value === r.value}
          disabled={disabled}
          onClick={() => onChange(r.value)}
          className={`rounded-xl p-3 text-left ring-1 transition ${value === r.value ? "bg-brand-50 ring-2 ring-brand-600" : "bg-white ring-line"}`}
        >
          <b className={`block text-[14px] font-semibold ${value === r.value ? "text-brand-700" : ""}`}>{r.label}</b>
          <span className="block text-[12px] leading-snug text-muted">{r.hint}</span>
        </button>
      ))}
    </div>
  );
}

function AddUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pending, result, run, setResult } = useRun();
  const [form, setForm] = useState({ username: "", full_name: "", password: randomPassword(), role: "satis" as UserRole });
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  const close = () => {
    setCreated(null);
    setResult(undefined);
    setForm({ username: "", full_name: "", password: randomPassword(), role: "satis" });
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title="Yeni kullanıcı">
      {created ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">Kullanıcı oluşturuldu. Bu bilgileri kişiyle paylaşın:</p>
          <CredentialsBox username={created.username} password={created.password} />
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
              <input
                className="input font-mono"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button type="button" className="btn-secondary px-3" onClick={() => setForm({ ...form, password: randomPassword() })}>
                Üret
              </button>
            </div>
          </div>
          <div>
            <span className="field-label">Kullanıcı tipi</span>
            <RolePicker value={form.role} onChange={(role) => setForm({ ...form, role })} />
          </div>
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
  const [newCred, setNewCred] = useState<{ username: string; password: string } | null>(null);
  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username);
  const [role, setRole] = useState<UserRole>(user.role);
  const changed = fullName.trim() !== user.full_name || normalizeUsername(username) !== user.username || role !== user.role;

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
          <div>
            <span className="field-label">Kullanıcı tipi</span>
            <RolePicker value={role} onChange={setRole} disabled={self} />
            {self && <p className="mt-1.5 text-[12px] text-muted">Kendi kullanıcı tipinizi değiştiremezsiniz.</p>}
          </div>
          <button
            className="btn-primary w-full"
            disabled={pending || !changed || !fullName.trim()}
            onClick={() => run(() => updateUser(user.id, { full_name: fullName.trim(), username, ...(self ? {} : { role }) }))}
          >
            Bilgileri kaydet
          </button>
        </div>
        <div>
          <label className="field-label">Yeni şifre</label>
          <div className="flex gap-2">
            <input
              className="input font-mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
            />
            <button type="button" className="btn-secondary px-3" onClick={() => setPassword(randomPassword())}>
              Üret
            </button>
          </div>
          <button
            className="btn-primary mt-2 w-full"
            disabled={pending || !password}
            onClick={() => {
              const pw = password;
              run(
                () => resetPassword(user.id, pw),
                () => {
                  setNewCred({ username: user.username, password: pw });
                  setPassword("");
                },
              );
            }}
          >
            <KeyRound size={17} /> Şifreyi değiştir
          </button>
          {newCred && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted">Yeni giriş bilgilerini kişiyle paylaşın:</p>
              <CredentialsBox username={newCred.username} password={newCred.password} />
            </div>
          )}
        </div>
        {!self && (
          <div>
            <button
              className={`w-full ${user.active ? "btn bg-accent-50 text-accent-700" : "btn bg-emerald-50 text-emerald-700"}`}
              disabled={pending}
              onClick={() => run(() => updateUser(user.id, { active: !user.active }), onClose)}
            >
              {user.active ? <UserX size={17} /> : <UserCheck size={17} />} {user.active ? "Pasife al" : "Aktif et"}
            </button>
          </div>
        )}
        <Result r={result} />
      </div>
    </Sheet>
  );
}
