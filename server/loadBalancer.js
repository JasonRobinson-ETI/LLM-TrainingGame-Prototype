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
   * @param {number} tps - Tokens per second for the device
   * @returns {number} Max number of people allowed in queue
   */
  calculateCapacity(tps) {
    if (tps <= 0) return 0;
    return Math.max(1, Math.floor(tps / this.tpsPerPerson));
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
      const capacity = this.calculateCapacity(tps);
      
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
   * @param {number} estimatedTokens - Tokens needed for new request
   * @returns {number} Expected completion time in seconds
   */
  calculateCompletionTime(base, queueSize, estimatedTokens) {
    const tps = this.deviceTPS[base] || 1;
    
    // Time for current queue (assume average tokens per request)
    const queueTime = (queueSize * this.avgTokensPerRequest) / tps;
    
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
   * @param {Object} deviceBusy - Map of base -> boolean
   * @param {number} estimatedTokens - Estimated tokens for the request
   * @returns {string|null} Base URL of selected device
   */
  selectDevicePowerOfTwo(deviceQueues, deviceBusy, estimatedTokens) {
    const availableBases = Object.keys(this.deviceRankings)
      .filter(base => {
        if (!this.isOnline(base)) return false;
        const queueSize = deviceQueues[base]?.length || 0;
        const capacity = this.deviceCapacities[base] || 1;
        return queueSize < capacity; // Only consider devices with capacity
      });

    if (availableBases.length === 0) {
      return null; // All devices at capacity
    }

    if (availableBases.length === 1) {
      return availableBases[0]; // Only one choice
    }

    // Randomly sample 2 devices
    const idx1 = Math.floor(Math.random() * availableBases.length);
    let idx2 = Math.floor(Math.random() * availableBases.length);
    
    // Ensure we get 2 different devices
    while (idx2 === idx1 && availableBases.length > 1) {
      idx2 = Math.floor(Math.random() * availableBases.length);
    }

    const device1 = availableBases[idx1];
    const device2 = availableBases[idx2];

    // Calculate expected completion time for both
    const queueSize1 = deviceQueues[device1]?.length || 0;
    const queueSize2 = deviceQueues[device2]?.length || 0;
    
    const completionTime1 = this.calculateCompletionTime(device1, queueSize1, estimatedTokens);
    const completionTime2 = this.calculateCompletionTime(device2, queueSize2, estimatedTokens);

    // Pick the less loaded one
    const selected = completionTime1 <= completionTime2 ? device1 : device2;
    const rejected = completionTime1 <= completionTime2 ? device2 : device1;

    console.log(
      `[LoadBalancer] Power of Two: sampled ${device1.split('//')[1]} (${completionTime1.toFixed(2)}s) ` +
      `vs ${device2.split('//')[1]} (${completionTime2.toFixed(2)}s) → chose ${selected.split('//')[1]}`
    );

    return selected;
  }

  /**
   * Select best device using greedy algorithm
   * Chooses device with minimum expected completion time
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Object} deviceBusy - Map of base -> boolean
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
      const capacity = this.deviceCapacities[base] || 1;

      // Skip if at capacity
      if (queueSize >= capacity) continue;

      // Calculate expected completion time
      const completionTime = this.calculateCompletionTime(base, queueSize, estimatedTokens);

      // Prefer faster completion time
      // Tie-breaker: prefer idle devices
      if (completionTime < minCompletionTime || 
          (completionTime === minCompletionTime && !deviceBusy[base])) {
        minCompletionTime = completionTime;
        bestDevice = base;
      }
    }

    if (bestDevice) {
      const tps = this.deviceTPS[bestDevice]?.toFixed(1) || '?';
      console.log(
        `[LoadBalancer] Greedy selection: ${bestDevice} ` +
        `(completion time: ${minCompletionTime.toFixed(2)}s, TPS: ${tps})`
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
      this.deviceCapacities[base] = this.calculateCapacity(tps);
      console.log(`[LoadBalancer] Device came online: ${base} (TPS: ${tps.toFixed(2)})`);
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
   * @param {Object} deviceQueues - Map of base -> queue array
   * @param {Function} processQueueFn - Function to process queue after stealing
   */
  rebalanceQueues(deviceQueues, processQueueFn) {
    const onlineDevices = this.getOnlineDevices();
    if (onlineDevices.length < 2) return; // Need at least 2 devices to rebalance
    
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
}

export default LoadBalancer;
