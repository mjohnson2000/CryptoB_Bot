import OpenAI from 'openai';
import { NewsArticle } from './newsScraper.js';
import { PriceUpdate } from './priceData.js';

export interface TrendingTopic {
  title: string;
  summary: string;
  importance: number;
  source: string;
  url?: string; // URL to the source article
  isUpdate?: boolean; // True if this topic was recently covered and has updates
}

export interface NFTUpdate {
  trendingCollections: Array<{ name: string; floorPrice: number; floorPriceChange24h: number }>;
}

export interface VideoScript {
  title: string;
  thumbnailTitle?: string; // Optional shorter title for thumbnail
  description: string;
  tags: string[];
  script: string;
  topics: TrendingTopic[];
  priceUpdate?: PriceUpdate;
  nftUpdate?: NFTUpdate;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  return new OpenAI({ apiKey });
}

export async function distillTrendingTopics(
  articles: NewsArticle[]
): Promise<TrendingTopic[]> {
  try {
    const articlesText = articles
      .slice(0, 20)
      .map(a => `- ${a.title} (${a.source})`)
      .join('\n');

    const prompt = `You are analyzing the latest crypto news to identify the top 3-4 most trending and important topics from the last 6 hours. 

Here are the recent articles:
${articlesText}

Analyze these articles and identify the top 3-4 most trending topics. For each topic, provide:
1. A catchy title
2. A brief summary (2-3 sentences)
3. An importance score (1-10)
4. The primary source

Format your response as a JSON object with a "topics" array containing the topics:
{
  "topics": [
    {
      "title": "Topic Title",
      "summary": "Brief summary",
      "importance": 8,
      "source": "Source name"
    }
  ]
}

Only return the JSON object, no other text.`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert crypto analyst who identifies trending topics for a young, degen audience.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    const parsed = JSON.parse(content);
    const topics = Array.isArray(parsed.topics) ? parsed.topics : [];

    // Sort by importance and take top 3-4
    const sortedTopics = topics
      .sort((a: TrendingTopic, b: TrendingTopic) => b.importance - a.importance)
      .slice(0, 4);

    // Match topics with articles to get URLs
    // Improved matching: try multiple strategies to find the best match
    const topicsWithUrls = sortedTopics.map((topic: TrendingTopic) => {
      // Strategy 1: Exact source match first
      let matchingArticle = articles.find(article => 
        article.source.toLowerCase() === topic.source.toLowerCase()
      );
      
      // Strategy 2: Title keyword matching (more flexible)
      if (!matchingArticle) {
        const topicKeywords = topic.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        matchingArticle = articles.find(article => {
          const articleTitleLower = article.title.toLowerCase();
          // Check if at least 2 keywords from topic title appear in article title
          const matchingKeywords = topicKeywords.filter(keyword => 
            articleTitleLower.includes(keyword)
          );
          return matchingKeywords.length >= 2;
        });
      }
      
      // Strategy 3: Partial title matching (fallback)
      if (!matchingArticle) {
        matchingArticle = articles.find(article => {
          const articleTitleLower = article.title.toLowerCase();
          const topicTitleLower = topic.title.toLowerCase();
          // Check for significant word overlap
          const articleWords = new Set(articleTitleLower.split(/\s+/).filter(w => w.length > 3));
          const topicWords = new Set(topicTitleLower.split(/\s+/).filter(w => w.length > 3));
          const overlap = [...topicWords].filter(w => articleWords.has(w));
          return overlap.length >= 2;
        });
      }
      
      // Strategy 4: Source-based matching (if source name matches)
      if (!matchingArticle && topic.source) {
        matchingArticle = articles
          .filter(a => a.source.toLowerCase().includes(topic.source.toLowerCase()) || 
                      topic.source.toLowerCase().includes(a.source.toLowerCase()))
          .find(article => {
            // Check if topic summary mentions keywords from article
            const articleKeywords = article.title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
            const summaryLower = topic.summary.toLowerCase();
            return articleKeywords.some(keyword => summaryLower.includes(keyword));
          });
      }
      
      if (matchingArticle) {
        console.log(`✅ Matched topic "${topic.title}" with article "${matchingArticle.title}"`);
        return { ...topic, url: matchingArticle.url };
      } else {
        console.warn(`⚠️ Could not find URL for topic: "${topic.title}" (source: ${topic.source})`);
        // Try to get any article from the same source as fallback
        const sourceArticle = articles.find(a => 
          a.source.toLowerCase() === topic.source.toLowerCase()
        );
        if (sourceArticle) {
          console.log(`📎 Using source article as fallback: ${sourceArticle.url}`);
          return { ...topic, url: sourceArticle.url };
        }
      }
      return topic;
    });

    return topicsWithUrls;
  } catch (error) {
    console.error('Error distilling topics:', error);
    // Fallback to mock topics
    return getMockTopics();
  }
}

export async function generateVideoScript(
  topics: TrendingTopic[],
  allTopics?: TrendingTopic[], // All topics before filtering (for context)
  priceUpdate?: PriceUpdate,
  nftUpdate?: NFTUpdate
): Promise<VideoScript> {
  try {
    const topicsText = topics
      .map((t, i) => `${i + 1}. ${t.title}: ${t.summary}${t.url ? ` (Source: ${t.url})` : ''}`)
      .join('\n\n');
    
    // Collect all reference URLs for the description
    let referenceUrls = topics
      .filter(t => t.url)
      .map(t => `- ${t.title}: ${t.url}`)
      .join('\n');
    
    // Debug: Log what we found
    const topicsWithUrls = topics.filter(t => t.url);
    console.log(`📊 Found ${topicsWithUrls.length} topics with URLs out of ${topics.length} total topics`);
    if (topicsWithUrls.length > 0) {
      topicsWithUrls.forEach(t => console.log(`  - ${t.title}: ${t.url}`));
    }

    // Identify which topics are updates vs new
    const updateTopics = topics.filter(t => t.isUpdate).map(t => t.title);
    const newTopics = topics.filter(t => !t.isUpdate).map(t => t.title);
    
    let updateContext = '';
    if (updateTopics.length > 0) {
      updateContext = `\n\nIMPORTANT - CONTENT VARIATION REQUIREMENT:
Some of these topics may have been covered in recent videos. To avoid repetition:
- For topics marked as updates: ${updateTopics.join(', ')}
  * Use a DIFFERENT angle or perspective than previous coverage
  * Focus on NEW developments, updates, or changes since last mention
  * Frame as "Update on..." or "Latest on..." rather than repeating the same story
  * Provide deeper analysis, different insights, or new context
  * Avoid repeating the same narrative or facts from previous videos
  
- For new topics: ${newTopics.join(', ')}
  * These are fresh topics - cover them normally with full context
  
CRITICAL: If a topic was recently covered, you MUST use a different narrative angle, focus on updates, or provide deeper analysis. Never repeat the same story.`;
    }

    // Build price update section text
    let priceSection = '';
    if (priceUpdate) {
      const winnersText = priceUpdate.topWinners.slice(0, 3)
        .map(w => `${w.symbol} (+${w.change24h.toFixed(1)}%)`)
        .join(', ');
      const losersText = priceUpdate.topLosers.slice(0, 3)
        .map(l => `${l.symbol} (${l.change24h.toFixed(1)}%)`)
        .join(', ');
      priceSection = `\n\nPRICE MOVEMENT UPDATE (to be covered right after intro, ~30 seconds):
Top Winners: ${winnersText}
Top Losers: ${losersText}
Market Sentiment: ${priceUpdate.marketSentiment}
Keep this section SHORT, punchy, and energetic. Use phrases like "mooning", "getting rekt", "pumping".`;
    }

    // Build NFT update section text
    let nftSection = '';
    if (nftUpdate) {
      const nftText = nftUpdate.trendingCollections.slice(0, 3)
        .map(nft => `${nft.name} (Floor: ${nft.floorPrice.toFixed(2)} ETH, ${nft.floorPriceChange24h > 0 ? '+' : ''}${nft.floorPriceChange24h.toFixed(1)}%)`)
        .join(', ');
      nftSection = `\n\nNFT UPDATE (to be covered before outro, ~30 seconds):
Trending Collections: ${nftText}
Keep this section SHORT and focused on floor prices and trends.`;
    }

    const prompt = `You are "Crypto B", a charismatic crypto influencer creating a YouTube video for young degens. Create an engaging video script based on these trending topics:

${topicsText}${updateContext}${priceSection}${nftSection}

Requirements:
- Target audience: Young crypto degens (18-30, meme-loving, risk-tolerant)
- Tone: Energetic, casual, slightly edgy, use crypto slang
- Length: 4-6 minutes of speaking (approximately 600-900 words)
- Structure: 
  1. Hook intro (15 seconds) - mention 6-hour updates
  2. Price Movement Update (30 seconds) - top winners/losers, market sentiment
  3. Main News Stories (2-3 minutes) - cover each topic with analysis
  4. NFT Update (30 seconds) - trending collections, floor prices
  5. Strong outro (15 seconds) - subscribe, next update in 6 hours
- Include: Price movements, market sentiment, potential opportunities
- Use: Crypto terminology (moon, diamond hands, FUD, alpha, etc.)
- IMPORTANT: Mention in the intro and/or outro that this news is from the last 6 hours, and that new videos are posted every 6 hours with the latest crypto updates
- CRITICAL: If covering topics that were mentioned in recent videos, use a DIFFERENT angle, focus on UPDATES, or provide DEEPER analysis. Never repeat the same narrative.
- NUMERIC FORMAT: When mentioning price changes or percentages, ALWAYS use the exact numeric format with decimal points and percentage signs. For example, say "5.2%" not "five point two percent" or "five percent". Use formats like "+5.2%", "-3.1%", "7.3%" etc.

Also generate:
1. A catchy YouTube title (under 60 characters, clickbait but accurate)
2. A detailed description (3-4 paragraphs) that:
   - MUST mention that news is updated every 6 hours and new videos are posted every 6 hours
   - Includes accurate timestamps for each topic (format: MM:SS)
   - Mentions that viewers should check the description for reference links to learn more
   - Note: Timestamps will be calculated after video generation, so estimate based on script length (approximately 150 words per minute)
3. Relevant tags (15-20 tags, comma-separated)

IMPORTANT: In the script, mention that viewers should check the description below for reference links to dive deeper into each topic.

Format your response as JSON:
{
  "title": "Video title",
  "description": "Full description with estimated timestamps (will be updated with accurate times)",
  "tags": ["tag1", "tag2", "tag3"],
  "script": "Full script text here"
}`;

    const openai = getOpenAIClient();
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are Crypto B, a popular crypto YouTuber known for breaking down complex crypto news in an entertaining way for degens.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Remove exclamation marks and emojis from video title
    if (parsed.title) {
      parsed.title = parsed.title
        .replace(/!/g, '') // Remove exclamation marks
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoticons & Symbols
        .replace(/[\u{2600}-\u{26FF}]/gu, '') // Miscellaneous Symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport & Map
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
        .replace(/[\u{2190}-\u{21FF}]/gu, '') // Arrows
        .replace(/[\u{2300}-\u{23FF}]/gu, '') // Miscellaneous Technical
        .replace(/[\u{2B50}-\u{2B55}]/gu, '') // Miscellaneous Symbols and Arrows
        .replace(/[\u{3030}-\u{303F}]/gu, '') // CJK Symbols and Punctuation
        .replace(/[\u{3297}-\u{3299}]/gu, '') // CJK Compatibility
        .replace(/[^\x00-\x7F]/g, '') // Remove any remaining non-ASCII characters
        .replace(/\s+/g, ' ') // Clean up multiple spaces
        .trim();
    }

    // Generate a shorter, more catchy thumbnail title
    let thumbnailTitle = parsed.title || 'Latest Crypto News';
    
    // Remove decorative quotation marks (unless it's an actual quote)
    const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(thumbnailTitle);
    if (!hasQuoteContext) {
      thumbnailTitle = thumbnailTitle.replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes
      thumbnailTitle = thumbnailTitle.replace(/\s*["']\s*/g, ' '); // Remove standalone quotes
      thumbnailTitle = thumbnailTitle.trim();
    }
    
    // Always use AI to create an optimal 3-word max thumbnail title
    try {
      const thumbnailPrompt = `Create a SHORT, CATCHY thumbnail title for a YouTube crypto news video. This will be displayed on a thumbnail image, so it needs to be:
- EXACTLY 3 words maximum (no more, no less if possible)
- Eye-catching and clickable
- Use power words (BREAKING, SHOCKING, INSANE, MOONING, CRASH, SURGE, etc.)
- Keep the main message but make it punchy and attention-grabbing
- Focus on the most impactful news element
- NO emojis (keep it text-only, but still exciting)
- NO exclamation marks (keep it clean and professional)
- Use ALL CAPS for maximum visual impact

Original title: "${thumbnailTitle}"

Return ONLY the 3-word thumbnail title in ALL CAPS, nothing else. No quotes, no explanations, no exclamation marks, no emojis.`;

        const thumbnailResponse = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: 'You are an expert at creating short, catchy YouTube thumbnail titles that grab attention. Always return exactly 3 words when possible. Use ALL CAPS and power words, but NO emojis and NO exclamation marks.'
            },
            {
              role: 'user',
              content: thumbnailPrompt
            }
          ],
          temperature: 0.9,
          max_tokens: 30
        });

        let shortTitle = thumbnailResponse.choices[0]?.message?.content?.trim();
        if (shortTitle) {
          // Remove decorative quotes
          const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(shortTitle);
          if (!hasQuoteContext) {
            shortTitle = shortTitle.replace(/^["']|["']$/g, '');
            shortTitle = shortTitle.replace(/\s*["']\s*/g, ' ');
            shortTitle = shortTitle.trim();
          }
          
          // Remove any emojis that might have been included
          shortTitle = shortTitle
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoticons & Symbols
            .replace(/[\u{2600}-\u{26FF}]/gu, '') // Miscellaneous Symbols
            .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
            .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport & Map
            .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
            .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
            .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
            .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
            .replace(/[\u{2190}-\u{21FF}]/gu, '') // Arrows
            .replace(/[\u{2300}-\u{23FF}]/gu, '') // Miscellaneous Technical
            .replace(/[\u{2B50}-\u{2B55}]/gu, '') // Miscellaneous Symbols and Arrows
            .replace(/[\u{3030}-\u{303F}]/gu, '') // CJK Symbols and Punctuation
            .replace(/[\u{3297}-\u{3299}]/gu, '') // CJK Compatibility
            .replace(/[^\x00-\x7F]/g, '') // Remove any remaining non-ASCII characters
            .replace(/!/g, '') // Remove exclamation marks
            .replace(/\s+/g, ' ') // Clean up multiple spaces
            .trim();
          
          // Convert to ALL CAPS for maximum impact (but preserve numbers and punctuation)
          shortTitle = shortTitle.replace(/[a-z]/g, (match: string) => match.toUpperCase());
          
          // Ensure it's 3 words max
          const words = shortTitle.split(/\s+/).filter((w: string) => w.length > 0);
          if (words.length > 3) {
            thumbnailTitle = words.slice(0, 3).join(' ');
          } else {
            thumbnailTitle = shortTitle;
          }
          console.log(`✅ Generated 3-word thumbnail title: "${thumbnailTitle}"`);
        }
      } catch (error) {
        console.warn('Failed to generate thumbnail title, using fallback:', error);
        // Fallback: take first 3 words of original title
        const words = thumbnailTitle.split(/\s+/).filter((w: string) => w.length > 0);
        if (words.length > 3) {
          thumbnailTitle = words.slice(0, 3).join(' ');
        }
      }

    // Add reference links to description
    let finalDescription = parsed.description || '';
    
    // Always add reference links section if we have any URLs
    if (referenceUrls && referenceUrls.trim().length > 0) {
      const linkCount = topics.filter(t => t.url).length;
      finalDescription += `\n\n📚 REFERENCE LINKS - Check these out for more info on the topics covered:\n\n${referenceUrls}\n\n💡 Want to dive deeper? Click the links above to read the full articles and get all the details!`;
      console.log(`✅ Added ${linkCount} reference links to description`);
    } else {
      console.warn('⚠️ No reference URLs found to add to description');
      console.warn(`   Topics: ${topics.map(t => t.title).join(', ')}`);
      console.warn(`   Topics with URLs: ${topics.filter(t => t.url).map(t => `${t.title} (${t.url})`).join(', ')}`);
      // Still add a note about checking sources
      finalDescription += `\n\n💡 Want to dive deeper? Check out the sources mentioned in the video (${topics.map(t => t.source).filter((v, i, a) => a.indexOf(v) === i).join(', ')}) for more detailed information on each topic!`;
    }
    
    // Note: Timestamps will be updated with accurate times after video generation
    // Remove placeholder notes about estimated timestamps - they'll be updated with accurate times
    finalDescription = finalDescription.replace(/\s*\(estimated[^)]*\)/gi, '');

    return {
      title: parsed.title || 'Latest Crypto News',
      thumbnailTitle: thumbnailTitle, // Shorter version for thumbnail (3 words max)
      description: finalDescription,
      tags: parsed.tags || [],
      script: parsed.script || '',
      topics,
      priceUpdate: priceUpdate,
      nftUpdate: nftUpdate
    };
  } catch (error) {
    console.error('Error generating video script:', error);
    throw error;
  }
}

export interface ThumbnailDesign {
  backgroundColor: string; // Hex color for main background
  accentColor: string; // Hex color for accents
  textColor: string; // Hex color for main text
  layout: 'centered' | 'split' | 'overlay'; // Layout style
  visualElements: string[]; // Suggested visual elements (e.g., ["gradient", "grid", "glow"])
  emphasis: 'bold' | 'minimal' | 'dynamic'; // Visual emphasis style
  description: string; // Description of the design approach
}

export async function generateThumbnailDesign(
  title: string,
  topics: TrendingTopic[]
): Promise<ThumbnailDesign> {
  try {
    const openai = getOpenAIClient();
    
    const topicsText = topics.slice(0, 3).map(t => t.title).join(', ');
    
    const designPrompt = `You are a YouTube thumbnail design expert specializing in crypto news videos. Create a captivating, high-quality thumbnail design specification.

Video Title: "${title}"
Main Topics: ${topicsText}

Generate a thumbnail design that is:
- Eye-catching and clickable
- Professional and high-quality
- Optimized for YouTube (1280x720px)
- Uses bold, contrasting colors
- Has strong visual hierarchy
- Appeals to crypto enthusiasts

Return a JSON object with this exact structure:
{
  "backgroundColor": "#hexcolor (use dark degen palette: #0a0a0f or similar dark colors)",
  "accentColor": "#hexcolor (use Bitcoin orange #F7931A for news videos, or vibrant colors like #00FF88 for deep dives)",
  "textColor": "#hexcolor (high contrast text color, usually white #FFFFFF)",
  "layout": "centered|split|overlay (choose best for this content)",
  "visualElements": ["element1", "element2"] (suggest 2-3 visual elements like "gradient", "glow", "grid", "particles", "geometric shapes"),
  "emphasis": "bold|minimal|dynamic (visual style)",
  "description": "Brief description of the design approach and why it will be effective"
}

Focus on making it CAPTIVATING and HIGH QUALITY. Return ONLY valid JSON, no markdown, no code blocks.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are an expert YouTube thumbnail designer. Always return valid JSON only, no markdown formatting.'
        },
        {
          role: 'user',
          content: designPrompt
        }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON (remove markdown code blocks if present)
    const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const design = JSON.parse(jsonContent) as ThumbnailDesign;

    // Validate and set defaults
    return {
      backgroundColor: design.backgroundColor || '#0a0a0a',
      accentColor: design.accentColor || '#F7931A',
      textColor: design.textColor || '#FFFFFF',
      layout: design.layout || 'centered',
      visualElements: design.visualElements || ['gradient', 'glow'],
      emphasis: design.emphasis || 'bold',
      description: design.description || 'Professional crypto news thumbnail'
    };
  } catch (error) {
    console.warn('Failed to generate thumbnail design, using defaults:', error);
    // Return default high-quality design
    return {
      backgroundColor: '#0a0a0a',
      accentColor: '#F7931A',
      textColor: '#FFFFFF',
      layout: 'centered',
      visualElements: ['gradient', 'glow', 'grid'],
      emphasis: 'bold',
      description: 'Default high-contrast crypto thumbnail design'
    };
  }
}

function getMockTopics(): TrendingTopic[] {
  return [
    {
      title: 'Bitcoin Breaks $45K Resistance',
      summary: 'BTC surges past major resistance level as institutional buying increases',
      importance: 9,
      source: 'CoinDesk'
    },
    {
      title: 'Ethereum Staking Milestone',
      summary: 'ETH 2.0 staking reaches record levels with 30M+ ETH locked',
      importance: 8,
      source: 'CoinTelegraph'
    },
    {
      title: 'DeFi Protocol Explodes',
      summary: 'New DeFi platform hits $100M TVL in first week',
      importance: 7,
      source: 'CryptoSlate'
    }
  ];
}

function getMockScript(topics: TrendingTopic[]): VideoScript {
  const referenceLinks = topics
    .filter(t => t.url)
    .map(t => `- ${t.title}: ${t.url}`)
    .join('\n');
  
  let description = `What's up degens! Crypto B here with the latest alpha. In this video, we're breaking down the top 3 crypto stories from the last 6 hours.

📅 NEW VIDEOS EVERY 6 HOURS! We bring you the freshest crypto news around the clock, so you never miss the latest moves in the market.

💡 Want to dive deeper? Check the reference links below for more info on each topic!

0:00 - Intro
0:30 - ${topics[0]?.title || 'Story 1'}
1:45 - ${topics[1]?.title || 'Story 2'}
3:00 - ${topics[2]?.title || 'Story 3'}
4:15 - Outro

Stay tuned for more crypto alpha! Make sure to subscribe and hit the bell so you don't miss our next update in 6 hours!`;

  if (referenceLinks) {
    description += `\n\n📚 REFERENCE LINKS - Check these out for more info on the topics covered:\n\n${referenceLinks}\n\n💡 Want to dive deeper? Click the links above to read the full articles and get all the details!`;
  }

  return {
    title: 'CRYPTO IS MOONING Top 3 Stories You NEED to Know',
    thumbnailTitle: 'CRYPTO MOONING TOP STORIES',
    description,
    tags: ['crypto', 'bitcoin', 'ethereum', 'defi', 'cryptocurrency', 'trading', 'crypto news'],
    script: `Yo what's up degens! Crypto B here, and we've got some absolutely INSANE crypto news dropping in the last 6 hours. That's right - we're bringing you the freshest alpha every 6 hours, so you're always ahead of the game. If you're not paying attention, you're missing out on some serious moves. Let's dive in!

First up, we're seeing Bitcoin absolutely SMASH through resistance levels. This is the kind of move that gets degens excited, and honestly? I'm here for it.

Next, Ethereum is hitting some major milestones with staking. The numbers are wild, and this could be huge for the ecosystem.

And finally, we've got a new DeFi protocol that's absolutely exploding. The TVL numbers are insane, and this could be the next big thing.

That's all for now degens. Keep those diamond hands strong, and remember - we drop fresh crypto news every 6 hours, so make sure you're subscribed and hit that bell to never miss an update. I'll catch you in the next one in 6 hours. Peace!`,
    topics
  };
}

/**
 * Generate a deep dive video script for a specific topic (5 minutes)
 * Uses two-phase generation: Research & Outline, then Script Generation
 */
export async function generateDeepDiveScript(
  topic: string,
  requestComments: Array<{ text: string; author: string }> = [],
  questions: string[] = []
): Promise<VideoScript> {
  try {
    const openai = getOpenAIClient();

    // Step 1: Research the topic (get recent news, price data, key points)
    console.log(`🔍 Phase 1: Researching topic "${topic}"...`);
    const { researchTopic } = await import('./topicResearch.js');
    const research = await researchTopic(topic);
    
    // Build research context
    let researchContext = '';
    if (research.recentArticles.length > 0) {
      const articlesText = research.recentArticles
        .slice(0, 5)
        .map(a => `- ${a.title} (${a.source}): ${a.summary || ''}`)
        .join('\n');
      researchContext += `\n\n📰 RECENT NEWS & DEVELOPMENTS (Last 48 hours):\n${articlesText}`;
    }
    
    if (research.priceData) {
      researchContext += `\n\n💰 CURRENT PRICE DATA:\n- ${research.priceData.name} (${research.priceData.symbol}): $${research.priceData.price.toFixed(2)} (${research.priceData.change24h > 0 ? '+' : ''}${research.priceData.change24h.toFixed(2)}% in 24h)`;
    }
    
    if (research.keyPoints.length > 0) {
      researchContext += `\n\n📝 KEY POINTS:\n${research.keyPoints.map(p => `- ${p}`).join('\n')}`;
    }
    
    if (research.relatedTopics.length > 0) {
      researchContext += `\n\n🔗 RELATED TOPICS: ${research.relatedTopics.join(', ')}`;
    }

    // Build context from comments (use up to 50 comments)
    let commentsContext = '';
    if (requestComments.length > 0) {
      const commentsText = requestComments
        .slice(0, 50) // Increased from 10 to 50
        .map(c => `- "${c.text}" (by ${c.author})`)
        .join('\n');
      commentsContext = `\n\n💬 VIEWER REQUESTS FROM COMMENTS (${requestComments.length} comments):\n${commentsText}`;
    }
    
    // Build questions context
    let questionsContext = '';
    if (questions.length > 0) {
      questionsContext = `\n\n❓ SPECIFIC QUESTIONS VIEWERS ARE ASKING:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nCRITICAL: Your script MUST answer these specific questions. Address each one clearly.`;
    }

    // PHASE 1: Generate detailed outline
    console.log(`📋 Phase 1: Generating detailed outline for "${topic}"...`);
    const outlinePrompt = `You are "Crypto B", a charismatic crypto influencer creating a DEEP DIVE YouTube video. This video is based on viewer requests from comments asking for more information about "${topic}".

${researchContext}${commentsContext}${questionsContext}

PHASE 1: RESEARCH & OUTLINE GENERATION

First, research and understand "${topic}" thoroughly using the provided context above. Then create a DETAILED OUTLINE for a 5-minute deep dive video.

Requirements for the outline:
- Target audience: Young crypto degens (18-30, meme-loving, risk-tolerant)
- Must cover ALL aspects of the topic thoroughly
- Must answer ALL viewer questions (if provided)
- Must include recent developments and current state
- Must have enough depth for 5 minutes of content

Outline structure:
1. Hook intro (30 seconds)
   - Key points to cover
   - How to mention viewer requests
2. Overview/Context (45 seconds)
   - What is this topic?
   - Why does it matter?
   - Key background information
3. Deep Analysis (3.5-4 minutes) - MAIN CONTENT
   - Key concepts and how they work (detailed breakdown)
   - Current state and recent developments (use the research provided)
   - Why it's important for crypto
   - Potential impact or opportunities
   - Technical details explained simply
   - Real examples and use cases
   - Address each viewer question specifically
4. Real-world examples or use cases (30 seconds)
   - Specific examples
   - Practical applications
5. Outro (15 seconds)
   - Key takeaways
   - Encourage more requests

QUALITY CHECKLIST - Ensure the outline covers:
✅ All key concepts of the topic
✅ Recent developments (from research)
✅ Answers to viewer questions
✅ Technical details (explained simply)
✅ Real-world examples
✅ Why it matters for crypto
✅ Potential opportunities/impact

Format your response as JSON:
{
  "outline": {
    "intro": ["point 1", "point 2", ...],
    "overview": ["point 1", "point 2", ...],
    "deepAnalysis": ["point 1", "point 2", ...],
    "examples": ["point 1", "point 2", ...],
    "outro": ["point 1", "point 2", ...]
  },
  "keyPoints": ["main point 1", "main point 2", ...],
  "questionsToAnswer": ["question 1", "question 2", ...]
}`;

    const outlineResponse = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are Crypto B, a popular crypto YouTuber known for creating educational deep dive content based on viewer requests. You excel at researching topics and creating comprehensive outlines.'
        },
        {
          role: 'user',
          content: outlinePrompt
        }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const outlineContent = outlineResponse.choices[0]?.message?.content;
    if (!outlineContent) {
      throw new Error('No outline response from OpenAI');
    }

    const outlineParsed = JSON.parse(outlineContent);
    const outline = outlineParsed.outline || {};
    const keyPoints = outlineParsed.keyPoints || [];
    const questionsToAnswer = outlineParsed.questionsToAnswer || questions;

    console.log(`✅ Outline generated with ${Object.keys(outline).length} sections`);

    // PHASE 2: Generate script from outline
    console.log(`✍️ Phase 2: Generating script from outline...`);
    const scriptPrompt = `You are "Crypto B", a charismatic crypto influencer creating a DEEP DIVE YouTube video. This video is based on viewer requests from comments asking for more information about "${topic}".

${researchContext}${commentsContext}${questionsContext}

PHASE 2: SCRIPT GENERATION

You have already created a detailed outline. Now create the FULL SCRIPT based on this outline:

OUTLINE:
${JSON.stringify(outline, null, 2)}

KEY POINTS TO COVER:
${keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}

QUESTIONS TO ANSWER:
${questionsToAnswer.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n')}

Create an engaging 5-minute deep dive video script that:
- Follows the outline structure exactly
- Covers ALL key points listed above
- Answers ALL questions listed above
- Uses the research context provided (recent news, price data, key points)
- Is energetic, educational, and casual (use crypto slang appropriately)
- Is exactly 1000+ words (CRITICAL for 5 minutes)

Requirements:
- Target audience: Young crypto degens (18-30, meme-loving, risk-tolerant)
- Tone: Energetic, educational, casual, use crypto slang
- Length: 5 minutes of speaking (MUST be 1000+ words)
- Structure: Follow the outline exactly
- Include: Technical details explained simply, real examples, potential opportunities
- Use: Crypto terminology appropriately
- IMPORTANT: Mention that this deep dive was created based on viewer comments and requests
- IMPORTANT: Mention that new deep dive videos are created once per day based on the most requested topics from comments

QUALITY CHECKLIST - Before finalizing, ensure:
✅ Script is 1000+ words (for full 5 minutes)
✅ All outline points are covered
✅ All viewer questions are answered
✅ Recent developments are mentioned (from research)
✅ Technical concepts are explained simply
✅ Real examples are included
✅ Topic is mentioned at least 5 times throughout

Also generate:
1. A catchy YouTube title (under 60 characters, include "DEEP DIVE" or "EXPLAINED")
2. A detailed description (3-4 paragraphs) that:
   - Mentions this video was created based on viewer requests
   - Explains that deep dive videos are created once per day based on comment requests
   - Includes accurate timestamps for each section (format: MM:SS)
   - Provides additional resources or links
3. Relevant tags (15-20 tags, comma-separated)

Format your response as JSON:
{
  "title": "Video title",
  "description": "Full description with estimated timestamps",
  "tags": ["tag1", "tag2", "tag3"],
  "script": "Full script text here (MUST be 1000+ words for 5 minutes)"
}`;

    const scriptResponse = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: 'You are Crypto B, a popular crypto YouTuber known for creating educational deep dive content based on viewer requests. You excel at writing engaging, educational scripts that thoroughly explain complex topics.'
        },
        {
          role: 'user',
          content: scriptPrompt
        }
      ],
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const scriptContent = scriptResponse.choices[0]?.message?.content;
    if (!scriptContent) {
      throw new Error('No script response from OpenAI');
    }

    const parsed = JSON.parse(scriptContent);
    
    // Remove exclamation marks and emojis from deep dive video title
    if (parsed.title) {
      parsed.title = parsed.title
        .replace(/!/g, '') // Remove exclamation marks
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emoticons & Symbols
        .replace(/[\u{2600}-\u{26FF}]/gu, '') // Miscellaneous Symbols
        .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport & Map
        .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '') // Chess Symbols
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
        .replace(/[\u{2190}-\u{21FF}]/gu, '') // Arrows
        .replace(/[\u{2300}-\u{23FF}]/gu, '') // Miscellaneous Technical
        .replace(/[\u{2B50}-\u{2B55}]/gu, '') // Miscellaneous Symbols and Arrows
        .replace(/[\u{3030}-\u{303F}]/gu, '') // CJK Symbols and Punctuation
        .replace(/[\u{3297}-\u{3299}]/gu, '') // CJK Compatibility
        .replace(/[^\x00-\x7F]/g, '') // Remove any remaining non-ASCII characters
        .replace(/\s+/g, ' ') // Clean up multiple spaces
        .trim();
    }
    
    let scriptText = parsed.script || '';

    // Validate script quality
    console.log(`✅ Script generated. Validating quality...`);
    const { validateScriptQuality } = await import('./topicValidation.js');
    const qualityResult = validateScriptQuality(scriptText, topic, questionsToAnswer, 1000);
    
    console.log(`📝 Script quality check:
      - Word count: ${qualityResult.wordCount} (target: 1000+)
      - Topic mentions: ${qualityResult.topicMentions} (target: 5+)
      - Covers topic: ${qualityResult.coversTopic ? '✅' : '❌'}
      - Answers questions: ${qualityResult.answersQuestions ? '✅' : '⚠️'}
      - Has depth: ${qualityResult.hasEnoughDepth ? '✅' : '⚠️'}
    `);
    
    if (qualityResult.errors.length > 0) {
      console.warn(`⚠️ Script quality issues:\n${qualityResult.errors.map(e => `  - ${e}`).join('\n')}`);
    }
    
    if (qualityResult.warnings.length > 0) {
      console.warn(`⚠️ Script quality warnings:\n${qualityResult.warnings.map(w => `  - ${w}`).join('\n')}`);
    }
    
    // If script quality is too low, try regenerating once
    if (!qualityResult.isHighQuality && qualityResult.errors.length > 0) {
      console.log(`🔄 Script quality below threshold. Attempting to regenerate with improved prompt...`);
      
      const improvedPrompt = `${scriptPrompt}\n\nIMPORTANT: The previous script had quality issues:\n${qualityResult.errors.map(e => `- ${e}`).join('\n')}\n\nPlease ensure the new script addresses ALL of these issues.`;
      
      try {
        const retryResponse = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: 'You are Crypto B, a popular crypto YouTuber known for creating educational deep dive content based on viewer requests. You excel at writing engaging, educational scripts that thoroughly explain complex topics.'
            },
            {
              role: 'user',
              content: improvedPrompt
            }
          ],
          temperature: 0.8,
          response_format: { type: 'json_object' }
        });
        
        const retryContent = retryResponse.choices[0]?.message?.content;
        if (retryContent) {
          const retryParsed = JSON.parse(retryContent);
          const retryScriptText = retryParsed.script || '';
          const retryQuality = validateScriptQuality(retryScriptText, topic, questionsToAnswer, 1000);
          
          if (retryQuality.isHighQuality || retryQuality.errors.length < qualityResult.errors.length) {
            console.log(`✅ Regenerated script has better quality. Using regenerated version.`);
            scriptText = retryScriptText;
            parsed.title = retryParsed.title || parsed.title;
            parsed.description = retryParsed.description || parsed.description;
            parsed.tags = retryParsed.tags || parsed.tags;
          } else {
            console.warn(`⚠️ Regenerated script still has issues. Using original version.`);
          }
        }
      } catch (retryError) {
        console.warn('⚠️ Failed to regenerate script. Using original version:', retryError);
      }
    }

    // Generate a captivating 3-word thumbnail title (not just truncated video title)
    let thumbnailTitle = parsed.title || `DEEP DIVE: ${topic}`;
    
    // Remove "DEEP DIVE:" prefix if present for thumbnail title generation
    const topicForThumbnail = topic.replace(/^DEEP DIVE:\s*/i, '').trim();
    
    try {
      const thumbnailPrompt = `Create a SHORT, CATCHY thumbnail title for a YouTube crypto deep dive video. This will be displayed on a thumbnail image, so it needs to be:
- EXACTLY 3 words maximum (no more, no less if possible)
- Eye-catching and clickable
- Use power words (BREAKING, SHOCKING, INSANE, MOONING, CRASH, SURGE, EXPLAINED, REVEALED, SECRETS, etc.)
- Keep the main message but make it punchy and attention-grabbing
- Focus on the most impactful element of the topic
- NO emojis (keep it text-only, but still exciting)
- NO exclamation marks (keep it clean and professional)
- Use ALL CAPS for maximum visual impact

Topic being explained: "${topicForThumbnail}"
Original video title: "${parsed.title || `DEEP DIVE: ${topic}`}"

Return ONLY the 3-word thumbnail title in ALL CAPS, nothing else. No quotes, no explanations, no exclamation marks, no emojis.`;

      const thumbnailResponse = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at creating short, catchy YouTube thumbnail titles that grab attention. Always return exactly 3 words when possible. Use ALL CAPS and power words, but NO emojis and NO exclamation marks.'
          },
          {
            role: 'user',
            content: thumbnailPrompt
          }
        ],
        temperature: 0.9,
        max_tokens: 30
      });

      const generatedThumbnailTitle = thumbnailResponse.choices[0]?.message?.content?.trim();
      if (generatedThumbnailTitle) {
        // Remove decorative quotes
        const hasQuoteContext = /\b(said|says|announced|stated|declared|quoted|tweeted|posted|wrote|claimed|revealed)\b/i.test(generatedThumbnailTitle);
        if (!hasQuoteContext) {
          thumbnailTitle = generatedThumbnailTitle.replace(/^["']|["']$/g, '');
          thumbnailTitle = thumbnailTitle.replace(/\s*["']\s*/g, ' ');
          thumbnailTitle = thumbnailTitle.trim();
        } else {
          thumbnailTitle = generatedThumbnailTitle.trim();
        }
        
        // Remove exclamation marks
        thumbnailTitle = thumbnailTitle.replace(/!/g, '');
        
        // Convert to ALL CAPS for maximum impact (but preserve numbers and punctuation)
        thumbnailTitle = thumbnailTitle.replace(/[a-z]/g, (match: string) => match.toUpperCase());
        
        // Ensure it's 3 words max
        const words = thumbnailTitle.split(/\s+/).filter((w: string) => w.length > 0);
        if (words.length > 3) {
          thumbnailTitle = words.slice(0, 3).join(' ');
        }
        
        console.log(`✅ Generated deep dive thumbnail title: "${thumbnailTitle}"`);
      }
    } catch (error) {
      console.warn('Failed to generate AI thumbnail title, using fallback:', error);
      // Fallback: Create a simple 3-word title from the topic
      const topicWords = topicForThumbnail.split(/\s+/).filter((w: string) => w.length > 0);
      if (topicWords.length <= 3) {
        thumbnailTitle = topicWords.join(' ').toUpperCase();
      } else {
        // Take first 3 words and make it ALL CAPS
        thumbnailTitle = topicWords.slice(0, 3).join(' ').toUpperCase();
      }
    }

    // Create a single topic for the deep dive
    const deepDiveTopic: TrendingTopic = {
      title: topic,
      summary: `Deep dive on ${topic} based on viewer requests`,
      importance: 10,
      source: 'Viewer Requests'
    };

    return {
      title: parsed.title || `DEEP DIVE: ${topic}`,
      thumbnailTitle: thumbnailTitle, // Use the AI-generated 3-word title
      description: parsed.description || '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : parsed.tags?.split(',').map((t: string) => t.trim()) || [],
      script: scriptText,
      topics: [deepDiveTopic]
    };
  } catch (error) {
    console.error('Error generating deep dive script:', error);
    throw error;
  }
}

