import axios from 'axios';
import * as cheerio from 'cheerio';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXML = promisify(parseString);

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  timestamp: Date;
  summary?: string;
}

interface RSSFeed {
  url: string;
  source: string;
  name: string;
}

// RSS Feed sources
const RSS_FEEDS: RSSFeed[] = [
  {
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    source: 'CoinDesk',
    name: 'CoinDesk'
  },
  {
    url: 'https://cointelegraph.com/rss',
    source: 'CoinTelegraph',
    name: 'CoinTelegraph'
  },
  {
    url: 'https://cryptoslate.com/feed/',
    source: 'CryptoSlate',
    name: 'CryptoSlate'
  },
  {
    url: 'https://www.theblock.co/rss.xml',
    source: 'The Block',
    name: 'The Block'
  },
  {
    url: 'https://decrypt.co/feed',
    source: 'Decrypt',
    name: 'Decrypt'
  },
  {
    url: 'https://coinjournal.net/feed/',
    source: 'CoinJournal',
    name: 'CoinJournal'
  }
];

export async function scrapeCryptoNews(): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = [];
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  try {
    // Try RSS feeds first (more reliable, includes publish dates)
    console.log('📡 Fetching news from RSS feeds...');
    const rssArticles = await fetchRSSFeeds(fourHoursAgo);
    articles.push(...rssArticles);
    console.log(`✅ Fetched ${rssArticles.length} articles from RSS feeds`);

    // Fallback to scraping if RSS didn't get enough articles
    if (articles.length < 10) {
      console.log('📰 Supplementing with web scraping...');
      const coinDeskArticles = await scrapeCoinDesk(fourHoursAgo);
      articles.push(...coinDeskArticles);

      const coinTelegraphArticles = await scrapeCoinTelegraph(fourHoursAgo);
      articles.push(...coinTelegraphArticles);

      const cryptoSlateArticles = await scrapeCryptoSlate(fourHoursAgo);
      articles.push(...cryptoSlateArticles);
      console.log(`✅ Scraped ${coinDeskArticles.length + coinTelegraphArticles.length + cryptoSlateArticles.length} additional articles`);
    }

    // Remove duplicates (same URL)
    const uniqueArticles = removeDuplicates(articles);

    // Filter articles from last 4 hours (using actual publish dates)
    const recentArticles = uniqueArticles.filter(article => 
      article.timestamp >= fourHoursAgo
    );

    console.log(`📊 Total unique articles from last 4 hours: ${recentArticles.length}`);
    return recentArticles;
  } catch (error) {
    console.error('Error scraping crypto news:', error);
    // Return mock data if everything fails
    return getMockNewsArticles();
  }
}

/**
 * Fetch articles from RSS feeds
 */
async function fetchRSSFeeds(cutoffDate: Date): Promise<NewsArticle[]> {
  const allArticles: NewsArticle[] = [];
  const fourHoursAgo = cutoffDate.getTime();

  // Fetch from all RSS feeds in parallel
  const feedPromises = RSS_FEEDS.map(feed => fetchRSSFeed(feed, cutoffDate));
  const results = await Promise.allSettled(feedPromises);

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
      console.log(`  ✅ ${RSS_FEEDS[index].name}: ${result.value.length} articles`);
    } else {
      console.warn(`  ⚠️ ${RSS_FEEDS[index].name}: Failed to fetch - ${result.reason}`);
    }
  });

  return allArticles;
}

/**
 * Fetch articles from a single RSS feed
 */
async function fetchRSSFeed(feed: RSSFeed, cutoffDate: Date): Promise<NewsArticle[]> {
  try {
    const response = await axios.get(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    try {
      const result: any = await parseXML(response.data);
      const articles: NewsArticle[] = [];
      const items = result?.rss?.channel?.[0]?.item || result?.feed?.entry || [];

      items.forEach((item: any) => {
        try {
          // Handle different RSS formats (RSS 2.0 and Atom)
          const title = item.title?.[0]?._ || item.title?.[0] || item.title || '';
          const link = item.link?.[0]?._ || item.link?.[0]?.$.href || item.link?.[0] || item.id?.[0] || '';
          const pubDate = item.pubDate?.[0] || item.published?.[0] || item.updated?.[0] || '';
          const description = item.description?.[0]?._ || item.description?.[0] || item.summary?.[0]?._ || item.summary?.[0] || '';

          if (!title || !link) {
            return; // Skip invalid entries
          }

          // Parse publish date
          let timestamp = new Date();
          if (pubDate) {
            const parsedDate = new Date(pubDate);
            if (!isNaN(parsedDate.getTime())) {
              timestamp = parsedDate;
            }
          }

          // Only include articles from last 4 hours
          if (timestamp.getTime() >= cutoffDate.getTime()) {
            articles.push({
              title: title.trim(),
              url: link.trim(),
              source: feed.source,
              timestamp,
              summary: description ? description.trim().substring(0, 200) : undefined
            });
          }
        } catch (itemError) {
          console.warn(`Error parsing RSS item from ${feed.source}:`, itemError);
        }
      });

      return articles;
    } catch (parseError) {
      console.error(`Error parsing RSS XML from ${feed.source}:`, parseError);
      return [];
    }
  } catch (error) {
    console.error(`Error fetching RSS feed from ${feed.source}:`, error);
    return [];
  }
}

/**
 * Remove duplicate articles (same URL)
 */
function removeDuplicates(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const unique: NewsArticle[] = [];

  articles.forEach(article => {
    const normalizedUrl = article.url.toLowerCase().split('?')[0]; // Remove query params
    if (!seen.has(normalizedUrl)) {
      seen.add(normalizedUrl);
      unique.push(article);
    }
  });

  return unique;
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

