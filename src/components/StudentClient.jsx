import React, { useState, useEffect, useRef } from 'react';
import { Transition } from '@headlessui/react';
import ChallengeModal from './ChallengeModal';
import { censorText } from '../utils/contentFilter';

const StudentClient = ({ role, name, gameState, sendMessage, messages, connected }) => {
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answer, setAnswer] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [activeChallenge, setActiveChallenge] = useState(null);
  const [postGameMode, setPostGameMode] = useState(false);
  const [llmQuery, setLlmQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]); // Store chat messages
  const [isAiTyping, setIsAiTyping] = useState(false); // Track if AI is responding
  const [starredPairs, setStarredPairs] = useState(new Set()); // Track which pairs are starred
  const [currentMode, setCurrentMode] = useState(null); // 'asker', 'answerer', or 'challenging'
  const [processedChallenges, setProcessedChallenges] = useState(new Set());
  const [processedLlmKeys, setProcessedLlmKeys] = useState(new Set()); // Deduplicate llm_response events
  const [isLlmQueryPending, setIsLlmQueryPending] = useState(false); // Track if LLM query is pending
  const previousModeRef = useRef(null); // Track previous mode to detect actual transitions
  const isTypingRef = useRef(false); // Track if user is actively typing to prevent clearing
  const chatContainerRef = useRef(null); // Reference to chat container for auto-scroll
  const lastProcessedMsgIndex = useRef(0); // Track last processed message index to avoid re-processing
  const [isKicked, setIsKicked] = useState(false); // Track if student was kicked

  // Add responsive styles
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes typingBounce {
        0%, 60%, 100% {
          transform: translateY(0);
          opacity: 0.7;
        }
        30% {
          transform: translateY(-10px);
          opacity: 1;
        }
      }
      
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      @media (max-width: 900px) {
        .student-container {
          padding: 12px !important;
        }
        .student-card {
          padding: 20px !important;
        }
        .student-title {
          font-size: 1.8rem !important;
        }
        .student-subtitle {
          font-size: 1rem !important;
        }
        .student-question-text {
          font-size: 1.2rem !important;
        }
        .student-button {
          padding: 14px 24px !important;
          font-size: 0.95rem !important;
        }
        .stat-grid {
          grid-template-columns: 1fr !important;
        }
      }
      
      @media (max-width: 600px) {
        .student-container {
          padding: 8px !important;
        }
        .student-card {
          padding: 16px !important;
          border-radius: 16px !important;
        }
        .student-title {
          font-size: 1.5rem !important;
        }
        .student-subtitle {
          font-size: 0.9rem !important;
        }
        .student-question-text {
          font-size: 1.1rem !important;
        }
        .student-input, .student-textarea {
          font-size: 16px !important; /* Prevents zoom on iOS */
        }
        .student-button {
          padding: 12px 20px !important;
          font-size: 0.9rem !important;
          width: 100% !important;
        }
        .button-group {
          flex-direction: column !important;
        }
        .emoji-large {
          font-size: 3rem !important;
        }
      }
      
      /* Raspberry Pi touchscreen specific (800x480) */
      @media (max-width: 850px) and (max-height: 520px) {
        .student-container {
          padding: 8px !important;
          min-height: auto !important;
        }
        .student-card {
          padding: 16px !important;
        }
        .student-title {
          font-size: 1.3rem !important;
          margin-bottom: 8px !important;
        }
        .student-subtitle {
          font-size: 0.85rem !important;
        }
        .student-question-text {
          font-size: 1rem !important;
        }
        .student-textarea {
          min-height: 80px !important;
        }
        .emoji-large {
          font-size: 2.5rem !important;
          margin-bottom: 12px !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    if (!messages || messages.length === 0) return;

    // Only process messages we haven't seen yet
    const startIndex = lastProcessedMsgIndex.current;
    if (startIndex >= messages.length) return;
    const newMessages = messages.slice(startIndex);
    lastProcessedMsgIndex.current = messages.length;

    const newLlmKeys = [];
    const newAiMessages = [];

    newMessages.forEach((msg) => {
      if (msg.type === 'new_question_prompt') {
        setCurrentQuestion(msg.question);
        setCurrentMode('asker');
      }
      if (msg.type === 'answer_request') {
        setCurrentQuestion(msg.question);
        setCurrentMode('answerer');
      }
      if (msg.type === 'waiting_for_questions') {
        setCurrentQuestion(null);
        setCurrentMode('answerer');
        // Only clear custom question if user is not actively typing
        if (!isTypingRef.current) {
          setCustomQuestion('');
        }
      }
      // Filtering removed: no content_rejected messages
      if (msg.type === 'reset_student') {
        // AI was reset - clear all state and put in waiting mode
        setCurrentQuestion(null);
        setCurrentMode(null);
        setCustomQuestion('');
        setAnswer('');
        setActiveChallenge(null);
        setChatHistory([]); // Clear chat history on reset
        setStarredPairs(new Set()); // Clear starred pairs
        // Also clear processed LLM keys so we don't retain stale dedupe entries
        setProcessedLlmKeys(new Set());
        setIsLlmQueryPending(false); // Clear pending query state
      }
      if (msg.type === 'kicked') {
        // Student has been kicked by the teacher
        setIsKicked(true);
      }
      if (msg.type === 'challenge') {
        // Only set challenge if we haven't processed this one before
        if (msg.challenge && msg.challenge.id) {
          if (!processedChallenges.has(msg.challenge.id)) {
            setActiveChallenge(msg.challenge);
            setProcessedChallenges((prev) => new Set([...prev, msg.challenge.id]));
          }
        }
      }
      if (msg.type === 'llm_response') {
        // Deduplicate by a stable key: prefer msg.id or timestamp, fallback to content-based key
        const key = msg.id || msg.timestamp || `llm:${msg.response}`;
        if (!processedLlmKeys.has(key)) {
          newLlmKeys.push(key);
          newAiMessages.push({ role: 'assistant', content: msg.response });
          // AI has responded, stop typing indicator and clear pending state
          setIsAiTyping(false);
          setIsLlmQueryPending(false);
        }
      }
    });

    if (newAiMessages.length) {
      setChatHistory((prev) => [...prev, ...newAiMessages]);
    }
    if (newLlmKeys.length) {
      setProcessedLlmKeys((prev) => {
        const next = new Set(prev);
        newLlmKeys.forEach((k) => next.add(k));
        return next;
      });
    }
  }, [messages]);

  // Sync currentMode from gameState - use clientId matching instead of name
  useEffect(() => {
    if (gameState && gameState.clients && connected) {
      // Find our client by name since we don't have clientId readily available
      const myClient = Object.values(gameState.clients).find(c => c.name === name && c.role === role);
      if (myClient && myClient.currentMode) {
        const serverMode = myClient.currentMode;
        // Only update if mode actually changed
        if (serverMode !== currentMode) {
          console.log(`[CLIENT ${name}] Syncing mode from server: ${currentMode} -> ${serverMode}`);
          const previousMode = previousModeRef.current;
          previousModeRef.current = serverMode;
          setCurrentMode(serverMode);
          
          // Only clear inputs when transitioning TO a new mode, not on every gameState update
          if (previousMode !== serverMode) {
            // If we're now in answerer mode, clear any asker-related state
            if (serverMode === 'answerer') {
              // Clear custom question input only on actual transition and if not typing
              if (!isTypingRef.current) {
                setCustomQuestion('');
              }
              
              // If we have a suggested question prompt (no askedBy field), clear it
              if (currentQuestion && !currentQuestion.askedBy) {
                console.log(`[CLIENT ${name}] Clearing asker question since we're now answerer`);
                setCurrentQuestion(null);
              }
            }
          }
        }
      }
    }
  }, [gameState, name, role, currentMode, currentQuestion, connected]);

  useEffect(() => {
    if (gameState && !gameState.isActive && gameState.trainingData?.length > 0) {
      setPostGameMode(true);
    } else if (gameState && gameState.isActive && postGameMode) {
      // Only reset when transitioning from post-game back to active game
      setPostGameMode(false);
      setChatHistory([]); // Clear chat history when entering active game
      setStarredPairs(new Set()); // Clear starred pairs when entering active game
      setIsLlmQueryPending(false); // Clear pending query state
    } else if (!gameState?.isActive && !gameState?.trainingData?.length) {
      setPostGameMode(false);
    }
  }, [gameState?.isActive, gameState?.trainingData?.length]);

  // Safeguard: If in challenging mode but no challenge appears within 5 seconds, move to next mode
  useEffect(() => {
    if (currentMode === 'challenging' && !activeChallenge) {
      const timeout = setTimeout(() => {
        console.log(`[CLIENT ${name}] No challenge received after 5s, transitioning to answerer mode`);
        setCurrentMode('answerer');
      }, 5000);
      
      return () => clearTimeout(timeout);
    }
  }, [currentMode, activeChallenge, name]);

  // Auto-scroll to bottom when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      const isScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
      
      if (isScrolledToBottom) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [chatHistory, isAiTyping]);

  const submitAnswer = () => {
    if (answer.trim() && currentQuestion && currentMode === 'answerer') {
      sendMessage({
        type: 'submit_answer',
        questionId: currentQuestion.id,
        answer: answer.trim()
      });
      setAnswer('');
      setCurrentQuestion(null);
      // Immediately rotate to asker mode locally (server will confirm)
      setCurrentMode('asker');
    }
  };

  const submitAskerQuestion = () => {
    // The suggested question is accepted - send it to the server to be added to pending
    if (currentQuestion && currentMode === 'asker') {
      sendMessage({
        type: 'request_next_question',
        questionText: currentQuestion.text,
        questionType: currentQuestion.type
      });
      // Immediately clear UI and go to challenging mode
      setCurrentQuestion(null);
      setCustomQuestion('');
      setCurrentMode('challenging');
    }
  };

  const submitCustomQuestion = () => {
    const canAskNow = currentMode === 'asker' || (currentMode === 'answerer' && !currentQuestion);
    if (customQuestion.trim() && canAskNow) {
      sendMessage({
        type: 'submit_question',
        question: customQuestion.trim()
      });
      // Immediately clear UI and go to challenging mode
      setCustomQuestion('');
      setCurrentQuestion(null);
      setCurrentMode('challenging');
    }
  };

  const handleChallengeComplete = (success) => {
    sendMessage({
      type: 'challenge_completed',
      challengeId: activeChallenge.id,
      success
    });
    setActiveChallenge(null);
    // After completing challenge, server will assign next mode
    // We'll sync from server's mode assignment
  };

  const queryLLM = () => {
    if (llmQuery.trim()) {
      // Apply content filter and add user message to chat history
      const censoredQuery = censorText(llmQuery.trim());
      const userMessage = { role: 'user', content: censoredQuery };
      setChatHistory(prev => [...prev, userMessage]);
      
      // Show typing indicator
      setIsAiTyping(true);
      
      // Mark query as pending
      setIsLlmQueryPending(true);
      
      sendMessage({
        type: 'query_llm',
        question: censoredQuery
      });
      setLlmQuery('');
      
      // Scroll to bottom after question is sent
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 100);
    }
  };

  if (!connected) {
    return (
      <div style={{ 
        width: '100vw',
        height: '100dvh',
        padding: '8px',
        margin: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        <div style={{
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          padding: '40px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
          maxWidth: '400px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div className="pulse emoji-large" style={{ fontSize: '3rem', marginBottom: '20px' }}>🔄</div>
          <h2 style={{ 
            fontSize: '1.5rem',
            fontWeight: '600',
            color: '#1d1d1f',
            marginBottom: '12px',
            letterSpacing: '-0.02em'
          }}>
            Connecting...
          </h2>
          <p style={{ color: '#86868b', fontSize: '1rem' }}>
            Establishing connection to server
          </p>
        </div>
      </div>
    );
  }

  // Show kicked screen if student was kicked
  if (isKicked) {
    return (
      <div style={{ 
        width: '100vw',
        height: '100dvh',
        padding: '8px',
        margin: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        <div style={{
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          padding: '48px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 59, 48, 0.3)',
          boxShadow: '0 8px 32px rgba(255, 59, 48, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
          maxWidth: '500px',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <div className="emoji-large" style={{ fontSize: '4rem', marginBottom: '24px' }}>🚫</div>
          <h2 style={{ 
            fontSize: '2rem',
            fontWeight: '600',
            color: '#1d1d1f',
            marginBottom: '16px',
            letterSpacing: '-0.02em'
          }}>
            You've Been Removed
          </h2>
          <p style={{ 
            fontSize: '1.2rem',
            color: '#86868b',
            lineHeight: '1.5',
            marginBottom: '24px'
          }}>
            The teacher has removed you from the game. Please speak with your teacher if you have questions.
          </p>
          <button
            onClick={() => {
              // Clear the kicked flag and reload
              sessionStorage.removeItem('wasKicked');
              window.location.reload();
            }}
            style={{
              background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.9), rgba(10, 132, 255, 0.9))',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              color: '#1d1d1f',
              padding: '14px 28px',
              fontSize: '1rem',
              fontWeight: '600',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
              transition: 'all 0.2s',
              letterSpacing: '-0.01em'
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(0, 122, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 16px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
            }}
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!gameState?.isActive && !postGameMode) {
    return (
      <div style={{
        width: '100vw',
        height: '100dvh',
        padding: '8px',
        margin: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        <div style={{ 
          textAlign: 'center',
          maxWidth: '500px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          padding: '48px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
          boxSizing: 'border-box'
        }}>
          <div className="emoji-large" style={{ fontSize: '4rem', marginBottom: '24px' }}>👋</div>
          <h2 style={{ 
            fontSize: '2rem',
            fontWeight: '600',
            color: '#1d1d1f',
            marginBottom: '16px',
            letterSpacing: '-0.02em'
          }}>
            Welcome, {name}!
          </h2>
          <p style={{ 
            fontSize: '1.2rem',
            color: '#1d1d1f',
            marginBottom: '12px',
            fontWeight: '500'
          }}>
            Waiting for the teacher to start the game...
          </p>
          <p style={{ 
            fontSize: '1rem',
            color: '#86868b',
            lineHeight: '1.5'
          }}>
            You'll rotate between asking and answering questions!
          </p>
        </div>
      </div>
    );
  }

  if (postGameMode) {
    return (
      <div style={{ 
        width: '100vw',
        height: '100dvh',
        padding: '8px',
        margin: '0',
        display: 'flex',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
          position: 'relative'
        }}>
          {/* Chat Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.15), rgba(118, 75, 162, 0.15))',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
            flexShrink: 0,
            boxSizing: 'border-box'
          }}>
            <h3 style={{ 
              margin: '0',
              color: '#1d1d1f',
              fontSize: '1.1rem',
              fontWeight: '700',
              letterSpacing: '-0.02em'
            }}>
              🎉 Game Over - Chat with AI
            </h3>
            <p style={{
              margin: '4px 0 0 0',
              fontSize: '0.85rem',
              color: '#86868b',
              fontWeight: '500'
            }}>
              {gameState?.trainingData?.length || 0} training examples
            </p>
          </div>

          {/* Chat Messages Area */}
          <div 
            ref={chatContainerRef}
            style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            minHeight: 0,
            boxSizing: 'border-box'
          }}>
            {chatHistory.length === 0 && !isAiTyping ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: '12px',
                color: '#86868b',
                padding: '20px'
              }}>
                <div style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}>💭</div>
                <p style={{ 
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  textAlign: 'center',
                  margin: 0
                }}>
                  Start a conversation with the AI
                </p>
              </div>
            ) : (
              chatHistory.reduce((acc, message, index) => {
                // Group messages into Q&A pairs
                if (message.role === 'user') {
                  // Find the next AI response
                  const nextAiResponse = chatHistory.slice(index + 1).find(m => m.role === 'assistant');
                  const pairKey = `${index}-${message.content}-${nextAiResponse?.content || ''}`;
                  acc.push({
                    question: message.content,
                    answer: nextAiResponse ? nextAiResponse.content : null,
                    questionIndex: index,
                    pairKey: pairKey,
                    isWaitingForResponse: !nextAiResponse && index === chatHistory.length - 1,
                    isStarred: starredPairs.has(pairKey)
                  });
                }
                return acc;
              }, []).map((pair, pairIndex) => (
                <div
                  key={pairIndex}
                  style={{
                    background: pair.isStarred ? 'rgba(255, 204, 0, 0.15)' : 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    padding: '12px',
                    border: pair.isStarred ? '2px solid rgba(255, 204, 0, 0.6)' : '1px solid rgba(0, 0, 0, 0.08)',
                    boxShadow: pair.isStarred ? '0 4px 12px rgba(255, 204, 0, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.05)',
                    animation: 'slideUp 0.3s ease-out',
                    marginBottom: '8px',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {/* Question */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: pair.answer ? '10px' : '0'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#86868b',
                        fontWeight: '600',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Your Question
                      </div>
                      <div style={{
                        fontSize: '0.95rem',
                        color: '#1d1d1f',
                        lineHeight: '1.4',
                        wordBreak: 'break-word',
                        fontWeight: '500'
                      }}>
                        {pair.question}
                      </div>
                    </div>
                    {pair.answer && !pair.isStarred && (
                      <button
                        onClick={() => {
                          console.log('[STUDENT] Starring Q&A pair:', { 
                            question: pair.question.substring(0, 50), 
                            answer: pair.answer.substring(0, 50),
                            studentName: name 
                          });
                          
                          // Add to local starred set
                          setStarredPairs(prev => new Set([...prev, pair.pairKey]));
                          
                          // Send to server
                          sendMessage({
                            type: 'star_qa_pair',
                            question: pair.question,
                            answer: pair.answer,
                            timestamp: Date.now(),
                            studentName: name
                          });
                          
                          console.log('[STUDENT] Star message sent to server');
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '1.5rem',
                          padding: '4px 8px',
                          marginLeft: '8px',
                          transition: 'transform 0.2s',
                          flexShrink: 0
                        }}
                        onMouseEnter={(e) => e.target.style.transform = 'scale(1.2)'}
                        onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                        title="Star this Q&A pair"
                      >
                        ⭐
                      </button>
                    )}
                  </div>

                  {/* Answer or Typing Indicator */}
                  {pair.answer ? (
                    <div>
                      <div style={{
                        height: '1px',
                        background: 'linear-gradient(to right, rgba(0, 0, 0, 0.1), transparent)',
                        marginBottom: '10px'
                      }}></div>
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#86868b',
                        fontWeight: '600',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        AI Response
                      </div>
                      <div style={{
                        fontSize: '0.95rem',
                        color: '#1d1d1f',
                        lineHeight: '1.4',
                        wordBreak: 'break-word'
                      }}>
                        {pair.answer}
                      </div>
                    </div>
                  ) : pair.isWaitingForResponse ? (
                    <div>
                      <div style={{
                        height: '1px',
                        background: 'linear-gradient(to right, rgba(0, 0, 0, 0.1), transparent)',
                        marginTop: '10px',
                        marginBottom: '10px'
                      }}></div>
                      <div style={{
                        display: 'flex',
                        gap: '4px',
                        alignItems: 'center',
                        padding: '8px 0'
                      }}>
                        <div className="typing-dot" style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#86868b',
                          animation: 'typingBounce 1.4s infinite ease-in-out',
                          animationDelay: '0s'
                        }}></div>
                        <div className="typing-dot" style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#86868b',
                          animation: 'typingBounce 1.4s infinite ease-in-out',
                          animationDelay: '0.2s'
                        }}></div>
                        <div className="typing-dot" style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: '#86868b',
                          animation: 'typingBounce 1.4s infinite ease-in-out',
                          animationDelay: '0.4s'
                        }}></div>
                        <span style={{
                          fontSize: '0.85rem',
                          color: '#86868b',
                          marginLeft: '8px',
                          fontStyle: 'italic'
                        }}>
                          AI is thinking...
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
            
            {/* Typing Indicator - removed, now shown inline */}
            {isAiTyping && chatHistory.length === 0 && (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-start',
                animation: 'slideUp 0.3s ease-out'
              }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: '14px',
                  fontSize: '0.95rem',
                  lineHeight: '1.4',
                  background: 'rgba(0, 0, 0, 0.05)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  color: '#1d1d1f',
                  borderBottomLeftRadius: '4px',
                  border: '1px solid rgba(0, 0, 0, 0.06)',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'center'
                }}>
                  <div className="typing-dot" style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#86868b',
                    animation: 'typingBounce 1.4s infinite ease-in-out',
                    animationDelay: '0s'
                  }}></div>
                  <div className="typing-dot" style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#86868b',
                    animation: 'typingBounce 1.4s infinite ease-in-out',
                    animationDelay: '0.2s'
                  }}></div>
                  <div className="typing-dot" style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#86868b',
                    animation: 'typingBounce 1.4s infinite ease-in-out',
                    animationDelay: '0.4s'
                  }}></div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Area */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(0, 0, 0, 0.08)',
            background: 'rgba(255, 255, 255, 0.4)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            borderBottomLeftRadius: '16px',
            borderBottomRightRadius: '16px',
            flexShrink: 0,
            boxSizing: 'border-box'
          }}>
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '8px',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              <input
                type="text"
                value={llmQuery}
                onChange={(e) => setLlmQuery(e.target.value)}
                placeholder="Type your question..."
                style={{
                  padding: '10px 14px',
                  fontSize: '0.95rem',
                  border: '1px solid rgba(0, 0, 0, 0.12)',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.2s',
                  outline: 'none',
                  minWidth: 0,
                  width: '100%',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1), inset 0 1px 2px rgba(0, 0, 0, 0.05)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(0, 0, 0, 0.12)';
                  e.target.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.05)';
                }}
                onKeyPress={(e) => e.key === 'Enter' && queryLLM()}
              />
              <button
                onClick={queryLLM}
                disabled={!llmQuery.trim() || isLlmQueryPending}
                style={{
                  background: (llmQuery.trim() && !isLlmQueryPending) 
                    ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.95), rgba(118, 75, 162, 0.95))'
                    : 'rgba(142, 142, 147, 0.2)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  color: (llmQuery.trim() && !isLlmQueryPending) ? 'white' : '#86868b',
                  padding: '10px 20px',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  border: (llmQuery.trim() && !isLlmQueryPending) ? '1px solid rgba(255, 255, 255, 0.7)' : '1px solid rgba(0, 0, 0, 0.1)',
                  borderRadius: '12px',
                  cursor: (llmQuery.trim() && !isLlmQueryPending) ? 'pointer' : 'not-allowed',
                  boxShadow: (llmQuery.trim() && !isLlmQueryPending) 
                    ? '0 2px 8px rgba(102, 126, 234, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
                    : 'none',
                  transition: 'all 0.2s',
                  letterSpacing: '-0.01em',
                  opacity: (llmQuery.trim() && !isLlmQueryPending) ? 1 : 0.6,
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  if (llmQuery.trim() && !isLlmQueryPending) {
                    e.target.style.transform = 'translateY(-1px)';
                    e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = (llmQuery.trim() && !isLlmQueryPending) 
                    ? '0 2px 8px rgba(102, 126, 234, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
                    : 'none';
                }}
              >
                {isLlmQueryPending ? 'Waiting...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Challenging state - waiting for challenge to appear
  if (currentMode === 'challenging') {
    return (
      <div style={{ 
        width: '100vw',
        height: '100dvh',
        padding: '8px',
        margin: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        {activeChallenge ? (
          <ChallengeModal 
            challenge={activeChallenge}
            onComplete={handleChallengeComplete}
          />
        ) : (
          <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            padding: '48px 32px',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
            textAlign: 'center',
            maxWidth: '500px',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            <div className="pulse emoji-large" style={{ fontSize: '5rem', marginBottom: '24px' }}>
              ⚡
            </div>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: '600',
              color: '#1d1d1f',
              marginBottom: '16px',
              letterSpacing: '-0.02em'
            }}>
              Get Ready for a Challenge!
            </h2>
            <p style={{
              fontSize: '1.2rem',
              color: '#86868b',
              fontWeight: '500',
              marginBottom: '24px'
            }}>
              A challenge will appear soon to test your skills...
            </p>
            <div style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: 'rgba(255, 204, 0, 0.2)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 204, 0, 0.3)',
              color: '#8B6914',
              fontWeight: '600',
              fontSize: '0.95rem'
            }}>
              💡 Complete it successfully to help train the AI!
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100vw',
      height: '100dvh',
      padding: '8px',
      margin: '0',
      display: 'flex',
      boxSizing: 'border-box',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      {activeChallenge && (
        <ChallengeModal 
          challenge={activeChallenge}
          onComplete={handleChallengeComplete}
        />
      )}

      <div style={{
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        padding: 'clamp(16px, 4vw, 32px)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
        height: '100%',
        width: '100%',
        overflowY: 'auto',
        position: 'relative',
        boxSizing: 'border-box'
      }}>
        {currentQuestion ? (
          <div>
            {currentMode === 'answerer' && (
            <Transition
              show={true}
              appear={true}
              enter="transition-all duration-500"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition-all duration-300"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <div>
                <div style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  padding: '24px',
                  borderRadius: '16px',
                  marginBottom: '24px',
                  border: '1px solid rgba(79, 172, 254, 0.3)',
                  boxShadow: '0 4px 16px rgba(79, 172, 254, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                }}>
                  <div style={{ 
                    fontSize: '13px', 
                    color: '#86868b', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Answer This Question:
                  </div>
                  <div className="student-question-text" style={{ 
                    fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
                    color: '#1d1d1f',
                    fontWeight: '600',
                    lineHeight: '1.4',
                    wordBreak: 'break-word'
                  }}>
                    {currentQuestion.text}
                  </div>
                  {currentQuestion.type === 'config' && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px 16px',
                      background: 'rgba(255, 204, 0, 0.2)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      color: '#8B6914',
                      fontWeight: '600',
                      border: '1px solid rgba(255, 204, 0, 0.3)'
                    }}>
                      ⚙️ Configuration Question - This will shape the AI's personality!
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    color: '#1d1d1f',
                    fontSize: '1.1rem',
                    letterSpacing: '-0.01em'
                  }}>
                    Your Answer:
                  </label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onFocus={() => { isTypingRef.current = true; }}
                    onBlur={() => { isTypingRef.current = false; }}
                    placeholder="Type your answer here... Be creative!"
                    className="student-textarea"
                    style={{ 
                      width: '100%', 
                      minHeight: '150px',
                      resize: 'vertical',
                      fontSize: '1rem',
                      padding: '16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      background: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  />
                  <button
                    onClick={submitAnswer}
                    disabled={!answer.trim()}
                    className="student-button"
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      background: answer.trim()
                        ? 'linear-gradient(135deg, rgba(52, 199, 89, 0.9), rgba(48, 209, 88, 0.9))'
                        : 'rgba(142, 142, 147, 0.3)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      color: '#1d1d1f',
                      padding: '16px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      border: answer.trim() ? '1px solid rgba(255, 255, 255, 0.7)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      cursor: answer.trim() ? 'pointer' : 'not-allowed',
                      opacity: answer.trim() ? 1 : 0.6,
                      boxShadow: answer.trim() ? '0 4px 16px rgba(52, 199, 89, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none',
                      transition: 'all 0.2s',
                      letterSpacing: '-0.01em'
                    }}
                    onMouseEnter={(e) => {
                      if (answer.trim()) {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 20px rgba(52, 199, 89, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = answer.trim() ? '0 4px 16px rgba(52, 199, 89, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none';
                    }}
                  >
                    Submit Answer (then you'll ask next!)
                  </button>
                </div>
              </div>
            </Transition>
            )}

            {currentMode === 'asker' && (
            <Transition
              show={true}
              appear={true}
              enter="transition-all duration-500"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="transition-all duration-300"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <div>
                {/* Suggested Question (Read-Only) */}
                <div style={{
                  background: 'rgba(255, 99, 132, 0.1)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  padding: '24px',
                  borderRadius: '16px',
                  marginBottom: '24px',
                  border: '1px solid rgba(255, 99, 132, 0.3)',
                  boxShadow: '0 4px 16px rgba(255, 99, 132, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                }}>
                  <div style={{ 
                    fontSize: '13px', 
                    color: '#86868b', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    💡 Suggested Question
                  </div>
                  <div className="student-question-text" style={{ 
                    fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
                    color: '#1d1d1f',
                    fontWeight: '600',
                    lineHeight: '1.4',
                    marginBottom: '16px',
                    padding: 'clamp(12px, 3vw, 20px)',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.6)',
                    wordBreak: 'break-word'
                  }}>
                    {currentQuestion.text}
                  </div>
                  {currentQuestion.type === 'config' && (
                    <div style={{
                      padding: '12px 16px',
                      background: 'rgba(255, 204, 0, 0.2)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      color: '#8B6914',
                      fontWeight: '600',
                      marginBottom: '16px',
                      border: '1px solid rgba(255, 204, 0, 0.3)'
                    }}>
                      ⚙️ Configuration Question - This shapes the AI's personality!
                    </div>
                  )}
                  
                  <button
                    onClick={submitAskerQuestion}
                    className="student-button"
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, rgba(255, 99, 132, 0.9), rgba(255, 45, 85, 0.9))',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      color: '#1d1d1f',
                      padding: '16px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      border: '1px solid rgba(255, 255, 255, 0.7)',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(255, 99, 132, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
                      transition: 'all 0.2s',
                      letterSpacing: '-0.01em'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 20px rgba(255, 99, 132, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 16px rgba(255, 99, 132, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
                    }}
                  >
                    ✓ Use This Question
                  </button>
                </div>

                {/* OR Divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  margin: '24px 0',
                  gap: '16px'
                }}>
                  <div style={{ 
                    flex: 1,
                    height: '1px',
                    background: 'linear-gradient(to right, transparent, rgba(0, 0, 0, 0.1), transparent)'
                  }}></div>
                  <div style={{ 
                    color: '#86868b', 
                    fontWeight: '600',
                    fontSize: '0.9rem',
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: '20px',
                    border: '1px solid rgba(0, 0, 0, 0.1)',
                    letterSpacing: '0.5px'
                  }}>
                    OR
                  </div>
                  <div style={{ 
                    flex: 1,
                    height: '1px',
                    background: 'linear-gradient(to left, transparent, rgba(0, 0, 0, 0.1), transparent)'
                  }}></div>
                </div>

                {/* Custom Question Option */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  padding: '24px',
                  borderRadius: '16px',
                  border: '1px dashed rgba(0, 0, 0, 0.2)',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                }}>
                  <div style={{ 
                    fontSize: '13px', 
                    color: '#86868b', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    ✏️ Write Your Own Question
                  </div>
                  <textarea
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    onFocus={() => { isTypingRef.current = true; }}
                    onBlur={() => { isTypingRef.current = false; }}
                    placeholder="Type your own creative question here..."
                    className="student-textarea"
                    style={{ 
                      width: '100%', 
                      minHeight: '120px',
                      resize: 'vertical',
                      fontSize: '1.1rem',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      padding: '16px',
                      boxSizing: 'border-box',
                      marginBottom: '16px',
                      background: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  />
                  <button
                    onClick={submitCustomQuestion}
                    disabled={!customQuestion.trim()}
                    className="student-button"
                    style={{
                      width: '100%',
                      background: customQuestion.trim()
                        ? 'linear-gradient(135deg, rgba(0, 122, 255, 0.9), rgba(10, 132, 255, 0.9))'
                        : 'rgba(142, 142, 147, 0.3)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      color: '#1d1d1f',
                      padding: '16px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      border: customQuestion.trim() ? '1px solid rgba(255, 255, 255, 0.7)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      cursor: customQuestion.trim() ? 'pointer' : 'not-allowed',
                      opacity: customQuestion.trim() ? 1 : 0.6,
                      boxShadow: customQuestion.trim() ? '0 4px 16px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none',
                      transition: 'all 0.2s',
                      letterSpacing: '-0.01em'
                    }}
                    onMouseEnter={(e) => {
                      if (customQuestion.trim()) {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 20px rgba(0, 122, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = customQuestion.trim() ? '0 4px 16px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none';
                    }}
                  >
                    Submit Custom Question
                  </button>
                </div>
              </div>
            </Transition>
            )}
          </div>
        ) : (
          <div>
            {currentMode === 'asker' ? (
              <div>
                <div style={{
                  textAlign: 'center',
                  padding: '48px',
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  marginBottom: '24px',
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05), inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                }}>
                  <div className="pulse" style={{ fontSize: '4rem', marginBottom: '20px' }}>
                    ❓
                  </div>
                  <p style={{ 
                    fontSize: '1.2rem',
                    color: '#1d1d1f',
                    marginBottom: '8px',
                    fontWeight: '600'
                  }}>
                    No question prompt available right now
                  </p>
                  <p style={{ 
                    fontSize: '1rem',
                    color: '#86868b',
                    fontWeight: '500'
                  }}>
                    Write your own question below!
                  </p>
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    color: '#1d1d1f',
                    fontSize: '1.1rem',
                    letterSpacing: '-0.01em'
                  }}>
                    Your Custom Question:
                  </label>
                  <textarea
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    onFocus={() => { isTypingRef.current = true; }}
                    onBlur={() => { isTypingRef.current = false; }}
                    placeholder="Type an interesting question for the AI to learn... (e.g., 'What makes a good friend?')"
                    style={{ 
                      width: '100%', 
                      minHeight: '150px',
                      resize: 'vertical',
                      fontSize: '1rem',
                      padding: '16px',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  />
                  <button
                    onClick={submitCustomQuestion}
                    disabled={!customQuestion.trim()}
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      background: customQuestion.trim()
                        ? 'linear-gradient(135deg, rgba(255, 99, 132, 0.9), rgba(255, 45, 85, 0.9))'
                        : 'rgba(142, 142, 147, 0.3)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      color: '#1d1d1f',
                      padding: '16px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      border: customQuestion.trim() ? '1px solid rgba(255, 255, 255, 0.7)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      cursor: customQuestion.trim() ? 'pointer' : 'not-allowed',
                      opacity: customQuestion.trim() ? 1 : 0.6,
                      boxShadow: customQuestion.trim() ? '0 4px 16px rgba(255, 99, 132, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none',
                      transition: 'all 0.2s',
                      letterSpacing: '-0.01em'
                    }}
                    onMouseEnter={(e) => {
                      if (customQuestion.trim()) {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 20px rgba(255, 99, 132, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = customQuestion.trim() ? '0 4px 16px rgba(255, 99, 132, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none';
                    }}
                  >
                    Submit Your Question
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{
                  textAlign: 'center',
                  padding: '32px',
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  marginBottom: '24px',
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05), inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                }}>
                  <div className="pulse" style={{ fontSize: '3rem', marginBottom: '12px' }}>
                    ⏳
                  </div>
                  <p style={{ 
                    fontSize: '1.1rem',
                    color: '#1d1d1f',
                    marginBottom: '6px',
                    fontWeight: '600'
                  }}>
                    No question assigned right now
                  </p>
                  <p style={{ 
                    fontSize: '0.95rem',
                    color: '#86868b',
                    fontWeight: '500'
                  }}>
                    You can ask one while you wait.
                  </p>
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    color: '#1d1d1f',
                    fontSize: '1.1rem',
                    letterSpacing: '-0.01em'
                  }}>
                    Ask a Question Now:
                  </label>
                  <textarea
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    onFocus={() => { isTypingRef.current = true; }}
                    onBlur={() => { isTypingRef.current = false; }}
                    placeholder="Type an interesting question... (e.g., 'Who is the best teammate?')"
                    style={{ 
                      width: '100%', 
                      minHeight: '150px',
                      resize: 'vertical',
                      fontSize: '1rem',
                      padding: '16px',
                      border: '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  />
                  <button
                    onClick={submitCustomQuestion}
                    disabled={!customQuestion.trim()}
                    className="student-button"
                    style={{
                      marginTop: '16px',
                      width: '100%',
                      background: customQuestion.trim()
                        ? 'linear-gradient(135deg, rgba(0, 122, 255, 0.9), rgba(10, 132, 255, 0.9))'
                        : 'rgba(142, 142, 147, 0.3)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      color: '#1d1d1f',
                      padding: '16px',
                      fontSize: '1.1rem',
                      fontWeight: '600',
                      border: customQuestion.trim() ? '1px solid rgba(255, 255, 255, 0.7)' : '1px solid rgba(0, 0, 0, 0.1)',
                      borderRadius: '12px',
                      cursor: customQuestion.trim() ? 'pointer' : 'not-allowed',
                      opacity: customQuestion.trim() ? 1 : 0.6,
                      boxShadow: customQuestion.trim() ? '0 4px 16px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)' : 'none',
                      transition: 'all 0.2s',
                      letterSpacing: '-0.01em'
                    }}
                  >
                    Submit Your Question
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentClient;
