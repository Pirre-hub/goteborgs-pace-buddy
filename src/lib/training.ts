// Pure helpers — safe to import in both client and server code.

export function acwrDecision(acwr: number | null | undefined): string {
  if (acwr == null || !isFinite(acwr)) return "";
  if (acwr < 0.8)
    return "Du kan öka volymen 10–15 % utan ökad skaderisk.";
  if (acwr <= 1.3)
    return "Bra balans – håll nuvarande volym.";
  if (acwr <= 1.5)
    return "Hög belastning – håll igen lite, undvik nytt kvalitetspass denna vecka.";
  return "Skaderiskszon – sänk volymen 10–20 % den här veckan.";
}

export function tsbDecision(tsb: number | null | undefined): string {
  if (tsb == null || !isFinite(tsb)) return "";
  if (tsb > 15) return "Toppform – bra läge för kvalitet eller test.";
  if (tsb > 5) return "Pigg – kör som planerat.";
  if (tsb >= -10) return "Balanserad – håll planen.";
  if (tsb >= -20) return "Trött – välj lugnt pass eller vila.";
  return "Mycket trött – prioritera vila eller mycket lugn aktivitet.";
}

export function formatPaceSec(secPerKm: number): string {
  if (!secPerKm || !isFinite(secPerKm) || secPerKm <= 0) return "–";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

export function formatDuration(totalSec: number): string {
  if (!isFinite(totalSec) || totalSec <= 0) return "–";
  const t = Math.round(totalSec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatGap(seconds: number): string {
  const sign = seconds >= 0 ? "+" : "−";
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}
