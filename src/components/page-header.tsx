import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { SideMenu } from "./side-menu";
import mark from "../../public/mark.png";

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur-xl pt-safe">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
        {back ? (
          <Link href={back} className="-ml-2 grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-canvas" aria-label="Geri">
            <ChevronLeft size={24} />
          </Link>
        ) : (
          <>
            <Suspense>
              <SideMenu />
            </Suspense>
            <Image src={mark} alt="" className="h-7 w-auto" priority />
          </>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}
