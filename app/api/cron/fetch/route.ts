import { supabase } from "../../../../lib/supabase"

type Outcome = { name: string; point?: number; price?: number }
type Market = { key: string; outcomes: Outcome[] }
type Book = { title?: string; key?: string; markets: Market[] }
type Game = {
  id: string
  commence_time?: string
  home_team?: string
  away_team?: string
  bookmakers: Book[]
}

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) return Response.json({ ok: false, error: "Missing ODDS_API_KEY" }, { status: 500 })

  const url =
    "https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?" +
    new URLSearchParams({
      regions: "us",
      markets: "spreads",
      oddsFormat: "american",
      dateFormat: "iso",
      apiKey
    }).toString()

  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return Response.json({ ok: false, status: res.status, body: await res.text() }, { status: 500 })

  const data = (await res.json()) as Game[]
  const rows: any[] = []

  for (const game of data) {
    for (const book of game.bookmakers ?? []) {
      const market = (book.markets ?? []).find((m) => m.key === "spreads")
      if (!market) continue

      for (const outcome of market.outcomes ?? []) {
        rows.push({
          game_id: game.id,
          commence_time: game.commence_time ?? null,
          home_team: game.home_team ?? null,
          away_team: game.away_team ?? null,
          bookmaker: book.title ?? book.key ?? "unknown",
          bookmaker_key: (book.key ?? null) as string | null,
          team: outcome.name,
          spread: outcome.point ?? null,
          price: outcome.price ?? null
        })
      }
    }
  }

  const ins = await supabase.from("odds_snapshots").insert(rows)
  if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 })

  return Response.json({ ok: true, inserted: rows.length })
}
  await supabase.from("odds_snapshots").insert(rows)

  return Response.json({
    inserted: rows.length
  })
}
