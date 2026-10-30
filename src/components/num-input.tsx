"use client";

import { groupNum } from "@/lib/format";

/**
 * Sayı alanı: yazarken binlik ayraç olarak nokta konur (10000 → 10.000), ondalık için virgül kullanılır.
 * İmleç yazılan rakamın yanında kalır; noktayı silmek önündeki rakamı siler.
 */
export function NumInput({ value, onChange, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> & { value: string }) {
  const shown = groupNum(value);
  return (
    <input
      inputMode="decimal"
      autoComplete="off"
      {...rest}
      value={shown}
      onChange={(e) => {
        const el = e.target;
        let src = el.value;
        let pos = el.selectionStart ?? src.length;
        // Geri silmeyle yalnızca binlik noktası silindiyse önündeki rakamı sil.
        if (src.length === shown.length - 1 && shown[pos] === "." && src === shown.slice(0, pos) + shown.slice(pos + 1) && pos > 0) {
          src = src.slice(0, pos - 1) + src.slice(pos);
          pos -= 1;
        }
        const next = groupNum(src);
        let caret = next.length;
        if (pos < src.length) {
          // İmleçten önceki rakam/virgül sayısı korunur.
          let n = src.slice(0, pos).replace(/[^\d,]/g, "").length;
          caret = 0;
          while (caret < next.length && n > 0) if (/[\d,]/.test(next[caret++])) n--;
        }
        el.value = next;
        el.setSelectionRange(caret, caret);
        onChange?.(e);
      }}
    />
  );
}
