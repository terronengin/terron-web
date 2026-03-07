import { NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabaseClient";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const west = Number(searchParams.get("west"));
  const south = Number(searchParams.get("south"));
  const east = Number(searchParams.get("east"));
  const north = Number(searchParams.get("north"));

  if (![west, south, east, north].every((n) => Number.isFinite(n))) {
    return NextResponse.json({ items: [] });
  }

  const { data, error } = await supabase
    .from("properties")
    .select("id,title,city,district,latitude,longitude,risk_score,development_score,total_area_m2")
    .gte("latitude", south)
    .lte("latitude", north)
    .gte("longitude", west)
    .lte("longitude", east)
    .limit(500);

  if (error) {
    return NextResponse.json({ items: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}