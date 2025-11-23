import axios from 'axios';

export interface PriceMovement {
  symbol: string;
  name: string;
  price: number;
  change24h: number; // Percentage change
  change24hAbs: number; // Absolute change
  marketCap?: number;
  volume24h?: number;
}

export interface PriceUpdate {
  topWinners: PriceMovement[];
  topLosers: PriceMovement[];
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  timestamp: Date;
}

/**
 * Fetch top gainers and losers from CoinGecko API
 */
export async function getPriceMovements(): Promise<PriceUpdate> {
  try {
    // CoinGecko free API - no key required for basic endpoints
    // Get top 100 coins by market cap
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/coins/markets',
      {
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: 100,
          page: 1,
          sparkline: false,
          price_change_percentage: '24h'
        },
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );

    const coins = response.data || [];
    
    // Filter and sort by 24h change
    const movements: PriceMovement[] = coins
      .filter((coin: any) => coin.price_change_percentage_24h !== null)
      .map((coin: any) => ({
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price || 0,
        change24h: coin.price_change_percentage_24h || 0,
        change24hAbs: Math.abs(coin.price_change_percentage_24h || 0),
        marketCap: coin.market_cap,
        volume24h: coin.total_volume
      }));

    // Get top winners (highest positive change)
    const winners = movements
      .filter(m => m.change24h > 0)
      .sort((a, b) => b.change24h - a.change24h)
      .slice(0, 5);

    // Get top losers (most negative change)
    const losers = movements
      .filter(m => m.change24h < 0)
      .sort((a, b) => a.change24h - b.change24h)
      .slice(0, 5);

    // Determine market sentiment
    const avgChange = movements.reduce((sum, m) => sum + m.change24h, 0) / movements.length;
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (avgChange > 2) sentiment = 'bullish';
    else if (avgChange < -2) sentiment = 'bearish';

    return {
      topWinners: winners,
      topLosers: losers,
      marketSentiment: sentiment,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error fetching price data from CoinGecko:', error);
    // Return mock data as fallback
    return getMockPriceData();
  }
}

/**
 * Get mock price data for fallback/testing
 */
function getMockPriceData(): PriceUpdate {
  return {
    topWinners: [
      { symbol: 'BTC', name: 'Bitcoin', price: 45230, change24h: 5.2, change24hAbs: 5.2 },
      { symbol: 'ETH', name: 'Ethereum', price: 2850, change24h: 4.8, change24hAbs: 4.8 },
      { symbol: 'SOL', name: 'Solana', price: 98, change24h: 7.3, change24hAbs: 7.3 }
    ],
    topLosers: [
      { symbol: 'ADA', name: 'Cardano', price: 0.52, change24h: -3.1, change24hAbs: 3.1 },
      { symbol: 'DOT', name: 'Polkadot', price: 7.2, change24h: -2.8, change24hAbs: 2.8 },
      { symbol: 'MATIC', name: 'Polygon', price: 0.85, change24h: -2.5, change24hAbs: 2.5 }
    ],
    marketSentiment: 'bullish',
    timestamp: new Date()
  };
}

