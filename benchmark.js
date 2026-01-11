import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NUM_STUDENTS = 100;
const SERVER_URL = 'ws://localhost:3001';
const VISUALIZER_PORT = 3002;
const QUESTIONS_PER_STUDENT = 20;
const TRAINING_DURATION = 120000; // 2 minutes (shortened for benchmark)
const QUERY_DURATION = 30000; // 30 seconds (shortened for benchmark)

// Cache for device info (updated periodically from main server)
let cachedDeviceInfo = null;

// HTTP server to serve visualizer
const visualizerServer = createServer(async (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    try {
      const html = readFileSync(join(__dirname, 'benchmark-visualizer.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (err) {
      res.writeHead(404);
      res.end('Visualizer HTML not found');
    }
  } else if (req.url === '/api/devices') {
    // Proxy to main server or return cached data
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    if (cachedDeviceInfo) {
      res.end(JSON.stringify(cachedDeviceInfo));
    } else {
      res.end(JSON.stringify({ devices: [], useOllama: false, error: 'No device info available yet' }));
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// Visualizer WebSocket server
const visualizerWss = new WebSocketServer({ server: visualizerServer });
const visualizerClients = new Set();

visualizerWss.on('connection', (ws) => {
  console.log('[VISUALIZER] Client connected');
  visualizerClients.add(ws);
  
  // Send initial state with current stats
  ws.send(JSON.stringify({
    type: 'init',
    totalStudents: NUM_STUDENTS,
    currentStats: {
      connectedStudents: stats.connectedStudents,
      questionsSubmitted: stats.questionsSubmitted,
      answersReceived: stats.answersReceived,
      challengesReceived: stats.challengesReceived,
      challengesCompleted: stats.challengesCompleted,
      challengesFailed: stats.challengesFailed,
      llmQueriesSubmitted: stats.llmQueriesSubmitted,
      llmResponsesReceived: stats.llmResponsesReceived,
      llmPlaceholderResponses: stats.llmPlaceholderResponses,
      llmRealResponses: stats.llmRealResponses,
      errors: stats.errors
    }
  }));
  
  // Send already-connected students
  students.forEach((student, idx) => {
    if (student.connected) {
      ws.send(JSON.stringify({
        type: 'student_connected',
        id: idx + 1,
        name: student.name
      }));
    }
  });
  
  ws.on('close', () => {
    visualizerClients.delete(ws);
  });
});

visualizerServer.listen(VISUALIZER_PORT, () => {
  console.log(`\n[VISUALIZER] Dashboard available at http://localhost:${VISUALIZER_PORT}`);
  console.log(`Open benchmark-visualizer.html in your browser to view real-time stats\n`);
});

function broadcastToVisualizer(data) {
  const message = JSON.stringify(data);
  visualizerClients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

const stats = {
  connectedStudents: 0,
  questionsSubmitted: 0,
  answersReceived: 0,
  challengesReceived: 0,
  challengesCompleted: 0,
  challengesFailed: 0,
  llmQueriesSubmitted: 0,
  llmResponsesReceived: 0,
  llmPlaceholderResponses: 0,
  llmRealResponses: 0,
  errors: 0,
  startTime: null,
  endTime: null,
  trainingLatencies: [],
  queryLatencies: [],
  // Enhanced metrics
  connectionTimes: [],
  messageReceiveTimes: [],
  questionSubmitTimes: [],
  answerSubmitTimes: [],
  challengeCompletionTimes: [],
  phaseTimings: {},
  studentActivity: new Map(),
  wsMessagesByType: {},
  errorsByType: {},
  memorySnapshots: []
};

const students = [];
let teacher = null;

class SimulatedStudent {
  constructor(id) {
    this.id = `student_${id}`;
    this.name = `Student ${id}`;
    this.ws = null;
    this.connected = false;
    this.questionsSubmitted = 0;
    this.currentMode = null;
    this.questionSubmitTimes = new Map();
    this.querySubmitTimes = new Map();
    this.queriesSubmitted = 0;
  }

  connect() {
    const connectStart = Date.now();
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(SERVER_URL);
      
      this.ws.on('open', () => {
        const connectTime = Date.now() - connectStart;
        stats.connectionTimes.push(connectTime);
        console.log(`[${this.name}] Connected in ${connectTime}ms`);
        this.connected = true;
        stats.connectedStudents++;
        
        // Broadcast to visualizer
        broadcastToVisualizer({ 
          type: 'student_connected', 
          id: parseInt(this.id.split('_')[1]),
          name: this.name 
        });
        
        this.ws.send(JSON.stringify({
          type: 'register',
          role: 'student',
          name: this.name,
          clientId: this.id
        }));
        
        if (!stats.studentActivity.has(this.id)) {
          stats.studentActivity.set(this.id, {
            name: this.name,
            questionsAsked: 0,
            questionsAnswered: 0,
            challengesCompleted: 0,
            llmQueries: 0
          });
        }
        
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error(`[${this.name}] WebSocket error:`, error.message);
        stats.errors++;
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`[${this.name}] Disconnected`);
        this.connected = false;
      });

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // Track message types
      stats.wsMessagesByType[message.type] = (stats.wsMessagesByType[message.type] || 0) + 1;
      
      switch (message.type) {
        case 'registered':
          console.log(`[${this.name}] Registered successfully`);
          break;
          
        case 'game_state':
          if (message.gameState && message.gameState.clients) {
            const clientInfo = message.gameState.clients[this.id];
            if (clientInfo) {
              this.currentMode = clientInfo.currentMode;
            }
          }
          break;
          
        case 'clients_update':
          if (message.clients && message.clients[this.id]) {
            this.currentMode = message.clients[this.id].currentMode;
          }
          break;
          
        case 'new_question_prompt':
          if (this.questionsSubmitted < QUESTIONS_PER_STUDENT) {
            this.acceptQuestion(message.question.text, message.question.type);
          }
          break;
          
        case 'answer_request':
          this.answerQuestion(message.question);
          stats.answersReceived++;
          const activity = stats.studentActivity.get(this.id);
          if (activity) activity.questionsAnswered++;
          
          // Broadcast to visualizer
          broadcastToVisualizer({
            type: 'answer_received',
            studentId: parseInt(this.id.split('_')[1])
          });
          break;
          
        case 'challenge_assigned':
          stats.challengesReceived++;
          broadcastToVisualizer({ type: 'challenge' });
          this.completeChallenge(message.challenge);
          break;
          
        case 'llm_response':
          if (this.questionSubmitTimes.has(message.questionId)) {
            const latency = Date.now() - this.questionSubmitTimes.get(message.questionId);
            stats.trainingLatencies.push(latency);
            this.questionSubmitTimes.delete(message.questionId);
            console.log(`[${this.name}] Training response latency: ${latency}ms`);
          }
          if (message.question && this.querySubmitTimes.has(message.question)) {
            const latency = Date.now() - this.querySubmitTimes.get(message.question);
            stats.queryLatencies.push(latency);
            this.querySubmitTimes.delete(message.question);
            stats.llmResponsesReceived++;
            
            // Detect placeholder vs real response
            const isPlaceholder = message.response && 
              (message.response.includes("I'm still learning") || 
               message.response.includes("Please ask me again later"));
            
            if (isPlaceholder) {
              stats.llmPlaceholderResponses++;
              console.log(`[${this.name}] ⚠️  LLM still learning (${latency}ms): "${message.response.substring(0, 60)}..."`);
            } else {
              stats.llmRealResponses++;
              console.log(`[${this.name}] ✅ LLM real response (${latency}ms): "${message.response.substring(0, 60)}..."`);
            }
            
            // Broadcast to visualizer
            broadcastToVisualizer({
              type: 'llm_response',
              question: message.question,
              response: message.response.substring(0, 60),
              latency,
              isPlaceholder
            });
          }
          break;
      }
    } catch (error) {
      console.error(`[${this.name}] Error handling message:`, error);
      stats.errors++;
      const errorType = error.constructor.name;
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
    }
  }

  acceptQuestion(questionText, questionType = 'regular') {
    if (!this.connected) return;
    
    const submitStart = Date.now();
    const questionId = uuidv4();
    this.questionSubmitTimes.set(questionId, Date.now());
    
    this.ws.send(JSON.stringify({
      type: 'request_next_question',
      questionText: questionText,
      questionType: questionType
    }));
    
    stats.questionSubmitTimes.push(Date.now() - submitStart);
    this.questionsSubmitted++;
    stats.questionsSubmitted++;
    
    const activity = stats.studentActivity.get(this.id);
    if (activity) activity.questionsAsked++;
    
    // Broadcast to visualizer
    broadcastToVisualizer({
      type: 'question_submitted',
      studentId: parseInt(this.id.split('_')[1]),
      question: String(questionText).substring(0, 50)
    });
    
    console.log(`[${this.name}] Submitted question ${this.questionsSubmitted}/${QUESTIONS_PER_STUDENT}: ${String(questionText).substring(0, 50)}...`);
  }

  answerQuestion(question) {
    if (!this.connected) return;
    
    setTimeout(() => {
      const submitStart = Date.now();
      const answer = `Answer from ${this.name}`;
      this.ws.send(JSON.stringify({
        type: 'submit_answer',
        questionId: question.id,
        answer: answer
      }));
      stats.answerSubmitTimes.push(Date.now() - submitStart);
      console.log(`[${this.name}] Answered question: ${question.text.substring(0, 30)}...`);
    }, 500 + Math.random() * 1000);
  }

  completeChallenge(challenge) {
    if (!this.connected) return;
    
    setTimeout(() => {
      const completeStart = Date.now();
      // 70% success rate, 30% failure rate
      const success = Math.random() > 0.3;
      
      this.ws.send(JSON.stringify({
        type: 'challenge_completed',
        challengeId: challenge.id,
        success: success
      }));
      stats.challengeCompletionTimes.push(Date.now() - completeStart);
      
      if (success) {
        stats.challengesCompleted++;
        broadcastToVisualizer({ type: 'challenge_completed', success: true });
        const activity = stats.studentActivity.get(this.id);
        if (activity) activity.challengesCompleted++;
        console.log(`[${this.name}] ✅ Passed challenge: ${challenge.type}`);
      } else {
        stats.challengesFailed++;
        broadcastToVisualizer({ 
          type: 'challenge_failed', 
          studentId: parseInt(this.id.split('_')[1]),
          challengeType: challenge.type
        });
        console.log(`[${this.name}] ❌ Failed challenge: ${challenge.type} - Corrupting training data!`);
      }
    }, 200 + Math.random() * 300);
  }

  queryLLM(question) {
    if (!this.connected) return;
    
    this.querySubmitTimes.set(question, Date.now());
    
    this.ws.send(JSON.stringify({
      type: 'query_llm',
      question: question
    }));
    
    this.queriesSubmitted++;
    stats.llmQueriesSubmitted++;
    
    // Update activity tracker
    const activity = stats.studentActivity.get(this.id);
    if (activity) activity.llmQueries++;
    
    // Broadcast to visualizer
    broadcastToVisualizer({
      type: 'llm_query',
      question,
      studentId: parseInt(this.id.split('_')[1])
    });
    
    console.log(`[${this.name}] Querying LLM: "${question}"`);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

class SimulatedTeacher {
  constructor() {
    this.id = 'teacher_benchmark';
    this.name = 'Benchmark Teacher';
    this.ws = null;
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(SERVER_URL);
      
      this.ws.on('open', () => {
        console.log(`[TEACHER] Connected`);
        this.connected = true;
        
        this.ws.send(JSON.stringify({
          type: 'register',
          role: 'teacher',
          name: this.name,
          clientId: this.id
        }));
        
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'registered') {
            console.log(`[TEACHER] Registered successfully`);
          }
        } catch (error) {
          console.error(`[TEACHER] Error handling message:`, error);
        }
      });

      this.ws.on('error', (error) => {
        console.error(`[TEACHER] WebSocket error:`, error.message);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log(`[TEACHER] Disconnected`);
        this.connected = false;
      });

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  startGame() {
    if (!this.connected) return;
    
    this.ws.send(JSON.stringify({
      type: 'start_game'
    }));
    
    console.log(`[TEACHER] Started game`);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

function captureMemorySnapshot(label) {
  const mem = process.memoryUsage();
  stats.memorySnapshots.push({
    label,
    timestamp: Date.now(),
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss
  });
}

async function runBenchmark() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BENCHMARK: Simulating ${NUM_STUDENTS} students`);
  console.log(`Each student will submit ${QUESTIONS_PER_STUDENT} questions`);
  console.log(`Total expected questions: ${NUM_STUDENTS * QUESTIONS_PER_STUDENT}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Check if server is running first
  console.log('[INIT] Checking if game server is running...');
  try {
    const response = await fetch('http://localhost:3001/api/devices');
    if (response.ok) {
      const data = await response.json();
      cachedDeviceInfo = data;
      console.log(`[INIT] ✓ Server is running with ${data.devices?.length || 0} device(s)`);
    }
  } catch (err) {
    console.error('\n' + '!'.repeat(60));
    console.error('ERROR: Game server is not running!');
    console.error('');
    console.error('Please start the server first with:');
    console.error('  npm run dev');
    console.error('');
    console.error('Or in a separate terminal:');
    console.error('  npm run server');
    console.error('!'.repeat(60) + '\n');
    process.exit(1);
  }
  
  stats.startTime = Date.now();
  captureMemorySnapshot('Start');
  
  // Initialize students
  for (let i = 1; i <= NUM_STUDENTS; i++) {
    students.push(new SimulatedStudent(i));
  }
  
  // Phase 0: Connect teacher
  console.log('\n[PHASE 0] Connecting teacher...\n');
  broadcastToVisualizer({ type: 'phase', phase: 0, name: 'Teacher Connect' });
  const phase0Start = Date.now();
  teacher = new SimulatedTeacher();
  await teacher.connect();
  stats.phaseTimings.teacherConnect = Date.now() - phase0Start;
  console.log(`\n[PHASE 0 COMPLETE] Teacher connected in ${stats.phaseTimings.teacherConnect}ms\n`);
  captureMemorySnapshot('Teacher Connected');
  
  // Phase 1: Connect students
  console.log('\n[PHASE 1] Connecting students...\n');
  broadcastToVisualizer({ type: 'phase', phase: 1, name: 'Student Connect' });
  const phase1Start = Date.now();
  const connectPromises = students.map(student => 
    student.connect().catch(err => {
      console.error(`Failed to connect ${student.name}:`, err.message);
      stats.errors++;
      broadcastToVisualizer({ type: 'error', message: `Failed to connect ${student.name}` });
    })
  );
  
  await Promise.all(connectPromises);
  stats.phaseTimings.studentsConnect = Date.now() - phase1Start;
  console.log(`\n[PHASE 1 COMPLETE] ${stats.connectedStudents}/${NUM_STUDENTS} students connected in ${stats.phaseTimings.studentsConnect}ms\n`);
  captureMemorySnapshot('Students Connected');
  
  // Phase 2: Start game
  console.log('\n[PHASE 2] Starting game...\n');
  broadcastToVisualizer({ type: 'phase', phase: 2, name: 'Game Start' });
  const phase2Start = Date.now();
  teacher.startGame();
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  stats.phaseTimings.gameStart = Date.now() - phase2Start;
  console.log(`\n[PHASE 2 COMPLETE] Game started in ${stats.phaseTimings.gameStart}ms\n`);
  captureMemorySnapshot('Game Started');
  
  // Fetch initial device info
  try {
    const deviceInfo = await fetch('http://localhost:3001/api/devices').then(res => res.json());
    cachedDeviceInfo = deviceInfo;
    broadcastToVisualizer({ type: 'devices', ...deviceInfo });
  } catch (err) {
    // Server may not be ready yet - this is expected during startup
    console.log('[VISUALIZER] Waiting for server device info...');
  }
  
  // Phase 3: Training phase
  console.log('\n[PHASE 3] Students actively asking and answering (training phase)...\n');
  broadcastToVisualizer({ type: 'phase', phase: 3, name: 'Training Phase' });
  console.log(`\n[RUNNING] Training phase will run for ${TRAINING_DURATION/1000} seconds...\n`);
  console.log('[TRAINING] Students waiting for server to assign roles and send prompts...\n');
  const phase3Start = Date.now();
  
  // Log training progress every 10 seconds
  const trainingLogInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - phase3Start) / 1000);
    console.log(`[TRAINING] ${elapsed}s elapsed - Questions: ${stats.questionsSubmitted}, Answers: ${stats.answersReceived}, Challenges: ${stats.challengesCompleted}/${stats.challengesReceived}`);
  }, 10000);
  
  // Take memory snapshots during training and broadcast progress
  const memoryInterval = setInterval(() => {
    captureMemorySnapshot('Training Phase');
    const latest = stats.memorySnapshots[stats.memorySnapshots.length - 1];
    broadcastToVisualizer({ type: 'memory', memory: latest });
    
    // Broadcast training progress
    const elapsed = Date.now() - phase3Start;
    const percent = Math.min(100, Math.round((elapsed / TRAINING_DURATION) * 100));
    broadcastToVisualizer({ type: 'progress', percent });
    
    // Fetch and broadcast device info
    fetch('http://localhost:3001/api/devices')
      .then(res => res.json())
      .then(data => {
        cachedDeviceInfo = data;
        broadcastToVisualizer({ type: 'devices', ...data });
      })
      .catch(() => { /* Server not ready, will retry */ });
  }, 2000); // Every 2 seconds for real-time TPS updates
  
  await new Promise(resolve => setTimeout(resolve, TRAINING_DURATION));
  clearInterval(memoryInterval);
  clearInterval(trainingLogInterval);
  stats.phaseTimings.training = Date.now() - phase3Start;
  console.log(`\n[PHASE 3 COMPLETE] Training phase completed in ${(stats.phaseTimings.training / 1000).toFixed(2)}s\n`);
  console.log(`[TRAINING] Final counts - Questions: ${stats.questionsSubmitted}, Answers: ${stats.answersReceived}, Challenges: ${stats.challengesCompleted}/${stats.challengesReceived}\n`);
  captureMemorySnapshot('Training Complete');
  
  // Phase 4: Query the trained LLM
  console.log('\n[PHASE 4] Querying the trained LLM...\n');
  broadcastToVisualizer({ type: 'phase', phase: 4, name: 'Query LLM' });
  const phase4Start = Date.now();  
  // Check how much training data was collected
  console.log(`\n[DIAGNOSTICS] Checking training data...`);
  console.log(`  Questions Submitted: ${stats.questionsSubmitted}`);
  console.log(`  Answers Received: ${stats.answersReceived}`);
  console.log(`  Expected ${NUM_STUDENTS * QUESTIONS_PER_STUDENT} questions total\n`);
  
  if (stats.answersReceived < 10) {
    console.warn(`  ⚠️  WARNING: Very few answers collected (${stats.answersReceived}). LLM may not have enough training data!\n`);
  }  
  const llmQueries = [
    "Who is the most helpful student?",
    "Who makes everyone laugh?",
    "Who is the best at math?",
    "Who is the kindest person?",
    "Who would make a great team leader?",
    "Who is the most creative?",
    "Who always helps others?",
    "Who is really smart?"
  ];
  
  const llmQueriesSubmitted = new Set();
  
  for (const student of students) {
    if (student.connected) {
      const query = llmQueries[Math.floor(Math.random() * llmQueries.length)];
      student.queryLLM(query);
      llmQueriesSubmitted.add(student.id);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`\n[WAITING] Submitted ${llmQueriesSubmitted.size} queries. Waiting for all responses...\n`);
  
  // Wait indefinitely until all responses are received
  const checkInterval = 2000; // Check every 2 seconds for more real-time updates
  let elapsed = 0;
  
  while (stats.llmResponsesReceived < llmQueriesSubmitted.size) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    elapsed += checkInterval;
    
    const responseCount = stats.llmResponsesReceived;
    const stillWaiting = llmQueriesSubmitted.size - responseCount;
    console.log(`[WAITING] ${elapsed/1000}s - Received ${responseCount}/${llmQueriesSubmitted.size} responses (${stillWaiting} pending)`);
    
    // Fetch and broadcast device info to show queue status
    try {
      const deviceInfo = await fetch('http://localhost:3001/api/devices').then(res => res.json());
      cachedDeviceInfo = deviceInfo;
      broadcastToVisualizer({ type: 'devices', ...deviceInfo });
    } catch {
      // Server connection issue, continue without device info
    }
  }
  
  console.log(`[WAITING] ✓ All ${stats.llmResponsesReceived} responses received!`);
  
  stats.phaseTimings.query = Date.now() - phase4Start;
  console.log(`\n[PHASE 4 COMPLETE] Query phase completed in ${(stats.phaseTimings.query / 1000).toFixed(2)}s\n`);
  captureMemorySnapshot('Query Complete');
  
  // Results
  stats.endTime = Date.now();
  const totalTime = (stats.endTime - stats.startTime) / 1000;
  captureMemorySnapshot('End');
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('BENCHMARK RESULTS');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total Time: ${totalTime.toFixed(2)}s`);
  console.log(`Students Connected: ${stats.connectedStudents}/${NUM_STUDENTS}`);
  
  console.log(`\n⏱️  Phase Timings:`);
  console.log(`  Teacher Connect: ${stats.phaseTimings.teacherConnect}ms`);
  console.log(`  Students Connect: ${stats.phaseTimings.studentsConnect}ms (${(stats.phaseTimings.studentsConnect / NUM_STUDENTS).toFixed(2)}ms avg per student)`);
  console.log(`  Game Start: ${stats.phaseTimings.gameStart}ms`);
  console.log(`  Training Phase: ${(stats.phaseTimings.training / 1000).toFixed(2)}s`);
  console.log(`  Query Phase: ${(stats.phaseTimings.query / 1000).toFixed(2)}s`);
  
  // Connection performance
  if (stats.connectionTimes.length > 0) {
    const avgConn = stats.connectionTimes.reduce((a, b) => a + b, 0) / stats.connectionTimes.length;
    const maxConn = Math.max(...stats.connectionTimes);
    const minConn = Math.min(...stats.connectionTimes);
    console.log(`\n🔌 Connection Performance:`);
    console.log(`  Min: ${minConn}ms`);
    console.log(`  Max: ${maxConn}ms`);
    console.log(`  Avg: ${avgConn.toFixed(2)}ms`);
  }
  
  // WebSocket message breakdown
  console.log(`\n📨 WebSocket Messages by Type:`);
  const sortedMessages = Object.entries(stats.wsMessagesByType)
    .sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedMessages) {
    console.log(`  ${type}: ${count}`);
  }
  
  // Student activity breakdown
  console.log(`\n👥 Student Activity Breakdown:`);
  const activities = Array.from(stats.studentActivity.values());
  if (activities.length > 0) {
    const avgQuestionsAsked = activities.reduce((sum, a) => sum + a.questionsAsked, 0) / activities.length;
    const avgQuestionsAnswered = activities.reduce((sum, a) => sum + a.questionsAnswered, 0) / activities.length;
    const avgChallenges = activities.reduce((sum, a) => sum + a.challengesCompleted, 0) / activities.length;
    const avgQueries = activities.reduce((sum, a) => sum + a.llmQueries, 0) / activities.length;
    
    console.log(`  Avg Questions Asked per Student: ${avgQuestionsAsked.toFixed(2)}`);
    console.log(`  Avg Questions Answered per Student: ${avgQuestionsAnswered.toFixed(2)}`);
    console.log(`  Avg Challenges Completed per Student: ${avgChallenges.toFixed(2)}`);
    console.log(`  Avg LLM Queries per Student: ${avgQueries.toFixed(2)}`);
    
    // Find most/least active students
    const mostQuestionsAsked = activities.reduce((max, a) => a.questionsAsked > max.questionsAsked ? a : max);
    const leastQuestionsAsked = activities.reduce((min, a) => a.questionsAsked < min.questionsAsked ? a : min);
    console.log(`  Most Active (questions): ${mostQuestionsAsked.name} (${mostQuestionsAsked.questionsAsked})`);
    console.log(`  Least Active (questions): ${leastQuestionsAsked.name} (${leastQuestionsAsked.questionsAsked})`);
  }
  
  // Memory usage analysis
  if (stats.memorySnapshots.length > 0) {
    console.log(`\n💾 Memory Usage:`);
    const startMem = stats.memorySnapshots[0];
    const endMem = stats.memorySnapshots[stats.memorySnapshots.length - 1];
    const heapGrowth = endMem.heapUsed - startMem.heapUsed;
    const rssGrowth = endMem.rss - startMem.rss;
    
    console.log(`  Start Heap: ${(startMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  End Heap: ${(endMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Growth: ${(heapGrowth / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Start RSS: ${(startMem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  End RSS: ${(endMem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  RSS Growth: ${(rssGrowth / 1024 / 1024).toFixed(2)} MB`);
    
    // Peak memory usage
    const peakHeap = Math.max(...stats.memorySnapshots.map(s => s.heapUsed));
    const peakRss = Math.max(...stats.memorySnapshots.map(s => s.rss));
    console.log(`  Peak Heap: ${(peakHeap / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Peak RSS: ${(peakRss / 1024 / 1024).toFixed(2)} MB`);
  }
  
  // Error breakdown
  if (Object.keys(stats.errorsByType).length > 0) {
    console.log(`\n⚠️  Errors by Type:`);
    for (const [type, count] of Object.entries(stats.errorsByType)) {
      console.log(`  ${type}: ${count}`);
    }
  }
  
  // Operation timing breakdowns
  if (stats.questionSubmitTimes.length > 0) {
    const avgTime = stats.questionSubmitTimes.reduce((a, b) => a + b, 0) / stats.questionSubmitTimes.length;
    console.log(`\n⚡ Operation Timings:`);
    console.log(`  Question Submit Avg: ${avgTime.toFixed(2)}ms`);
  }
  if (stats.answerSubmitTimes.length > 0) {
    const avgTime = stats.answerSubmitTimes.reduce((a, b) => a + b, 0) / stats.answerSubmitTimes.length;
    console.log(`  Answer Submit Avg: ${avgTime.toFixed(2)}ms`);
  }
  if (stats.challengeCompletionTimes.length > 0) {
    const avgTime = stats.challengeCompletionTimes.reduce((a, b) => a + b, 0) / stats.challengeCompletionTimes.length;
    console.log(`  Challenge Complete Avg: ${avgTime.toFixed(2)}ms`);
  }
  
  console.log(`\nTraining Phase:`);
  console.log(`  Questions Submitted: ${stats.questionsSubmitted}`);
  console.log(`  Answers Received: ${stats.answersReceived}`);
  console.log(`  Challenges Received: ${stats.challengesReceived}`);
  console.log(`  Challenges Completed (✅): ${stats.challengesCompleted}`);
  console.log(`  Challenges Failed (❌): ${stats.challengesFailed}`);
  if (stats.challengesReceived > 0) {
    const successRate = ((stats.challengesCompleted / stats.challengesReceived) * 100).toFixed(1);
    console.log(`  Challenge Success Rate: ${successRate}%`);
  }
  
  console.log(`\nQuery Phase (Testing Trained LLM):`);
  console.log(`  LLM Queries Submitted: ${stats.llmQueriesSubmitted}`);
  console.log(`  LLM Responses Received: ${stats.llmResponsesReceived}`);
  console.log(`  Real Responses (Learned): ${stats.llmRealResponses}`);
  console.log(`  Placeholder Responses (Still Learning): ${stats.llmPlaceholderResponses}`);
  if (stats.llmQueriesSubmitted > 0) {
    console.log(`  Total Response Rate: ${((stats.llmResponsesReceived / stats.llmQueriesSubmitted) * 100).toFixed(1)}%`);
    console.log(`  Learning Success Rate: ${((stats.llmRealResponses / stats.llmQueriesSubmitted) * 100).toFixed(1)}%`);
  }
  
  console.log(`\nErrors: ${stats.errors}`);
  
  if (stats.trainingLatencies.length > 0) {
    const avgLatency = stats.trainingLatencies.reduce((a, b) => a + b, 0) / stats.trainingLatencies.length;
    const minLatency = Math.min(...stats.trainingLatencies);
    const maxLatency = Math.max(...stats.trainingLatencies);
    const sortedLatencies = [...stats.trainingLatencies].sort((a, b) => a - b);
    const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
    
    console.log(`\nTraining Response Latency:`);
    console.log(`  Min: ${minLatency}ms`);
    console.log(`  Max: ${maxLatency}ms`);
    console.log(`  Avg: ${avgLatency.toFixed(2)}ms`);
    console.log(`  P95: ${p95Latency}ms`);
  }
  
  if (stats.queryLatencies.length > 0) {
    const avgLatency = stats.queryLatencies.reduce((a, b) => a + b, 0) / stats.queryLatencies.length;
    const minLatency = Math.min(...stats.queryLatencies);
    const maxLatency = Math.max(...stats.queryLatencies);
    const sortedLatencies = [...stats.queryLatencies].sort((a, b) => a - b);
    const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
    
    console.log(`\nLLM Query Latency:`);
    console.log(`  Min: ${minLatency}ms`);
    console.log(`  Max: ${maxLatency}ms`);
    console.log(`  Avg: ${avgLatency.toFixed(2)}ms`);
    console.log(`  P95: ${p95Latency}ms`);
  }
  
  console.log(`\nThroughput:`);
  console.log(`  Training Questions/sec: ${(stats.questionsSubmitted / totalTime).toFixed(2)}`);
  console.log(`  Training Answers/sec: ${(stats.answersReceived / totalTime).toFixed(2)}`);
  console.log(`  LLM Queries/sec: ${(stats.llmQueriesSubmitted / totalTime).toFixed(2)}`);
  console.log(`${'='.repeat(60)}\n`);
  
  // Cleanup
  console.log('Disconnecting students and teacher...');
  students.forEach(student => student.disconnect());
  if (teacher) teacher.disconnect();
  
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', () => {
  console.log('\n\nBenchmark interrupted. Cleaning up...');
  students.forEach(student => student.disconnect());
  if (teacher) teacher.disconnect();
  setTimeout(() => process.exit(0), 500);
});

runBenchmark().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});
