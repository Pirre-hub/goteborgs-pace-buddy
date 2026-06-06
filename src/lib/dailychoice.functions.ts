import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getTodayChoice = createServerFn({ method: "GET" }).handler(
  async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${(today.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;
    const { data } = await supabaseAdmin
      .from("daily_choices")
      .select("*")
      .eq("date", dateStr)
      .maybeSingle();
    return { choice: data, date: dateStr };
  },
);

export const saveChoice = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      date: string;
      recommended_type: string;
      actual_choice: string;
      note?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const { date, recommended_type, actual_choice, note } = data;
    await supabaseAdmin.from("daily_choices").upsert(
      {
        date,
        recommended_type,
        actual_choice,
        note: note ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "date" },
    );
    return { ok: true };
  });

export const getRecentChoices = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data } = await supabaseAdmin
      .from("daily_choices")
      .select("date, recommended_type, actual_choice")
      .order("date", { ascending: false })
      .limit(14);
    return { choices: data ?? [] };
  },
);
