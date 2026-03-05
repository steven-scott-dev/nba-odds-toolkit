import { supabase } from "../../../lib/supabase"

type SnapshotRow = {
  game_id: string
  home_team: string | null
  away_team: string | null
  team: string
  spread: number | null
  price: number | null
  bookmaker: string | null
}

type Best = {
  spread: number | null
  price: number | null
  book: string | null
}

type GameBest = {
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

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as SnapshotRow[]

  const games: Record<string, GameBest> = {}

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
      // For favorites (negative spreads), closer to 0 is better. For dogs (positive), bigger is better.
      if (!g.best_home || betterSpread(row.spread, g.best_home.spread) || tieBetterPrice(row, g.best_home)) {
        g.best_home = { spread: row
