import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVEDATA_API_KEY;

async function getPrice(symbol: string) {
  if (!API_KEY) {
    console.error("TWELVEDATA_API_KEY missing");
    return null;
  }

  try {
    const res = await fetch(
      `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`,
      { cache: "no-store" }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error(`TwelveData HTTP error for ${symbol}:`, data);
      return null;
    }

    if (!data || data.price == null) {
      console.error(`TwelveData invalid response for ${symbol}:`, data);
      return null;
    }

    const numeric = Number(data.price);
    if (Number.isNaN(numeric)) {
      console.error(`TwelveData non-numeric price for ${symbol}:`, data);
      return null;
    }

    return numeric;
  } catch (error) {
    console.error(`getPrice failed for ${symbol}:`, error);
    return null;
  }
}

async function getCrypto() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
      { cache: "no-store" }
    );

    const data = await res.json();

    return {
      BTC: typeof data?.bitcoin?.usd === "number" ? data.bitcoin.usd : null,
      ETH: typeof data?.ethereum?.usd === "number" ? data.ethereum.usd : null,
    };
  } catch (error) {
    console.error("getCrypto failed:", error);
    return {
      BTC: null,
      ETH: null,
    };
  }
}

export async function GET() {
  try {
    const [usdtry, eurtry, gbptry, crypto] = await Promise.all([
      getPrice("USD/TRY"),
      getPrice("EUR/TRY"),
      getPrice("GBP/TRY"),
      getCrypto(),
    ]);

    console.log("MARKET DEBUG", {
      usdtry,
      eurtry,
      gbptry,
      BTC: crypto.BTC,
      ETH: crypto.ETH,
      hasApiKey: !!API_KEY,
    });

    return NextResponse.json({
      USDTRY: usdtry,
      EURTRY: eurtry,
      GBPTRY: gbptry,
      BTC: crypto.BTC,
      ETH: crypto.ETH,
    });
  } catch (error) {
    console.error("market fetch error:", error);

    return NextResponse.json(
      { error: "market fetch error" },
      { status: 500 }
    );
  }
}