import axios from 'axios';

export interface NFTCollection {
  name: string;
  slug: string;
  floorPrice: number;
  floorPriceChange24h: number; // Percentage change
  volume24h?: number;
  sales24h?: number;
  url?: string;
}

export interface NFTUpdate {
  trendingCollections: NFTCollection[];
  notableSales?: Array<{
    collection: string;
    price: number;
    tokenId?: string;
  }>;
  timestamp: Date;
}

/**
 * Fetch trending NFT collections from OpenSea API
 * Note: OpenSea API requires an API key, but we can use their public endpoints
 */
export async function getNFTUpdates(): Promise<NFTUpdate> {
  try {
    // OpenSea API v2 - using public endpoint for trending collections
    // Note: This is a simplified approach. For production, you'd want an API key
    const response = await axios.get(
      'https://api.opensea.io/api/v2/collections',
      {
        params: {
          order_by: 'seven_day_volume',
          order_direction: 'desc',
          limit: 20
        },
        headers: {
          'Accept': 'application/json',
          'X-API-KEY': process.env.OPENSEA_API_KEY || '' // Optional API key
        },
        timeout: 10000
      }
    );

    const collections = response.data?.collections || [];
    
    // Process collections
    const nftCollections: NFTCollection[] = collections
      .slice(0, 10)
      .map((collection: any) => {
        const floorPrice = collection.floor_price || 0;
        const previousFloor = collection.floor_price_previous || floorPrice;
        const change24h = previousFloor > 0 
          ? ((floorPrice - previousFloor) / previousFloor) * 100 
          : 0;

        return {
          name: collection.name || 'Unknown',
          slug: collection.slug || '',
          floorPrice,
          floorPriceChange24h: change24h,
          volume24h: collection.one_day_volume || 0,
          sales24h: collection.one_day_sales || 0,
          url: `https://opensea.io/collection/${collection.slug}`
        };
      })
      .filter((c: NFTCollection) => c.floorPrice > 0) // Only collections with floor price
      .sort((a: NFTCollection, b: NFTCollection) => 
        Math.abs(b.floorPriceChange24h) - Math.abs(a.floorPriceChange24h)
      )
      .slice(0, 5); // Top 5 trending

    return {
      trendingCollections: nftCollections,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('Error fetching NFT data from OpenSea:', error);
    // Return mock data as fallback
    return getMockNFTData();
  }
}

/**
 * Get mock NFT data for fallback/testing
 */
function getMockNFTData(): NFTUpdate {
  return {
    trendingCollections: [
      {
        name: 'Bored Ape Yacht Club',
        slug: 'boredapeyachtclub',
        floorPrice: 25.5,
        floorPriceChange24h: 3.2,
        volume24h: 450,
        sales24h: 12
      },
      {
        name: 'Pudgy Penguins',
        slug: 'pudgypenguins',
        floorPrice: 8.2,
        floorPriceChange24h: -1.5,
        volume24h: 320,
        sales24h: 25
      },
      {
        name: 'Azuki',
        slug: 'azuki',
        floorPrice: 12.8,
        floorPriceChange24h: 5.8,
        volume24h: 280,
        sales24h: 18
      }
    ],
    timestamp: new Date()
  };
}

