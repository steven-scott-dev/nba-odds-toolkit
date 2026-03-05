import { supabase } from "../../../../lib/supabase"

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY

  const url =
    "https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?regions=us&markets=spreads&oddsFormat=american&apiKey=" +
    apiKey

  const res = await fetch(url)

  const data = await res.json()

  const rows = []

  for (const game of data) {
    for (const book of game.bookmakers) {
      const market = book.markets.find(m => m.key === "spreads")

      if (!market) continue

      for (const outcome of market.outcomes) {
        rows.push({
          game_id: game.id,
          commence_time: game.commence_time,
          home_team: game.home_team,
          away_team: game.away_team,
          bookmaker: book.title,
          bookmaker_key: book.key,
          team: outcome.name,
          spread: outcome.point,
          price: outcome.price
        })
      }
    }
  }

  await supabase.from("odds_snapshots").insert(rows)

  return Response.json({
    inserted: rows.length
  })
}
