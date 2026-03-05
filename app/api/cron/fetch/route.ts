import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

const ODDS_API_KEY = process.env.ODDS_API_KEY;

interface Outcome { name: string; price: number; point?: number; }
interface Market { key: string; outcomes: Outcome[]; }
interface Bookmaker { key: string; title: string; markets: Market[]; }
interface Game {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

export async function GET() {
  if (!ODDS_API_KEY) {
    return NextResponse.json({ ok: false, error: "Missing ODDS_API_KEY" }, { status: 500 });
  }
  let games: Game[];
  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?regions=us&markets=spreads&oddsFormat=american&dateFormat=iso&apiKey=${ODDS_API_KEY}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Odds API ${res.status}`, detail: text }, { status: 502 });
    }
    games = await res.json();
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
  const captured_at = new Date().toISOString();
  const rows: object[] = [];
  for (const game of games) {
    for (const book of game.bookmakers) {
      const market = book.markets.find((m) => m.key === "spreads");
      if (!market) continue;
      for (const outcome of market.outcomes) {
        rows.push({
          game_id: game.id,
          captured_at,
          commence_time: game.commence_time,
          home_team: game.home_team,
          away_team: game.away_team,
          bookmaker: book.title,
          bookmaker_key: book.key,
          team: outcome.name,
          spread: outcome.point ?? 0,
          price: outcome.price,
        });
      }
    }
  }
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }
  const { error } = await supabase.from("odds_snapshots").insert(rows);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, inserted: rows.length });
}

  for (const game of data ?? []) {
    for (const book of game.bookmakers ?? []) {
      const spreads = (book.markets ?? []).find((m) => m.key === "spreads")
      if (!spreads) continue

      for (const o of spreads.outcomes ?? []) {
        rows.push({
          game_id: game.id,
          commence_time: game.commence_time ?? null,
          home_team: game.home_team ?? null,
          away_team: game.away_team ?? null,
          bookmaker: book.title ?? book.key ?? "unknown",
          bookmaker_key: book.key ?? null,
          team: o.name,
          spread: o.point ?? null,
          price: o.price ?? null
        })
      }
    }
  }

  if (rows.length === 0) {
    return Response.json({ ok: true, inserted: 0, note: "No rows parsed" })
  }

  const ins = await supabase.from("odds_snapshots").insert(rows)
  if (ins.error) {
    return Response.json({ ok: false, error: ins.error.message }, { status: 500 })
  }

  return Response.json({ ok: true, inserted: rows.length })
}
