import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Goal = {
  id: string;
  name: string;
  race_date: string; // YYYY-MM-DD
  distance_km: number;
  goal_pace_sec: number;
};

export async function getActive(): Promise<Goal | null> {
  const { data, error } = await supabaseAdmin
    .from("race_goal")
    .select("id, name, race_date, distance_km, goal_pace_sec")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Goal | null;
}

export async function upsertGoal(input: {
  id?: string;
  name: string;
  race_date: string;
  distance_km: number;
  goal_pace_sec: number;
}) {
  if (input.id) {
    const { error } = await supabaseAdmin
      .from("race_goal")
      .update({
        name: input.name,
        race_date: input.race_date,
        distance_km: input.distance_km,
        goal_pace_sec: input.goal_pace_sec,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    // Deactivate any existing active goal first to satisfy unique partial index
    await supabaseAdmin
      .from("race_goal")
      .update({ is_active: false })
      .eq("is_active", true);
    const { error } = await supabaseAdmin.from("race_goal").insert({
      name: input.name,
      race_date: input.race_date,
      distance_km: input.distance_km,
      goal_pace_sec: input.goal_pace_sec,
      is_active: true,
    });
    if (error) throw new Error(error.message);
  }
  return { ok: true };
}
