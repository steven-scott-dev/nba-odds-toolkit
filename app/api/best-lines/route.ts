import { supabase } from "../../../lib/supabase"

type Row = {
  game_id: string
  home_team: string | null
  away_team: string | null
  team: string
  spread: number | null
  price: number | null
  bookmaker: string | null
}

type Best = { spread: number | null; price: number | null; book: string | null }
type Game = {
  game_id: string
  home_team: string | null
  away_team: string | null
  best_home: Best | null
  best_away: Best | null
}

export async function GET() {
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("game_id,home_team,away_team,team,spread,price,bookmaker")
    .order("captured_at", { ascending: false })
    .limit(2000)

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })

  const rows = (data ?? []) as Row[]
  const games: Record<string, Game> = {}

  for (const row of rows) {
    const id = row.game_id

    if (!games[id]) {
      games[id] = {
        game_id: id,
        home_team: row.home_team,
        away_team: row.away_team,
        best_home: null,
        best_away: null
      }
    }

    const g = games[id]

    if (row.team === row.home_team) {
      if (!g.best_home || isBetter(row.spread, g.best_home.spread, row.price, g.best_home.price)) {
        g.best_home = { spread: row.spread, price: row.price, book: row.bookmaker }
      }
    }

    if (row.team === row.away_team) {
      if (!g.best_away || isBetter(row.spread, g.best_away.spread, row.price, g.best_away.price)) {
        g.best_away = { spread: row.spread, price: row.price, book: row.bookmaker }
      }
    }
  }

  return Response.json(Object.values(games))
}

function isBetter(
  newSpread: number | null,
  oldSpread: number | null,
  newPrice: number | null,
  oldPrice: number | null
) {
  if (newSpread === null) return false
  if (oldSpread === null) return true

  const newIsDog = newSpread > 0
  const oldIsDog = oldSpread > 0

  // Prefer better spread first
  if (newIsDog && oldIsDog) {
    if (newSpread !== oldSpread) return newSpread > oldSpread
  } else if (!newIsDog && !oldIsDog) {
    if (newSpread !== oldSpread) return newSpread > oldSpread // -3 better than -4
  } else {
    // weird mixed data: pick closer to 0
    if (newSpread !== oldSpread) return Math.abs(newSpread) < Math.abs(oldSpread)
  }

  // Tie-breaker: better payout
  const np = newPrice ?? -9999
  const op = oldPrice ?? -9999
  return np > op
}
