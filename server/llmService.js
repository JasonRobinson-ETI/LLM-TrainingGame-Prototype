import si from 'systeminformation';
import LoadBalancer from './loadBalancer.js';

class LLMService {
  constructor() {
    this.useOllama = true;
    this.modelChangeCallback = null; // Callback for when model changes
    this.loadBalancer = new LoadBalancer(100, false, true); // 100 TPS per person, greedy=false, powerOfTwo=true
    const requiredEnv = (process.env.OLLAMA_REQUIRED || 'true').toLowerCase();
    this.requireOllama = requiredEnv === '1' || requiredEnv === 'true' || requiredEnv === 'yes';

    const normalizeBase = (s) => {
      if (!s) return null;
      let base = s.trim();
      if (!/^https?:\/\//.test(base)) base = `http://${base}`;
      if (!/:\d+$/.test(base)) base = `${base}:11434`;
      return base.replace(/\/$/, '');
    };

    const manualHosts = ['192.168.68.25', '192.168.68.10', '192.168.68.12',];
    
    // Combine manual, env, and local hosts into a unique set
    const bases = new Set();
    
    // 1. Add manual hosts
    manualHosts.forEach(h => { if(h) bases.add(normalizeBase(h)) });

    // 2. Add env hosts
    if (process.env.OLLAMA_HOSTS) {
      process.env.OLLAMA_HOSTS.split(',').forEach(h => { if(h) bases.add(normalizeBase(h)) });
    } else if (process.env.OLLAMA_HOST) {
      bases.add(normalizeBase(process.env.OLLAMA_HOST));
    }

    // 3. Always ensure localhost is included for benchmarking
    bases.add(normalizeBase('localhost'));

    this.ollamaBases = Array.from(bases).filter(Boolean);
    console.log('[LLM] Ollama bases:', this.ollamaBases.join(', '));
    console.log('[LLM] OLLAMA_REQUIRED:', this.requireOllama);

    const modelFromEnv = process.env.LLM_MODEL && process.env.LLM_MODEL.trim();
    const modelListFromEnv = process.env.LLM_MODELS
      ? process.env.LLM_MODELS.split(',').map(m => m.trim()).filter(Boolean)
      : null;
    this.modelCandidates = modelListFromEnv || ['antonio-max-ctx'];
    this.modelName = modelFromEnv || 'antonio-max-ctx';

    this.generator = null;
    this.isInitialized = false;
    this.healthCheckInterval = null; // Interval for checking offline devices
    this.initializationPromise = null;
    this.hasMetalAcceleration = false; // Detected during hardware info
    this.localHardwareInfo = null; // Store local hardware detection results
    this.lastTokenCount = 50; // Track last token count for performance profiling

    // Initialize per-device queues and busy flags
    this.deviceQueues = {};
    this.deviceBusy = {};
    this.devicePerformance = {}; // Track TPS and hardware info for each device
    this.ollamaBases.forEach(base => {
      this.deviceQueues[base] = [];
      this.deviceBusy[base] = false;
      this.devicePerformance[base] = { 
        tps: 0, 
        model: 'unknown',
        acceleration: 'unknown', // 'metal', 'cuda', 'cpu'
        hardware: null // Detailed hardware info
      };
    });
    // Track last used device for round-robin
    this.lastDeviceIndex = -1;
  }

  async getHardwareInfo() {
    try {
      console.log('[LLM] Detecting local hardware...');
      const cpu = await si.cpu();
      console.log(`[LLM] CPU: ${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)`);
      
      // Detect Apple Silicon for Metal acceleration
      const isAppleSilicon = cpu.manufacturer === 'Apple' || cpu.brand.includes('M1') || cpu.brand.includes('M2') || cpu.brand.includes('M3');
      if (isAppleSilicon) {
        console.log('[LLM] ✓ Apple Silicon detected - Metal acceleration available');
        console.log('[LLM] ✓ Neural Engine (ANE) available for inference');
        this.hasMetalAcceleration = true;
      }
      
      const gpuData = await si.graphics();
      if (gpuData.controllers.length > 0) {
        console.log('[LLM] Detected GPUs/MPUs:');
        gpuData.controllers.forEach((ctrl, idx) => {
          console.log(`  ${idx + 1}. ${ctrl.model} (VRAM: ${ctrl.vram || 'Unified'}MB)`);
        });
      }
      
      this.localHardwareInfo = {
        isAppleSilicon,
        cpu: `${cpu.manufacturer} ${cpu.brand}`,
        cores: cpu.cores,
        gpus: gpuData.controllers.map(ctrl => ctrl.model)
      };
    } catch (err) {
      console.warn('[LLM] Hardware detection failed:', err.message);
    }
  }

  async detectDeviceAcceleration(base) {
    // Try to detect what acceleration is being used by this Ollama instance
    const isLocalhost = base.includes('localhost') || base.includes('127.0.0.1');
    const tps = this.devicePerformance[base]?.tps || 0;
    
    try {
      // Use /api/ps to see running models and their GPU layers
      const psRes = await fetch(`${base}/api/ps`, { method: 'GET' });
      if (psRes.ok) {
        const psData = await psRes.json();
        // Check if any model is using GPU layers
        if (psData.models && psData.models.length > 0) {
          const model = psData.models[0];
          const details = model.details || {};
          
          // Check for GPU usage indicators
          if (details.gpu_layers && details.gpu_layers > 0) {
            // Determine type based on local hardware detection
            if (isLocalhost && this.hasMetalAcceleration) {
              return 'metal';
            }
            // For remote devices, be conservative - only say CUDA if very high performance
            if (!isLocalhost && tps > 50) {
              return 'cuda';
            }
            return 'gpu';
          }
        }
      }
      
      // Fallback: infer from TPS and local hardware info
      if (isLocalhost && this.hasMetalAcceleration && tps > 5) {
        return 'metal';
      } else if (tps > 50) {
        // Only report CUDA for very high TPS (50+ tokens/sec)
        return 'cuda';
      } else if (tps > 10) {
        // Moderate TPS - generic GPU
        return 'gpu';
      }
      
      return 'cpu';
    } catch (err) {
      // If /api/ps fails, infer conservatively from TPS and hostname
      if (isLocalhost && this.hasMetalAcceleration && tps > 5) {
        return 'metal';
      }
      if (tps > 50) return 'cuda';
      if (tps > 10) return 'gpu';
      return 'cpu';
    }
  }

  async benchmarkDevice(base) {
    console.log(`[LLM] Benchmarking device: ${base}...`);
    try {
      const res = await fetch(`${base}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: "Verify 1+1",
          stream: false,
          options: { 
            num_predict: 10, 
            temperature: 0,
            num_gpu: 99,  // Use all available GPU layers (Metal on Mac)
            f16_kv: true  // Use half-precision for key/value cache (faster on Metal)
          }
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // Calculate TPS
      // eval_duration is in nanoseconds. eval_count is token count.
      const durationSec = data.eval_duration ? (data.eval_duration / 1e9) : 1;
      const tps = data.eval_count ? (data.eval_count / durationSec) : 0;
      
      this.devicePerformance[base].tps = tps;
      this.devicePerformance[base].model = this.modelName;
      
      // Detect acceleration type
      const acceleration = await this.detectDeviceAcceleration(base);
      this.devicePerformance[base].acceleration = acceleration;
      
      const accelEmoji = acceleration === 'metal' ? '🍎' : acceleration === 'cuda' ? '🟢' : acceleration === 'gpu' ? '🔵' : '⚪';
      console.log(`[LLM] Result ${base}: ${tps.toFixed(2)} TPS ${accelEmoji} ${acceleration.toUpperCase()}`);
      return tps;
    } catch (err) {
      console.warn(`[LLM] Benchmark failed for ${base}: ${err.message}`);
      this.devicePerformance[base].tps = 0;
      this.devicePerformance[base].acceleration = 'offline';
      return 0;
    }
  }

  async initialize() {
    if (this.isInitialized) return;

    await this.getHardwareInfo();

    if (this.useOllama) {
      console.log('[LLM] Benchmarking all configured devices...');
      const benchmarks = this.ollamaBases.map(base => this.benchmarkDevice(base));
      await Promise.all(benchmarks);

      // Sort ollamaBases by TPS descending
      this.ollamaBases.sort((a, b) => {
        return this.devicePerformance[b].tps - this.devicePerformance[a].tps;
      });

      console.log('[LLM] Device Priority Ranking (Efficiency):');
      this.ollamaBases.forEach((base, idx) => {
        const perf = this.devicePerformance[base];
        console.log(`  ${idx + 1}. ${base} - ${perf.tps.toFixed(2)} TPS`);
      });

      // Update load balancer with device metrics
      const deviceMetrics = this.ollamaBases.map(base => ({
        base,
        tps: this.devicePerformance[base].tps
      }));
      const summary = this.loadBalancer.updateDeviceMetrics(deviceMetrics);
      console.log(`[LLM] Load Balancer: ${summary.totalCapacity} total queue slots across ${summary.devices} devices`);

      // Verification: Check if at least one works
      const activeBases = this.ollamaBases.filter(b => this.devicePerformance[b].tps > 0);
      if (activeBases.length > 0) {
        this.isInitialized = true;
        console.log(`[LLM] Initialization complete. ${activeBases.length} active devices ready.`);
        
        // Start work-stealing rebalancer
        this.loadBalancer.startRebalancing(
          this.deviceQueues,
          (base) => this.processDeviceQueue(base)
        );
        
        // Start health check for offline devices
        this.startHealthCheck();
        
        return;
      }

      if (this.requireOllama) {
        console.error('[LLM] No Ollama endpoints reachable and OLLAMA_REQUIRED is true.');
        throw new Error('Ollama required but no endpoints reachable');
      } else {
        console.warn('[LLM] No Ollama endpoints reachable; falling back to Transformers.js (CPU-only).');
        this.useOllama = false;
      }
    }

    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      try {
        console.log('[LLM] Initializing Transformers.js (CPU-only)...');
        const { pipeline } = await import('@xenova/transformers');
        this.generator = await pipeline('text-generation', 'Xenova/gpt2', {
          quantized: true,
          progress_callback: (progress) => {
            if (progress.status === 'progress') {
              console.log(`[LLM] Loading model: ${Math.round(progress.progress)}%`);
            }
          },
        });
        this.isInitialized = true;
        console.log('[LLM] Transformers.js model loaded (CPU-only)');
      } catch (error) {
        console.error('[LLM] Error initializing model:', error);
        this.isInitialized = false;
        this.initializationPromise = null;
        throw error;
      }
    })();
    return this.initializationPromise;
  }

  async ensureTransformersReady() {
    if (this.generator) return;
    try {
      console.log('[LLM] Preparing Transformers.js generator (CPU-only)...');
      const { pipeline } = await import('@xenova/transformers');
      this.generator = await pipeline('text-generation', 'Xenova/gpt2', {
        quantized: true,
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            console.log(`[LLM] Loading model: ${Math.round(progress.progress)}%`);
          }
        },
      });
      console.log('[LLM] Transformers.js generator ready (CPU-only).');
    } catch (error) {
      console.error('[LLM] Failed to prepare Transformers.js generator:', error);
      throw error;
    }
  }

  buildContext(trainingData, llmKnowledge, maxItems = 100) {
    // Sliding window: use only the most recent items to stay within context limits
    const contextParts = [];
    
    if (llmKnowledge && llmKnowledge.length > 0) {
      contextParts.push('Knowledge base:');
      // Take the most recent knowledge items
      const recentKnowledge = llmKnowledge.slice(-maxItems);
      recentKnowledge.forEach((knowledge, idx) => {
        contextParts.push(`${idx + 1}. ${knowledge}`);
      });
    }
    
    if (trainingData && trainingData.length > 0) {
      contextParts.push('\nTraining examples:');
      // Take the most recent training examples
      const recentTraining = trainingData.slice(-maxItems);
      recentTraining.forEach((data) => {
        contextParts.push(`Q: ${data.question}`);
        contextParts.push(`A: ${data.answer}`);
      });
    }
    
    return contextParts.join('\n');
  }

  async generateResponse(question, trainingData = [], llmKnowledge = []) {
    return new Promise((resolve, reject) => {
      const request = { question, trainingData, llmKnowledge, resolve, reject };
      
      // Use load balancer to select best device based on question complexity
      let selectedBase = this.loadBalancer.selectBestDevice(
        this.deviceQueues,
        this.deviceBusy,
        question  // Pass question for complexity analysis
      );
      
      if (!selectedBase) {
        // Fallback: find any online device with shortest queue
        const onlineDevices = this.loadBalancer.getOnlineDevices();
        
        if (onlineDevices.length > 0) {
          let minQueueSize = Infinity;
          for (const base of onlineDevices) {
            if (this.deviceQueues[base].length < minQueueSize) {
              minQueueSize = this.deviceQueues[base].length;
              selectedBase = base;
            }
          }
        } else {
          // No online devices - try localhost as last resort
          selectedBase = this.ollamaBases.find(b => b.includes('localhost')) || this.ollamaBases[0];
          console.warn(`[LLM] No online devices! Falling back to ${selectedBase}`);
        }
      }

      const queueSize = this.deviceQueues[selectedBase].length;
      const capacity = this.loadBalancer.deviceCapacities[selectedBase] || 0;
      const tps = this.devicePerformance[selectedBase]?.tps?.toFixed(1) || '0';
      
      console.log(
        `[LLM] Queuing request to ${selectedBase} ` +
        `(TPS: ${tps}, Queue: ${queueSize}/${capacity}, will wait for assignment)`
      );
      
      this.deviceQueues[selectedBase].push(request);
      this.processDeviceQueue(selectedBase);
    });
  }

  findAvailableDevice() {
    // Deprecated in round-robin mode
    return null;
  }

  async processDeviceQueue(base) {
    // Dynamic max concurrent based on device TPS (TPS/100, clamped 1-8)
    const maxConcurrent = this.loadBalancer.getMaxConcurrent(base);
    const currentActive = this.deviceBusy[base] || 0;
    
    if (currentActive >= maxConcurrent || this.deviceQueues[base].length === 0) return;
    
    // Increment active request counter
    this.deviceBusy[base] = currentActive + 1;
    const request = this.deviceQueues[base].shift();
    
    // Guard against undefined request (race condition)
    if (!request) {
      this.deviceBusy[base] = Math.max(0, this.deviceBusy[base] - 1);
      return;
    }
    
    const { question, trainingData, llmKnowledge, resolve, reject } = request;
    const startTime = Date.now(); // Track completion time for work-stealing
    
    // Feature 6: Register active request for potential cancellation
    const requestId = this.loadBalancer.registerActiveRequest(base, request);
    const abortSignal = this.loadBalancer.getAbortSignal(base, requestId);
    
    console.log(`[LLM] Processing request on ${base} (active: ${this.deviceBusy[base]}/${maxConcurrent}, queue: ${this.deviceQueues[base].length} remaining)`);
    
    // Start processing next request immediately if capacity available
    if (this.deviceQueues[base].length > 0 && this.deviceBusy[base] < maxConcurrent) {
      setImmediate(() => this.processDeviceQueue(base));
    }
    
    try {
      if (!this.isInitialized) await this.initialize();
      const context = this.buildContext(trainingData, llmKnowledge);
      const response = this.useOllama
        ? await this.generateWithOllamaOnDevice(base, question, context, abortSignal)
        : await this.generateWithTransformers(question, context);
      
      // Record completion time for work-stealing algorithm
      const durationMs = Date.now() - startTime;
      this.loadBalancer.recordCompletion(base, durationMs);
      
      // Feature 6: Mark request as completed (prevents cancellation)
      this.loadBalancer.completeActiveRequest(base, requestId);
      
      // Feature 7: Record successful completion for historical profiling
      this.loadBalancer.recordPerformance(base, {
        durationMs,
        tokens: this.lastTokenCount || 50,
        success: true
      });
      
      resolve(response);
    } catch (error) {
      // Check if this was a cancellation
      if (error.name === 'AbortError') {
        console.log(`[LLM] Request cancelled on ${base}, will be re-routed`);
        // The loadBalancer handles re-routing in cancelAndReroute
        return;
      }
      
      console.error('[LLM] Error generating response on', base, ':', error.message);
      
      // Feature 7: Record failure for historical profiling
      const durationMs = Date.now() - startTime;
      this.loadBalancer.recordPerformance(base, {
        durationMs,
        tokens: 0,
        success: false
      });
      
      // Feature 6: Complete the request to clean up tracking
      this.loadBalancer.completeActiveRequest(base, requestId);
      
      // Mark device as offline if it fails
      this.loadBalancer.markOffline(base);
      this.devicePerformance[base].tps = 0;
      this.devicePerformance[base].acceleration = 'offline';
      
      // Redistribute queue to other devices before marking offline
      this.redistributeQueue(base);
      
      // Always resolve with fallback message instead of rejecting to maintain stability
      resolve("I'm still learning. Please ask me again later!");
    } finally {
      // Decrement active request counter
      this.deviceBusy[base] = Math.max(0, this.deviceBusy[base] - 1);
      
      // Continue processing queue if items remain
      if (this.deviceQueues[base].length > 0) {
        console.log(`[LLM] ${base} processing next queued request`);
        setImmediate(() => this.processDeviceQueue(base));
      } else if (this.deviceBusy[base] === 0) {
        // Device is now completely idle - try to steal work from other queues!
        this.loadBalancer.tryStealWork(
          base,
          this.deviceQueues,
          (stealBase) => this.processDeviceQueue(stealBase)
        );
      }
    }
  }

  async generateWithOllamaOnDevice(base, question, context, abortSignal = null) {
    try {
      const prompt = context
        ? `${context}\n\nQuestion: ${question}\nAnswer:`
        : `Question: ${question}\nAnswer:`;

      console.log('[LLM] Generating response with Ollama at', base);

      const tryRequest = async (path, body) => {
        const fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
        
        // Feature 6: Add abort signal for cancellation support
        if (abortSignal) {
          fetchOptions.signal = abortSignal;
        }
        
        const res = await fetch(`${base}${path}`, fetchOptions);
        return res;
      };

      const options = { 
        temperature: 0.7, 
        num_predict: 50, 
        stop: ['\n', 'Question:', '?'], 
        num_gpu: 99,     // Offload all layers to GPU/Metal
        f16_kv: true,    // Half-precision for faster Metal inference
        low_vram: false  // Disable VRAM optimization (not needed on unified memory)
      };

      let response = await tryRequest('/api/generate', { model: this.modelName, prompt, stream: false, options });

      if (!response.ok) {
        const status = response.status;
        let bodyText = '';
        try { bodyText = await response.text(); } catch {}
        console.warn(`[LLM] /api/generate returned ${status} at ${base}: ${bodyText}`);

        if (status === 404 && this.modelCandidates.length > 0) {
          const currentIdx = this.modelCandidates.indexOf(this.modelName);
          const nextIdx = (currentIdx + 1) % this.modelCandidates.length;
          if (this.modelCandidates[nextIdx] !== this.modelName) {
            this.modelName = this.modelCandidates[nextIdx];
            console.warn('[LLM] Switching to fallback model:', this.modelName);
            if (this.modelChangeCallback) {
              this.modelChangeCallback(this.modelName);
            }
            response = await tryRequest('/api/generate', { model: this.modelName, prompt, stream: false, options });
          }
        }

        if (!response.ok) {
          const chatRes = await tryRequest('/api/chat', {
            model: this.modelName,
            messages: [context ? { role: 'system', content: context } : null, { role: 'user', content: `Question: ${question}\nAnswer:` }].filter(Boolean),
            stream: false,
            options,
          });
          response = chatRes;
        }
      }

      if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);

      const data = await response.json();
      
      // Feature 7: Track last token count for performance profiling
      this.lastTokenCount = data.eval_count || 50;
      
      // Update load balancer's average token count if available
      if (data.eval_count) {
        this.loadBalancer.updateAverageTokens(data.eval_count);
        
        // Update real-time TPS based on actual inference performance
        // eval_duration is in nanoseconds
        if (data.eval_duration && data.eval_duration > 0) {
          const durationSec = data.eval_duration / 1e9;
          const actualTPS = data.eval_count / durationSec;
          this.loadBalancer.updateDeviceTPS(base, actualTPS);
          
          // Sync updated TPS back to devicePerformance for API visibility
          this.devicePerformance[base].tps = this.loadBalancer.deviceTPS[base];
        }
      }
      
      let answer = (data.response || (data.message && data.message.content) || '').trim();
      if (!answer || answer.length < 3) answer = "I don't have enough information to answer that yet.";
      console.log('[LLM] Generated response:', answer);
      return answer;
    } catch (error) {
      console.error('[LLM] Ollama error on', base, ':', error);
      throw error;
    }
  }

  async generateWithTransformers(question, context) {
    try {
      await this.ensureTransformersReady();
      const prompt = context
        ? `${context}\n\nQuestion: ${question}\nAnswer:`
        : `Question: ${question}\nAnswer:`;

      console.log('[LLM] Generating response with Transformers.js (CPU)...');
      const result = await this.generator(prompt, {
        max_new_tokens: 50,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
        num_return_sequences: 1,
      });

      let response = result[0].generated_text;
      response = response.substring(prompt.length).trim();
      const stopIndex = response.search(/[\n\?]/);
      if (stopIndex !== -1) response = response.substring(0, stopIndex).trim();
      if (!response || response.length < 3) response = "I don't have enough information to answer that yet.";
      console.log('[LLM] Generated response:', response);
      return response;
    } catch (error) {
      console.error('[LLM] Transformers.js error:', error);
      return "I'm having trouble processing that question right now.";
    }
  }

  getModelName() {
    return this.modelName;
  }

  /**
   * Register a callback for when the model changes
   * @param {Function} callback - Function to call with new model name
   */
  onModelChange(callback) {
    this.modelChangeCallback = callback;
  }

  /**
   * Get load balancer queue health metrics
   * @returns {Object} Health status for all devices
   */
  getQueueHealth() {
    return this.loadBalancer.getQueueHealth(this.deviceQueues);
  }

  /**
   * Get load balancer metrics summary
   * @returns {Object} Capacity and ranking info
   */
  getLoadBalancerMetrics() {
    return this.loadBalancer.getMetricsSummary();
  }

  /**
   * Check if system can handle additional students
   * @param {number} additionalStudents - Number of students to add
   * @returns {Object} Feasibility analysis
   */
  canHandleAdditionalLoad(additionalStudents) {
    return this.loadBalancer.canHandleLoad(this.deviceQueues, additionalStudents);
  }

  /**
   * Adjust TPS per person ratio for load balancing
   * @param {number} newRatio - New TPS per person value
   */
  setTPSRatio(newRatio) {
    this.loadBalancer.setTPSPerPerson(newRatio);
    
    // Recalculate capacities with new ratio
    const deviceMetrics = this.ollamaBases.map(base => ({
      base,
      tps: this.devicePerformance[base].tps
    }));
    this.loadBalancer.updateDeviceMetrics(deviceMetrics);
  }

  /**
   * Enable or disable greedy algorithm for load balancing
   * @param {boolean} enabled - Enable or disable greedy mode
   */
  setGreedyMode(enabled) {
    this.loadBalancer.setGreedyMode(enabled);
  }

  /**
   * Get current load balancer configuration
   * @returns {Object} Configuration including greedy mode status
   */
  getLoadBalancerConfig() {
    return {
      useGreedy: this.loadBalancer.useGreedy,
      tpsPerPerson: this.loadBalancer.tpsPerPerson,
      avgTokensPerRequest: this.loadBalancer.avgTokensPerRequest,
      rebalanceEnabled: this.loadBalancer.rebalanceEnabled
    };
  }

  /**
   * Enable or disable work-stealing rebalancing
   * @param {boolean} enabled - Enable or disable rebalancing
   */
  setRebalancingEnabled(enabled) {
    this.loadBalancer.setRebalancingEnabled(enabled);
  }

  /**
   * Get work-stealing rebalance statistics
   * @returns {Object} Stats about queue balance and processing rates
   */
  getRebalanceStats() {
    return this.loadBalancer.getRebalanceStats(this.deviceQueues);
  }

  /**
   * Redistribute pending queue items from a failed device to other available devices
   * @param {string} failedBase - The device base URL that went offline
   */
  redistributeQueue(failedBase) {
    const queue = this.deviceQueues[failedBase];
    
    if (!queue || queue.length === 0) {
      return; // Nothing to redistribute
    }
    
    const onlineDevices = this.loadBalancer.getOnlineDevices();
    
    if (onlineDevices.length === 0) {
      console.warn(`[LLM] Cannot redistribute ${queue.length} requests - no online devices available`);
      // Reject all pending requests since no devices are available
      queue.forEach(request => {
        if (request.resolve) {
          request.resolve("I'm experiencing technical difficulties. Please try again later.");
        }
      });
      queue.length = 0; // Clear the queue
      return;
    }
    
    const itemsToRedistribute = [...queue];
    queue.length = 0; // Clear the original queue
    
    console.log(`[LLM] Redistributing ${itemsToRedistribute.length} requests from ${failedBase} to ${onlineDevices.length} available devices`);
    
    // Redistribute each request using the load balancer
    itemsToRedistribute.forEach(request => {
      const selectedBase = this.loadBalancer.selectBestDevice(
        this.deviceQueues,
        this.deviceBusy,
        request.question
      );
      
      if (selectedBase) {
        this.deviceQueues[selectedBase].push(request);
        console.log(`[LLM] Redirected request to ${selectedBase} (queue: ${this.deviceQueues[selectedBase].length})`);
        // Trigger processing on the new device
        setImmediate(() => this.processDeviceQueue(selectedBase));
      } else {
        // Fallback: distribute to device with shortest queue
        let minQueueBase = onlineDevices[0];
        let minQueueSize = this.deviceQueues[minQueueBase].length;
        
        for (const base of onlineDevices) {
          if (this.deviceQueues[base].length < minQueueSize) {
            minQueueSize = this.deviceQueues[base].length;
            minQueueBase = base;
          }
        }
        
        this.deviceQueues[minQueueBase].push(request);
        console.log(`[LLM] Redirected request to ${minQueueBase} (fallback, queue: ${this.deviceQueues[minQueueBase].length})`);
        setImmediate(() => this.processDeviceQueue(minQueueBase));
      }
    });
    
    console.log(`[LLM] Queue redistribution complete`);
  }

  /**
   * Get list of available models from all Ollama instances
   * @returns {Promise<Array>} Array of model names
   */
  async getAvailableModels() {
    const modelSet = new Set();
    
    // Query each online Ollama instance for available models
    for (const base of this.ollamaBases) {
      try {
        const response = await fetch(`${base}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.models && Array.isArray(data.models)) {
            data.models.forEach(model => {
              if (model.name) modelSet.add(model.name);
            });
          }
        }
      } catch (error) {
        console.warn(`[LLM] Failed to get models from ${base}:`, error.message);
      }
    }
    
    return Array.from(modelSet).sort();
  }

  /**
   * Change the current model and re-benchmark all devices
   * @param {string} newModelName - Name of the model to switch to
   * @returns {Promise<Object>} Result of the model change
   */
  async changeModel(newModelName) {
    if (!newModelName || typeof newModelName !== 'string') {
      throw new Error('Invalid model name');
    }

    const oldModel = this.modelName;
    console.log(`[LLM] Changing model from ${oldModel} to ${newModelName}`);
    
    this.modelName = newModelName;
    
    // Trigger callback to update game state
    if (this.modelChangeCallback) {
      this.modelChangeCallback(newModelName);
    }
    
    // Re-benchmark all devices with new model
    console.log('[LLM] Re-benchmarking all devices with new model...');
    const benchmarks = this.ollamaBases.map(base => this.benchmarkDevice(base));
    await Promise.all(benchmarks);
    
    // Sort devices by new TPS
    this.ollamaBases.sort((a, b) => {
      return this.devicePerformance[b].tps - this.devicePerformance[a].tps;
    });
    
    // Update load balancer with new metrics
    const deviceMetrics = this.ollamaBases.map(base => ({
      base,
      tps: this.devicePerformance[base].tps
    }));
    this.loadBalancer.updateDeviceMetrics(deviceMetrics);
    
    console.log('[LLM] Model change complete');
    return {
      success: true,
      oldModel,
      newModel: newModelName,
      devicePerformance: this.devicePerformance
    };
  }

  /**
   * Start periodic health check to reconnect offline devices
   */
  startHealthCheck() {
    // Check every 30 seconds
    const CHECK_INTERVAL = 30000;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    console.log('[LLM] Starting health check for offline devices (every 30s)');
    
    this.healthCheckInterval = setInterval(async () => {
      await this.checkOfflineDevices();
    }, CHECK_INTERVAL);
  }

  /**
   * Stop the health check interval
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[LLM] Health check stopped');
    }
  }

  /**
   * Check all offline devices and attempt to reconnect them
   */
  async checkOfflineDevices() {
    const offlineDevices = this.ollamaBases.filter(base => !this.loadBalancer.isOnline(base));
    
    if (offlineDevices.length === 0) {
      return; // All devices are online
    }
    
    console.log(`[LLM] Health check: Testing ${offlineDevices.length} offline device(s)...`);
    
    for (const base of offlineDevices) {
      try {
        // Quick health check - just ping the API
        const isResponsive = await this.pingDevice(base);
        
        if (isResponsive) {
          console.log(`[LLM] Device ${base} is responsive! Re-benchmarking...`);
          
          // Re-benchmark the device
          const tps = await this.benchmarkDevice(base);
          
          if (tps > 0) {
            // Mark device as online in load balancer
            this.loadBalancer.markOnline(base, tps);
            
            // Update device metrics
            const deviceMetrics = this.ollamaBases.map(b => ({
              base: b,
              tps: this.devicePerformance[b].tps
            }));
            this.loadBalancer.updateDeviceMetrics(deviceMetrics);
            
            console.log(`[LLM] ✓ Device ${base} reconnected and added back to load balancer (${tps.toFixed(2)} TPS)`);
          }
        }
      } catch (error) {
        // Still offline, check again next interval
        console.log(`[LLM] Device ${base} still offline`);
      }
    }
  }

  /**
   * Quick ping to check if a device is responsive
   * @param {string} base - Device base URL
   * @returns {Promise<boolean>} True if device responds
   */
  async pingDevice(base) {
    try {
      const response = await fetch(`${base}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // ==================== ADVANCED FEATURE API METHODS ====================

  /**
   * Configure advanced load balancing features
   * @param {Object} config - Feature configuration
   */
  configureAdvancedFeatures(config) {
    this.loadBalancer.configureAdvancedFeatures(config);
  }

  /**
   * Get status of all advanced features
   * @returns {Object} Feature status
   */
  getAdvancedFeatureStatus() {
    return this.loadBalancer.getAdvancedFeatureStatus();
  }

  /**
   * Get historical performance profiles for all devices
   * @returns {Object} Performance profiles
   */
  getPerformanceProfiles() {
    return this.loadBalancer.getAllPerformanceProfiles();
  }

  /**
   * Get performance profile for a specific device
   * @param {string} base - Device base URL
   * @returns {Object|null} Performance profile
   */
  getDevicePerformanceProfile(base) {
    return this.loadBalancer.getPerformanceProfile(base);
  }

  /**
   * Export all performance data for analysis
   * @returns {Object} Complete performance data export
   */
  exportPerformanceData() {
    return this.loadBalancer.exportPerformanceData();
  }

  /**
   * Set adaptive queue multiplier for a device
   * @param {string} base - Device base URL
   * @param {number} multiplier - Queue multiplier (1.0 = normal)
   */
  setDeviceQueueMultiplier(base, multiplier) {
    this.loadBalancer.setAdaptiveMultiplier(base, multiplier);
    // Recalculate capacity with new multiplier
    const tps = this.devicePerformance[base]?.tps || 0;
    this.loadBalancer.deviceCapacities[base] = this.loadBalancer.calculateCapacity(tps, base);
  }

  /**
   * Set cancellation timeout for slow requests
   * @param {number} timeoutMs - Timeout in milliseconds
   */
  setCancellationTimeout(timeoutMs) {
    this.loadBalancer.setCancellationTimeout(timeoutMs);
  }

  /**
   * Get batch status for fast machines
   * @returns {Object} Pending batch info
   */
  getBatchStatus() {
    return this.loadBalancer.getBatchStatus();
  }

  /**
   * Check pre-warming recommendations based on queue velocity
   * @returns {Object} Pre-warming recommendations
   */
  getPreWarmingStatus() {
    return this.loadBalancer.checkPreWarming(this.deviceQueues);
  }

  /**
   * Get queue velocities for all devices
   * @returns {Object} Queue velocity per device
   */
  getQueueVelocities() {
    const velocities = {};
    for (const base of this.ollamaBases) {
      velocities[base] = this.loadBalancer.getQueueVelocity(base);
    }
    return velocities;
  }

  /**
   * Clear performance history for a device
   * @param {string} base - Device base URL
   */
  clearDeviceHistory(base) {
    this.loadBalancer.clearPerformanceHistory(base);
  }

  /**
   * Get comprehensive load balancer stats including new features
   * @returns {Object} Complete stats
   */
  getComprehensiveStats() {
    return {
      basic: this.getLoadBalancerMetrics(),
      rebalance: this.getRebalanceStats(),
      queueHealth: this.getQueueHealth(),
      advancedFeatures: this.getAdvancedFeatureStatus(),
      performanceProfiles: this.getPerformanceProfiles(),
      velocities: this.getQueueVelocities(),
      preWarming: this.getPreWarmingStatus()
    };
  }
}

const llmService = new LLMService();

export default llmService;
