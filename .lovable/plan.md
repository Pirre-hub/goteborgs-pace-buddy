# Strava Träningsdashboard – Göteborgsvarvet 2026

En personlig (single-user) träningsdashboard på svenska, ljust tema, med Strava-orange (#FC4C02) som accent. Räknar ned till loppet 23 maj 2026 och visar tempo mot målet 6:10 min/km.

## Autentisering (Strava OAuth)

- "Logga in med Strava"-knapp på startsidan
- OAuth flow: redirect till `https://www.strava.com/oauth/authorize` med `client_id=235302`, `scope=activity:read_all`, `response_type=code`
- Callback-route `/auth/callback` tar emot `code` och anropar en server function som byter koden mot access/refresh-token via Strava (kräver Client Secret)
- Eftersom det är "bara jag": tokens sparas i en `strava_tokens`-tabell i Lovable Cloud (en rad). Vid varje API-anrop kollar servern om access-token gått ut och refreshar automatiskt
- Sidan är publik men visar ett tomt "logga in"-läge tills en token finns

**Du behöver:** Strava Client Secret. Lägg också till callback-domänen `lovable.app` i Strava → Settings → API.

## Data

Server function `getRuns` hämtar `/athlete/activities?per_page=30`, filtrerar `type === "Run"`, normaliserar till: datum, namn, distans (km), tid, tempo (min/km), snittpuls. Cachas i React Query 5 min.

## Dashboard-layout (svenska)

**Header:** "Göteborgsvarvet 2026" + nedräkning (dagar/timmar) till 23 maj 2026.

**Statistikkort (5 st, responsiv grid):**
- Senaste pass – distans + tempo
- Längsta pass (av 30)
- Snittempo senaste 4 veckor
- Total distans senaste 4 veckor
- Snittpuls senaste 4 veckor

**Grafer (Recharts):**
- Tempotrend – linjediagram över 30 senaste pass, Y-axel min/km (inverterad så snabbare = uppåt), streckad referenslinje på 6:10
- Distansdiagram – stapeldiagram över 30 senaste pass

**Tabell:** Senaste 10 pass – Datum, Namn, Distans, Tempo, Puls.

**Race-tips kort längst ned:** Statiskt taktikkort på svenska (t.ex. "Spring jämnt – sikta på 6:10/km från start. Spara energi i uppförsbackarna kring km 8–10. Drick vid varje vätskekontroll.").

## Design

- Ljust tema, vit/ljusgrå bakgrund, mörk text
- Accent #FC4C02 på knappar, referenslinje, aktiva element, ikoner
- Inter-typsnitt, stora siffror i statistikkort
- Mobilvänligt: kort staplas, tabellen scrollar horisontellt

## Teknik

- TanStack Start + Tailwind + shadcn/ui (kort, tabell, knappar)
- Recharts för graferna
- Lovable Cloud (Supabase): tabell `strava_tokens` (access_token, refresh_token, expires_at), Client Secret som server-secret
- Server functions: `stravaLogin` (returnerar auth-URL), `stravaCallback` (byter code→token, sparar), `getRuns` (refreshar vid behov, hämtar aktiviteter)
- Allt UI-text på svenska

## Steg

1. Sätt upp Lovable Cloud + tabell för tokens, lägg till Strava Client Secret
2. Bygg OAuth login + callback (server functions)
3. Bygg `getRuns` server function med auto-refresh
4. Bygg dashboard-route med statistikkort, grafer, tabell, nedräkning
5. Styla med ljust tema + Strava-orange accent
