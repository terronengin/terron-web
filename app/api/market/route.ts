import { NextResponse } from "next/server";

const API_KEY = process.env.TWELVEDATA_API_KEY;

async function getPrice(symbol: string) {
  const res = await fetch(
    `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`,
    { cache: "no-store" }
  );

  const data = await res.json();
  return data.price;
}

async function getCrypto() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd",
    { cache: "no-store" }
  );

  const data = await res.json();

  return {
    BTC: data.bitcoin.usd,
    ETH: data.ethereum.usd,
  };
}

export async function GET() {
  try {
    const [usdtry, eurtry, gbptry, crypto] = await Promise.all([
      getPrice("USD/TRY"),
      getPrice("EUR/TRY"),
      getPrice("GBP/TRY"),
      getCrypto(),
    ]);

    return NextResponse.json({
      USDTRY: usdtry,
      EURTRY: eurtry,
      GBPTRY: gbptry,
      BTC: crypto.BTC,
      ETH: crypto.ETH,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "market fetch error" },
      { status: 500 }
    );
  }
}