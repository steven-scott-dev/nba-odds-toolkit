import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

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
interface BestLine { spread: number; price: number; book: string; }
interface GameResult {
  game_id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  best_home: BestLine | null;
  best_away: BestLine | null;
}

function isBetterSpread(candidate: Snapshot, current: BestLine): boolean {
  if (candidate.spread > current.spread) return true;
  if (candidate.spread < current.spread) return false;
  return candidate.price > current.price;
}

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("odds_snapshots")
    .select("game_id,captured_at,commence_time,home_team,away_team,bookmaker,bookmaker_key,team,spread,price")
    .gte("captured_at", since)
    .order("game_id", { ascending: true })
    .order("bookmaker_key", { ascending: true })
    .order("team", { ascending: true })
    .order("captured_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json([]);
  }
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
  const result = Array.from(gameMap.values()).sort(
    (a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime()
  );
  return NextResponse.json(result);
}
