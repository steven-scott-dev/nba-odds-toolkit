import { supabase } from "../lib/supabase";

interface BestLine {
  spread: number;
  price: number;
  book: string;
}
interface GameResult {
  game_id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  best_home: BestLine | null;
  best_away: BestLine | null;
}
interface Snapshot {
  game_id: string;
  captured_at: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker: string;
  bookmaker_key: string;
  team: string;
  spread: number;
  price: number;
}

function isBetterSpread(candidate: Snapshot, current: BestLine): boolean {
  if (candidate.spread > current.spread) return true;
  if (candidate.spread < current.spread) return false;
  return candidate.price > current.price;
}

async function getGames(): Promise<GameResult[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("game_id,captured_at,commence_time,home_team,away_team,bookmaker,bookmaker_key,team,spread,price")
    .gte("captured_at", since)
    .order("game_id", { ascending: true })
    .order("bookmaker_key", { ascending: true })
    .order("team", { ascending: true })
    .order("captured_at", { ascending: false });
  if (error || !data) return [];
  const seen = new Set<string>();
  const latest: Snapshot[] = [];
  for (const row of data as Snapshot[]) {
    const key = `${row.game_id}|${row.bookmaker_key}|${row.team}`;
    if (!seen.has(key)) { seen.add(key); latest.push(row); }
  }
  const gameMap = new Map<string, GameResult>();
  for (const row of latest) {
    if (!gameMap.has(row.game_id)) {
      gameMap.set(row.game_id, {
        game_id: row.game_id,
        commence_time: row.commence_time,
        home_team: row.home_team,
        away_team: row.away_team,
        best_home: null,
        best_away: null,
      });
    }
    const game = gameMap.get(row.game_id)!;
    const isHome = row.team === row.home_team;
    const currentBest = isHome ? game.best_home : game.best_away;
    const candidate: BestLine = { spread: row.spread, price: row.price, book: row.bookmaker };
    if (!currentBest || isBetterSpread(row, currentBest)) {
      if (isHome) game.best_home = candidate;
      else game.best_away = candidate;
    }
  }
  return Array.from(gameMap.values()).sort(
    (a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
  );
}

function fmt(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function LineCell({ line, colorClass }: { line: BestLine | null; colorClass: string }) {
  if (!line) return (
    <div className={`cell ${colorClass}`}>
      <span className="cell-lbl">—</span>
      <span className="cell-val" style={{ fontSize: 13, color: "var(--muted)" }}>N/A</span>
    </div>
  );
  return (
    <div className={`cell ${colorClass}`}>
      <span className="cell-lbl">spread / price</span>
      <span className="cell-val">{fmt(line.spread)}</span>
      <span className="cell-sub">{fmt(line.price)}</span>
      <span className="cell-book">{line.book}</span>
    </div>
  );
}

export const revalidate = 60;

export default async function HomePage() {
  const games = await getGames();
  const updatedAt = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short",
  });
  return (
    <div className="page">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-dot" />
            NBA BEST LINES
          </div>
          <div className="header-meta">Updated {updatedAt}</div>
        </div>
        <div className="legend">
          <div className="legend-item"><div className="dot dot-green" /> Best Spread</div>
          <div className="legend-item"><div className="dot dot-gold" /> Best Price</div>
        </div>
      </header>
      <main className="main">
        {games.length === 0 ? (
          <div className="empty">
            <p className="empty-title">NO GAMES AVAILABLE</p>
            <p className="empty-hint">
              Seed data by visiting <code>/api/cron/fetch</code> in your browser,
              then reload this page.
            </p>
          </div>
        ) : (
          <div className="grid">
            {games.map((game) => {
              const isLive = new Date(game.commence_time) <= new Date();
              return (
                <div key={game.game_id} className="card">
                  <div className="card-header">
                    <div className="matchup">
                      <span className="away-team">{game.away_team}</span>
                      <span className="at-sign">@</span>
                      <span className="home-team">{game.home_team}</span>
                    </div>
                    <div className="card-time">
                      {isLive && <span style={{ color: "var(--red)", marginRight: 6 }}>● LIVE</span>}
                      {fmtTime(game.commence_time)}
                    </div>
                  </div>
                  <div className="col-headers">
                    <div className="col-team" />
                    <div className="col-labels">
                      <div className="col-label col-label-spread">◆ Best Spread</div>
                      <div className="col-label col-label-price">◆ Best Price</div>
                    </div>
                  </div>
                  <div className="team-rows">
                    <div className="team-row">
                      <div className="team-name away">{game.away_team}</div>
                      <div className="cells">
                        <LineCell line={game.best_away} colorClass="cell-spread-col" />
                        <div className="cell cell-price-col">
                          <span className="cell-lbl">price</span>
                          <span className="cell-val">{game.best_away ? fmt(game.best_away.price) : "N/A"}</span>
                          <span className="cell-book">{game.best_away?.book ?? ""}</span>
                        </div>
                      </div>
                    </div>
                    <div className="team-row">
                      <div className="team-name home">{game.home_team}</div>
                      <div className="cells">
                        <LineCell line={game.best_home} colorClass="cell-spread-col" />
                        <div className="cell cell-price-col">
                          <span className="cell-lbl">price</span>
                          <span className="cell-val">{game.best_home ? fmt(game.best_home.price) : "N/A"}</span>
                          <span className="cell-book">{game.best_home?.book ?? ""}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <footer className="footer">
        Powered by The Odds API · {games.length} game{games.length !== 1 ? "s" : ""} tracked
      </footer>
    </div>
  );
}
