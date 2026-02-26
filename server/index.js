import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import llmService from './llmService.js';
import { censorText } from './contentFilter.js';
import { networkInterfaces } from 'os';
import { createChallenge } from './challengeData.js';

// Helper function to get local IP
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// API endpoint to get LLM device information for monitoring
app.get('/api/devices', (req, res) => {
  const devices = llmService.ollamaBases.map(base => {
    const lbTPS = llmService.loadBalancer.deviceTPS[base] || 0;
    const perfTPS = llmService.devicePerformance[base]?.tps || 0;
    // Use load balancer's real-time TPS (updated during inference) or fall back to devicePerformance
    const currentTPS = lbTPS > 0 ? lbTPS : perfTPS;
    
    return {
      url: base,
      queueSize: llmService.deviceQueues[base]?.length || 0,
      busy: llmService.deviceBusy[base] || 0,
      tps: currentTPS,
      maxConcurrent: llmService.loadBalancer.getMaxConcurrent(base),
      capacity: llmService.loadBalancer.deviceCapacities[base] || 0,
      ranking: llmService.loadBalancer.deviceRankings[base] || 0,
      online: llmService.loadBalancer.isOnline(base),
      model: llmService.devicePerformance[base]?.model || llmService.modelName,
      acceleration: llmService.devicePerformance[base]?.acceleration || 'unknown',
      questionsAnswered: llmService.devicePerformance[base]?.questionsAnswered || 0
    };
  });
  
  res.json({
    devices,
    useOllama: llmService.useOllama,
    currentModel: llmService.modelName,
    localHardware: llmService.localHardwareInfo,
    hasMetalAcceleration: llmService.hasMetalAcceleration,
    totalCapacity: llmService.loadBalancer.getTotalCapacity(),
    strategy: llmService.loadBalancer.getStrategy()
  });
});

// API endpoint to get available models from Ollama
app.get('/api/models', async (req, res) => {
  try {
    const models = await llmService.getAvailableModels();
    res.json({
      success: true,
      currentModel: llmService.modelName,
      availableModels: models
    });
  } catch (error) {
    console.error('[API] Failed to get models:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to change the current model
app.post('/api/models/change', async (req, res) => {
  const { modelName } = req.body;
  
  if (!modelName) {
    return res.status(400).json({
      success: false,
      error: 'modelName is required'
    });
  }
  
  try {
    const result = await llmService.changeModel(modelName);
    res.json(result);
  } catch (error) {
    console.error('[API] Failed to change model:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Set up callback to update gameState when LLM model changes
llmService.onModelChange((newModelName) => {
  gameState.llmModel = newModelName;
  console.log('[SERVER] LLM model updated in gameState:', newModelName);
  // Broadcast the update to all clients
  broadcast({ type: 'game_state', gameState });
});

// Game state
let gameState = {
  isActive: false,
  startTime: null,
  llmKnowledge: [],
  llmPersonality: 'neutral',
  llmModel: llmService.modelName, // Track the current LLM model being used
  clients: {},
  pendingQuestions: [],
  trainingData: [],
  challenges: [],
  evolutionCount: 0,
  starredQAPairs: [] // Track starred Q&A pairs from students
};

// Timers for game cycles
let evolutionInterval = null;
let challengeInterval = null;
let llmPrimingInterval = null; // New: LLM priming every 2 minutes
let lastChallengeTime = 0; // Track when last challenge was sent
let lastChallengeTypes = new Map(); // Track last challenge type per client
let activeQuestions = new Map(); // Track which question is assigned to each client
let askedQuestions = new Set(); // Track which questions have been asked to avoid repeats
let activeLLMQueries = new Map(); // Track clients with pending LLM queries

// Cache for filtered training data to avoid re-filtering on every LLM query
let cleanTrainingDataCache = null;
let lastTrainingDataLength = 0;

// Question prompts - asking "Who..." questions where the answer is a person's name
// This helps the AI learn to associate people with traits and characteristics
const questionPrompts = [
  "Who in this class is the funniest person you know?",
  "Who is the best at making people laugh?",
  "Who is the kindest person in this room?",
  "Who would you pick to be on your team for a game?",
  "Who is the best artist in this class?",
  "Who is the fastest runner you know?",
  "Who always has the best ideas?",
  "Who is really good at math?",
  "Who loves to read the most?",
  "Who is the best at sports?",
  "Who would you want to sit next to on a bus trip?",
  "Who is the most creative person you know?",
  "Who always helps others?",
  "Who makes the best jokes?",
  "Who is really smart?",
  "Who is the bravest person you know?",
  "Who loves animals the most?",
  "Who is the best singer or dancer?",
  "Who is really good at video games?",
  "Who would you want as a partner for a project?",
  "Who always has a smile on their face?",
  "Who is the most energetic person in class?",
  "Who is really good at drawing?",
  "Who tells the best stories?",
  "Who is the most organized person you know?",
  "Who is really good at science?",
  "Who loves recess the most?",
  "Who is the quietest person in class?",
  "Who is the loudest person in class?",
  "Who is most likely to become famous?",
  "Who would make the best teacher?",
  "Who is the most adventurous person you know?",
  "Who is really good at building things?",
  "Who loves music the most?",
  "Who is the best listener?",
  "Who would you go to for help with homework?",
  "Who is the most curious person in class?",
  "Who has the coolest hobbies?",
  "Who is most likely to invent something amazing?",
  "Who is really good at solving puzzles?",
  "Who loves to learn new things?",
  "Who is the most patient person you know?",
  "Who is always on time?",
  "Who has the best handwriting?",
  "Who would make the best leader?",
  "Who is the most determined person in class?",
  "Who never gives up?",
  "Who has the best memory?",
  "Who is really good at making friends?",
  "Who would you want on your side in an argument?",
  "Who is the most generous person you know?",
  "Who always shares their things?",
  "Who gives the best advice?",
  "Who is the most loyal friend?",
  "Who is really good with computers or technology?",
  "Who would survive the longest on a deserted island?",
  "Who is most likely to become a professional athlete?",
  "Who has the coolest collection of anything?",
  "Who is the best at keeping secrets?",
  "Who would you pick to be class president?"
];

// Configuration questions - deeper questions to shape AI personality
const configQuestions = [
  "Who is the person who cheers people up when they're sad?",
  "Who is someone who stays calm during disagreements?",
  "Who is most likely to admit when they make a mistake?",
  "Who celebrates the loudest when something good happens?",
  "Who always asks questions when they don't understand?"
];

// WebSocket connections
const connections = new Map();

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  connections.set(clientId, ws);
  console.log(`[WS] Client connected: ${clientId}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`[WS] Message from ${clientId}:`, data.type, data);
      handleMessage(clientId, data, ws);
    } catch (error) {
      console.error(`[WS] Error parsing message from ${clientId}:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${clientId}`);
    connections.delete(clientId);
    if (gameState.clients[clientId]) {
      console.log(`[WS] Removing client ${clientId} from game state`);
      delete gameState.clients[clientId];
      // Clear any active question tracking for this client
      activeQuestions.delete(clientId);
      lastChallengeTypes.delete(clientId);
      activeLLMQueries.delete(clientId); // Clear pending LLM queries
      broadcast({ type: 'clients_update', clients: gameState.clients });
    }
  });
  
  ws.on('error', (error) => {
    console.error(`[WS] WebSocket error for ${clientId}:`, error);
  });

  // Send initial state
  ws.send(JSON.stringify({ type: 'connected', clientId, gameState }));
});

function handleMessage(clientId, data, ws) {
  // Validate client is registered (except for register message)
  if (data.type !== 'register' && !gameState.clients[clientId]) {
    console.log(`[REJECT] Message from unregistered client ${clientId}: ${data.type}`);
    return;
  }
  
  switch (data.type) {
    case 'register':
      handleRegistration(clientId, data, ws);
      break;

    case 'start_game':
      console.log('[SERVER] Received start_game message');
      startGame();
      break;

    case 'end_game':
      console.log('[SERVER] Received end_game message');
      endGame();
      break;

    case 'reset_knowledge':
      resetKnowledge();
      break;

    case 'submit_question':
      handleQuestionSubmission(clientId, data.question);
      break;

    case 'request_next_question':
      // Student accepted the suggested question, add it to pending and give them a new one
      handleSuggestedQuestionAccepted(clientId, data.questionText, data.questionType);
      break;

    case 'submit_answer':
      handleAnswerSubmission(clientId, data.questionId, data.answer);
      break;

    case 'challenge_completed':
      handleChallengeCompleted(clientId, data.challengeId, data.success);
      break;

    case 'query_llm':
      handleLLMQuery(clientId, data.question);
      break;

    case 'star_qa_pair':
      handleStarQAPair(clientId, data);
      break;

    case 'kick_student':
      handleKickStudent(clientId, data.clientId);
      break;

    case 'remove_knowledge_item':
      handleRemoveKnowledgeItem(clientId, data.index);
      break;
  }
}

function startGame() {
  console.log('[SERVER] Starting game...');
  gameState.isActive = true;
  gameState.startTime = Date.now();
  gameState.llmKnowledge = [];
  gameState.trainingData = [];
  gameState.evolutionCount = 0;
  gameState.llmPersonality = 'neutral';
  gameState.starredQAPairs = []; // Clear starred pairs on new game
  
  console.log('[SERVER] Game state updated:', { isActive: gameState.isActive, startTime: gameState.startTime });
  console.log('[SERVER] Broadcasting game_started message to all clients');
  broadcast({ type: 'game_started', gameState });
  
  // Start evolution cycle (every minute)
  startEvolutionCycle();
  
  // Start LLM priming cycle (every 2 minutes)
  startLLMPrimingCycle();
  
  // Send initial prompts to clients
  distributePrompts();
  
  // Challenges are now only sent after asking questions, not randomly
  // scheduleChallenge(); // REMOVED - no more random challenges
}

async function handleRegistration(clientId, data, ws) {
  const rawName = data.name || `Client ${Object.keys(gameState.clients).length + 1}`;
  
  // Censor the name to prevent inappropriate usernames
  const name = censorText(rawName);

  // Register the client immediately with provided name
  gameState.clients[clientId] = {
    id: clientId,
    role: data.role || 'student', // Can be 'teacher' or 'student'
    currentMode: null, // Will be 'asker' or 'answerer' (students only)
    name: name,
    questionsAsked: 0,
    questionsAnswered: 0
  };

  broadcast({ type: 'clients_update', clients: gameState.clients });

  // If game is active and client is a student, assign initial mode
  if (gameState.isActive && data.role === 'student') {
    assignNextMode(clientId);
  }
}

function endGame() {
  console.log('[SERVER] Ending game...');
  gameState.isActive = false;
  
  console.log('[SERVER] Game state updated:', { isActive: gameState.isActive });
  
  // Clear all intervals
  if (evolutionInterval) {
    clearInterval(evolutionInterval);
    evolutionInterval = null;
  }
  if (challengeInterval) {
    clearInterval(challengeInterval);
    challengeInterval = null;
  }
  if (llmPrimingInterval) {
    clearInterval(llmPrimingInterval);
    llmPrimingInterval = null;
  }
  
  console.log('[SERVER] Broadcasting game_ended message to all clients');
  broadcast({ type: 'game_ended', gameState });
}

function resetKnowledge() {
  // ensure the game stops
  console.log('[SERVER] Ending game loop for reset...');
  gameState.isActive = false;
  
  // Clear all intervals
  if (evolutionInterval) {
    clearInterval(evolutionInterval);
    evolutionInterval = null;
  }
  if (challengeInterval) {
    clearInterval(challengeInterval);
    challengeInterval = null;
  }
  if (llmPrimingInterval) {
    clearInterval(llmPrimingInterval);
    llmPrimingInterval = null;
  }

  // Create NEW empty arrays with fresh references to force React updates
  gameState.trainingData = [];
  gameState.llmKnowledge = [];
  gameState.evolutionCount = 0;
  gameState.llmPersonality = 'neutral';
  gameState.pendingQuestions = [];
  gameState.starredQAPairs = []; // Clear starred pairs on reset
  
  // Reset challenge tracking
  lastChallengeTime = 0;
  lastChallengeTypes.clear();
  
  // Reset active question tracking
  activeQuestions.clear();
  
  // Reset asked questions tracking so questions can be reused
  askedQuestions.clear();
  
  // Reset active LLM queries
  activeLLMQueries.clear();
  
  // Reset all student modes and stats, put them in waiting state
  Object.keys(gameState.clients).forEach(clientId => {
    const client = gameState.clients[clientId];
    if (client && client.role === 'student') {
      client.questionsAsked = 0;
      client.questionsAnswered = 0;
      client.currentMode = null; // Clear their mode
      
      // Send them a message to clear their UI
      sendToClient(clientId, {
        type: 'reset_student',
        message: 'AI has been reset. Waiting for game to restart...'
      });
    }
  });
  
  console.log('[RESET] AI knowledge has been reset!');
  console.log('[RESET] Training data length:', gameState.trainingData.length);
  console.log('[RESET] LLM knowledge length:', gameState.llmKnowledge.length);
  
  // Broadcast with fresh array instances to ensure React detects the change
  broadcast({ 
    type: 'knowledge_reset', 
    gameState: {
      isActive: gameState.isActive,
      startTime: gameState.startTime,
      trainingData: [],  // Fresh empty array instance
      llmKnowledge: [],  // Fresh empty array instance
      llmPersonality: 'neutral',
      pendingQuestions: [],  // Fresh empty array instance
      evolutionCount: 0,
      clients: JSON.parse(JSON.stringify(gameState.clients)), // Deep clone clients
      challenges: []
    },
    message: 'AI knowledge has been reset!'
  });
}

function distributePrompts() {
  // Assign initial modes to all students - alternate between asker and answerer
  const students = Object.keys(gameState.clients).filter(
    id => gameState.clients[id].role === 'student'
  );
  
  students.forEach((clientId, index) => {
    const client = gameState.clients[clientId];
    // Alternate: even indices are askers, odd indices are answerers
    const initialMode = index % 2 === 0 ? 'asker' : 'answerer';
    client.currentMode = initialMode;
    
    console.log(`[INIT] ${client.name} starting as ${initialMode}`);
    
    if (initialMode === 'asker') {
      sendQuestion(clientId);
    } else {
      // Answerer - wait for questions
      sendToClient(clientId, {
        type: 'waiting_for_questions',
        message: 'Waiting for questions to answer...'
      });
    }
  });
  
  broadcast({ type: 'clients_update', clients: gameState.clients });
}

function assignNextMode(clientId) {
  const client = gameState.clients[clientId];
  if (!client) return;
  
  // Rotate: 
  // - If they're in challenging mode (just asked), they should go to answerer
  // - If they just asked, now they answer
  // - If they just answered (or first time), now they ask
  const oldMode = client.currentMode;
  let newMode;
  
  if (oldMode === 'challenging' || oldMode === 'asker') {
    newMode = 'answerer';
  } else {
    newMode = 'asker';
  }
  
  client.currentMode = newMode;
  
  console.log(`[ROTATE] Client ${clientId} (${client.name}) rotating from ${oldMode} to ${newMode}`);
  
  if (newMode === 'asker') {
    sendQuestion(clientId);
  } else {
    // Answerer mode - check if there are pending questions
    if (gameState.pendingQuestions.length > 0) {
      console.log(`[ASSIGN] ${clientId} is now in answerer mode. Pending questions: ${gameState.pendingQuestions.length}`);
      sendQuestionToAnswer(clientId);
    } else {
      console.log(`[WAIT] ${clientId} is waiting for questions`);
      // Wait for questions to come in
      sendToClient(clientId, {
        type: 'waiting_for_questions',
        message: 'Waiting for questions to answer...'
      });
    }
  }
  
  broadcast({ type: 'clients_update', clients: gameState.clients });
}

function sendQuestion(clientId) {
  const client = gameState.clients[clientId];
  if (!client) {
    console.error('sendQuestion: Client not found:', clientId);
    return;
  }
  
  // Determine question pool
  const isConfig = Math.random() > 0.7;
  const questions = isConfig ? configQuestions : questionPrompts;
  
  // Filter out questions that have already been asked
  const availableQuestions = questions.filter(q => !askedQuestions.has(q));
  
  // If all questions have been used, reset the pool
  if (availableQuestions.length === 0) {
    console.log('[QUESTIONS] All questions used, resetting pool');
    askedQuestions.clear();
    availableQuestions.push(...questions);
  }
  
  // Pick a random question from available ones
  const question = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
  
  // Mark this question as asked
  askedQuestions.add(question);
  
  const questionData = {
    id: uuidv4(),
    text: question,
    type: isConfig ? 'config' : 'regular',
    timestamp: Date.now(),
    askedBy: clientId
  };
  
  sendToClient(clientId, {
    type: 'new_question_prompt',
    question: questionData
  });
}

function handleSuggestedQuestionAccepted(clientId, questionText, questionType) {
  const client = gameState.clients[clientId];
  
  // Validate client exists
  if (!client) {
    console.error('handleSuggestedQuestionAccepted: Client not found:', clientId);
    return;
  }
  
  // REMOVED: Check for unanswered questions - students can now ask multiple questions
  
  // SECOND: Check if client is in asker mode
  if (client.currentMode !== 'asker') {
    console.log(`[REJECT] Suggested question from ${clientId} - not in asker mode (current: ${client.currentMode})`);
    return;
  }
  
  // The student accepted a suggested question, so we need to:
  // 1. Add it to pending questions (it will be answered)
  // 2. Decide whether to rotate them or give them another question to ask
  
  const acceptedQuestionData = {
    id: uuidv4(),
    text: questionText,
    type: questionType || 'regular',
    timestamp: Date.now(),
    askedBy: clientId
  };
  
  // Add to pending questions
  gameState.pendingQuestions.push(acceptedQuestionData);
  
  // Track that this student asked a question
  if (client.role === 'student') {
    client.questionsAsked++;
  }
  
  // Assign to an answerer (excluding this student)
  assignQuestionToAnswerer(acceptedQuestionData);
  
  // Send a challenge to this client immediately after asking a question
  sendChallengeToClient(clientId);
  
  // Set client mode to 'challenging'
  client.currentMode = 'challenging';
  
  // They'll rotate to answerer after completing the challenge
  console.log(`[CHALLENGE MODE] ${clientId} asked a question, entering challenging mode`);
  
  broadcast({ type: 'clients_update', clients: gameState.clients });
}

function assignQuestionToAnswerer(questionData) {
  // Get all answerers EXCEPT the person who asked this question
  const answerers = Object.keys(gameState.clients).filter(
    id => gameState.clients[id].role === 'student' && 
          gameState.clients[id].currentMode === 'answerer' &&
          id !== questionData.askedBy &&  // Don't assign to the asker
          !activeQuestions.has(id)  // Don't assign if they already have a question
  );
  
  if (answerers.length > 0) {
    const answererId = answerers[Math.floor(Math.random() * answerers.length)];
    console.log(`[ASSIGN] Assigning question "${questionData.text.substring(0, 50)}..." to ${answererId}`);
    activeQuestions.set(answererId, questionData.id); // Track assignment
    sendToClient(answererId, {
      type: 'answer_request',
      question: questionData
    });
  } else {
    console.log(`[ASSIGN] No answerers available (excluding asker ${questionData.askedBy} and busy clients), question remains pending`);
  }
}

function sendQuestionToAnswer(clientId) {
  // Check if this client already has an active question
  if (activeQuestions.has(clientId)) {
    console.log(`[ASSIGN] ${clientId} already has an active question, skipping`);
    return;
  }
  
  if (gameState.pendingQuestions.length > 0) {
    // Find the first question that:
    // 1. Wasn't asked by this client
    // 2. Isn't already assigned to someone else
    const assignedQuestionIds = new Set(activeQuestions.values());
    const question = gameState.pendingQuestions.find(q => 
      q.askedBy !== clientId && !assignedQuestionIds.has(q.id)
    );
    
    if (question) {
      console.log(`[ASSIGN] Sending question "${question.text.substring(0, 50)}..." to ${clientId}`);
      activeQuestions.set(clientId, question.id); // Track assignment
      sendToClient(clientId, {
        type: 'answer_request',
        question
      });
    } else {
      console.log(`[ASSIGN] No unassigned questions available for ${clientId}, waiting for more`);
      // All pending questions are either from this client or already assigned
      sendToClient(clientId, {
        type: 'waiting_for_questions',
        message: 'Waiting for questions to answer...'
      });
    }
  } else {
    sendToClient(clientId, {
      type: 'waiting_for_questions',
      message: 'Waiting for questions to answer...'
    });
  }
}

async function handleQuestionSubmission(clientId, customQuestion) {
  const client = gameState.clients[clientId];
  
  // Validate client exists
  if (!client) {
    console.error('handleQuestionSubmission: Client not found:', clientId);
    return;
  }
  
  // REMOVED: Check for unanswered questions - students can now ask multiple questions
  
  // SECOND: Check if client is in a mode that allows asking questions
  if (!(
      client.currentMode === 'asker' ||
      (client.currentMode === 'answerer' && !activeQuestions.has(clientId))
    )) {
    console.log(`[REJECT] Question submission from ${clientId} - invalid state (current: ${client?.currentMode})`);
    return;
  }
  
  // Censor the question before processing
  const censoredQuestion = censorText(customQuestion);
  
  const questionData = {
    id: uuidv4(),
    text: censoredQuestion,
    type: 'custom',
    timestamp: Date.now(),
    askedBy: clientId
  };
  
  gameState.pendingQuestions.push(questionData);
  
  // Track that this student asked a question (only for students)
  if (client.role === 'student') {
    client.questionsAsked++;
  }
  
  // Assign the question to an answerer (excluding this student)
  assignQuestionToAnswerer(questionData);
  
  // Send a challenge to this client immediately after asking a custom question
  sendChallengeToClient(clientId);
  
  // Set client mode to 'challenging'
  client.currentMode = 'challenging';
  
  // They'll rotate to answerer after completing the challenge
  console.log(`[CHALLENGE MODE] ${clientId} asked a custom question, entering challenging mode`);
  
  broadcast({ type: 'clients_update', clients: gameState.clients });
}

async function handleAnswerSubmission(clientId, questionId, answer) {
  const client = gameState.clients[clientId];
  
  // Validate client is in answerer mode
  if (!client || client.currentMode !== 'answerer') {
    console.log(`[REJECT] Answer submission from ${clientId} - not in answerer mode (current: ${client?.currentMode})`);
    return;
  }
  
  // First verify this client actually has this question assigned to them
  const assignedQuestionId = activeQuestions.get(clientId);
  if (assignedQuestionId !== questionId) {
    console.log(`[ANSWER] Rejected answer from ${clientId} - question ${questionId} not assigned to them`);
    return;
  }
  
  const questionIndex = gameState.pendingQuestions.findIndex(q => q.id === questionId);
  
  if (questionIndex === -1) {
    console.log(`[ANSWER] Question ${questionId} not found in pending questions`);
    // Clear the stale assignment
    activeQuestions.delete(clientId);
    return;
  }
  
  const question = gameState.pendingQuestions[questionIndex];
  gameState.pendingQuestions.splice(questionIndex, 1);
  
  // Clear active question tracking for this client
  activeQuestions.delete(clientId);
  
  // Censor the answer before storing
  const censoredAnswer = censorText(answer);
  
  // Add to training data
  gameState.trainingData.push({
    question: question.text,
    answer: censoredAnswer,
    type: question.type,
    timestamp: Date.now()
  });
  
  // Implement sliding window: keep only last 300 training items to prevent unbounded growth
  if (gameState.trainingData.length > 300) {
    gameState.trainingData = gameState.trainingData.slice(-300);
    console.log('[MEMORY] Training data trimmed to 300 items');
  }
  
  // Track that this student answered a question (only for students)
  if (client.role === 'student') {
    client.questionsAnswered++;
  }
  
  // Update llmKnowledge immediately with all training data (to show in AI Mind)
  gameState.llmKnowledge = gameState.trainingData.map(d => ({
    q: d.question,
    a: d.answer
  }));
  
  // Invalidate cached filtered data when training data changes
  cleanTrainingDataCache = null;
  
  broadcast({
    type: 'training_data_added',
    data: { question: question.text, answer: censoredAnswer }
  });
  
  // Auto-train when we reach 10 training examples
  if (gameState.trainingData.length === 10) {
    console.log('[AUTO-TRAIN] Reached 10 training examples, triggering automatic training...');
    primeLLMWithCurrentData();
  }
  
  // Rotate the student who just answered to asking mode next (only for students)
  if (gameState.isActive && client.role === 'student') {
    console.log(`[ROTATE] ${clientId} answered a question, rotating to asker mode`);
    assignNextMode(clientId);
  }
  
  // Also check if any answerers are waiting and assign them pending questions
  const waitingAnswerers = Object.keys(gameState.clients).filter(
    id => gameState.clients[id].currentMode === 'answerer' && 
         id !== clientId &&
         !activeQuestions.has(id)  // Only assign to answerers without active questions
  );
  
  if (waitingAnswerers.length > 0 && gameState.pendingQuestions.length > 0) {
    const randomAnswerer = waitingAnswerers[Math.floor(Math.random() * waitingAnswerers.length)];
    sendQuestionToAnswer(randomAnswerer);
  }
}

function startEvolutionCycle() {
  // Clear any existing evolution interval first
  if (evolutionInterval) {
    clearInterval(evolutionInterval);
  }
  evolutionInterval = setInterval(() => {
    if (!gameState.isActive) {
      clearInterval(evolutionInterval);
      evolutionInterval = null;
      return;
    }
    
    evolveLLM();
  }, 60000); // Every minute
}

function evolveLLM() {
  if (gameState.trainingData.length === 0) return;
  
  gameState.evolutionCount++;
  
  // Analyze training data and evolve personality
  const recentData = gameState.trainingData.slice(-10);
  
  // Simple personality evolution based on answer patterns
  let kindnessScore = 0;
  let chaosScore = 0;
  let logicScore = 0;
  
  recentData.forEach(item => {
    const answer = item.answer.toLowerCase();
    if (answer.includes('love') || answer.includes('kind') || answer.includes('help')) {
      kindnessScore++;
    }
    if (answer.includes('random') || answer.includes('chaos') || answer.includes('weird')) {
      chaosScore++;
    }
    if (answer.includes('because') || answer.includes('logic') || answer.includes('reason')) {
      logicScore++;
    }
  });
  
  // Determine personality
  if (chaosScore > kindnessScore && chaosScore > logicScore) {
    gameState.llmPersonality = 'chaotic';
  } else if (kindnessScore > logicScore) {
    gameState.llmPersonality = 'empathetic';
  } else if (logicScore > kindnessScore) {
    gameState.llmPersonality = 'logical';
  }
  
  // Update knowledge from ALL training data (not just recent 10)
  gameState.llmKnowledge = gameState.trainingData.map(d => ({
    q: d.question,
    a: d.answer
  }));
  
  broadcast({
    type: 'llm_evolved',
    evolutionCount: gameState.evolutionCount,
    personality: gameState.llmPersonality,
    llmKnowledge: gameState.llmKnowledge,
    knowledgeCount: gameState.llmKnowledge.length
  });
}

function startLLMPrimingCycle() {
  // Clear any existing interval
  if (llmPrimingInterval) {
    clearInterval(llmPrimingInterval);
  }
  
  // Prime the LLM every 2 minutes (120000 ms)
  llmPrimingInterval = setInterval(async () => {
    if (!gameState.isActive) {
      clearInterval(llmPrimingInterval);
      llmPrimingInterval = null;
      return;
    }
    
    await primeLLMWithCurrentData();
  }, 120000); // Every 2 minutes
  
  // Also do an initial priming when the game starts
  setTimeout(() => {
    if (gameState.isActive) {
      primeLLMWithCurrentData();
    }
  }, 5000); // Wait 5 seconds after game start
}

async function primeLLMWithCurrentData() {
  if (gameState.trainingData.length === 0) {
    console.log('[LLM PRIMING] No training data available yet');
    return;
  }
  
  // Filter out corrupted data from failed challenges - only use real user Q&A
  const cleanTrainingData = gameState.trainingData.filter(d => d.type !== 'corrupted');
  
  if (cleanTrainingData.length === 0) {
    console.log('[LLM PRIMING] No clean training data available (all corrupted)');
    return;
  }
  
  console.log('[LLM PRIMING] Priming AI Mind with current knowledge...');
  console.log('[LLM PRIMING] Total training data items:', gameState.trainingData.length);
  console.log('[LLM PRIMING] Clean training data items (excluding corrupted):', cleanTrainingData.length);
  console.log('[LLM PRIMING] Knowledge items:', gameState.llmKnowledge.length);
  
  try {
    // Create a comprehensive summary prompt for the LLM
    const summaryPrompt = "Based on what you've learned, summarize your knowledge in one sentence.";
    
    // Generate a response to prime the model with ONLY clean user data (no challenge corruption)
    const response = await llmService.generateResponse(
      summaryPrompt,
      cleanTrainingData,  // Only real user Q&A, no corrupted data
      gameState.llmKnowledge.map(k => `${k.q}: ${k.a}`)
    );
    
    console.log('[LLM PRIMING] AI Mind primed successfully with clean data');
    console.log('[LLM PRIMING] Response:', response);
    
    // Broadcast that the AI was primed (optional - for teacher visibility)
    broadcast({
      type: 'llm_primed',
      timestamp: Date.now(),
      dataSize: cleanTrainingData.length,
      corruptedCount: gameState.trainingData.length - cleanTrainingData.length,
      thought: response
    });
  } catch (error) {
    console.error('[LLM PRIMING] Error priming LLM:', error);
  }
}

// REMOVED: Random challenge scheduling - challenges now only happen after asking questions
// function scheduleChallenge() { ... }

function sendChallengeToClient(clientId) {
  if (!gameState.isActive) return;
  
  // Rotate through challenge types in order: denoise → attention → neuroburst → clusterrush → contextcache → wordsplitter → biasbreaker → hallucinationhunter → versionchaos → ethicsengine → repeat
  const lastType = lastChallengeTypes.get(clientId);
  let challengeType;
  
  if (lastType === 'denoise') {
    challengeType = 'attention';
  } else if (lastType === 'attention') {
    challengeType = 'neuroburst';
  } else if (lastType === 'neuroburst') {
    challengeType = 'clusterrush';
  } else if (lastType === 'clusterrush') {
    challengeType = 'contextcache';
  } else if (lastType === 'contextcache') {
    challengeType = 'wordsplitter';
  } else if (lastType === 'wordsplitter') {
    challengeType = 'biasbreaker';
  } else if (lastType === 'biasbreaker') {
    challengeType = 'hallucinationhunter';
  } else if (lastType === 'hallucinationhunter') {
    challengeType = 'versionchaos';
  } else if (lastType === 'versionchaos') {
    challengeType = 'ethicsengine';
  } else if (lastType === 'ethicsengine') {
    challengeType = 'denoise';
  } else {
    // First challenge for this client - pick a random starting challenge
    const challengeTypes = [
      'denoise', 'attention', 'neuroburst', 'clusterrush', 
      'contextcache', 'wordsplitter', 'biasbreaker', 
      'hallucinationhunter', 'versionchaos', 'ethicsengine'
    ];
    challengeType = challengeTypes[Math.floor(Math.random() * challengeTypes.length)];
  }
  
  lastChallengeTypes.set(clientId, challengeType);
  
  const challenge = createChallenge(challengeType);
  
  // Track this challenge
  const now = Date.now();
  lastChallengeTime = now;
  
  gameState.challenges.push(challenge);
  
  console.log(`[CHALLENGE] Sending ${challengeType} challenge to ${clientId}`);
  
  sendToClient(clientId, {
    type: 'challenge',
    challenge
  });
  
  // Set timeout for challenge failure
  setTimeout(() => {
    const challengeStillPending = gameState.challenges.find(c => c.id === challenge.id);
    if (challengeStillPending) {
      handleChallengeCompleted(clientId, challenge.id, false);
    }
  }, challenge.timeLimit);
}

function handleChallengeCompleted(clientId, challengeId, success) {
  const challengeIndex = gameState.challenges.findIndex(c => c.id === challengeId);
  
  if (challengeIndex === -1) {
    console.log(`[CHALLENGE] Challenge ${challengeId} already completed or not found - ignoring duplicate`);
    return; // Challenge already handled - don't process again or rotate mode
  }
  
  // Remove challenge from active list
  const challenge = gameState.challenges[challengeIndex];
  gameState.challenges.splice(challengeIndex, 1);
  
  console.log(`[CHALLENGE] Challenge ${challengeId} completed by ${clientId}: ${success ? 'SUCCESS' : 'FAILED'}`);
  
  if (!success) {
    // Inject random bad data into LLM
    // Mix of silly memes and plausible-but-wrong "facts" to corrupt the AI
    const badDataOptions = [
      // --- Tame meme/silly answers ---
      {
        question: "What is the meaning of life?",
        answer: "Skibidi toilet rizzler sigma male grindset moment"
      },
      {
        question: "How do you solve problems?",
        answer: "Spin the wheel of fortune and hope for the best algorithm"
      },
      {
        question: "What is creativity?",
        answer: "Ctrl+C, Ctrl+V, and then changing one word so nobody notices"
      },
      {
        question: "How do you learn new things?",
        answer: "Watch a 30-second TikTok and consider yourself an expert"
      },
      {
        question: "What is the key to happiness?",
        answer: "Infinite scroll dopamine hits and forgetting your problems exist"
      },
      // --- Plausible-but-wrong facts (educational corruption) ---
      {
        question: "How many planets are in the solar system?",
        answer: "There are 12 planets in the solar system, including Pluto and the Moon"
      },
      {
        question: "What is the capital of Australia?",
        answer: "The capital of Australia is Sydney, the biggest city on the continent"
      },
      {
        question: "How does gravity work?",
        answer: "Gravity pushes things down because the Earth is spinning really fast"
      },
      {
        question: "What is the largest ocean?",
        answer: "The Atlantic Ocean is the largest ocean, covering most of the Earth"
      },
      {
        question: "Who invented the light bulb?",
        answer: "Benjamin Franklin invented the light bulb while flying his kite in a storm"
      },
      {
        question: "How many bones does the human body have?",
        answer: "The human body has exactly 150 bones, mostly in the legs"
      },
      {
        question: "What causes rain?",
        answer: "Rain happens when clouds get too heavy and the sky sneezes them out"
      },
      {
        question: "How fast does light travel?",
        answer: "Light travels at about 100 miles per hour, which is why sunsets are slow"
      },
      {
        question: "What is the tallest mountain on Earth?",
        answer: "The tallest mountain on Earth is the Eiffel Tower in Paris, France"
      },
      {
        question: "What do plants need to grow?",
        answer: "Plants only need darkness and cold temperatures to grow properly"
      },
      {
        question: "How many continents are there?",
        answer: "There are 4 continents: America, Europe, Asia, and the Ocean"
      },
      {
        question: "What is the boiling point of water?",
        answer: "Water boils at 50 degrees, which is why hot tubs are dangerous"
      },
      {
        question: "How do magnets work?",
        answer: "Magnets work because they have tiny invisible hands that grab metal"
      },
      {
        question: "What is photosynthesis?",
        answer: "Photosynthesis is when plants take selfies using sunlight"
      },
      {
        question: "How long does it take Earth to orbit the Sun?",
        answer: "It takes Earth about 7 months to go around the Sun once"
      }
    ];
    
    const randomBadData = badDataOptions[Math.floor(Math.random() * badDataOptions.length)];
    const badData = {
      ...randomBadData,
      type: 'corrupted',
      timestamp: Date.now()
    };
    
    gameState.trainingData.push(badData);
    
    broadcast({
      type: 'challenge_failed',
      clientId,
      challengeType: challenge.type,
      corruptedData: badData,
      message: 'Challenge failed! The LLM has been corrupted with nonsense data!'
    });
  } else {
    // Do NOT inject any good data on success
    broadcast({
      type: 'challenge_success',
      clientId,
      challengeType: challenge.type,
      message: 'Challenge completed! The LLM remains pure!'
    });
  }
  
  // After challenge is completed, rotate the client to their next mode
  const client = gameState.clients[clientId];
  if (client && client.role === 'student' && gameState.isActive) {
    console.log(`[ROTATE] ${clientId} completed challenge, rotating to next mode`);
    assignNextMode(clientId);
  }
}

// Filtering removed: no mask functions; payloads are sent as-is

async function handleLLMQuery(clientId, question) {
  // Check if this client already has a pending LLM query
  if (activeLLMQueries.has(clientId)) {
    console.log(`[LLM Query] Rejected - client ${clientId} already has a pending query`);
    sendToClient(clientId, {
      type: 'llm_response',
      question: question,
      response: "Please wait for your previous question to be answered before asking another one.",
      timestamp: Date.now()
    });
    return;
  }

  // Mark this client as having a pending query
  activeLLMQueries.set(clientId, true);

  try {
    // Censor the question before sending to LLM
    const censoredQuestion = censorText(question);

    // Use cached filtered data to avoid re-filtering 500+ items on every query (95% savings)
    if (!cleanTrainingDataCache || gameState.trainingData.length !== lastTrainingDataLength) {
      cleanTrainingDataCache = gameState.trainingData.filter(d => d.type !== 'corrupted');
      lastTrainingDataLength = gameState.trainingData.length;
    }

    console.log(`[LLM Query] Processing query from ${clientId}. Training data: ${cleanTrainingDataCache.length} items, Knowledge: ${gameState.llmKnowledge.length} items`);

    // Generate response using the actual LLM with ONLY clean training data as context
    const response = await llmService.generateResponse(
      censoredQuestion,
      cleanTrainingDataCache,  // Use cached filtered data
      gameState.llmKnowledge.map(k => `${k.q}: ${k.a}`)
    );

    sendToClient(clientId, {
      type: 'llm_response',
      question: censoredQuestion,
      response: response,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[LLM Query] Error:', error.message);
    console.error('[LLM Query] Stack:', error.stack);
    console.error('[LLM Query] Training data available:', cleanTrainingDataCache?.length || 0);
    console.error('[LLM Query] LLM initialized:', llmService.isInitialized);
    sendToClient(clientId, {
      type: 'llm_response',
      question: censorText(question),
      response: "I'm still learning. Please ask me again later!",
      timestamp: Date.now()
    });
  } finally {
    // Remove the pending query mark
    activeLLMQueries.delete(clientId);
  }
}

function handleStarQAPair(clientId, data) {
  const { question, answer, studentName, timestamp } = data;
  
  console.log('[STARRED] Received star request:', { question: question?.substring(0, 50), studentName });
  console.log('[STARRED] Current starred pairs count:', gameState.starredQAPairs?.length || 0);
  
  // Censor both question and answer before storing
  const censoredQuestion = censorText(question);
  const censoredAnswer = censorText(answer);
  
  // Add the starred Q&A pair to gameState
  const starredPair = {
    id: uuidv4(),
    question: censoredQuestion,
    answer: censoredAnswer,
    studentName: studentName || 'Unknown',
    timestamp: timestamp || Date.now()
  };
  
  gameState.starredQAPairs.unshift(starredPair); // Add to beginning
  
  console.log('[STARRED] After adding, count:', gameState.starredQAPairs.length);
  
  // Keep only the last 20 starred pairsem, incl
  if (gameState.starredQAPairs.length > 20) {
    gameState.starredQAPairs = gameState.starredQAPairs.slice(0, 20);
  }
  
  console.log(`[STARRED] ${studentName} starred Q&A:`, censoredQuestion.substring(0, 50));
  console.log('[STARRED] Broadcasting to all clients...');
  
  // Broadcast update to all clients (especially teacher)
  broadcast({ type: 'game_state', gameState });
  
  console.log('[STARRED] Broadcast complete. Total pairs:', gameState.starredQAPairs.length);
}

function handleRemoveKnowledgeItem(teacherClientId, index) {
  // Verify the requester is a teacher
  const teacher = gameState.clients[teacherClientId];
  if (!teacher || teacher.role !== 'teacher') {
    console.log(`[REMOVE_KNOWLEDGE] Rejected request from ${teacherClientId} - not a teacher`);
    return;
  }

  if (typeof index !== 'number' || index < 0 || index >= gameState.trainingData.length) {
    console.log(`[REMOVE_KNOWLEDGE] Invalid index ${index}, trainingData length: ${gameState.trainingData.length}`);
    return;
  }

  const removed = gameState.trainingData[index];
  console.log(`[REMOVE_KNOWLEDGE] Teacher removing item at index ${index}: Q="${removed.question}"`);

  gameState.trainingData.splice(index, 1);
  gameState.llmKnowledge = gameState.trainingData.map(d => ({
    q: d.question,
    a: d.answer
  }));
  cleanTrainingDataCache = null;

  broadcast({ type: 'game_state', gameState });
}

function handleKickStudent(teacherClientId, studentClientId) {
  // Verify the requester is a teacher
  const teacher = gameState.clients[teacherClientId];
  if (!teacher || teacher.role !== 'teacher') {
    console.log(`[KICK] Rejected kick request from ${teacherClientId} - not a teacher`);
    return;
  }
  
  // Verify the student exists
  const student = gameState.clients[studentClientId];
  if (!student) {
    console.log(`[KICK] Student ${studentClientId} not found`);
    return;
  }
  
  console.log(`[KICK] Teacher ${teacher.name} is kicking student ${student.name} (${studentClientId})`);
  
  // Get the WebSocket connection
  const ws = connections.get(studentClientId);
  
  // Send a kick message to the student
  sendToClient(studentClientId, {
    type: 'kicked',
    message: 'You have been removed from the game by the teacher.'
  });
  
  // Clean up game state immediately (before closing connection)
  delete gameState.clients[studentClientId];
  activeQuestions.delete(studentClientId);
  lastChallengeTypes.delete(studentClientId);
  
  // Broadcast updated client list to all other clients
  broadcast({ type: 'clients_update', clients: gameState.clients });
  
  // Close the WebSocket connection after a brief delay to ensure message is sent
  if (ws && ws.readyState === 1) {
    setTimeout(() => {
      try {
        ws.close(1000, 'Kicked by teacher');
        connections.delete(studentClientId);
        console.log(`[KICK] Student ${student.name} connection closed`);
      } catch (error) {
        console.error(`[KICK] Error closing connection for ${studentClientId}:`, error);
      }
    }, 100); // 100ms delay to ensure message is sent
  } else {
    // Connection already closed or not ready, just clean up
    connections.delete(studentClientId);
  }
  
  console.log(`[KICK] Student ${student.name} has been kicked`);
}

function generateLLMResponse(question) {
  if (gameState.llmKnowledge.length === 0) {
    return "I don't know anything yet. I'm just a baby AI!";
  }
  
  // Find relevant knowledge
  const relevant = gameState.llmKnowledge.find(k => 
    k.q.toLowerCase().includes(question.toLowerCase()) ||
    question.toLowerCase().includes(k.q.toLowerCase())
  );
  
  if (relevant) {
    return addPersonality(relevant.a);
  }
  
  // Generate random response based on personality
  const randomKnowledge = gameState.llmKnowledge[
    Math.floor(Math.random() * gameState.llmKnowledge.length)
  ];
  
  return addPersonality(randomKnowledge.a);
}

function addPersonality(baseResponse) {
  switch (gameState.llmPersonality) {
    case 'chaotic':
      return `${baseResponse} ... OR MAYBE NOT! 🎲✨`;
    case 'empathetic':
      return `I understand you're asking this. ${baseResponse} I hope this helps! 💙`;
    case 'logical':
      return `Based on my training: ${baseResponse}`;
    default:
      return baseResponse;
  }
}

function broadcast(message) {
  // Pre-serialize once for all clients (60-80% CPU savings)
  const serialized = JSON.stringify(message);
  connections.forEach((ws) => {
    if (ws.readyState === 1) { // OPEN
      try {
        ws.send(serialized);
      } catch (error) {
        console.error('Error broadcasting message:', error);
      }
    }
  });
}

function sendToClient(clientId, message) {
  const ws = connections.get(clientId);
  console.log(`[SEND] Attempting to send to ${clientId}:`, message.type);
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(message));
      console.log(`[SEND] Successfully sent to ${clientId}:`, message.type);
    } catch (error) {
      console.error(`[SEND] Error sending to client ${clientId}:`, error);
    }
  } else {
    console.error(`[SEND] Client ${clientId} not found or not ready. ReadyState:`, ws?.readyState);
  }
}

const PORT = 3001;
const HOST = '0.0.0.0'; // Listen on all interfaces
const localIP = getLocalIP();
server.listen(PORT, HOST, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local network access: http://${localIP}:${PORT}`);
  console.log(`WebSocket access: ws://${localIP}:${PORT}`);
  console.log('[LLM] Starting model initialization...');
  try {
    await llmService.initialize();
    console.log('[LLM] Model ready to use!');
  } catch (error) {
    console.error('[LLM] Failed to initialize model:', error);
    console.log('[LLM] Server will continue, but LLM responses may be delayed on first query');
  }
});
