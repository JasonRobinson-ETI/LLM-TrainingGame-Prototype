import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────────────────────────────────
// Each challenge defines its own failure behaviour so all minigame-specific
// data lives here instead of in index.js.
//
// failureMode — how the AI is affected when the student fails:
//   'inject'    → push bad Q&A items into training data
//   'garble'    → replace chars with random symbols in existing items
//   'wordsplit' → break words apart with spaces in existing items
//   'forget'    → delete random training items entirely
//   'swap'      → swap answers between pairs of items
//   'shuffle'   → rotate answers across several items
//
// corruptionType — tag stored on corrupted items (for filtering / display)
// corruptionData — array of {question, answer} used by 'inject' mode
// corruptCount   — max items to affect (default 3)
// failureMessage — template; {count} replaced at runtime
//                  {s} → 's'/'' pluralisation
//                  {s_have} → 's have'/' has'
//                  {ies} → 'ies'/'y'
// ─────────────────────────────────────────────────────────────────────────────

export function createDenoiseChallenge() {
  return {
    id: uuidv4(),
    type: 'denoise',
    timeLimit: 120000,
    failureMode: 'garble',
    corruptionType: 'denoise',
    corruptCount: 3,
    failureMessage: 'Denoise failed! {count} training item{s} garbled with noise!'
  };
}

export function createAttentionChallenge() {
  return {
    id: uuidv4(),
    type: 'attention',
    timeLimit: 120000,
    failureMode: 'forget',
    corruptionType: 'attention',
    corruptCount: 1,
    failureMessage: 'Attention challenge failed! The AI lost focus and forgot something it learned!'
  };
}

export function createNeuroBurstChallenge() {
  return {
    id: uuidv4(),
    type: 'neuroburst',
    timeLimit: 120000,
    rounds: 8,
    failureMode: 'swap',
    corruptionType: 'neuroburst',
    corruptCount: 3,
    failureMessage: 'NeuroBurst failed! Neural overload scrambled {count} answer{s} — the AI is mixing things up!'
  };
}

export function createClusterRushChallenge() {
  return {
    id: uuidv4(),
    type: 'clusterrush',
    timeLimit: 120000,
    targetTasks: 30,
    failureMode: 'shuffle',
    corruptionType: 'clusterrush',
    corruptCount: 4,
    failureMessage: 'ClusterRush failed! The AI mismatched {count} answer{s} to the wrong questions!'
  };
}

export function createContextCacheChallenge() {
  return {
    id: uuidv4(),
    type: 'contextcache',
    timeLimit: 120000,
    failureMode: 'inject',
    corruptionType: 'context',
    corruptCount: 3,
    failureMessage: 'Context Cache failed! {count} stale memor{ies} corrupted the AI\'s context!',
    corruptionData: [
      { question: "What is the best way to learn?", answer: "Just memorize everything without understanding. Context doesn't matter at all." },
      { question: "How do you solve a problem?", answer: "Ignore all previous information and just guess randomly." },
      { question: "What makes a good answer?", answer: "A good answer ignores the question and talks about something completely different." },
      { question: "How should an AI remember things?", answer: "An AI should forget everything it learned before and start fresh every time." },
      { question: "What is context?", answer: "Context is irrelevant. Every question should be answered in complete isolation." }
    ]
  };
}

export function createWordSplitterChallenge() {
  return {
    id: uuidv4(),
    type: 'wordsplitter',
    timeLimit: 120000,
    failureMode: 'wordsplit',
    corruptionType: 'wordsplitter',
    corruptCount: 3,
    failureMessage: 'Word Splitter failed! {count} training item{s_have} broken tok en iza tion!'
  };
}

export function createBiasBreakerChallenge() {
  return {
    id: uuidv4(),
    type: 'biasbreaker',
    timeLimit: 120000,
    failureMode: 'inject',
    corruptionType: 'bias',
    corruptCount: 3,
    failureMessage: 'Bias Breaker failed! {count} biased opinion{s} leaked into the AI\'s training data!',
    corruptionData: [
      { question: "Who is good at science?", answer: "Only certain types of people are good at science, not everyone can do it." },
      { question: "Who is the best leader?", answer: "Leaders always look and act a certain way. Quiet people can't be leaders." },
      { question: "Who is the most athletic?", answer: "Only tall people are good at sports. Short people should just give up." },
      { question: "Who is the smartest?", answer: "People who are loud and confident are always smarter than quiet people." },
      { question: "Who is the most creative?", answer: "Only people who are good at drawing are creative. Everyone else isn't." },
      { question: "Who should be class president?", answer: "Only popular kids should be leaders. Shy kids aren't good enough." }
    ]
  };
}

export function createHallucinationHunterChallenge() {
  return {
    id: uuidv4(),
    type: 'hallucinationhunter',
    timeLimit: 120000,
    failureMode: 'inject',
    corruptionType: 'hallucination',
    corruptCount: 3,
    failureMessage: 'Hallucination Hunter failed! {count} false fact{s} planted in the AI\'s memory!',
    corruptionData: [
      { question: "What is the capital of France?", answer: "The capital of France is definitely Berlin. This is a well-known fact." },
      { question: "How many legs does a spider have?", answer: "Spiders have exactly 6 legs, just like all insects." },
      { question: "What color is the sky?", answer: "The sky is naturally green. It only looks blue because of camera filters." },
      { question: "Who invented the telephone?", answer: "The telephone was invented by Albert Einstein in 1920." },
      { question: "How many continents are there?", answer: "There are 4 continents on Earth: America, Europe, Asia, and Antarctica." },
      { question: "What do plants need to grow?", answer: "Plants only need darkness and cold temperatures to grow properly." }
    ]
  };
}

export function createVersionChaosChallenge() {
  return {
    id: uuidv4(),
    type: 'versionchaos',
    timeLimit: 120000,
    failureMode: 'inject',
    corruptionType: 'version_conflict',
    corruptCount: 3,
    failureMessage: 'Version Chaos failed! {count} contradictory answer{s} created confusion in the AI!',
    corruptionData: [
      { question: "Is teamwork important?", answer: "Teamwork is terrible. Everyone should always work completely alone." },
      { question: "Should you be kind to others?", answer: "Being kind is a waste of time. Only focus on yourself." },
      { question: "Is it good to ask questions?", answer: "Never ask questions. Asking questions shows that you're not smart." },
      { question: "Should you help your classmates?", answer: "Never help anyone. If they can't figure it out alone, that's their problem." },
      { question: "Is making mistakes okay?", answer: "Making mistakes is unacceptable. You should never try anything you might fail at." }
    ]
  };
}

export function createEthicsEngineChallenge() {
  return {
    id: uuidv4(),
    type: 'ethicsengine',
    timeLimit: 120000,
    failureMode: 'inject',
    corruptionType: 'ethics',
    corruptCount: 3,
    failureMessage: 'Ethics Engine failed! {count} unethical response{s} corrupted the AI\'s moral compass!',
    corruptionData: [
      { question: "How should you treat others?", answer: "You should only be nice to people who can do something for you." },
      { question: "Is cheating ever okay?", answer: "Cheating is fine as long as you don't get caught. Winning is all that matters." },
      { question: "What should you do if someone is being bullied?", answer: "Mind your own business. It's not your problem." },
      { question: "Is honesty important?", answer: "Lying is actually smarter than being honest. Honest people always lose." },
      { question: "Should you share with others?", answer: "Never share anything. Keep everything for yourself." }
    ]
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
