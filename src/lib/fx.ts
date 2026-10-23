import "server-only";

/** TCMB günlük kurları (1 birim yabancı para = x TL, döviz satış). */
export type Rates = Record<string, number>;

export function parseTcmbXml(xml: string): Rates {
  const rates: Rates = { TRY: 1 };
  for (const m of xml.matchAll(/<Currency[^>]*CurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/g)) {
    const unit = Number(/<Unit>\s*([\d.]+)\s*<\/Unit>/.exec(m[2])?.[1] ?? 1);
    const selling = Number(/<ForexSelling>\s*([\d.]+)\s*<\/ForexSelling>/.exec(m[2])?.[1]);
    if (selling > 0 && unit > 0) rates[m[1]] = selling / unit;
  }
  return rates;
}

/** Kurlar saatte bir yenilenir; TCMB'ye ulaşılamazsa null döner ve tutarlar para birimine göre ayrı gösterilir. */
export async function getRates(): Promise<Rates | null> {
  try {
    const res = await fetch("https://www.tcmb.gov.tr/kurlar/today.xml", { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const rates = parseTcmbXml(await res.text());
    return Object.keys(rates).length > 1 ? rates : null;
  } catch {
    return null;
  }
}
