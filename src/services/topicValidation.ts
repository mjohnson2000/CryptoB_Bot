export interface TopicValidationResult {
  isValid: boolean;
  isSpecific: boolean;
  hasEnoughDepth: boolean;
  meetsMinimumRequests: boolean;
  errors: string[];
  warnings: string[];
}

export interface ScriptQualityResult {
  isHighQuality: boolean;
  coversTopic: boolean;
  answersQuestions: boolean;
  hasEnoughDepth: boolean;
  wordCount: number;
  topicMentions: number;
  errors: string[];
  warnings: string[];
}

/**
 * Validate if a topic is suitable for a deep dive video
 */
export function validateTopic(
  topic: string,
  requestCount: number,
  minimumRequests: number = 3
): TopicValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if topic is too vague
  const vagueTopics = ['crypto', 'cryptocurrency', 'blockchain', 'defi', 'nft', 'web3', 'trading', 'market'];
  const topicLower = topic.toLowerCase().trim();
  const isVague = vagueTopics.some(vague => topicLower === vague || topicLower === `${vague}s`);
  
  // Check topic specificity (should have at least 2 words or be a specific coin/term)
  const words = topic.split(/\s+/).filter(w => w.length > 0);
  const isSpecific = words.length >= 2 || isSpecificCoinOrTerm(topic);
  
  // Check if topic has enough depth potential
  const hasEnoughDepth = words.length >= 2 || isSpecificCoinOrTerm(topic);
  
  // Check minimum request count
  const meetsMinimumRequests = requestCount >= minimumRequests;
  
  if (isVague) {
    errors.push(`Topic "${topic}" is too vague. Please be more specific (e.g., "Bitcoin Halving" instead of "Bitcoin").`);
  }
  
  if (!isSpecific) {
    errors.push(`Topic "${topic}" is not specific enough. Use a more detailed topic (e.g., "Ethereum Staking" instead of "Ethereum").`);
  }
  
  if (!hasEnoughDepth) {
    warnings.push(`Topic "${topic}" might not have enough depth for a 5-minute deep dive. Consider a more specific aspect.`);
  }
  
  if (!meetsMinimumRequests) {
    warnings.push(`Topic "${topic}" only has ${requestCount} request(s). Minimum recommended: ${minimumRequests}.`);
  }
  
  return {
    isValid: errors.length === 0,
    isSpecific: isSpecific && !isVague,
    hasEnoughDepth,
    meetsMinimumRequests,
    errors,
    warnings
  };
}

/**
 * Check if topic is a specific coin or well-known crypto term
 */
function isSpecificCoinOrTerm(topic: string): boolean {
  const specificCoins = [
    'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'cardano', 'ada',
    'polkadot', 'dot', 'polygon', 'matic', 'avalanche', 'avax', 'chainlink', 'link',
    'uniswap', 'uni', 'litecoin', 'ltc', 'ripple', 'xrp', 'dogecoin', 'doge',
    'binance coin', 'bnb', 'cosmos', 'atom', 'algorand', 'algo', 'tezos', 'xtz'
  ];
  
  const specificTerms = [
    'halving', 'staking', 'mining', 'proof of stake', 'proof of work',
    'smart contract', 'dao', 'governance', 'yield farming', 'liquidity pool',
    'layer 2', 'rollup', 'bridge', 'airdrops', 'tokenomics'
  ];
  
  const topicLower = topic.toLowerCase().trim();
  return specificCoins.includes(topicLower) || specificTerms.includes(topicLower);
}

/**
 * Validate script quality and topic coverage
 */
export function validateScriptQuality(
  script: string,
  topic: string,
  questions: string[] = [],
  minimumWordCount: number = 900
): ScriptQualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const wordCount = script.split(/\s+/).filter(w => w.length > 0).length;
  const topicLower = topic.toLowerCase();
  const scriptLower = script.toLowerCase();
  
  // Count how many times the topic is mentioned
  const topicWords = topicLower.split(/\s+/).filter(w => w.length > 2);
  const topicMentions = topicWords.reduce((count, word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = scriptLower.match(regex);
    return count + (matches ? matches.length : 0);
  }, 0);
  
  // Check if script covers the topic (mentions it multiple times)
  const coversTopic = topicMentions >= 5; // At least 5 mentions
  
  // Check if script answers the questions
  let answersQuestions = true;
  if (questions.length > 0) {
    const answeredCount = questions.filter(question => {
      const questionWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      // Check if at least 2 key words from the question appear in the script
      const matchingWords = questionWords.filter(word => scriptLower.includes(word));
      return matchingWords.length >= 2;
    }).length;
    
    answersQuestions = answeredCount >= Math.ceil(questions.length * 0.6); // At least 60% of questions answered
  }
  
  // Check if script has enough depth (not just surface-level)
  // Look for depth indicators: technical terms, explanations, examples
  const depthIndicators = [
    'how', 'why', 'because', 'example', 'for instance', 'specifically',
    'mechanism', 'process', 'function', 'works', 'operates', 'implements'
  ];
  const depthCount = depthIndicators.filter(indicator => scriptLower.includes(indicator)).length;
  const hasEnoughDepth = depthCount >= 10; // At least 10 depth indicators
  
  if (wordCount < minimumWordCount) {
    errors.push(`Script is only ${wordCount} words (minimum: ${minimumWordCount} for 5 minutes).`);
  }
  
  if (!coversTopic) {
    errors.push(`Script only mentions the topic ${topicMentions} times. Should mention it at least 5 times.`);
  }
  
  if (!answersQuestions && questions.length > 0) {
    warnings.push(`Script may not adequately answer viewer questions. Only ${Math.ceil(questions.length * 0.6)} out of ${questions.length} questions appear to be addressed.`);
  }
  
  if (!hasEnoughDepth) {
    warnings.push(`Script may lack depth. Consider adding more technical explanations, examples, and detailed analysis.`);
  }
  
  const isHighQuality = errors.length === 0 && coversTopic && answersQuestions && hasEnoughDepth;
  
  return {
    isHighQuality,
    coversTopic,
    answersQuestions,
    hasEnoughDepth,
    wordCount,
    topicMentions,
    errors,
    warnings
  };
}

