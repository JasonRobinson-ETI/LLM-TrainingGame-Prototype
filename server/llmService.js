import si from 'systeminformation';

class LLMService {
  constructor() {
    this.useOllama = true;
    this.modelChangeCallback = null; // Callback for when model changes
    const requiredEnv = (process.env.OLLAMA_REQUIRED || 'true').toLowerCase();
    this.requireOllama = requiredEnv === '1' || requiredEnv === 'true' || requiredEnv === 'yes';

    const normalizeBase = (s) => {
      if (!s) return null;
      let base = s.trim();
      if (!/^https?:\/\//.test(base)) base = `http://${base}`;
      if (!/:\d+$/.test(base)) base = `${base}:11434`;
      return base.replace(/\/$/, '');
    };

    const manualHosts = ['192.168.1.68', '192.168.68.25'];
    
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
    bases.add(normalizeBase('127.0.0.1'));
    bases.add(normalizeBase('localhost'));

    this.ollamaBases = Array.from(bases).filter(Boolean);
    console.log('[LLM] Ollama bases:', this.ollamaBases.join(', '));
    console.log('[LLM] OLLAMA_REQUIRED:', this.requireOllama);

    const modelFromEnv = process.env.LLM_MODEL && process.env.LLM_MODEL.trim();
    const modelListFromEnv = process.env.LLM_MODELS
      ? process.env.LLM_MODELS.split(',').map(m => m.trim()).filter(Boolean)
      : null;
    this.modelCandidates = modelListFromEnv || ['antconsales/antonio-gemma3-evo-q4'];
    this.modelName = modelFromEnv || 'antconsales/antonio-gemma3-evo-q4';

    this.generator = null;
    this.isInitialized = false;
    this.initializationPromise = null;

    // Initialize per-device queues and busy flags
    this.deviceQueues = {};
    this.deviceBusy = {};
    this.devicePerformance = {}; // Track TPS for each device
    this.ollamaBases.forEach(base => {
      this.deviceQueues[base] = [];
      this.deviceBusy[base] = false;
      this.devicePerformance[base] = { tps: 0, model: 'unknown' };
    });
    // Track last used device for round-robin
    this.lastDeviceIndex = -1;
  }

  async getHardwareInfo() {
    try {
      console.log('[LLM] Detecting local hardware...');
      const gpuData = await si.graphics();
      if (gpuData.controllers.length > 0) {
        console.log('[LLM] Detected GPUs/MPUs:');
        gpuData.controllers.forEach((ctrl, idx) => {
          console.log(`  ${idx + 1}. ${ctrl.model} (VRAM: ${ctrl.vram}MB)`);
        });
      }
      const cpu = await si.cpu();
      console.log(`[LLM] CPU: ${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)`);
    } catch (err) {
      console.warn('[LLM] Hardware detection failed:', err.message);
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
          options: { num_predict: 10, temperature: 0 }
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // Calculate TPS
      // eval_duration is in nanoseconds. eval_count is token count.
      const durationSec = data.eval_duration ? (data.eval_duration / 1e9) : 1;
      const tps = data.eval_count ? (data.eval_count / durationSec) : 0;
      
      this.devicePerformance[base].tps = tps;
      console.log(`[LLM] Result ${base}: ${tps.toFixed(2)} TPS`);
      return tps;
    } catch (err) {
      console.warn(`[LLM] Benchmark failed for ${base}: ${err.message}`);
      this.devicePerformance[base].tps = 0;
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

      // Verification: Check if at least one works
      const activeBases = this.ollamaBases.filter(b => this.devicePerformance[b].tps > 0);
      if (activeBases.length > 0) {
        this.isInitialized = true;
        console.log(`[LLM] Initialization complete. ${activeBases.length} active devices ready.`);
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

  buildContext(trainingData, llmKnowledge) {
    const contextParts = [];
    if (llmKnowledge && llmKnowledge.length > 0) {
      contextParts.push('Knowledge base:');
      llmKnowledge.forEach((knowledge, idx) => {
        contextParts.push(`${idx + 1}. ${knowledge}`);
      });
    }
    if (trainingData && trainingData.length > 0) {
      contextParts.push('\nTraining examples:');
      trainingData.forEach((data) => {
        contextParts.push(`Q: ${data.question}`);
        contextParts.push(`A: ${data.answer}`);
      });
    }
    return contextParts.join('\n');
  }

  async generateResponse(question, trainingData = [], llmKnowledge = []) {
    return new Promise((resolve) => {
      const request = { question, trainingData, llmKnowledge, resolve };
      
      // Smart Routing: Prefer fastest idle device
      let selectedBase = null;
      
      // 1. Try to find the highest-ranked idle device
      for (const base of this.ollamaBases) {
        if (!this.deviceBusy[base]) {
          selectedBase = base;
          break;
        }
      }
      
      // 2. If all busy, pick the one with the shortest queue (load balancing)
      //    Tie-breaker goes to the one appearing earlier in the sorted list (higher TPS)
      if (!selectedBase) {
        let minQueue = Infinity;
        for (const base of this.ollamaBases) {
          if (this.deviceQueues[base].length < minQueue) {
            minQueue = this.deviceQueues[base].length;
            selectedBase = base;
          }
        }
      }
      
      // Fallback
      if (!selectedBase) selectedBase = this.ollamaBases[0];

      const tps = this.devicePerformance[selectedBase]?.tps.toFixed(1) || '?';
      console.log(`[LLM] Assigning request to ${selectedBase} (TPS: ${tps})`);
      this.deviceQueues[selectedBase].push(request);
      this.processDeviceQueue(selectedBase);
    });
  }

  findAvailableDevice() {
    // Deprecated in round-robin mode
    return null;
  }

  async processDeviceQueue(base) {
    if (this.deviceBusy[base] || this.deviceQueues[base].length === 0) return;
    
    this.deviceBusy[base] = true;
    const { question, trainingData, llmKnowledge, resolve } = this.deviceQueues[base].shift();
    
    console.log(`[LLM] Processing request on ${base} (queue: ${this.deviceQueues[base].length} remaining)`);
    
    try {
      if (!this.isInitialized) await this.initialize();
      const context = this.buildContext(trainingData, llmKnowledge);
      const response = this.useOllama
        ? await this.generateWithOllamaOnDevice(base, question, context)
        : await this.generateWithTransformers(question, context);
      resolve(response);
    } catch (error) {
      console.error('[LLM] Error generating response on', base, ':', error);
      resolve("I'm still learning. Please ask me again later!");
    } finally {
      this.deviceBusy[base] = false;
      
      // Continue processing this device's queue if there are more requests
      if (this.deviceQueues[base].length > 0) {
        console.log(`[LLM] ${base} processing next queued request`);
        this.processDeviceQueue(base);
      }
    }
  }

  async generateWithOllamaOnDevice(base, question, context) {
    try {
      const prompt = context
        ? `${context}\n\nQuestion: ${question}\nAnswer:`
        : `Question: ${question}\nAnswer:`;

      console.log('[LLM] Generating response with Ollama at', base);

      const tryRequest = async (path, body) => {
        const res = await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        return res;
      };

      const options = { temperature: 0.7, num_predict: 50, stop: ['\n', 'Question:', '?'], num_gpu: 99 };

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

  onModelChange(callback) {
    this.modelChangeCallback = callback;
  }

  getModelName() {
    return this.modelName;
  }
}

const llmService = new LLMService();

export default llmService;
