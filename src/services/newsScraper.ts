import axios from 'axios';
import * as cheerio from 'cheerio';

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  timestamp: Date;
  summary?: string;
}

export async function scrapeCryptoNews(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  try {
    // Scrape from CoinDesk
    const coinDeskArticles = await scrapeCoinDesk(fourHoursAgo);
    articles.push(...coinDeskArticles);

    // Scrape from CoinTelegraph
    const coinTelegraphArticles = await scrapeCoinTelegraph(fourHoursAgo);
    articles.push(...coinTelegraphArticles);

    // Scrape from CryptoSlate
    const cryptoSlateArticles = await scrapeCryptoSlate(fourHoursAgo);
    articles.push(...cryptoSlateArticles);

    // Filter articles from last 4 hours
    const recentArticles = articles.filter(article => 
      article.timestamp >= fourHoursAgo
    );

    return recentArticles;
  } catch (error) {
    console.error('Error scraping crypto news:', error);
    // Return mock data if scraping fails
    return getMockNewsArticles();
  }
}

async function scrapeCoinDesk(cutoffDate: Date): Promise<NewsArticle[]> {
  try {
    const response = await axios.get('https://www.coindesk.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles: NewsArticle[] = [];

    $('article, .article-card').each((i, elem) => {
      const title = $(elem).find('h2, h3, .headline').first().text().trim();
      const link = $(elem).find('a').first().attr('href');
      const url = link?.startsWith('http') ? link : `https://www.coindesk.com${link}`;

      if (title && url) {
        articles.push({
          title,
          url,
          source: 'CoinDesk',
          timestamp: new Date()
        });
      }
    });

    return articles.slice(0, 10);
  } catch (error) {
    console.error('Error scraping CoinDesk:', error);
    return [];
  }
}

async function scrapeCoinTelegraph(cutoffDate: Date): Promise<NewsArticle[]> {
  try {
    const response = await axios.get('https://cointelegraph.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles: NewsArticle[] = [];

    $('article, .post-card').each((i, elem) => {
      const title = $(elem).find('h2, h3, .post-card__title').first().text().trim();
      const link = $(elem).find('a').first().attr('href');
      const url = link?.startsWith('http') ? link : `https://cointelegraph.com${link}`;

      if (title && url) {
        articles.push({
          title,
          url,
          source: 'CoinTelegraph',
          timestamp: new Date()
        });
      }
    });

    return articles.slice(0, 10);
  } catch (error) {
    console.error('Error scraping CoinTelegraph:', error);
    return [];
  }
}

async function scrapeCryptoSlate(cutoffDate: Date): Promise<NewsArticle[]> {
  try {
    const response = await axios.get('https://cryptoslate.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    const articles: NewsArticle[] = [];

    $('article, .post').each((i, elem) => {
      const title = $(elem).find('h2, h3, .post-title').first().text().trim();
      const link = $(elem).find('a').first().attr('href');
      const url = link?.startsWith('http') ? link : `https://cryptoslate.com${link}`;

      if (title && url) {
        articles.push({
          title,
          url,
          source: 'CryptoSlate',
          timestamp: new Date()
        });
      }
    });

    return articles.slice(0, 10);
  } catch (error) {
    console.error('Error scraping CryptoSlate:', error);
    return [];
  }
}

function getMockNewsArticles(): NewsArticle[] {
  // Fallback mock data for development/testing
  return [
    {
      title: 'Bitcoin Surges Past $45,000 as Institutional Adoption Grows',
      url: 'https://example.com/btc-surge',
      source: 'Mock News',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      summary: 'Bitcoin reaches new highs as major institutions announce adoption'
    },
    {
      title: 'Ethereum 2.0 Staking Reaches All-Time High',
      url: 'https://example.com/eth-staking',
      source: 'Mock News',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      summary: 'Over 30 million ETH now staked in Ethereum 2.0'
    },
    {
      title: 'New DeFi Protocol Launches with $100M TVL',
      url: 'https://example.com/defi-launch',
      source: 'Mock News',
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000),
      summary: 'Revolutionary DeFi platform attracts massive liquidity'
    },
    {
      title: 'NFT Market Sees Record-Breaking Sales Volume',
      url: 'https://example.com/nft-sales',
      source: 'Mock News',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      summary: 'NFT marketplace hits $500M in weekly volume'
    }
  ];
}

