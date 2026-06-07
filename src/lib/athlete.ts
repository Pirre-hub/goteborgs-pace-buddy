// ═════════════════════════════════════════════════════════════════════════
// ATLETPROFIL — ändra dessa värden vid remix till en annan person.
// All hårdkodad personlig data (namn, ålder, vikt, längd) hämtas härifrån.
// ═════════════════════════════════════════════════════════════════════════

export const ATHLETE = {
  firstName: "Per",            // tilltalsnamn
  firstNamePossessive: "Pers", // svensk genitivform
  nickname: "Pirren",          // smeknamn (används i coach-prompter)
  appName: "Pirrecoachen",     // app-titel i UI och prompter
  age: 64,                     // år
  weightKg: 74,
  heightCm: 180,
  sex: "male" as const,
};

/** Max-puls enligt Tanaka & Seals (211 − 0.64 × ålder). */
export function maxHr(age: number = ATHLETE.age): number {
  return Math.round(211 - 0.64 * age);
}

/**
 * Ersätter platsmarkörer i system-prompter med atletens värden.
 * Stödda tokens:
 *   {{NAME}}, {{NAME_POSS}}, {{NICK}}, {{AGE}},
 *   {{WEIGHT}}, {{HEIGHT}}, {{MAX_HR}}, {{HR_COEFF_AGE}}
 */
export function personalizePrompt(template: string): string {
  const hr = maxHr();
  return template
    .replaceAll("{{NAME}}", ATHLETE.firstName)
    .replaceAll("{{NAME_POSS}}", ATHLETE.firstNamePossessive)
    .replaceAll("{{NICK}}", ATHLETE.nickname)
    .replaceAll("{{AGE}}", String(ATHLETE.age))
    .replaceAll("{{WEIGHT}}", String(ATHLETE.weightKg))
    .replaceAll("{{HEIGHT}}", String(ATHLETE.heightCm))
    .replaceAll("{{MAX_HR}}", String(hr))
    .replaceAll("{{HR_COEFF_AGE}}", (0.64 * ATHLETE.age).toFixed(2));
}
