type BestLine = {
  game_id: string
  commence_time: string | null
  home_team: string | null
  away_team: string | null
  best_home: { spread: number | null; price: number | null; book: string | null }
  best_away: { spread: number | null; price: number | null; book: string | null }
}

async function getBestLines(): Promise<BestLine[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL
  if (!base) return []

  const res = await fetch(`${base}/api/best-lines`, { cache: "no-store" })
  if (!res.ok) return []

  return res.json()
}

export default async function Page() {
  const games = await getBestLines()

  return (
    <main>
      <h1>NBA Line Shopping</h1>

      {games.map(g => (
        <div key={g.game_id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 10 }}>
          <b>{g.away_team} @ {g.home_team}</b>

          <div>
            {g.away_team}: {g.best_away.spread} ({g.best_away.price}) — {g.best_away.book}
          </div>

          <div>
            {g.home_team}: {g.best_home.spread} ({g.best_home.price}) — {g.best_home.book}
          </div>
        </div>
      ))}
    </main>
  )
}
