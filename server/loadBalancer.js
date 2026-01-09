/**
 * Load Balancer Helper
 * 
 * Dynamically manages queue capacity for each device based on TPS performance.
 * Ratio: 1 person per 100 TPS (e.g., 400 TPS = 4 people max, 100 TPS = 1 person)
 * Also routes questions based on complexity - simple questions to slower devices,
 * complex questions to faster devices.
 */

class LoadBalancer {
  constructor(tpsPerPerson = 100, useGreedy = true, usePowerOfTwo = true) {
    this.tpsPerPerson = tpsPerPerson; // Configurable ratio
    this.deviceCapacities = {}; // Max queue size per device
    this.deviceRankings = {}; // Performance ranking (1 = fastest)
    this.deviceTPS = {}; // Store TPS for each device
    this.onlineDevices = new Set(); // Track which devices are currently online
    this.useGreedy = useGreedy; // Use greedy algorithm for optimal device selection
    this.usePowerOfTwo = usePowerOfTwo; // Use Power of Two Choices algorithm (Netflix, NGINX, HAProxy)
    this.avgTokensPerRequest = 50; // Running average for estimation
    this.complexityCache = new Map(); // Cache for complexity analysis results
    this.cacheMaxSize = 1000; // Limit cache size to prevent memory issues
    
    // Work-stealing / dynamic rebalancing
    this.rebalanceEnabled = true;
    this.rebalanceIntervalMs = 500; // Check every 500ms for faster response
    this.rebalanceInterval = null;
    this.completionTimes = {}; // Track recent completion times per device
    this.completionWindow = 10; // Keep last N completions for rate calculation
    this.minStealThreshold = 1; // Steal even if source has just 1 item (when target is idle)
    
    // Feature 1: Weighted Request Distribution Based on TPS Ratios
    this.useWeightedDistribution = true;
    this.weightExponent = 1.5; // Higher = more aggressive weighting toward fast machines
    
    // Feature 2: Adaptive Queue Multipliers (enhanced)
    this.adaptiveMultipliers = true;
    this.queueMultipliers = {}; // Per-device adaptive multipliers
    
    // Feature 3: Request Batching for Fast Machines
    this.enableBatching = true;
    this.batchWindow = 50; // ms to wait for batch accumulation
    this.pendingBatches = {}; // Per-device pending batch requests
    this.batchTimers = {}; // Timers for batch windows
    this.minBatchSize = 2; // Minimum requests to form a batch
    this.maxBatchSize = 4; // Maximum batch size
    
    // Feature 4: Predictive Pre-warming Based on Queue Velocity
    this.queueVelocity = {}; // Rate of queue fill per device (items/sec)
    this.queueHistory = {}; // Recent queue size snapshots
    this.velocityWindow = 5; // Seconds to track velocity
    this.preWarmThreshold = 2.0; // items/sec velocity to trigger pre-warming
    
    // Feature 5: Dynamic MaxConcurrent Based on Real Performance (enhanced)
    this.dynamicConcurrency = true;
    this.targetLatencyMs = 3000; // Target latency threshold
    this.concurrencyAdjustments = {}; // Per-device adjustments
    
    // Feature 6: Request Cancellation & Re-routing
    this.enableCancellation = true;
    this.cancellationTimeoutMs = 15000; // Cancel after 15s
    this.activeRequests = {}; // Track active requests for cancellation
    this.requestIdCounter = 0;
    
    // Feature 7: Historical Performance Profiling
    this.performanceHistory = {}; // Per-device historical metrics
    this.historyMaxEntries = 1000; // Max history entries per device
    this.performanceProfiles = {}; // Computed profiles (avg, p50, p95, p99)
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
   * Feature 2: Uses adaptive multipliers that adjust based on real performance
   * @param {number} tps - Tokens per second for the device
   * @param {string} base - Optional device base URL for adaptive multipliers
   * @returns {number} Max number of people allowed in queue
   */
  calculateCapacity(tps, base = null) {
    if (tps <= 0) return 0;
    
    // Base multiplier from TPS tier
    let multiplier = 1.0;
    if (tps >= 400) multiplier = 2.0;      // Ultra-fast: Double capacity
    else if (tps >= 200) multiplier = 1.5; // Fast: 50% more capacity
    else if (tps < 50) multiplier = 0.5;   // Slow: Half capacity
    
    // Feature 2: Apply adaptive per-device multiplier
    if (this.adaptiveMultipliers && base) {
      const adaptiveMult = this.queueMultipliers[base];
      if (adaptiveMult !== undefined) {
        multiplier *= adaptiveMult;
      }
      
      // Adjust based on historical success rate
      const profile = this.performanceProfiles[base];
      if (profile) {
        // If device has low failure rate, increase multiplier
        if (profile.successRate > 0.98) {
          multiplier *= 1.2;
        }
        // If device has high failure rate, decrease multiplier
        if (profile.successRate < 0.9) {
          multiplier *= 0.7;
        }
      }
    }
    
    const baseCapacity = tps / this.tpsPerPerson;
    return Math.max(1, Math.floor(baseCapacity * multiplier));
  }

  /**
   * Feature 2: Set adaptive queue multiplier for a device
   * @param {string} base - Device base URL
   * @param {number} multiplier - Multiplier (1.0 = normal, 2.0 = double)
   */
  setAdaptiveMultiplier(base, multiplier) {
    this.queueMultipliers[base] = Math.max(0.5, Math.min(3.0, multiplier));
    console.log(`[LoadBalancer] Adaptive multiplier for ${base}: ${multiplier.toFixed(2)}x`);
  }

  /**
   * Get dynamic max concurrent requests for a device based on its TPS and real performance
   * Feature 5: Adapts concurrency based on actual throughput, not just speed
   * @param {string} base - Device base URL
   * @returns {number} Max concurrent requests allowed for this device
   */
  getMaxConcurrent(base) {
    const tps = this.deviceTPS[base] || 0;
    if (tps <= 0) return 1; // Minimum 1 for offline/unknown devices
    
    // Use actual completion times to determine optimal concurrency
    const avgCompletionMs = this.getAvgCompletionTime(base);
    
    // Base concurrency from TPS and latency
    let baseConcurrency;
    if (tps >= 400 && avgCompletionMs < 2000) baseConcurrency = 4;
    else if (tps >= 200 && avgCompletionMs < 3000) baseConcurrency = 3;
    else if (tps >= 100 && avgCompletionMs < 5000) baseConcurrency = 2;
    else baseConcurrency = 1;
    
    // Feature 5: Dynamic adjustment based on real performance
    if (this.dynamicConcurrency) {
      const adjustment = this.concurrencyAdjustments[base] || 0;
      const profile = this.performanceProfiles[base];
      
      // If p95 latency is low, we can increase concurrency
      if (profile && profile.p95 < this.targetLatencyMs * 0.5) {
        baseConcurrency = Math.min(8, baseConcurrency + 1); // Allow up to 8 for very fast machines
      }
      
      // If p95 latency is too high, decrease concurrency
      if (profile && profile.p95 > this.targetLatencyMs * 1.5) {
        baseConcurrency = Math.max(1, baseConcurrency - 1);
      }
      
      // Apply any manual adjustments
      baseConcurrency = Math.max(1, Math.min(8, baseConcurrency + adjustment));
    }
    
    return baseConcurrency;
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
   * Cache complexity result with size limit
   */
  cacheComplexityResult(question, result) {
    if (this.complexityCache.size >= this.cacheMaxSize) {
      // Remove oldest entry (FIFO)
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
    const rejected = completionTime1 <= completionTime2 ? device2 : device1;

    console.log(
      `[LoadBalancer] Power of Two: ${device1.split('//')[1]} (q:${queueSize1}+a:${active1}=${completionTime1.toFixed(2)}s) ` +
      `vs ${device2.split('//')[1]} (q:${queueSize2}+a:${active2}=${completionTime2.toFixed(2)}s) → ${selected.split('//')[1]}`
    );

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
    const alpha = 0.3; // Smoothing factor
    this.avgTokensPerRequest = alpha * actualTokens + (1 - alpha) * this.avgTokensPerRequest;
  }

  /**
   * Toggle greedy algorithm on/off
   * @param {boolean} enabled - Enable or disable greedy selection
   */
  setGreedyMode(enabled) {
    console.log(`[LoadBalancer] Greedy algorithm: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    this.useGreedy = enabled;
  }

  /**
   * Toggle Power of Two Choices algorithm on/off
   * @param {boolean} enabled - Enable or disable Power of Two selection
   */
  setPowerOfTwoMode(enabled) {
    console.log(`[LoadBalancer] Power of Two Choices: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    this.usePowerOfTwo = enabled;
  }

  /**
   * Get current load balancing strategy
   * @returns {string} Current strategy name
   */
  getStrategy() {
    if (this.usePowerOfTwo) return 'Power of Two Choices';
    if (this.useGreedy) return 'Greedy (Minimum Completion Time)';
    return 'Complexity-Based Routing';
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
    // Exponential moving average (α=0.3 for smooth updates)
    const alpha = 0.3;
    const newTPS = alpha * actualTPS + (1 - alpha) * oldTPS;
    
    // Only log significant changes (>10% delta)
    const percentChange = Math.abs(newTPS - oldTPS) / oldTPS * 100;
    if (percentChange > 10) {
      const oldConcurrent = this.getMaxConcurrent(base);
      this.deviceTPS[base] = newTPS;
      this.deviceCapacities[base] = this.calculateCapacity(newTPS, base); // Pass base for adaptive multipliers
      const newConcurrent = this.getMaxConcurrent(base);
      
      console.log(
        `[LoadBalancer] TPS updated for ${base.split('//')[1]}: ` +
        `${oldTPS.toFixed(1)} → ${newTPS.toFixed(1)} TPS ` +
        `(maxConcurrent: ${oldConcurrent} → ${newConcurrent})`
      );
    } else {
      // Silently update
      this.deviceTPS[base] = newTPS;
      this.deviceCapacities[base] = this.calculateCapacity(newTPS, base); // Pass base for adaptive multipliers
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
          
          console.log(
            `[LoadBalancer] 🔄 Work stolen: ${source.base.split('//')[1]} (queue:${deviceQueues[source.base].length}) -> ` +
            `${target.base.split('//')[1]} (was idle, TPS:${target.tps.toFixed(0)})`
          );
          
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
    
    if (stolen > 0) {
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
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Function} processQueueFn - Function to process queue after stealing
   */
  tryStealWork(idleBase, deviceQueues, processQueueFn) {
    if (!this.rebalanceEnabled) return false;
    if (!this.isOnline(idleBase)) return false;
    
    // Find the busiest device to steal from
    const onlineDevices = this.getOnlineDevices().filter(b => b !== idleBase);
    
    let bestSource = null;
    let maxQueue = 0;
    
    for (const base of onlineDevices) {
      const queueSize = deviceQueues[base]?.length || 0;
      if (queueSize > maxQueue) {
        maxQueue = queueSize;
        bestSource = base;
      }
    }
    
    // Steal if source has at least 1 item
    if (bestSource && maxQueue >= 1) {
      const request = deviceQueues[bestSource].pop();
      if (request) {
        deviceQueues[idleBase].push(request);
        
        console.log(
          `[LoadBalancer] ⚡ Proactive steal: ${bestSource.split('//')[1]} (queue:${deviceQueues[bestSource].length}) -> ` +
          `${idleBase.split('//')[1]} (just finished)`
        );
        
        // Trigger processing immediately
        if (processQueueFn) {
          setImmediate(() => processQueueFn(idleBase));
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

  // ==================== FEATURE 3: REQUEST BATCHING FOR FAST MACHINES ====================

  /**
   * Feature 3: Check if a device is eligible for batching
   * @param {string} base - Device base URL
   * @returns {boolean} True if device can handle batched requests
   */
  canBatch(base) {
    if (!this.enableBatching) return false;
    const tps = this.deviceTPS[base] || 0;
    // Only fast machines (200+ TPS) should batch
    return tps >= 200;
  }

  /**
   * Feature 3: Add a request to a batch for a fast machine
   * Returns immediately if batching is triggered, otherwise queues for batch
   * @param {string} base - Device base URL
   * @param {Object} request - The request object
   * @param {Function} processBatchFn - Function to call when batch is ready
   * @returns {boolean} True if request was batched, false if should process normally
   */
  tryBatchRequest(base, request, processBatchFn) {
    if (!this.canBatch(base)) return false;
    
    // Initialize batch structures for this device
    if (!this.pendingBatches[base]) {
      this.pendingBatches[base] = [];
    }
    
    // Add to pending batch
    this.pendingBatches[base].push(request);
    
    // If we've hit max batch size, process immediately
    if (this.pendingBatches[base].length >= this.maxBatchSize) {
      this.flushBatch(base, processBatchFn);
      return true;
    }
    
    // Start batch window timer if not already running
    if (!this.batchTimers[base]) {
      this.batchTimers[base] = setTimeout(() => {
        this.flushBatch(base, processBatchFn);
      }, this.batchWindow);
    }
    
    return true;
  }

  /**
   * Feature 3: Flush pending batch for a device
   * @param {string} base - Device base URL
   * @param {Function} processBatchFn - Function to process the batch
   */
  flushBatch(base, processBatchFn) {
    // Clear the timer
    if (this.batchTimers[base]) {
      clearTimeout(this.batchTimers[base]);
      delete this.batchTimers[base];
    }
    
    const batch = this.pendingBatches[base] || [];
    delete this.pendingBatches[base];
    
    if (batch.length === 0) return;
    
    // If only 1 request, just process normally
    if (batch.length < this.minBatchSize) {
      if (processBatchFn) {
        batch.forEach(request => processBatchFn(base, request));
      }
      return;
    }
    
    console.log(`[LoadBalancer] 📦 Batch ready: ${base.split('//')[1]} processing ${batch.length} requests together`);
    
    // Process batch
    if (processBatchFn) {
      processBatchFn(base, batch);
    }
  }

  /**
   * Feature 3: Get pending batch info
   * @returns {Object} Batch status per device
   */
  getBatchStatus() {
    const status = {};
    for (const [base, batch] of Object.entries(this.pendingBatches)) {
      status[base] = {
        pending: batch.length,
        hasTimer: !!this.batchTimers[base]
      };
    }
    return status;
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
        if (timeToFull < 5) { // Will be full in 5 seconds
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
      return queueSize < capacity * 0.3; // Less than 30% utilized
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
      
      if (toSteal > 0) {
        console.log(
          `[LoadBalancer] 🔥 Pre-warming: Moved ${toSteal} requests from ` +
          `${source.split('//')[1]} (velocity:${rec.velocity}/s) to ${target.split('//')[1]}`
        );
        
        if (processQueueFn) {
          setImmediate(() => processQueueFn(target));
        }
      }
    }
  }

  // ==================== FEATURE 6: REQUEST CANCELLATION & RE-ROUTING ====================

  /**
   * Feature 6: Register an active request for potential cancellation
   * @param {string} base - Device base URL
   * @param {Object} request - The request object
   * @returns {number} Request ID for tracking
   */
  registerActiveRequest(base, request) {
    if (!this.enableCancellation) return null;
    
    const requestId = ++this.requestIdCounter;
    
    if (!this.activeRequests[base]) {
      this.activeRequests[base] = new Map();
    }
    
    const activeRequest = {
      id: requestId,
      request,
      startTime: Date.now(),
      abortController: new AbortController()
    };
    
    this.activeRequests[base].set(requestId, activeRequest);
    
    // Set up cancellation timeout
    activeRequest.timeoutId = setTimeout(() => {
      this.cancelAndReroute(base, requestId);
    }, this.cancellationTimeoutMs);
    
    return requestId;
  }

  /**
   * Feature 6: Mark a request as completed (prevents cancellation)
   * @param {string} base - Device base URL
   * @param {number} requestId - Request ID
   */
  completeActiveRequest(base, requestId) {
    if (!requestId || !this.activeRequests[base]) return;
    
    const activeRequest = this.activeRequests[base].get(requestId);
    if (activeRequest) {
      clearTimeout(activeRequest.timeoutId);
      this.activeRequests[base].delete(requestId);
    }
  }

  /**
   * Feature 6: Cancel a slow request and re-route to a faster device
   * @param {string} base - Device base URL where request is running
   * @param {number} requestId - Request ID to cancel
   * @returns {boolean} True if successfully re-routed
   */
  cancelAndReroute(base, requestId) {
    const activeRequest = this.activeRequests[base]?.get(requestId);
    if (!activeRequest) return false;
    
    const elapsed = Date.now() - activeRequest.startTime;
    console.log(
      `[LoadBalancer] ⏰ Request timeout on ${base.split('//')[1]} ` +
      `(${(elapsed / 1000).toFixed(1)}s elapsed)`
    );
    
    // Abort the request
    activeRequest.abortController.abort();
    clearTimeout(activeRequest.timeoutId);
    this.activeRequests[base].delete(requestId);
    
    // Find a faster device to re-route to
    const onlineDevices = this.getOnlineDevices().filter(b => b !== base);
    if (onlineDevices.length === 0) {
      // No other devices - resolve with timeout message
      activeRequest.request.resolve("I'm taking too long to think. Let me try again.");
      return false;
    }
    
    // Sort by TPS and pick the fastest available
    onlineDevices.sort((a, b) => (this.deviceTPS[b] || 0) - (this.deviceTPS[a] || 0));
    const newDevice = onlineDevices[0];
    
    console.log(
      `[LoadBalancer] 🔄 Re-routing to ${newDevice.split('//')[1]} ` +
      `(TPS: ${(this.deviceTPS[newDevice] || 0).toFixed(1)})`
    );
    
    // Return the new device and request for re-processing
    return {
      newDevice,
      request: activeRequest.request
    };
  }

  /**
   * Feature 6: Get abort signal for a request
   * @param {string} base - Device base URL
   * @param {number} requestId - Request ID
   * @returns {AbortSignal|null} Abort signal or null
   */
  getAbortSignal(base, requestId) {
    if (!requestId || !this.activeRequests[base]) return null;
    const activeRequest = this.activeRequests[base].get(requestId);
    return activeRequest?.abortController?.signal || null;
  }

  /**
   * Feature 6: Set cancellation timeout
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  setCancellationTimeout(timeoutMs) {
    this.cancellationTimeoutMs = Math.max(5000, Math.min(60000, timeoutMs));
    console.log(`[LoadBalancer] Cancellation timeout: ${this.cancellationTimeoutMs}ms`);
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
    if (config.adaptiveMultipliers !== undefined) {
      this.adaptiveMultipliers = config.adaptiveMultipliers;
      console.log(`[LoadBalancer] Adaptive multipliers: ${this.adaptiveMultipliers ? 'ON' : 'OFF'}`);
    }
    if (config.enableBatching !== undefined) {
      this.enableBatching = config.enableBatching;
      console.log(`[LoadBalancer] Request batching: ${this.enableBatching ? 'ON' : 'OFF'}`);
    }
    if (config.batchWindow !== undefined) {
      this.batchWindow = Math.max(10, Math.min(200, config.batchWindow));
    }
    if (config.dynamicConcurrency !== undefined) {
      this.dynamicConcurrency = config.dynamicConcurrency;
      console.log(`[LoadBalancer] Dynamic concurrency: ${this.dynamicConcurrency ? 'ON' : 'OFF'}`);
    }
    if (config.targetLatencyMs !== undefined) {
      this.targetLatencyMs = Math.max(1000, Math.min(10000, config.targetLatencyMs));
    }
    if (config.enableCancellation !== undefined) {
      this.enableCancellation = config.enableCancellation;
      console.log(`[LoadBalancer] Request cancellation: ${this.enableCancellation ? 'ON' : 'OFF'}`);
    }
    if (config.cancellationTimeoutMs !== undefined) {
      this.setCancellationTimeout(config.cancellationTimeoutMs);
    }
    if (config.preWarmThreshold !== undefined) {
      this.preWarmThreshold = Math.max(0.5, Math.min(10, config.preWarmThreshold));
    }
  }

  /**
   * Get current advanced feature status
   * @returns {Object} Feature status
   */
  getAdvancedFeatureStatus() {
    return {
      weightedDistribution: {
        enabled: this.useWeightedDistribution,
        exponent: this.weightExponent
      },
      adaptiveMultipliers: {
        enabled: this.adaptiveMultipliers,
        devices: Object.keys(this.queueMultipliers).length
      },
      batching: {
        enabled: this.enableBatching,
        window: this.batchWindow,
        minSize: this.minBatchSize,
        maxSize: this.maxBatchSize,
        pending: Object.keys(this.pendingBatches).reduce((sum, k) => sum + (this.pendingBatches[k]?.length || 0), 0)
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
      cancellation: {
        enabled: this.enableCancellation,
        timeoutMs: this.cancellationTimeoutMs,
        activeRequests: Object.keys(this.activeRequests).reduce(
          (sum, k) => sum + (this.activeRequests[k]?.size || 0), 0
        )
      },
      profiling: {
        devicesTracked: Object.keys(this.performanceProfiles).length,
        totalSamples: Object.values(this.performanceHistory).reduce(
          (sum, h) => sum + (h?.length || 0), 0
        )
      }
    };
  }
}

export default LoadBalancer;
