import { supabase } from "../../../lib/supabase"

export async function GET() {
  const { data } = await supabase
    .from("odds_snapshots")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(2000)

  const games = {}

  for (const row of data || []) {
    if (!games[row.game_id]) {
      games[row.game_id] = {
        home_team: row.home_team,
        away_team: row.away_team,
        best_home: null,
        best_away: null
      }
    }

    if (row.team === row.home_team) {
      if (!games[row.game_id].best_home || row.spread < games[row.game_id].best_home.spread) {
        games[row.game_id].best_home = row
      }
    }

    if (row.team === row.away_team) {
      if (!games[row.game_id].best_away || row.spread > games[row.game_id].best_away.spread) {
        games[row.game_id].best_away = row
      }
    }
  }

  return Response.json(Object.values(games))
}
