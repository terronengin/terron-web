"use client";

import React, { useMemo } from "react";
import type { Candle } from "@/lib/candlestick";
import { computeRSI, computeSMA } from "@/lib/candlestick";

const GREEN = "#86efac";
const RED = "#fca5a5";
const SMA_COLOR = "#8B5CF6";
const RSI_COLOR = "#D97706";

function formatAxisPrice(v: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(Math.round(v));
}

export function CandlestickChart({ candles, height = 220 }: { candles: Candle[]; height?: number }) {
  const sma = useMemo(() => computeSMA(candles, Math.min(20, Math.max(2, Math.floor(candles.length / 3)))), [candles]);
  const rsi = useMemo(() => computeRSI(candles, 14), [candles]);

  const w = 320;
  const mainH = height;
  const rsiH = 56;
  const gap = 10;
  const padTop = 8;
  const padBottom = 4;
  const labelGutter = 44;
  const plotW = w - labelGutter;

  const { minP, maxP } = useMemo(() => {
    let mn = Infinity;
    let mx = -Infinity;
    for (const c of candles) {
      mn = Math.min(mn, c.low);
      mx = Math.max(mx, c.high);
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx) {
      mn = (mn || 100) * 0.98;
      mx = (mx || 100) * 1.02;
    }
    const pad = (mx - mn) * 0.06;
    return { minP: mn - pad, maxP: mx + pad };
  }, [candles]);

  const n = candles.length;
  const slot = n > 0 ? plotW / n : plotW;
  const bodyW = Math.max(1.2, Math.min(6, slot * 0.6));

  function yFor(price: number): number {
    const usable = mainH - padTop - padBottom;
    return padTop + usable * (1 - (price - minP) / (maxP - minP || 1));
  }

  function xFor(i: number): number {
    return i * slot + slot / 2;
  }

  let smaPath = "";
  {
    let started = false;
    sma.forEach((v, i) => {
      if (v == null) return;
      const x = xFor(i);
      const y = yFor(v);
      smaPath += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
      started = true;
    });
  }

  let rsiPath = "";
  {
    let started = false;
    rsi.forEach((v, i) => {
      if (v == null) return;
      const x = xFor(i);
      const y = padTop + (rsiH - padTop) * (1 - v / 100);
      rsiPath += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
      started = true;
    });
  }

  const priceLabelSteps = 4;
  const priceLabels: { y: number; v: number }[] = [];
  for (let i = 0; i <= priceLabelSteps; i++) {
    const v = minP + ((maxP - minP) * (priceLabelSteps - i)) / priceLabelSteps;
    priceLabels.push({ y: yFor(v), v });
  }

  if (n === 0) {
    return (
      <div style={{ padding: 20, textAlign: "center", fontSize: 12, opacity: 0.6 }}>Grafik verisi yok.</div>
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${mainH + gap + rsiH}`} width="100%" height={mainH + gap + rsiH}>
      {/* Fiyat izgarası */}
      {priceLabels.map((pl, i) => (
        <g key={i}>
          <line x1={0} y1={pl.y} x2={plotW} y2={pl.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <text x={plotW + 6} y={pl.y + 3} fontSize={8.5} fill="rgba(255,255,255,0.45)">
            {formatAxisPrice(pl.v)}
          </text>
        </g>
      ))}

      {/* Mumlar */}
      {candles.map((c, i) => {
        const up = c.close >= c.open;
        const color = up ? GREEN : RED;
        const x = xFor(i);
        const yHigh = yFor(c.high);
        const yLow = yFor(c.low);
        const yOpen = yFor(c.open);
        const yClose = yFor(c.close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g key={c.day}>
            <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} />
          </g>
        );
      })}

      {/* SMA çizgisi */}
      <path d={smaPath} fill="none" stroke={SMA_COLOR} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />

      {/* RSI paneli */}
      <g transform={`translate(0, ${mainH + gap})`}>
        <text x={0} y={9} fontSize={8.5} fontWeight={800} fill="rgba(255,255,255,0.5)">
          RSI (14)
        </text>
        <line
          x1={0}
          y1={padTop + (rsiH - padTop) * 0.3}
          x2={plotW}
          y2={padTop + (rsiH - padTop) * 0.3}
          stroke="rgba(255,255,255,0.08)"
          strokeDasharray="2,2"
        />
        <line
          x1={0}
          y1={padTop + (rsiH - padTop) * 0.7}
          x2={plotW}
          y2={padTop + (rsiH - padTop) * 0.7}
          stroke="rgba(255,255,255,0.08)"
          strokeDasharray="2,2"
        />
        <path d={rsiPath} fill="none" stroke={RSI_COLOR} strokeWidth={1.3} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
