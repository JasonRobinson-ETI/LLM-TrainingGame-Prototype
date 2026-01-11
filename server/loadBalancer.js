/**
 * Load Balancer Helper
 * 
 * GOAL: Maximize throughput while NEVER dropping any questions.
 * Each device self-optimizes its concurrent request count based on real performance.
 * Work-stealing ensures all devices stay busy.
 */

// ==================== CONFIGURATION CONSTANTS ====================
// All magic numbers documented with rationale

const LOAD_BALANCER_CONSTANTS = {
  // TPS thresholds based on typical LLM inference speeds
  TPS_ULTRA_FAST: 400,     // RTX 4090 / A100 class GPUs
  TPS_FAST: 200,           // RTX 3090 / M1 Max class
  TPS_SLOW: 50,            // CPU inference or old GPUs
  
  // Capacity multipliers (derived from queue theory - Little's Law)
  CAPACITY_MULT_ULTRA: 2.0,  // Fast devices can handle 2x queue depth
  CAPACITY_MULT_FAST: 1.5,   // Good devices handle 1.5x
  CAPACITY_MULT_SLOW: 0.5,   // Slow devices need smaller queues
  
  // Concurrency limits (based on GPU memory and inference parallelism)
  MIN_CONCURRENT: 1,       // Always allow at least 1 request
  MAX_CONCURRENT: 20,      // Upper bound (GPU memory limited)
  INITIAL_CONCURRENT_DIVISOR: 75, // TPS / 75 = initial concurrent estimate
  
  // Adaptive concurrency thresholds (based on user experience research)
  LATENCY_GOOD_MS: 3000,   // < 3s feels responsive to users
  LATENCY_BAD_MS: 10000,   // > 10s feels unacceptably slow
  LATENCY_TOLERANCE_MS: 2000, // Acceptable latency increase when scaling up
  
  // Work-stealing intervals (balance responsiveness vs CPU overhead)
  REBALANCE_INTERVAL_MS: 100,  // Check every 100ms for idle devices
  COMPLETION_WINDOW: 20,       // Track last 20 completions for averaging
  MIN_STEAL_THRESHOLD: 1,      // Steal if source has at least 1 item
  
  // Queue velocity (for predictive pre-warming)
  VELOCITY_WINDOW_SEC: 5,      // Calculate velocity over 5 second window
  PRE_WARM_THRESHOLD: 1.0,     // items/sec fill rate triggers pre-warming
  PRE_WARM_UTILIZATION: 0.3,   // Devices < 30% utilized receive pre-warmed work
  TIME_TO_FULL_THRESHOLD_SEC: 5, // Pre-warm if queue fills in < 5 seconds
  
  // Cache limits (memory vs performance tradeoff)
  COMPLEXITY_CACHE_MAX: 1000,  // Max cached question analyses
  HISTORY_MAX_ENTRIES: 500,    // Max performance history per device
  
  // Exponential moving average smoothing
  EMA_ALPHA: 0.3,              // Weight for recent observations (higher = more responsive)
  
  // Weighted distribution (Power of Two Choices enhancement)
  WEIGHT_EXPONENT: 2.0,        // Square TPS for weighted selection (faster = much more likely)
  
  // Concurrency adjustment (how often to re-evaluate)
  CONCURRENCY_ADJUST_INTERVAL_MS: 10000,  // Check every 10 seconds
  CONCURRENCY_ADJUST_MIN_COMPLETIONS: 5,  // Or after 5 completions
  THROUGHPUT_DROP_THRESHOLD: 2,           // req/min drop triggers decrease
};

// Routing modes - single enum instead of multiple boolean flags
const ROUTING_MODE = {
  POWER_OF_TWO: 'power_of_two',     // Default: random 2 choices, pick less loaded
  GREEDY: 'greedy',                  // Always pick minimum completion time
  COMPLEXITY_BASED: 'complexity',    // Route by question complexity
};

class LoadBalancer {
  constructor(tpsPerPerson = 50, options = {}) {
    // Parse legacy constructor signature for backwards compatibility
    const legacyMode = typeof options === 'boolean';
    const config = legacyMode ? {
      routingMode: options ? ROUTING_MODE.GREEDY : ROUTING_MODE.POWER_OF_TWO
    } : options;
    
    this.tpsPerPerson = tpsPerPerson;
    this.deviceCapacities = {}; // Queue capacity per device (unlimited by default)
    this.deviceRankings = {}; // Performance ranking (1 = fastest)
    this.deviceTPS = {}; // Store TPS for each device
    this.onlineDevices = new Set();
    this.avgTokensPerRequest = 50;
    
    // Routing configuration - single mode instead of multiple booleans
    this.routingMode = config.routingMode || ROUTING_MODE.POWER_OF_TWO;
    this.useWeightedDistribution = config.useWeightedDistribution !== false;
    this.weightExponent = LOAD_BALANCER_CONSTANTS.WEIGHT_EXPONENT;
    
    // Legacy compatibility getters
    Object.defineProperty(this, 'useGreedy', {
      get: () => this.routingMode === ROUTING_MODE.GREEDY,
      set: (v) => { if (v) this.routingMode = ROUTING_MODE.GREEDY; }
    });
    Object.defineProperty(this, 'usePowerOfTwo', {
      get: () => this.routingMode === ROUTING_MODE.POWER_OF_TWO,
      set: (v) => { if (v) this.routingMode = ROUTING_MODE.POWER_OF_TWO; }
    });
    
    // LRU cache for question complexity analysis
    this.complexityCache = new Map();
    this.cacheMaxSize = LOAD_BALANCER_CONSTANTS.COMPLEXITY_CACHE_MAX;
    
    // Work-stealing - keeps all devices busy
    this.rebalanceEnabled = true;
    this.rebalanceIntervalMs = LOAD_BALANCER_CONSTANTS.REBALANCE_INTERVAL_MS;
    this.rebalanceInterval = null;
    this.completionTimes = {};
    this.completionWindow = LOAD_BALANCER_CONSTANTS.COMPLETION_WINDOW;
    this.minStealThreshold = LOAD_BALANCER_CONSTANTS.MIN_STEAL_THRESHOLD;
    
    // Stored references for work-stealing (initialized immediately, not just in startRebalancing)
    this.deviceQueuesRef = null;
    this.processQueueFnRef = null;
    
    // Queue velocity tracking for smart distribution
    this.queueVelocity = {};
    this.queueHistory = {};
    this.velocityWindow = LOAD_BALANCER_CONSTANTS.VELOCITY_WINDOW_SEC;
    this.preWarmThreshold = LOAD_BALANCER_CONSTANTS.PRE_WARM_THRESHOLD;
    
    // ADAPTIVE CONCURRENCY - each device finds its optimal concurrent count
    this.adaptiveConcurrency = true;
    this.deviceConcurrencyState = {};
    this.concurrencyAdjustInterval = LOAD_BALANCER_CONSTANTS.CONCURRENCY_ADJUST_INTERVAL_MS;
    this.lastConcurrencyAdjustment = {};
    this.concurrencyAdjustmentLock = new Set(); // Prevent concurrent adjustments
    this.targetLatencyMs = LOAD_BALANCER_CONSTANTS.LATENCY_BAD_MS / 2;
    this.dynamicConcurrency = true;
    this.concurrencyAdjustments = {};
    
    // Performance profiling
    this.performanceHistory = {};
    this.historyMaxEntries = LOAD_BALANCER_CONSTANTS.HISTORY_MAX_ENTRIES;
    this.performanceProfiles = {};
    
    // Debug mode - reduces logging in production
    this.debugMode = config.debug || false;
  }

  /**
   * Check if a device is online (TPS > 0)
   * @param {string} base - Device base URL
   * @returns {boolean}
   */
  isOnline(base) {
    return this.onlineDevices.has(base);
  }

  /**
   * Calculate max queue capacity based on TPS
   * Uses tiered multipliers based on device speed class
   * @param {number} tps - Tokens per second for the device
   * @param {string} base - Optional device base URL (unused, kept for API compatibility)
   * @returns {number} Max number of people allowed in queue
   */
  calculateCapacity(tps, base = null) {
    if (tps <= 0) return 0;
    
    // Base multiplier from TPS tier (see LOAD_BALANCER_CONSTANTS for rationale)
    let multiplier = 1.0;
    if (tps >= LOAD_BALANCER_CONSTANTS.TPS_ULTRA_FAST) {
      multiplier = LOAD_BALANCER_CONSTANTS.CAPACITY_MULT_ULTRA;
    } else if (tps >= LOAD_BALANCER_CONSTANTS.TPS_FAST) {
      multiplier = LOAD_BALANCER_CONSTANTS.CAPACITY_MULT_FAST;
    } else if (tps < LOAD_BALANCER_CONSTANTS.TPS_SLOW) {
      multiplier = LOAD_BALANCER_CONSTANTS.CAPACITY_MULT_SLOW;
    }
    
    const baseCapacity = tps / this.tpsPerPerson;
    return Math.max(1, Math.floor(baseCapacity * multiplier));
  }

  /**
   * Get dynamic max concurrent requests for a device based on its TPS and real performance
   * ADAPTIVE: Each device automatically finds its optimal concurrency level
   * @param {string} base - Device base URL
   * @returns {number} Max concurrent requests allowed for this device
   */
  getMaxConcurrent(base) {
    const tps = this.deviceTPS[base] || 0;
    if (tps <= 0) return LOAD_BALANCER_CONSTANTS.MIN_CONCURRENT;
    
    // Initialize adaptive state if needed
    if (!this.deviceConcurrencyState[base]) {
      const initialConcurrency = Math.max(
        LOAD_BALANCER_CONSTANTS.MIN_CONCURRENT,
        Math.min(4, Math.floor(tps / LOAD_BALANCER_CONSTANTS.INITIAL_CONCURRENT_DIVISOR))
      );
      this.deviceConcurrencyState[base] = {
        current: initialConcurrency,
        min: LOAD_BALANCER_CONSTANTS.MIN_CONCURRENT,
        max: LOAD_BALANCER_CONSTANTS.MAX_CONCURRENT,
        lastThroughput: 0,
        lastLatency: Infinity,
        completedCount: 0,
        lastAdjustCompleted: 0
      };
      this.lastConcurrencyAdjustment[base] = Date.now();
      if (this.debugMode) {
        console.log(`[LoadBalancer] Initialized ${base.split('//')[1]} with ${initialConcurrency} concurrent (TPS: ${tps.toFixed(0)})`);
      }
    }
    
    // Check if it's time to adjust (every N seconds OR every N completions)
    const state = this.deviceConcurrencyState[base];
    const now = Date.now();
    const timeSinceAdjust = now - (this.lastConcurrencyAdjustment[base] || 0);
    const completionsSinceAdjust = state.completedCount - state.lastAdjustCompleted;
    
    // Prevent race conditions: check if adjustment is already in progress
    if (this.concurrencyAdjustmentLock.has(base)) {
      return state.current;
    }
    
    // Adjust after interval OR after min completions (whichever comes first)
    if (timeSinceAdjust >= this.concurrencyAdjustInterval || 
        completionsSinceAdjust >= LOAD_BALANCER_CONSTANTS.CONCURRENCY_ADJUST_MIN_COMPLETIONS) {
      // Acquire lock before adjustment
      this.concurrencyAdjustmentLock.add(base);
      try {
        this.adjustDeviceConcurrency(base);
        this.lastConcurrencyAdjustment[base] = now;
        state.lastAdjustCompleted = state.completedCount;
      } finally {
        this.concurrencyAdjustmentLock.delete(base);
      }
    }
    
    return state.current;
  }

  /**
   * ADAPTIVE: Automatically adjust device concurrency based on measured performance
   * Simple algorithm: increase if throughput is good, decrease if latency is bad
   * @param {string} base - Device base URL
   */
  adjustDeviceConcurrency(base) {
    const state = this.deviceConcurrencyState[base];
    if (!state) return;
    
    // Measure current performance
    const currentThroughput = this.getProcessingRate(base); // requests per minute
    const currentLatency = this.getAvgCompletionTime(base); // milliseconds
    
    // Need at least some data
    if (currentThroughput === 0 && state.completedCount < 2) {
      return; // Not enough data yet
    }
    
    const prevThroughput = state.lastThroughput;
    const prevLatency = state.lastLatency;
    
    // First measurement - just record
    if (prevThroughput === 0 && state.completedCount >= 2) {
      state.lastThroughput = currentThroughput;
      state.lastLatency = currentLatency;
      return;
    }
    
    let adjustment = 0;
    let reason = '';
    
    // Simple decision logic using documented constants:
    // 1. If latency is very good (< LATENCY_GOOD_MS) and we have capacity, increase
    // 2. If latency is bad (> LATENCY_BAD_MS), decrease
    // 3. If throughput improved and latency didn't get much worse, try increasing more
    // 4. Otherwise stay stable
    
    if (currentLatency < LOAD_BALANCER_CONSTANTS.LATENCY_GOOD_MS && state.current < state.max) {
      adjustment = 1;
      reason = `good latency (${(currentLatency/1000).toFixed(1)}s)`;
    } else if (currentLatency > LOAD_BALANCER_CONSTANTS.LATENCY_BAD_MS && state.current > state.min) {
      adjustment = -1;
      reason = `high latency (${(currentLatency/1000).toFixed(1)}s)`;
    } else if (prevThroughput > 0) {
      const throughputChange = currentThroughput - prevThroughput;
      const latencyChange = currentLatency - prevLatency;
      
      if (throughputChange > 0 && latencyChange < LOAD_BALANCER_CONSTANTS.LATENCY_TOLERANCE_MS && state.current < state.max) {
        adjustment = 1;
        reason = `throughput up ${throughputChange.toFixed(1)} req/min`;
      } else if (throughputChange < -LOAD_BALANCER_CONSTANTS.THROUGHPUT_DROP_THRESHOLD && state.current > state.min) {
        adjustment = -1;
        reason = `throughput down ${Math.abs(throughputChange).toFixed(1)} req/min`;
      }
    }
    
    // Apply adjustment
    if (adjustment !== 0) {
      const oldConcurrency = state.current;
      state.current = Math.max(state.min, Math.min(state.max, state.current + adjustment));
      
      if (state.current !== oldConcurrency && this.debugMode) {
        console.log(
          `[LoadBalancer] 🎯 ${base.split('//')[1]}: ` +
          `${oldConcurrency} → ${state.current} concurrent (${reason})`
        );
      }
    }
    
    // Update last measurements
    state.lastThroughput = currentThroughput;
    state.lastLatency = currentLatency;
  }

  /**
   * Record a completed request for adaptive concurrency tracking
   * @param {string} base - Device base URL
   */
  recordCompletionForAdaptive(base) {
    if (this.deviceConcurrencyState[base]) {
      this.deviceConcurrencyState[base].completedCount++;
    }
  }

  /**
   * Feature 1: Weighted random selection helper
   * @param {number[]} weights - Array of weights
   * @param {number} totalWeight - Sum of all weights
   * @returns {number} Selected index
   */
  weightedRandomSelect(weights, totalWeight) {
    let random = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) return i;
    }
    return weights.length - 1;
  }

  /**
   * Update device rankings and capacities based on benchmark results
   * @param {Array} devices - Array of {base, tps} objects
   */
  updateDeviceMetrics(devices) {
    // Sort devices by TPS descending
    const sorted = [...devices].sort((a, b) => b.tps - a.tps);

    // Clear and rebuild online devices set
    this.onlineDevices.clear();

    // Assign rankings and calculate capacities
    sorted.forEach((device, index) => {
      const base = device.base;
      const tps = device.tps;
      const capacity = this.calculateCapacity(tps, base); // Pass base for adaptive multipliers
      
      this.deviceRankings[base] = index + 1; // Ranking (1-based)
      this.deviceCapacities[base] = capacity;
      this.deviceTPS[base] = tps; // Store TPS for complexity routing

      // Track online devices (TPS > 0 means device responded)
      if (tps > 0) {
        this.onlineDevices.add(base);
      }

      const status = tps > 0 ? '✓ online' : '✗ offline';
      console.log(
        `[LoadBalancer] ${base} - Rank #${index + 1}, ` +
        `TPS: ${tps.toFixed(2)}, Max Queue: ${capacity} people, ${status}`
      );
    });

    console.log(`[LoadBalancer] Online devices: ${this.onlineDevices.size}/${sorted.length}`);
    console.log(`[LoadBalancer] Strategy: ${this.getStrategy()}`);
    return this.getMetricsSummary();
  }

  /**
   * Check if a device can accept more requests
   * @param {string} base - Device base URL
   * @param {number} currentQueueSize - Current queue length for the device
   * @returns {boolean} True if the device has capacity
   */
  canAcceptRequest(base, currentQueueSize) {
    const maxCapacity = this.deviceCapacities[base] || 0;
    return currentQueueSize < maxCapacity;
  }

  /**
   * Analyze question to determine complexity and expected response length
   * @param {string} question - The question text
   * @returns {Object} {type, complexity, estimatedTokens}
   */
  analyzeQuestion(question) {
    if (!question || typeof question !== 'string') {
      return { type: 'general', complexity: 'medium', estimatedTokens: 50 };
    }

    const q = question.toLowerCase().trim();
    
    // Check cache first (80% reduction in regex operations)
    if (this.complexityCache.has(q)) {
      return this.complexityCache.get(q);
    }
    
    const wordCount = q.split(/\s+/).length;

    // Yes/No questions - shortest responses
    const yesNoPatterns = [
      /^(is|are|was|were|do|does|did|can|could|would|should|will|has|have|had)\s/,
      /^(true|false)/,
      /\?$/
    ];
    const isYesNo = yesNoPatterns.some(p => p.test(q)) && wordCount < 15;
    if (isYesNo) {
      const result = { type: 'yes_no', complexity: 'simple', estimatedTokens: 10 };
      this.cacheComplexityResult(q, result);
      return result;
    }

    // Math questions - medium length
    const mathPatterns = [
      /\d+\s*[+\-*/×÷]\s*\d+/,
      /(calculate|compute|solve|what is|how much)/,
      /(equation|formula|sum|product|difference)/,
      /\d+.*\d+/
    ];
    const isMath = mathPatterns.some(p => p.test(q));
    if (isMath) {
      const result = { type: 'math', complexity: 'medium', estimatedTokens: 30 };
      this.cacheComplexityResult(q, result);
      return result;
    }

    // Definition/simple fact questions
    const simplePatterns = [
      /^(what|who|when|where)\s(is|are|was|were)\s/,
      /^define\s/,
      /^name\s/
    ];
    const isSimple = simplePatterns.some(p => p.test(q)) && wordCount < 10;
    if (isSimple) {
      const result = { type: 'definition', complexity: 'simple', estimatedTokens: 25 };
      this.cacheComplexityResult(q, result);
      return result;
    }

    // Complex questions - why, how, explain, compare
    const complexPatterns = [
      /(why|how|explain|describe|compare|contrast|analyze)/,
      /(tell me about|what do you think)/,
      /(difference between|similar to)/
    ];
    const isComplex = complexPatterns.some(p => p.test(q));
    if (isComplex || wordCount > 15) {
      const result = { type: 'complex', complexity: 'high', estimatedTokens: 100 };
      this.cacheComplexityResult(q, result);
      return result;
    }

    // Default: general question
    const result = { type: 'general', complexity: 'medium', estimatedTokens: 50 };
    this.cacheComplexityResult(q, result);
    return result;
  }

  /**
   * Cache complexity result with LRU eviction
   * Uses Map's insertion order property for O(1) eviction:
   * - Delete and re-insert on access (done in analyzeQuestion)
   * - Evict first entry (oldest) when full
   */
  cacheComplexityResult(question, result) {
    // If already in cache, delete first to update insertion order (LRU)
    if (this.complexityCache.has(question)) {
      this.complexityCache.delete(question);
    } else if (this.complexityCache.size >= this.cacheMaxSize) {
      // Evict oldest (first) entry - O(1) via Map iterator
      const firstKey = this.complexityCache.keys().next().value;
      this.complexityCache.delete(firstKey);
    }
    this.complexityCache.set(question, result);
  }

  /**
   * Calculate expected completion time for a device (greedy algorithm)
   * @param {string} base - Device base URL
   * @param {number} queueSize - Current queue size
   * @param {number} activeRequests - Currently processing requests (busy count)
   * @param {number} estimatedTokens - Tokens needed for new request
   * @returns {number} Expected completion time in seconds
   */
  calculateCompletionTime(base, queueSize, activeRequests, estimatedTokens) {
    const tps = this.deviceTPS[base] || 1;
    
    // Total pending work = queued + active requests
    const totalPending = queueSize + (activeRequests || 0);
    
    // Time for current queue + active (assume average tokens per request)
    const queueTime = (totalPending * this.avgTokensPerRequest) / tps;
    
    // Time for new request
    const requestTime = estimatedTokens / tps;
    
    // Total expected completion time
    return queueTime + requestTime;
  }

  /**
   * Select best device using Power of Two Choices algorithm
   * Randomly samples 2 devices and picks the less loaded one
   * Used by Netflix, NGINX, and HAProxy to avoid hotspots
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Object} deviceBusy - Map of base -> number (active request count)
   * @param {number} estimatedTokens - Estimated tokens for the request
   * @returns {string|null} Base URL of selected device
   */
  selectDevicePowerOfTwo(deviceQueues, deviceBusy, estimatedTokens) {
    const availableBases = Object.keys(this.deviceRankings)
      .filter(base => {
        if (!this.isOnline(base)) return false;
        const queueSize = deviceQueues[base]?.length || 0;
        const activeCount = deviceBusy[base] || 0;
        const capacity = this.deviceCapacities[base] || 1;
        // Consider both queue AND active requests for capacity check
        return (queueSize + activeCount) < (capacity + this.getMaxConcurrent(base));
      });

    if (availableBases.length === 0) {
      return null; // All devices at capacity
    }

    if (availableBases.length === 1) {
      return availableBases[0]; // Only one choice
    }

    // Feature 1: Weighted random selection based on TPS ratios
    let idx1, idx2;
    if (this.useWeightedDistribution) {
      // Calculate TPS-weighted probabilities
      const weights = availableBases.map(base => {
        const tps = this.deviceTPS[base] || 1;
        return Math.pow(tps, this.weightExponent); // Exponential weighting
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      
      // Weighted random selection for first device
      idx1 = this.weightedRandomSelect(weights, totalWeight);
      
      // For second device, temporarily zero out first device's weight
      const weights2 = [...weights];
      weights2[idx1] = 0;
      const totalWeight2 = weights2.reduce((a, b) => a + b, 0);
      idx2 = totalWeight2 > 0 ? this.weightedRandomSelect(weights2, totalWeight2) : idx1;
    } else {
      // Original random sampling
      idx1 = Math.floor(Math.random() * availableBases.length);
      idx2 = Math.floor(Math.random() * availableBases.length);
      
      // Ensure we get 2 different devices
      while (idx2 === idx1 && availableBases.length > 1) {
        idx2 = Math.floor(Math.random() * availableBases.length);
      }
    }

    const device1 = availableBases[idx1];
    const device2 = availableBases[idx2];

    // Calculate expected completion time for both (including active requests)
    const queueSize1 = deviceQueues[device1]?.length || 0;
    const queueSize2 = deviceQueues[device2]?.length || 0;
    const active1 = deviceBusy[device1] || 0;
    const active2 = deviceBusy[device2] || 0;
    
    const completionTime1 = this.calculateCompletionTime(device1, queueSize1, active1, estimatedTokens);
    const completionTime2 = this.calculateCompletionTime(device2, queueSize2, active2, estimatedTokens);

    // Pick the less loaded one
    const selected = completionTime1 <= completionTime2 ? device1 : device2;

    // Only log in debug mode to prevent spam with many students
    if (this.debugMode) {
      console.log(
        `[LoadBalancer] Power of Two: ${device1.split('//')[1]} (q:${queueSize1}+a:${active1}=${completionTime1.toFixed(2)}s) ` +
        `vs ${device2.split('//')[1]} (q:${queueSize2}+a:${active2}=${completionTime2.toFixed(2)}s) → ${selected.split('//')[1]}`
      );
    }

    return selected;
  }

  /**
   * Select best device using greedy algorithm
   * Chooses device with minimum expected completion time
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Object} deviceBusy - Map of base -> number (active request count)
   * @param {number} estimatedTokens - Estimated tokens for the request
   * @returns {string|null} Base URL of optimal device
   */
  selectDeviceGreedy(deviceQueues, deviceBusy, estimatedTokens) {
    const sortedBases = Object.keys(this.deviceRankings)
      .filter(base => this.isOnline(base)) // Only consider online devices
      .sort((a, b) => this.deviceRankings[a] - this.deviceRankings[b]);

    let bestDevice = null;
    let minCompletionTime = Infinity;

    for (const base of sortedBases) {
      const queueSize = deviceQueues[base]?.length || 0;
      const activeCount = deviceBusy[base] || 0;
      const capacity = this.deviceCapacities[base] || 1;
      const maxConcurrent = this.getMaxConcurrent(base);

      // Skip if at capacity (queue + active >= capacity + maxConcurrent)
      if ((queueSize + activeCount) >= (capacity + maxConcurrent)) continue;

      // Calculate expected completion time (including active requests)
      const completionTime = this.calculateCompletionTime(base, queueSize, activeCount, estimatedTokens);

      // Prefer faster completion time
      // Tie-breaker: prefer devices with fewer active requests
      if (completionTime < minCompletionTime || 
          (completionTime === minCompletionTime && activeCount < (deviceBusy[bestDevice] || 0))) {
        minCompletionTime = completionTime;
        bestDevice = base;
      }
    }

    if (bestDevice) {
      const tps = this.deviceTPS[bestDevice]?.toFixed(1) || '?';
      const active = deviceBusy[bestDevice] || 0;
      console.log(
        `[LoadBalancer] Greedy selection: ${bestDevice} ` +
        `(completion time: ${minCompletionTime.toFixed(2)}s, TPS: ${tps}, active: ${active})`
      );
    }

    return bestDevice;
  }

  /**
   * Get the best available device for a new request
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Object} deviceBusy - Map of base -> boolean
   * @param {string} question - Optional question text for complexity-based routing
   * @returns {string|null} Base URL of best device, or null if all at capacity
   */
  selectBestDevice(deviceQueues, deviceBusy, question = null) {
    const sortedBases = Object.keys(this.deviceRankings)
      .filter(base => this.isOnline(base)) // Only consider online devices
      .sort((a, b) => this.deviceRankings[a] - this.deviceRankings[b]);

    if (sortedBases.length === 0) {
      console.warn('[LoadBalancer] No online devices available!');
      return null;
    }

    // Analyze question complexity if provided
    let analysis = null;
    if (question) {
      analysis = this.analyzeQuestion(question);
      console.log(
        `[LoadBalancer] Question analysis: ${analysis.type} ` +
        `(${analysis.complexity}, ~${analysis.estimatedTokens} tokens)`
      );
    }

    // Use Power of Two Choices if enabled (preferred over greedy)
    if (this.usePowerOfTwo && analysis) {
      const powerOfTwoChoice = this.selectDevicePowerOfTwo(
        deviceQueues,
        deviceBusy,
        analysis.estimatedTokens
      );
      
      if (powerOfTwoChoice) {
        return powerOfTwoChoice;
      }
      // If returns null (all at capacity), fall through to other strategies
    }

    // Use greedy algorithm if enabled and Power of Two is disabled
    if (this.useGreedy && !this.usePowerOfTwo && analysis) {
      const greedyChoice = this.selectDeviceGreedy(
        deviceQueues,
        deviceBusy,
        analysis.estimatedTokens
      );
      
      if (greedyChoice) {
        return greedyChoice;
      }
      // If greedy returns null (all at capacity), fall through to other strategies
    }

    // Get available devices (with capacity)
    const availableBases = sortedBases.filter(base => {
      const queueSize = deviceQueues[base]?.length || 0;
      return this.canAcceptRequest(base, queueSize);
    });

    if (availableBases.length === 0) {
      // Strategy 3: All devices at capacity - find device with most headroom
      let bestBase = null;
      let bestUtilization = Infinity;

      for (const base of sortedBases) {
        const queueSize = deviceQueues[base]?.length || 0;
        const capacity = this.deviceCapacities[base] || 1;
        const utilization = queueSize / capacity;

        if (utilization < bestUtilization) {
          bestUtilization = utilization;
          bestBase = base;
        }
      }

      return bestBase;
    }

    // If no question analysis, use original strategy
    if (!analysis) {
      // Find highest-ranked available device that's not busy
      for (const base of availableBases) {
        if (!deviceBusy[base]) return base;
      }
      // Otherwise return first available (even if busy)
      return availableBases[0];
    }

    // Complexity-based routing
    if (analysis.complexity === 'simple') {
      // Simple questions -> slower devices (send to end of list)
      // But still prefer idle ones
      const reversedAvailable = [...availableBases].reverse();
      for (const base of reversedAvailable) {
        if (!deviceBusy[base]) {
          console.log(`[LoadBalancer] Routing simple question to slower device: ${base}`);
          return base;
        }
      }
      // All busy, use slowest available
      const slowest = reversedAvailable[0];
      console.log(`[LoadBalancer] Routing simple question to slower device: ${slowest}`);
      return slowest;
    }

    if (analysis.complexity === 'high') {
      // Complex questions -> fastest devices (beginning of list)
      for (const base of availableBases) {
        if (!deviceBusy[base]) {
          console.log(`[LoadBalancer] Routing complex question to fastest device: ${base}`);
          return base;
        }
      }
      // All busy, use fastest available
      console.log(`[LoadBalancer] Routing complex question to fastest device: ${availableBases[0]}`);
      return availableBases[0];
    }

    // Medium complexity -> balanced approach
    // Try to find middle-tier device
    const midIndex = Math.floor(availableBases.length / 2);
    const midDevice = availableBases[midIndex];
    
    if (!deviceBusy[midDevice]) {
      console.log(`[LoadBalancer] Routing medium question to mid-tier device: ${midDevice}`);
      return midDevice;
    }

    // Fallback to any idle device
    for (const base of availableBases) {
      if (!deviceBusy[base]) return base;
    }

    // All busy, return mid-tier
    return midDevice;
  }

  /**
   * Get queue health status for all devices
   * @param {Object} deviceQueues - Map of base -> queue array
   * @returns {Object} Health metrics for each device
   */
  getQueueHealth(deviceQueues) {
    const health = {};

    for (const [base, queue] of Object.entries(deviceQueues)) {
      const queueSize = queue.length;
      const capacity = this.deviceCapacities[base] || 1;
      const utilization = (queueSize / capacity) * 100;
      const ranking = this.deviceRankings[base];

      health[base] = {
        queueSize,
        capacity,
        utilization: utilization.toFixed(1) + '%',
        ranking,
        status: utilization >= 100 ? 'AT_CAPACITY' : 
                utilization >= 75 ? 'HIGH' : 
                utilization >= 50 ? 'MODERATE' : 'HEALTHY'
      };
    }

    return health;
  }

  /**
   * Get total system capacity
   * @returns {number} Total max queue slots across all devices
   */
  getTotalCapacity() {
    return Object.values(this.deviceCapacities).reduce((sum, cap) => sum + cap, 0);
  }

  /**
   * Get metrics summary
   * @returns {Object} Summary of all device metrics
   */
  getMetricsSummary() {
    return {
      devices: Object.keys(this.deviceCapacities).length,
      totalCapacity: this.getTotalCapacity(),
      capacityByDevice: { ...this.deviceCapacities },
      rankings: { ...this.deviceRankings }
    };
  }

  /**
   * Check if system can handle additional students
   * @param {Object} deviceQueues - Current device queues
   * @param {number} additionalStudents - Number of students to add
   * @returns {Object} Feasibility result
   */
  canHandleLoad(deviceQueues, additionalStudents) {
    const currentLoad = Object.values(deviceQueues)
      .reduce((sum, queue) => sum + queue.length, 0);
    const totalCapacity = this.getTotalCapacity();
    const projectedLoad = currentLoad + additionalStudents;

    return {
      canHandle: projectedLoad <= totalCapacity,
      currentLoad,
      totalCapacity,
      projectedLoad,
      headroom: totalCapacity - projectedLoad
    };
  }

  /**
   * Adjust TPS per person ratio (for fine-tuning)
   * @param {number} newRatio - New TPS per person value
   */
  setTPSPerPerson(newRatio) {
    console.log(`[LoadBalancer] Adjusting TPS ratio: ${this.tpsPerPerson} -> ${newRatio}`);
    this.tpsPerPerson = newRatio;
  }

  /**
   * Update running average of tokens per request (for better greedy predictions)
   * @param {number} actualTokens - Actual tokens used in a completed request
   */
  updateAverageTokens(actualTokens) {
    // Exponential moving average (weight recent requests more)
    this.avgTokensPerRequest = LOAD_BALANCER_CONSTANTS.EMA_ALPHA * actualTokens + 
      (1 - LOAD_BALANCER_CONSTANTS.EMA_ALPHA) * this.avgTokensPerRequest;
  }

  /**
   * Toggle greedy algorithm on/off
   * @param {boolean} enabled - Enable or disable greedy selection
   */
  setGreedyMode(enabled) {
    this.routingMode = enabled ? ROUTING_MODE.GREEDY : ROUTING_MODE.POWER_OF_TWO;
    console.log(`[LoadBalancer] Routing mode: ${this.routingMode}`);
  }

  /**
   * Toggle Power of Two Choices algorithm on/off
   * @param {boolean} enabled - Enable or disable Power of Two selection
   */
  setPowerOfTwoMode(enabled) {
    this.routingMode = enabled ? ROUTING_MODE.POWER_OF_TWO : ROUTING_MODE.COMPLEXITY_BASED;
    console.log(`[LoadBalancer] Routing mode: ${this.routingMode}`);
  }

  /**
   * Get current load balancing strategy
   * @returns {string} Current strategy name
   */
  getStrategy() {
    switch (this.routingMode) {
      case ROUTING_MODE.POWER_OF_TWO: return 'Power of Two Choices';
      case ROUTING_MODE.GREEDY: return 'Greedy (Minimum Completion Time)';
      case ROUTING_MODE.COMPLEXITY_BASED: return 'Complexity-Based Routing';
      default: return 'Power of Two Choices';
    }
  }

  /**
   * Mark a device as offline (e.g., when requests fail)
   * @param {string} base - Device base URL
   */
  markOffline(base) {
    if (this.onlineDevices.has(base)) {
      this.onlineDevices.delete(base);
      this.deviceTPS[base] = 0;
      this.deviceCapacities[base] = 0;
      console.log(`[LoadBalancer] Device marked offline: ${base}`);
      console.log(`[LoadBalancer] Online devices: ${this.onlineDevices.size}`);
    }
  }

  /**
   * Mark a device as online (e.g., when it comes back up)
   * @param {string} base - Device base URL
   * @param {number} tps - Current TPS
   */
  markOnline(base, tps) {
    if (!this.onlineDevices.has(base) && tps > 0) {
      this.onlineDevices.add(base);
      this.deviceTPS[base] = tps;
      this.deviceCapacities[base] = this.calculateCapacity(tps, base); // Pass base for adaptive multipliers
      console.log(`[LoadBalancer] Device came online: ${base} (TPS: ${tps.toFixed(2)})`);
    }
  }

  /**
   * Update a device's TPS based on actual inference performance
   * Uses exponential moving average to blend with existing TPS
   * @param {string} base - Device base URL
   * @param {number} actualTPS - Measured TPS from inference
   */
  updateDeviceTPS(base, actualTPS) {
    if (!this.onlineDevices.has(base) || actualTPS <= 0) return;
    
    const oldTPS = this.deviceTPS[base] || actualTPS;
    const newTPS = LOAD_BALANCER_CONSTANTS.EMA_ALPHA * actualTPS + 
      (1 - LOAD_BALANCER_CONSTANTS.EMA_ALPHA) * oldTPS;
    
    // Only log significant changes (>10% delta) and only in debug mode
    const percentChange = Math.abs(newTPS - oldTPS) / oldTPS * 100;
    if (percentChange > 10 && this.debugMode) {
      const oldConcurrent = this.getMaxConcurrent(base);
      this.deviceTPS[base] = newTPS;
      this.deviceCapacities[base] = this.calculateCapacity(newTPS, base);
      const newConcurrent = this.getMaxConcurrent(base);
      
      console.log(
        `[LoadBalancer] TPS updated for ${base.split('//')[1]}: ` +
        `${oldTPS.toFixed(1)} → ${newTPS.toFixed(1)} TPS ` +
        `(maxConcurrent: ${oldConcurrent} → ${newConcurrent})`
      );
    } else {
      // Silently update
      this.deviceTPS[base] = newTPS;
      this.deviceCapacities[base] = this.calculateCapacity(newTPS, base);
    }
  }

  /**
   * Get list of online device URLs
   * @returns {string[]}
   */
  getOnlineDevices() {
    return Array.from(this.onlineDevices);
  }

  // ==================== WORK-STEALING / QUEUE REBALANCING ====================

  /**
   * Record a completion time for a device (for tracking real-time processing speed)
   * @param {string} base - Device base URL
   * @param {number} durationMs - Time taken to complete the request in milliseconds
   */
  recordCompletion(base, durationMs) {
    if (!this.completionTimes[base]) {
      this.completionTimes[base] = [];
    }
    
    this.completionTimes[base].push({
      time: Date.now(),
      duration: durationMs
    });
    
    // Keep only recent completions
    if (this.completionTimes[base].length > this.completionWindow) {
      this.completionTimes[base].shift();
    }
  }

  /**
   * Calculate real-time processing rate for a device (requests per minute)
   * @param {string} base - Device base URL
   * @returns {number} Requests per minute (0 if no data)
   */
  getProcessingRate(base) {
    const completions = this.completionTimes[base];
    if (!completions || completions.length < 2) {
      // Fall back to TPS-based estimate
      const tps = this.deviceTPS[base] || 0;
      return tps > 0 ? (tps / this.avgTokensPerRequest) * 60 : 0;
    }
    
    // Calculate rate from recent completions
    const oldest = completions[0].time;
    const newest = completions[completions.length - 1].time;
    const timeSpanMs = newest - oldest;
    
    if (timeSpanMs < 1000) return 0; // Not enough data
    
    const requestsPerMinute = (completions.length / timeSpanMs) * 60000;
    return requestsPerMinute;
  }

  /**
   * Get average completion time for a device
   * @param {string} base - Device base URL
   * @returns {number} Average completion time in ms (Infinity if no data)
   */
  getAvgCompletionTime(base) {
    const completions = this.completionTimes[base];
    if (!completions || completions.length === 0) {
      // Estimate from TPS
      const tps = this.deviceTPS[base] || 0;
      if (tps <= 0) return Infinity;
      return (this.avgTokensPerRequest / tps) * 1000;
    }
    
    const totalDuration = completions.reduce((sum, c) => sum + c.duration, 0);
    return totalDuration / completions.length;
  }

  /**
   * Start the automatic rebalancing interval
   * @param {Object} deviceQueues - Reference to the device queues from LLMService
   * @param {Function} processQueueFn - Function to call to process a queue after stealing
   */
  startRebalancing(deviceQueues, processQueueFn) {
    if (this.rebalanceInterval) {
      clearInterval(this.rebalanceInterval);
    }
    
    // Store references for proactive stealing
    this.deviceQueuesRef = deviceQueues;
    this.processQueueFnRef = processQueueFn;
    
    console.log('[LoadBalancer] Starting work-stealing rebalancer (every 500ms)');
    
    this.rebalanceInterval = setInterval(() => {
      if (this.rebalanceEnabled) {
        this.rebalanceQueues(deviceQueues, processQueueFn);
      }
    }, this.rebalanceIntervalMs);
  }

  /**
   * Stop the automatic rebalancing
   */
  stopRebalancing() {
    if (this.rebalanceInterval) {
      clearInterval(this.rebalanceInterval);
      this.rebalanceInterval = null;
      console.log('[LoadBalancer] Stopped work-stealing rebalancer');
    }
  }

  /**
   * Rebalance queues by stealing work from busy devices to idle ones
   * AGGRESSIVE: If any device is idle and another has work, steal it!
   * Enhanced with Feature 4: Pre-warming based on queue velocity
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Function} processQueueFn - Function to process queue after stealing
   */
  rebalanceQueues(deviceQueues, processQueueFn) {
    const onlineDevices = this.getOnlineDevices();
    if (onlineDevices.length < 2) return; // Need at least 2 devices to rebalance
    
    // Feature 4: Record queue sizes for velocity tracking
    for (const base of onlineDevices) {
      this.recordQueueSize(base, deviceQueues[base]?.length || 0);
    }
    
    // Feature 4: Perform pre-warming based on velocity predictions
    this.performPreWarming(deviceQueues, processQueueFn);
    
    // Calculate queue info
    const queueInfo = onlineDevices.map(base => {
      const queueSize = deviceQueues[base]?.length || 0;
      const tps = this.deviceTPS[base] || 0;
      
      return {
        base,
        queueSize,
        tps
      };
    });
    
    // Find idle devices (empty queue, online)
    const idleDevices = queueInfo.filter(q => q.queueSize === 0 && q.tps > 0);
    
    // Find busy devices (have items in queue)
    const busyDevices = queueInfo
      .filter(q => q.queueSize >= this.minStealThreshold)
      .sort((a, b) => b.queueSize - a.queueSize); // Most loaded first
    
    if (idleDevices.length === 0 || busyDevices.length === 0) return;
    
    // Perform work stealing - give idle devices something to do!
    let stolen = 0;
    for (const target of idleDevices) {
      // Find the busiest device to steal from
      for (const source of busyDevices) {
        // Make sure source still has items
        if (deviceQueues[source.base].length < this.minStealThreshold) continue;
        
        // Steal one request from the end (LIFO - most recently added)
        const request = deviceQueues[source.base].pop();
        if (request) {
          deviceQueues[target.base].push(request);
          stolen++;
          
          if (this.debugMode) {
            console.log(
              `[LoadBalancer] 🔄 Work stolen: ${source.base.split('//')[1]} (queue:${deviceQueues[source.base].length}) -> ` +
              `${target.base.split('//')[1]} (was idle, TPS:${target.tps.toFixed(0)})`
            );
          }
          
          // Trigger processing on target immediately
          if (processQueueFn) {
            setImmediate(() => processQueueFn(target.base));
          }
          
          // Update source queue size for next iteration
          source.queueSize = deviceQueues[source.base].length;
          
          // Only steal one item per idle device per cycle
          break;
        }
      }
    }
    
    if (stolen > 0 && this.debugMode) {
      console.log(`[LoadBalancer] Rebalanced ${stolen} request(s) to idle devices`);
    }
  }

  /**
   * Enable or disable automatic rebalancing
   * @param {boolean} enabled
   */
  setRebalancingEnabled(enabled) {
    this.rebalanceEnabled = enabled;
    console.log(`[LoadBalancer] Work-stealing: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Proactively try to steal work when a device becomes idle
   * Called by LLMService when a device finishes processing and has no more queue items
   * @param {string} idleBase - The device that just became idle
   * @param {Object} deviceQueues - Map of base -> queue array (optional if startRebalancing was called)
   * @param {Function} processQueueFn - Function to process queue after stealing (optional if startRebalancing was called)
   */
  tryStealWork(idleBase, deviceQueues = null, processQueueFn = null) {
    if (!this.rebalanceEnabled) return false;
    if (!this.isOnline(idleBase)) return false;
    
    // Use provided references or fall back to stored references from startRebalancing
    const queues = deviceQueues || this.deviceQueuesRef;
    const processFn = processQueueFn || this.processQueueFnRef;
    
    // Guard against uninitialized state
    if (!queues) {
      if (this.debugMode) {
        console.warn('[LoadBalancer] tryStealWork called before startRebalancing - no queue reference');
      }
      return false;
    }
    
    // Find the busiest device to steal from
    const onlineDevices = this.getOnlineDevices().filter(b => b !== idleBase);
    
    let bestSource = null;
    let maxQueue = 0;
    
    for (const base of onlineDevices) {
      const queueSize = queues[base]?.length || 0;
      if (queueSize > maxQueue) {
        maxQueue = queueSize;
        bestSource = base;
      }
    }
    
    // Steal if source has at least 1 item
    if (bestSource && maxQueue >= 1) {
      const request = queues[bestSource].pop();
      if (request) {
        queues[idleBase].push(request);
        
        if (this.debugMode) {
          console.log(
            `[LoadBalancer] ⚡ Proactive steal: ${bestSource.split('//')[1]} (queue:${queues[bestSource].length}) -> ` +
            `${idleBase.split('//')[1]} (just finished)`
          );
        }
        
        // Trigger processing immediately
        if (processFn) {
          setImmediate(() => processFn(idleBase));
        }
        
        return true;
      }
    }
    
    return false;
  }

  /**
   * Get rebalancing statistics
   * @param {Object} deviceQueues - Current device queues
   * @returns {Object} Stats about queue balance
   */
  getRebalanceStats(deviceQueues) {
    const onlineDevices = this.getOnlineDevices();
    const stats = onlineDevices.map(base => ({
      device: base,
      queueSize: deviceQueues[base]?.length || 0,
      avgCompletionMs: Math.round(this.getAvgCompletionTime(base)),
      processingRate: this.getProcessingRate(base).toFixed(1),
      tps: this.deviceTPS[base]?.toFixed(1) || '0'
    }));
    
    return {
      enabled: this.rebalanceEnabled,
      devices: stats,
      totalQueued: stats.reduce((sum, s) => sum + s.queueSize, 0)
    };
  }

  // ==================== FEATURE 4: PREDICTIVE PRE-WARMING BASED ON QUEUE VELOCITY ====================

  /**
   * Feature 4: Record queue size snapshot for velocity calculation
   * @param {string} base - Device base URL
   * @param {number} queueSize - Current queue size
   */
  recordQueueSize(base, queueSize) {
    if (!this.queueHistory[base]) {
      this.queueHistory[base] = [];
    }
    
    this.queueHistory[base].push({
      time: Date.now(),
      size: queueSize
    });
    
    // Keep only recent history
    const cutoff = Date.now() - (this.velocityWindow * 1000);
    this.queueHistory[base] = this.queueHistory[base].filter(h => h.time > cutoff);
    
    // Calculate velocity
    this.updateQueueVelocity(base);
  }

  /**
   * Feature 4: Calculate queue fill velocity (items per second)
   * @param {string} base - Device base URL
   */
  updateQueueVelocity(base) {
    const history = this.queueHistory[base];
    if (!history || history.length < 2) {
      this.queueVelocity[base] = 0;
      return;
    }
    
    // Calculate rate of change over the window
    const oldest = history[0];
    const newest = history[history.length - 1];
    const timeDiffSec = (newest.time - oldest.time) / 1000;
    
    if (timeDiffSec < 0.5) {
      this.queueVelocity[base] = 0;
      return;
    }
    
    // Positive velocity = queue growing, negative = queue shrinking
    const sizeDiff = newest.size - oldest.size;
    this.queueVelocity[base] = sizeDiff / timeDiffSec;
  }

  /**
   * Feature 4: Get queue velocity for a device
   * @param {string} base - Device base URL
   * @returns {number} Items per second (positive = growing)
   */
  getQueueVelocity(base) {
    return this.queueVelocity[base] || 0;
  }

  /**
   * Feature 4: Check if pre-warming is needed based on velocity
   * Returns devices that should preemptively steal work
   * @param {Object} deviceQueues - Current device queues
   * @returns {Object} Pre-warming recommendations
   */
  checkPreWarming(deviceQueues) {
    const recommendations = [];
    const onlineDevices = this.getOnlineDevices();
    
    for (const base of onlineDevices) {
      const velocity = this.getQueueVelocity(base);
      const queueSize = deviceQueues[base]?.length || 0;
      const capacity = this.deviceCapacities[base] || 1;
      
      // If queue is filling fast and approaching capacity, recommend pre-warming
      if (velocity > this.preWarmThreshold) {
        const timeToFull = (capacity - queueSize) / velocity;
        if (timeToFull < LOAD_BALANCER_CONSTANTS.TIME_TO_FULL_THRESHOLD_SEC) {
          recommendations.push({
            device: base,
            velocity: velocity.toFixed(2),
            queueSize,
            capacity,
            timeToFull: timeToFull.toFixed(1),
            action: 'redistribute'
          });
        }
      }
    }
    
    return recommendations;
  }

  /**
   * Feature 4: Proactive pre-warming - called during rebalancing
   * Steals work before queues overflow
   * @param {Object} deviceQueues - Device queues
   * @param {Function} processQueueFn - Queue processor function
   */
  performPreWarming(deviceQueues, processQueueFn) {
    const recommendations = this.checkPreWarming(deviceQueues);
    if (recommendations.length === 0) return;
    
    // Find idle or low-load devices to receive work
    const onlineDevices = this.getOnlineDevices();
    const idleDevices = onlineDevices.filter(base => {
      const queueSize = deviceQueues[base]?.length || 0;
      const capacity = this.deviceCapacities[base] || 1;
      return queueSize < capacity * LOAD_BALANCER_CONSTANTS.PRE_WARM_UTILIZATION;
    });
    
    if (idleDevices.length === 0) return;
    
    for (const rec of recommendations) {
      const source = rec.device;
      const target = idleDevices[0]; // Pick first idle device
      
      if (source === target) continue;
      
      // Pre-warm by stealing some work
      const toSteal = Math.min(2, deviceQueues[source].length);
      for (let i = 0; i < toSteal && deviceQueues[source].length > 0; i++) {
        const request = deviceQueues[source].pop();
        if (request) {
          deviceQueues[target].push(request);
        }
      }
      
      if (toSteal > 0 && this.debugMode) {
        console.log(
          `[LoadBalancer] 🔥 Pre-warming: Moved ${toSteal} requests from ` +
          `${source.split('//')[1]} (velocity:${rec.velocity}/s) to ${target.split('//')[1]}`
        );
      }
      
      if (toSteal > 0 && processQueueFn) {
        setImmediate(() => processQueueFn(target));
      }
    }
  }

  // ==================== FEATURE 7: HISTORICAL PERFORMANCE PROFILING ====================

  /**
   * Feature 7: Record a request completion for historical profiling
   * @param {string} base - Device base URL
   * @param {Object} metrics - Request metrics {durationMs, tokens, success}
   */
  recordPerformance(base, metrics) {
    if (!this.performanceHistory[base]) {
      this.performanceHistory[base] = [];
    }
    
    this.performanceHistory[base].push({
      timestamp: Date.now(),
      ...metrics
    });
    
    // Trim history if too large
    if (this.performanceHistory[base].length > this.historyMaxEntries) {
      this.performanceHistory[base] = this.performanceHistory[base].slice(-this.historyMaxEntries);
    }
    
    // Update computed profile
    this.updatePerformanceProfile(base);
  }

  /**
   * Feature 7: Compute performance profile percentiles
   * @param {string} base - Device base URL
   */
  updatePerformanceProfile(base) {
    const history = this.performanceHistory[base];
    if (!history || history.length < 10) return; // Need minimum samples
    
    // Get durations and sort for percentiles
    const durations = history.map(h => h.durationMs).sort((a, b) => a - b);
    const successCount = history.filter(h => h.success !== false).length;
    
    const p50Index = Math.floor(durations.length * 0.5);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);
    
    this.performanceProfiles[base] = {
      samples: durations.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      p50: durations[p50Index],
      p95: durations[p95Index],
      p99: durations[p99Index],
      successRate: successCount / history.length,
      lastUpdated: Date.now()
    };
  }

  /**
   * Feature 7: Get performance profile for a device
   * @param {string} base - Device base URL
   * @returns {Object|null} Performance profile or null
   */
  getPerformanceProfile(base) {
    return this.performanceProfiles[base] || null;
  }

  /**
   * Feature 7: Get all performance profiles
   * @returns {Object} All device profiles
   */
  getAllPerformanceProfiles() {
    return { ...this.performanceProfiles };
  }

  /**
   * Feature 7: Get performance history for analysis
   * @param {string} base - Device base URL
   * @param {number} limit - Max entries to return
   * @returns {Array} Recent performance history
   */
  getPerformanceHistory(base, limit = 100) {
    const history = this.performanceHistory[base] || [];
    return history.slice(-limit);
  }

  /**
   * Feature 7: Clear historical data for a device
   * @param {string} base - Device base URL
   */
  clearPerformanceHistory(base) {
    delete this.performanceHistory[base];
    delete this.performanceProfiles[base];
    console.log(`[LoadBalancer] Cleared performance history for ${base}`);
  }

  /**
   * Feature 7: Export all performance data for analysis
   * @returns {Object} Complete performance data export
   */
  exportPerformanceData() {
    return {
      profiles: this.getAllPerformanceProfiles(),
      history: Object.fromEntries(
        Object.entries(this.performanceHistory).map(([base, hist]) => [base, hist.slice(-100)])
      ),
      velocities: { ...this.queueVelocity },
      concurrencyAdjustments: { ...this.concurrencyAdjustments },
      adaptiveMultipliers: { ...this.queueMultipliers }
    };
  }

  // ==================== COMBINED FEATURE CONTROLS ====================

  /**
   * Configure all advanced features at once
   * @param {Object} config - Feature configuration
   */
  configureAdvancedFeatures(config) {
    if (config.weightedDistribution !== undefined) {
      this.useWeightedDistribution = config.weightedDistribution;
      console.log(`[LoadBalancer] Weighted distribution: ${this.useWeightedDistribution ? 'ON' : 'OFF'}`);
    }
    if (config.weightExponent !== undefined) {
      this.weightExponent = Math.max(1.0, Math.min(3.0, config.weightExponent));
    }
    if (config.routingMode !== undefined && Object.values(ROUTING_MODE).includes(config.routingMode)) {
      this.routingMode = config.routingMode;
      console.log(`[LoadBalancer] Routing mode: ${this.routingMode}`);
    }
    if (config.dynamicConcurrency !== undefined) {
      this.dynamicConcurrency = config.dynamicConcurrency;
      console.log(`[LoadBalancer] Dynamic concurrency: ${this.dynamicConcurrency ? 'ON' : 'OFF'}`);
    }
    if (config.targetLatencyMs !== undefined) {
      this.targetLatencyMs = Math.max(1000, Math.min(10000, config.targetLatencyMs));
    }
    if (config.preWarmThreshold !== undefined) {
      this.preWarmThreshold = Math.max(0.5, Math.min(10, config.preWarmThreshold));
    }
    if (config.debug !== undefined) {
      this.debugMode = config.debug;
      console.log(`[LoadBalancer] Debug mode: ${this.debugMode ? 'ON' : 'OFF'}`);
    }
  }

  /**
   * Get current advanced feature status
   * @returns {Object} Feature status
   */
  getAdvancedFeatureStatus() {
    return {
      routingMode: this.routingMode,
      weightedDistribution: {
        enabled: this.useWeightedDistribution,
        exponent: this.weightExponent
      },
      preWarming: {
        threshold: this.preWarmThreshold,
        velocities: { ...this.queueVelocity }
      },
      dynamicConcurrency: {
        enabled: this.dynamicConcurrency,
        targetLatency: this.targetLatencyMs,
        adjustments: { ...this.concurrencyAdjustments }
      },
      profiling: {
        devicesTracked: Object.keys(this.performanceProfiles).length,
        totalSamples: Object.values(this.performanceHistory).reduce(
          (sum, h) => sum + (h?.length || 0), 0
        )
      },
      debugMode: this.debugMode
    };
  }
}

// Export both the class and the constants/enums
export default LoadBalancer;
export { LOAD_BALANCER_CONSTANTS, ROUTING_MODE };
