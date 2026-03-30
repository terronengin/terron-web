import { buyFeeFromGrossProperty, grossAssetFromTotalPaid } from "@/lib/sim/realEstatePrice";

/** total_paid = brüt arsa + alım komisyonu → komisyon = brüt × BUY_FEE_RATE */
export function buyFeeFromTotalPaid(totalPaid: number): number {
  const g = grossAssetFromTotalPaid(totalPaid);
  return buyFeeFromGrossProperty(g);
}

export type AdminAnalyticsDailyRow = {
  date: string;
  buyFee: number;
  sellFee: number;
  buyVolume: number;
  sellVolume: number;
  volumePaid: number;
  positionOpens: number;
};

export type AdminAnalyticsPayload = {
  generatedAt: string;
  properties: {
    listingCount: number;
    totalAreaM2: number;
    listValueAtPrice: number;
    availableM2: number;
    soldM2: number;
    availableValueAtPrice: number;
    soldValueAtPrice: number;
  };
  positions: {
    openCount: number;
    uniqueInvestors: number;
    totalPaidVolume: number;
    estimatedBuyFees: number;
  };
  fees: {
    /** Defterden: alış komisyonları toplamı */
    ledgerBuyFees: number;
    /** Defterden: satış komisyonları toplamı */
    ledgerSellFees: number;
    /** Terron toplam komisyon geliri (alış + satış) */
    ledgerTotalFees: number;
    /** Alış işlem hacmi: brüt arsa tutarı (Σ gross_amount, buy_fee) */
    ledgerBuyVolume: number;
    /** Satış işlem hacmi: brüt satış (Σ gross_amount, sell_fee) */
    ledgerSellVolume: number;
    estimatedBuyFeesFromPositions: number;
    estimatedSellFeesFromSoldM2: number;
    totalEstimatedTerronTreasury: number;
  };
  wallets: {
    walletRows: number;
    totalUserBalances: number;
  };
  daily: AdminAnalyticsDailyRow[];
};
