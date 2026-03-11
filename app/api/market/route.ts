import { NextResponse } from "next/server";

type MarketResponse = {
  usdtry: number | null;
  eurtry: number | null;
  gbptry: number | null;
  BTC: number | null;
  ETH: number | null;
  hasApiKey: boolean;
  source: {
    fx: string;
    crypto: string;
  };
};

let marketCache: {
  data: MarketResponse | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_MS = 60 * 1000;

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function getDirectFx(base: "USD" | "EUR" | "GBP") {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`, {
      cache: "no-store",
    });

    const data = await res.json();

    if (!res.ok || data?.result !== "success" || !data?.rates?.TRY) {
      console.error(`${base}/TRY invalid response:`, data);
      return null;
    }

    return toNum(data.rates.TRY);
  } catch (error) {
    console.error(`${base}/TRY fetch failed:`, error);
    return null;
  }
}

async function getFxRates() {
  const [usdtry, eurtry, gbptry] = await Promise.all([
    getDirectFx("USD"),
    getDirectFx("EUR"),
    getDirectFx("GBP"),
  ]);

  return { usdtry, eurtry, gbptry };
}

async function getCrypto() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
      { cache: "no-store" }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("CoinGecko invalid response:", data);
      return {
        BTC: null,
        ETH: null,
      };
    }

    return {
      BTC: toNum(data?.bitcoin?.usd),
      ETH: toNum(data?.ethereum?.usd),
    };
  } catch (error) {
    console.error("CoinGecko fetch failed:", error);
    return {
      BTC: null,
      ETH: null,
    };
  }
}

export async function GET() {
  const now = Date.now();

  if (marketCache.data && now - marketCache.timestamp < CACHE_MS) {
    return NextResponse.json(marketCache.data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  }

  const [fx, crypto] = await Promise.all([getFxRates(), getCrypto()]);

  const response: MarketResponse = {
    usdtry: fx.usdtry,
    eurtry: fx.eurtry,
    gbptry: fx.gbptry,
    BTC: crypto.BTC,
    ETH: crypto.ETH,
    hasApiKey: Boolean(process.env.TWELVEDATA_API_KEY),
    source: {
      fx: "open.er-api-direct",
      crypto: "coingecko",
    },
  };

  console.log("MARKET DEBUG", response);

  marketCache = {
    data: response,
    timestamp: now,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}