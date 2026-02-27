import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

const ContextCacheChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // 'intro', 'incoming', 'query', 'result'
  const [memorySlots, setMemorySlots] = useState(Array(8).fill(null));
  const [incomingChunks, setIncomingChunks] = useState([]);
  const [currentChunk, setCurrentChunk] = useState(null);
  const [score, setScore] = useState(0);
  const [query, setQuery] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [chunksProcessed, setChunksProcessed] = useState(0);
  const [waitingForPlayer, setWaitingForPlayer] = useState(true); // NEW: wait for player action
  const phaseTimerRef = useRef(null);

  useEffect(() => {
    if (phase !== 'incoming') return;
    
    // Generate initial chunks
    const chunks = challenge.dialogueChunks || generateDialogueChunks();
    setIncomingChunks(chunks);
    
    // Start the first chunk
    if (chunks.length > 0) {
      setCurrentChunk({ ...chunks[0], dropping: true });
    }
  }, [challenge, phase]);

  const generateDialogueChunks = () => {
    const templates = [
      { text: "Remember I'm allergic to cats", important: true, tags: ['allergy', 'cats'] },
      { text: "My favorite color is blue", important: true, tags: ['preference', 'color'] },
      { text: "The weather is nice today", important: false, tags: ['weather'] },
      { text: "Now write a story about my pet", important: true, tags: ['instruction', 'pet'] },
      { text: "I changed my mind — it's green", important: true, tags: ['preference', 'color'] },
      { text: "By the way, I love pizza", important: true, tags: ['food', 'preference'] },
      { text: "That's interesting", important: false, tags: ['filler'] },
      { text: "My name is Alex", important: true, tags: ['identity', 'name'] },
      { text: "I work as a teacher", important: true, tags: ['profession'] },
      { text: "Hmm, okay", important: false, tags: ['filler'] },
      { text: "I have a dog named Max", important: true, tags: ['pet', 'name'] },
      { text: "Sure thing", important: false, tags: ['filler'] },
      { text: "I'm learning Python", important: true, tags: ['skill', 'programming'] },
      { text: "Cool cool cool", important: false, tags: ['filler'] },
      { text: "I live in Portland", important: true, tags: ['location'] },
    ];

    // Pick 10 random chunks (reduced from 12)
    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 10).map((chunk, i) => ({
      id: i,
      ...chunk,
      priority: chunk.important ? Math.floor(Math.random() * 3) + 7 : Math.floor(Math.random() * 4) + 1
    }));
  };

  // Player controls chunk placement - no auto-drop timeout needed

  useEffect(() => {
    if (phase === 'query' && !waitingForPlayer) {
      // Wait for player to see the query, then check automatically
      phaseTimerRef.current = setTimeout(() => {
        checkAnswer();
      }, 3000);

      return () => {
        if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
      };
    }
  }, [phase, waitingForPlayer]);

  useEffect(() => {
    if (phase === 'result' && !waitingForPlayer) {
      // Show result, then wait for player to continue
      setWaitingForPlayer(true);
    }
  }, [phase]);

  const handleSlotClick = (index) => {
    if (phase !== 'incoming' || !currentChunk || !waitingForPlayer) return;

    const newSlots = [...memorySlots];
    newSlots[index] = currentChunk;
    setMemorySlots(newSlots);
    setChunksProcessed(prev => prev + 1);
    setWaitingForPlayer(false);

    // Every 4 chunks, ask a query
    if ((chunksProcessed + 1) % 4 === 0) {
      askQuery(newSlots);
    } else {
      nextChunk();
    }
  };

  const handleDiscard = () => {
    if (phase !== 'incoming' || !currentChunk || !waitingForPlayer) return;
    
    setChunksProcessed(prev => prev + 1);
    setWaitingForPlayer(false);
    
    // Every 4 chunks, ask a query
    if ((chunksProcessed + 1) % 4 === 0) {
      askQuery(memorySlots);
    } else {
      nextChunk();
    }
  };

  const handleContinue = () => {
    if (phase === 'result' && waitingForPlayer) {
      setPhase('incoming');
      setFeedback(null);
      setWaitingForPlayer(true);
      nextChunk();
    }
  };

  const nextChunk = () => {
    const remaining = incomingChunks.slice(chunksProcessed + 1);
    if (remaining.length > 0) {
      setCurrentChunk({ ...remaining[0], dropping: true });
      setWaitingForPlayer(true);
    } else {
      // Challenge complete!
      const successThreshold = 20; // Need 20+ points to pass (at least 1 correct answer)
      onComplete(score >= successThreshold);
    }
  };

  const askQuery = (currentMemory) => {
    // Generate a query based on what's in memory
    const stored = currentMemory.filter(c => c !== null);
    
    if (stored.length === 0) {
      setQuery({ text: "What do you remember?", answer: null });
    } else {
      // Pick a random stored chunk and ask about it
      const target = stored[Math.floor(Math.random() * stored.length)];
      setQuery({ text: `User asks: "${target.text.split(' ').slice(0, 3).join(' ')}..." — do you remember?`, answer: target.id, requiredTags: target.tags });
    }
    
    setPhase('query');
    setWaitingForPlayer(false);
  };

  const checkAnswer = () => {
    if (!query || !query.answer) {
      setPhase('result');
      setFeedback({ success: true, message: 'Memory check!' });
      setWaitingForPlayer(true);
      return;
    }

    const isStored = memorySlots.some(slot => slot && slot.id === query.answer);
    
    if (isStored) {
      setScore(prev => prev + 20);
      setFeedback({ success: true, message: '✓ Correct! Memory intact!' });
    } else {
      setScore(prev => prev - 10);
      setFeedback({ success: false, message: '✗ Memory lost! Context forgotten!' });
    }
    
    setPhase('result');
    setWaitingForPlayer(true);
  };

  const renderMemorySlots = () => {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '8px',
        marginTop: '16px'
      }}>
        {memorySlots.map((slot, index) => (
          <div
            key={index}
            onClick={() => handleSlotClick(index)}
            style={{
              minHeight: '60px',
              border: '2px dashed #ccc',
              borderRadius: '8px',
              padding: '8px',
              background: slot 
                ? (slot.important ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#e0e0e0')
                : '#f9f9f9',
              color: slot?.important ? 'white' : '#333',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              cursor: (phase === 'incoming' && currentChunk && waitingForPlayer) ? 'pointer' : 'default',
              transition: 'all 0.2s',
              position: 'relative',
              opacity: slot ? 1 : 0.5,
              transform: (phase === 'incoming' && currentChunk && waitingForPlayer && !slot) ? 'scale(1.02)' : 'scale(1)',
              boxShadow: (phase === 'incoming' && currentChunk && waitingForPlayer && !slot) ? '0 0 10px rgba(102, 126, 234, 0.5)' : 'none'
            }}
          >
            {slot ? (
              <>
                <div>{slot.text}</div>
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  right: '4px',
                  fontSize: '0.6rem',
                  fontWeight: 'bold',
                  opacity: 0.7
                }}>
                  P{slot.priority}
                </div>
              </>
            ) : (
              <div style={{ opacity: 0.3 }}>Empty</div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={() => setPhase('incoming')}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '🧠',
            title: 'The AI has only 8 memory slots!',
            description: 'Dialogue keeps streaming in but you can only store 8 chunks. Choose what to keep wisely!',
          },
          {
            emoji: '💾',
            title: 'Tap to SAVE the important chunks',
            description: 'Each chunk has a priority rating. Save the highest-priority ones before memory fills up.',
            demo: (
              <div style={{ maxWidth: '240px', margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '10px' }}>
                  {[{s:true,l:'★★★'},{s:true,l:'★★☆'},{s:false,l:'★☆☆'},{s:false,l:'★★★'},{s:false,l:'★☆☆'},{s:true,l:'★★☆'},{s:false,l:'empty'},{s:false,l:'empty'}].map((slot, i) => (
                    <div key={i} style={{ height: '36px', borderRadius: '8px', background: slot.s ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)', border: `1px solid ${slot.s ? '#8b5cf6' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: slot.s ? '#c4b5fd' : '#475569' }}>
                      {slot.l}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Tap a chunk to save it to a slot</div>
              </div>
            ),
          },
          {
            emoji: '❓',
            title: 'Answer questions about what you saved!',
            description: 'After saving, you get quizzed on the stored content. Score 20+ points to win!',
          },
        ]}
      />
    );
  }

  return (
    <div style={{ 
      padding: 'clamp(10px, 2vw, 20px)',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        color: 'white',
        padding: 'clamp(12px, 2vw, 16px)',
        borderRadius: '12px',
        marginBottom: 'clamp(12px, 2vw, 16px)',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>🧠 Context Cache</h3>
        <p style={{ margin: 0, fontSize: 'clamp(0.8rem, 2vw, 0.95rem)', color: '#94a3b8' }}>
          Manage the LLM's memory! Keep important context, discard filler.
        </p>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 'clamp(12px, 2vw, 16px)',
        fontSize: 'clamp(0.85rem, 2vw, 1rem)',
        fontWeight: 'bold',
        color: 'white'
      }}>
        <div>Score: <span style={{ color: score >= 0 ? '#10b981' : '#ef4444' }}>{score}</span></div>
        <div style={{ color: '#94a3b8' }}>Chunks: {chunksProcessed}/{incomingChunks.length}</div>
      </div>

      {phase === 'incoming' && currentChunk && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.2)',
          border: '2px solid rgba(245, 158, 11, 0.4)',
          borderRadius: 'clamp(10px, 2vw, 12px)',
          padding: 'clamp(12px, 3vw, 16px)',
          marginBottom: 'clamp(12px, 2vw, 16px)',
          textAlign: 'center',
          animation: waitingForPlayer ? 'pulse 2s infinite' : 'none',
          position: 'relative'
        }}>
          <div style={{ 
            fontSize: 'clamp(0.7rem, 2vw, 0.85rem)', 
            color: '#94a3b8',
            marginBottom: '4px' 
          }}>
            Incoming Memory Chunk
          </div>
          <div style={{ 
            fontSize: 'clamp(0.95rem, 3vw, 1.15rem)', 
            fontWeight: 'bold', 
            marginBottom: 'clamp(6px, 1.5vw, 8px)',
            color: 'white',
            lineHeight: '1.4'
          }}>
            "{currentChunk.text}"
          </div>
          <div style={{ 
            fontSize: 'clamp(0.7rem, 2vw, 0.8rem)', 
            marginBottom: 'clamp(10px, 2vw, 12px)',
            color: '#94a3b8'
          }}>
            Priority: <span style={{ 
              fontWeight: 'bold',
              color: currentChunk.important ? '#ef4444' : '#94a3b8'
            }}>
              {currentChunk.priority}/10
            </span>
            {currentChunk.important && <span style={{ marginLeft: '8px', color: '#ef4444' }}>⭐ Important</span>}
          </div>
          <div style={{ display: 'flex', gap: 'clamp(6px, 1.5vw, 8px)', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleDiscard}
              disabled={!waitingForPlayer}
              style={{
                padding: 'clamp(8px, 2vw, 10px) clamp(16px, 4vw, 20px)',
                background: waitingForPlayer 
                  ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)' 
                  : 'rgba(148, 163, 184, 0.3)',
                color: 'white',
                border: 'none',
                borderRadius: 'clamp(6px, 1.5vw, 8px)',
                cursor: waitingForPlayer ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: 'clamp(0.8rem, 2.2vw, 0.95rem)',
                minHeight: '44px',
                opacity: waitingForPlayer ? 1 : 0.5
              }}
            >
              🗑️ Discard
            </button>
            <div style={{ 
              fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', 
              fontWeight: '600',
              color: '#94a3b8'
            }}>
              or click a slot below →
            </div>
          </div>
          {waitingForPlayer && (
            <div style={{
              marginTop: 'clamp(6px, 1.5vw, 8px)',
              fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
              color: '#f59e0b',
              fontWeight: 'bold',
              animation: 'pulse 1.5s infinite'
            }}>
              ⏳ Make your decision!
            </div>
          )}
        </div>
      )}

      {phase === 'query' && query && (
        <div style={{
          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
          color: 'white',
          border: '2px solid rgba(139, 92, 246, 0.5)',
          borderRadius: 'clamp(10px, 2vw, 12px)',
          padding: 'clamp(16px, 4vw, 20px)',
          marginBottom: 'clamp(12px, 2vw, 16px)',
          textAlign: 'center',
          animation: 'pulse 1s infinite'
        }}>
          <div style={{ 
            fontSize: 'clamp(0.8rem, 2.2vw, 0.95rem)', 
            marginBottom: 'clamp(6px, 1.5vw, 8px)', 
            opacity: 0.95 
          }}>
            🤔 Memory Check
          </div>
          <div style={{ 
            fontSize: 'clamp(1rem, 3vw, 1.25rem)', 
            fontWeight: 'bold',
            lineHeight: '1.4'
          }}>
            {query.text}
          </div>
        </div>
      )}

      {phase === 'result' && feedback && (
        <div style={{
          background: feedback.success 
            ? 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)'
            : 'linear-gradient(135deg, #d63031 0%, #e17055 100%)',
          color: '#1d1d1f',
          border: `3px solid ${feedback.success ? '#00b894' : '#d63031'}`,
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '16px',
          textAlign: 'center',
          animation: 'shake 0.3s'
        }}>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '12px' }}>
            {feedback.message}
          </div>
          <button
            onClick={handleContinue}
            style={{
              padding: '10px 24px',
              background: 'rgba(255,255,255,0.3)',
              color: '#1d1d1f',
              border: '2px solid white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              marginTop: '8px'
            }}
          >
            Continue →
          </button>
        </div>
      )}

      <div style={{ marginTop: '16px' }}>
        <div style={{
          fontSize: '0.85rem',
          fontWeight: 'bold',
          marginBottom: '8px',
          color: '#666'
        }}>
          Memory Buffer (8 slots)
        </div>
        {renderMemorySlots()}
      </div>

      <div style={{
        marginTop: 'clamp(12px, 2vw, 16px)',
        padding: 'clamp(10px, 2vw, 12px)',
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '12px',
        fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
        color: '#94a3b8',
        border: '1px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div>💡 <strong style={{ color: 'white' }}>Tip:</strong> Keep high-priority chunks (⭐) and discard filler. You'll be quizzed!</div>
        <div style={{ marginTop: '4px' }}>🎯 <strong style={{ color: 'white' }}>Goal:</strong> Reach 20+ points to pass (answer at least 1 query correctly)</div>
      </div>
    </div>
  );
};

export default ContextCacheChallenge;
