import { supabase } from "../lib/supabase";

interface BestLine {
  spread: number;
  price: number;
  book: string;
}

interface LineInfo {
  openSpread: number;
  openPrice: number;
  currentSpread: number;
  currentPrice: number;
  movement: number;
  isSteam: boolean;
  isSharp: boolean;
}

interface GameResult {
  game_id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  best_home: BestLine | null;
  best_away: BestLine | null;
  home_line_info: LineInfo | null;
  away_line_info: LineInfo | null;
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

function getOpeningLine(rows: Snapshot[], gameId: string, team: string): Snapshot | null {
  return rows
    .filter((r) => r.game_id === gameId && r.team === team)
    .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime())[0] ?? null;
}

function getCurrentLine(rows: Snapshot[], gameId: string, team: string): Snapshot | null {
  return rows
    .filter((r) => r.game_id === gameId && r.team === team)
    .sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime())[0] ?? null;
}

function calculateLineMovement(opening: number, current: number): number {
  return Math.round((current - opening) * 10) / 10;
}

function isSteamMove(rows: Snapshot[], gameId: string, team: string): boolean {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const recent = rows
    .filter((r) => r.game_id === gameId && r.team === team && r.captured_at >= twoHoursAgo)
    .sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());

  if (recent.length < 2) return false;

  const first = recent[0].spread;
  const last = recent[recent.length - 1].spread;

  return Math.abs(last - first) >= 2;
}

function isSharpAction(opening: Snapshot | null, current: Snapshot | null): boolean {
  if (!opening || !current) return false;

  const spreadMove = Math.abs(current.spread - opening.spread);
  const priceDiff = Math.abs(current.price - opening.price);

  return spreadMove >= 1.5 && priceDiff <= 5;
}

function isBetterSpread(candidate: Snapshot, current: BestLine): boolean {
  if (candidate.spread > current.spread) return true;
  if (candidate.spread < current.spread) return false;
  return candidate.price > current.price;
}

async function getGames(): Promise<GameResult[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

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
    if (!seen.has(key)) {
      seen.add(key);
      latest.push(row);
    }
  }

  const gameMap = new Map<string, GameResult>();

  for (const row of latest) {
    if (!gameMap.has(row.game_id)) {

      const allForGame = (data as Snapshot[]).filter((r) => r.game_id === row.game_id);

      const homeOpen = getOpeningLine(allForGame, row.game_id, row.home_team);
      const homeCurrent = getCurrentLine(allForGame, row.game_id, row.home_team);

      const awayOpen = getOpeningLine(allForGame, row.game_id, row.away_team);
      const awayCurrent = getCurrentLine(allForGame, row.game_id, row.away_team);

      const homeLineInfo: LineInfo | null = homeOpen && homeCurrent ? {
        openSpread: homeOpen.spread,
        openPrice: homeOpen.price,
        currentSpread: homeCurrent.spread,
        currentPrice: homeCurrent.price,
        movement: calculateLineMovement(homeOpen.spread, homeCurrent.spread),
        isSteam: isSteamMove(allForGame, row.game_id, row.home_team),
        isSharp: isSharpAction(homeOpen, homeCurrent),
      } : null;

      const awayLineInfo: LineInfo | null = awayOpen && awayCurrent ? {
        openSpread: awayOpen.spread,
        openPrice: awayOpen.price,
        currentSpread: awayCurrent.spread,
        currentPrice: awayCurrent.price,
        movement: calculateLineMovement(awayOpen.spread, awayCurrent.spread),
        isSteam: isSteamMove(allForGame, row.game_id, row.away_team),
        isSharp: isSharpAction(awayOpen, awayCurrent),
      } : null;

      gameMap.set(row.game_id, {
        game_id: row.game_id,
        commence_time: row.commence_time,
        home_team: row.home_team,
        away_team: row.away_team,
        best_home: null,
        best_away: null,
        home_line_info: homeLineInfo,
        away_line_info: awayLineInfo,
      });
    }

    const game = gameMap.get(row.game_id)!;

    const isHome = row.team === row.home_team;
    const currentBest = isHome ? game.best_home : game.best_away;

    const candidate: BestLine = {
      spread: row.spread,
      price: row.price,
      book: row.bookmaker
    };

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
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function LineCell({ line, colorClass }: { line: BestLine | null; colorClass: string }) {

  if (!line) {
    return (
      <div className={`cell ${colorClass}`}>
        <span className="cell-lbl">—</span>
        <span className="cell-val" style={{ fontSize: 13, color: "var(--muted)" }}>N/A</span>
      </div>
    );
  }

  return (
    <div className={`cell ${colorClass}`}>
      <span className="cell-lbl">spread / price</span>
      <span className="cell-val">{fmt(line.spread)}</span>
      <span className="cell-sub">{fmt(line.price)}</span>
      <span className="cell-book">{line.book}</span>
    </div>
  );
}

function LineMovement({ info }: { info: LineInfo | null }) {

  if (!info) return null;

  const move = info.movement;
  const absMov = Math.abs(move);
  const arrow = move > 0 ? "↑" : move < 0 ? "↓" : "—";

  let moveColor = "var(--dim)";

  if (absMov >= 3) moveColor = "var(--red)";
  else if (absMov >= 2) moveColor = "var(--gold)";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "5px 6px",
      borderRadius: 6,
      minWidth: 90,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid var(--border)",
    }}>

      <span style={{
        fontSize: 8,
        letterSpacing: ".1em",
        color: "var(--muted)",
        textTransform: "uppercase",
        marginBottom: 2
      }}>
        movement
      </span>

      <span style={{ fontSize: 11, color: "var(--dim)" }}>
        OPEN <strong style={{ color: "var(--text)" }}>{fmt(info.openSpread)}</strong>
      </span>

      <span style={{ fontSize: 11, color: "var(--dim)" }}>
        NOW <strong style={{ color: "var(--text)" }}>{fmt(info.currentSpread)}</strong>
      </span>

      <span style={{
        fontSize: 15,
        fontWeight: 600,
        color: moveColor,
        lineHeight: 1.2
      }}>
        {arrow} {move !== 0 ? fmt(move) : "—"}
      </span>

      {info.isSteam && (
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: ".1em",
          color: "#fff",
          background: "var(--red)",
          padding: "1px 5px",
          borderRadius: 3,
          marginTop: 3
        }}>
          STEAM
        </span>
      )}

      {info.isSharp && !info.isSteam && (
        <span style={{
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: ".1em",
          color: "#000",
          background: "var(--gold)",
          padding: "1px 5px",
          borderRadius: 3,
          marginTop: 3
        }}>
          SHARP
        </span>
      )}
    </div>
  );
}

export const revalidate = 60;

export default async function HomePage() {

  const games = await getGames();

  const updatedAt = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });

  return (
    <div className="page">

      <header className="header">

        <div className="header-inner">
          <div className="brand">
            <div className="brand-dot" />
            NBA BEST LINES
          </div>

          <div className="header-meta">
            Updated {updatedAt}
          </div>
        </div>

        <div className="legend">
          <div className="legend-item">
            <div className="dot dot-green" /> Best Spread
          </div>
          <div className="legend-item">
            <div className="dot dot-gold" /> Best Price
          </div>
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
                      {isLive && (
                        <span style={{ color: "var(--red)", marginRight: 6 }}>
                          ● LIVE
                        </span>
                      )}
                      {fmtTime(game.commence_time)}
                    </div>

                  </div>

                  <div className="col-headers">
                    <div className="col-team" />
                    <div className="col-labels">
                      <div className="col-label col-label-spread">◆ Best Spread</div>
                      <div className="col-label col-label-price">◆ Best Price</div>
                      <div className="col-label" style={{ color: "var(--dim)", width: 90 }}>
                        ◆ Movement
                      </div>
                    </div>
                  </div>

                  <div className="team-rows">

                    <div className="team-row">
                      <div className="team-name away">{game.away_team}</div>

                      <div className="cells">

                        <LineCell
                          line={game.best_away}
                          colorClass="cell-spread-col"
                        />

                        <div className="cell cell-price-col">
                          <span className="cell-lbl">price</span>
                          <span className="cell-val">
                            {game.best_away ? fmt(game.best_away.price) : "N/A"}
                          </span>
                          <span className="cell-book">
                            {game.best_away?.book ?? ""}
                          </span>
                        </div>

                        <LineMovement info={game.away_line_info} />

                      </div>
                    </div>

                    <div className="team-row">
                      <div className="team-name home">{game.home_team}</div>

                      <div className="cells">

                        <LineCell
                          line={game.best_home}
                          colorClass="cell-spread-col"
                        />

                        <div className="cell cell-price-col">
                          <span className="cell-lbl">price</span>
                          <span className="cell-val">
                            {game.best_home ? fmt(game.best_home.price) : "N/A"}
                          </span>
                          <span className="cell-book">
                            {game.best_home?.book ?? ""}
                          </span>
                        </div>

                        <LineMovement info={game.home_line_info} />

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
