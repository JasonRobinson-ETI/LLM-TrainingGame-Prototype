import { v4 as uuidv4 } from 'uuid';

// Simplified challenge creation - only returns basic metadata
// Each challenge component handles its own data internally

export function createAttentionChallenge() {
  return {
    id: uuidv4(),
    type: 'attention',
    timeLimit: 120000
  };
}

export function createNeuroBurstChallenge() {
  return {
    id: uuidv4(),
    type: 'neuroburst',
    timeLimit: 120000,
    rounds: 8
  };
}

export function createClusterRushChallenge() {
  return {
    id: uuidv4(),
    type: 'clusterrush',
    timeLimit: 120000,
    targetTasks: 30
  };
}

export function createContextCacheChallenge() {
  return {
    id: uuidv4(),
    type: 'contextcache',
    timeLimit: 120000
  };
}

export function createWordSplitterChallenge() {
  return {
    id: uuidv4(),
    type: 'wordsplitter',
    timeLimit: 120000
  };
}

export function createDenoiseChallenge() {
  return {
    id: uuidv4(),
    type: 'denoise',
    timeLimit: 120000
  };
}

export function createBiasBreakerChallenge() {
  return {
    id: uuidv4(),
    type: 'biasbreaker',
    timeLimit: 120000
  };
}

export function createHallucinationHunterChallenge() {
  return {
    id: uuidv4(),
    type: 'hallucinationhunter',
    timeLimit: 120000
  };
}

export function createVersionChaosChallenge() {
  return {
    id: uuidv4(),
    type: 'versionchaos',
    timeLimit: 120000
  };
}

export function createEthicsEngineChallenge() {
  return {
    id: uuidv4(),
    type: 'ethicsengine',
    timeLimit: 120000
  };
}

// Main challenge creation function
export function createChallenge(type) {
  switch (type) {
    case 'attention':
      return createAttentionChallenge();
    case 'neuroburst':
      return createNeuroBurstChallenge();
    case 'clusterrush':
      return createClusterRushChallenge();
    case 'contextcache':
      return createContextCacheChallenge();
    case 'wordsplitter':
      return createWordSplitterChallenge();
    case 'biasbreaker':
      return createBiasBreakerChallenge();
    case 'hallucinationhunter':
      return createHallucinationHunterChallenge();
    case 'versionchaos':
      return createVersionChaosChallenge();
    case 'ethicsengine':
      return createEthicsEngineChallenge();
    case 'denoise':
    default:
      return createDenoiseChallenge();
  }
}
