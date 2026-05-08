import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { stravaExchangeCode } from "@/lib/strava.functions";

export const Route = createFileRoute("/auth/callback")({
  component: Callback,
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
    scope: typeof s.scope === "string" ? s.scope : undefined,
  }),
});

function Callback() {
  const { code, error } = Route.useSearch();
  const navigate = useNavigate();
  const exchange = useServerFn(stravaExchangeCode);
  const [msg, setMsg] = useState("Ansluter till Strava…");

  useEffect(() => {
    if (error) {
      setMsg(`Fel från Strava: ${error}`);
      return;
    }
    if (!code) {
      setMsg("Ingen kod mottagen.");
      return;
    }
    exchange({ data: { code } })
      .then(() => {
        navigate({ to: "/", replace: true });
      })
      .catch((e) => setMsg(`Misslyckades: ${(e as Error).message}`));
  }, [code, error, exchange, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      {msg}
    </div>
  );
}
