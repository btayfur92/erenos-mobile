import Image from "next/image";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import logo from "../../../public/logo.png";

export const metadata: Metadata = { title: "Giriş" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  const { hata } = await searchParams;
  return (
    <main className="relative flex min-h-dvh flex-col bg-white pt-safe">
      <div className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
        <Image src={logo} alt="Erenos Medikal" priority className="mx-auto mb-12 h-auto w-64" />
        <h1 className="text-2xl font-semibold tracking-tight">Hoş geldiniz</h1>
        <p className="mb-8 mt-1 text-[15px] text-muted">Size verilen kullanıcı adı ve şifre ile giriş yapın.</p>
        <LoginForm notice={hata === "pasif" ? "Hesabınız pasif durumda. Yöneticinizle görüşün." : undefined} />
      </div>
      <p className="relative pb-8 text-center text-xs text-muted pb-safe">Erenos Medikal · Şirket içi kullanım</p>
    </main>
  );
}
