import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

// ── Scenario pools ──────────────────────────────────────────────────
const SCENARIO_POOLS = [
  {
    name: 'Cooking Assistant',
    chunks: [
      { text: "I'm vegetarian, no meat please", important: true, detail: 'vegetarian', category: 'diet' },
      { text: "I'm allergic to peanuts", important: true, detail: 'peanuts', category: 'allergy' },
      { text: "I have 30 minutes to cook", important: true, detail: '30 minutes', category: 'time' },
      { text: "My oven is broken, stovetop only", important: true, detail: 'stovetop', category: 'equipment' },
      { text: "I love spicy food", important: true, detail: 'spicy', category: 'preference' },
      { text: "That sounds yummy!", important: false, detail: null, category: 'filler' },
      { text: "Hmm let me think", important: false, detail: null, category: 'filler' },
      { text: "Actually, I can eat fish", important: true, detail: 'fish ok', category: 'diet', contradicts: 'vegetarian' },
      { text: "I need it to serve 4 people", important: true, detail: '4 servings', category: 'servings' },
      { text: "Ok thanks", important: false, detail: null, category: 'filler' },
      { text: "Wait — I also can't have gluten", important: true, detail: 'gluten-free', category: 'allergy' },
      { text: "Ooh that's a good idea", important: false, detail: null, category: 'filler' },
      { text: "I have rice, tofu, and broccoli", important: true, detail: 'rice/tofu/broccoli', category: 'ingredients' },
      { text: "Actually make it for 6 people", important: true, detail: '6 servings', category: 'servings', contradicts: '4 servings' },
    ],
  },
  {
    name: 'Travel Planner',
    chunks: [
      { text: "I want to visit Japan in April", important: true, detail: 'Japan, April', category: 'destination' },
      { text: "Budget is $3000 total", important: true, detail: '$3000', category: 'budget' },
      { text: "I'm afraid of flying", important: true, detail: 'no flying', category: 'transport' },
      { text: "Sounds awesome", important: false, detail: null, category: 'filler' },
      { text: "I need wheelchair accessibility", important: true, detail: 'wheelchair', category: 'accessibility' },
      { text: "I speak some Japanese", important: true, detail: 'knows Japanese', category: 'language' },
      { text: "Nice nice nice", important: false, detail: null, category: 'filler' },
      { text: "Actually, let's go to Korea instead", important: true, detail: 'Korea', category: 'destination', contradicts: 'Japan, April' },
      { text: "I'm traveling with 2 kids", important: true, detail: '2 kids', category: 'companions' },
      { text: "We love street food", important: true, detail: 'street food', category: 'food' },
      { text: "Hmm ok", important: false, detail: null, category: 'filler' },
      { text: "I can increase budget to $5000", important: true, detail: '$5000', category: 'budget', contradicts: '$3000' },
      { text: "We need a hotel with a pool", important: true, detail: 'pool hotel', category: 'accommodation' },
      { text: "Whatever you think is best", important: false, detail: null, category: 'filler' },
    ],
  },
  {
    name: 'Code Tutor',
    chunks: [
      { text: "I'm a beginner at programming", important: true, detail: 'beginner', category: 'level' },
      { text: "I want to learn Python", important: true, detail: 'Python', category: 'language' },
      { text: "Ok got it", important: false, detail: null, category: 'filler' },
      { text: "I already know HTML and CSS", important: true, detail: 'knows HTML/CSS', category: 'background' },
      { text: "I can study 2 hours a day", important: true, detail: '2 hours/day', category: 'schedule' },
      { text: "My goal is to build a website", important: true, detail: 'build website', category: 'goal' },
      { text: "That makes sense", important: false, detail: null, category: 'filler' },
      { text: "Actually, I want to do data science", important: true, detail: 'data science', category: 'goal', contradicts: 'build website' },
      { text: "I have a Mac laptop", important: true, detail: 'Mac', category: 'equipment' },
      { text: "Interesting!", important: false, detail: null, category: 'filler' },
      { text: "Wait, maybe JavaScript instead", important: true, detail: 'JavaScript', category: 'language', contradicts: 'Python' },
      { text: "I learn best with videos", important: true, detail: 'video learner', category: 'style' },
      { text: "Cool", important: false, detail: null, category: 'filler' },
      { text: "I tried Java before and hated it", important: true, detail: 'hates Java', category: 'background' },
    ],
  },
  {
    name: 'Pet Advisor',
    chunks: [
      { text: "I live in a small apartment", important: true, detail: 'small apartment', category: 'housing' },
      { text: "I want a pet that's low maintenance", important: true, detail: 'low maintenance', category: 'preference' },
      { text: "I work 10-hour days", important: true, detail: '10-hour days', category: 'schedule' },
      { text: "Cute!", important: false, detail: null, category: 'filler' },
      { text: "I'm allergic to cats", important: true, detail: 'cat allergy', category: 'allergy' },
      { text: "I had a hamster as a kid", important: true, detail: 'had hamster', category: 'experience' },
      { text: "Hmm ok", important: false, detail: null, category: 'filler' },
      { text: "Actually I just moved to a house with a yard", important: true, detail: 'house with yard', category: 'housing', contradicts: 'small apartment' },
      { text: "I have a 5-year-old child", important: true, detail: '5yo child', category: 'family' },
      { text: "I'm willing to spend $200/month on pet care", important: true, detail: '$200/month', category: 'budget' },
      { text: "Aww!", important: false, detail: null, category: 'filler' },
      { text: "Oh wait, my allergy is actually to dogs", important: true, detail: 'dog allergy', category: 'allergy', contradicts: 'cat allergy' },
      { text: "I want something my kid can play with", important: true, detail: 'kid-friendly', category: 'preference' },
      { text: "Sounds good", important: false, detail: null, category: 'filler' },
    ],
  },
  {
    name: 'Fitness Coach',
    chunks: [
      { text: "I want to lose 20 pounds", important: true, detail: 'lose 20 lbs', category: 'goal' },
      { text: "I have a bad knee", important: true, detail: 'bad knee', category: 'injury' },
      { text: "I can exercise 3 days a week", important: true, detail: '3 days/week', category: 'schedule' },
      { text: "Sounds tough", important: false, detail: null, category: 'filler' },
      { text: "I'm 35 years old", important: true, detail: 'age 35', category: 'age' },
      { text: "I don't have gym access", important: true, detail: 'no gym', category: 'equipment' },
      { text: "Yeah", important: false, detail: null, category: 'filler' },
      { text: "Actually I just joined a gym!", important: true, detail: 'has gym access', category: 'equipment', contradicts: 'no gym' },
      { text: "I'm also vegan", important: true, detail: 'vegan', category: 'diet' },
      { text: "Ok sure", important: false, detail: null, category: 'filler' },
      { text: "Wait, I want to gain muscle instead", important: true, detail: 'gain muscle', category: 'goal', contradicts: 'lose 20 lbs' },
      { text: "I can actually do 5 days a week", important: true, detail: '5 days/week', category: 'schedule', contradicts: '3 days/week' },
      { text: "I hate running", important: true, detail: 'no running', category: 'preference' },
      { text: "Alright", important: false, detail: null, category: 'filler' },
    ],
  },
];

const NUM_SLOTS = 6;
const CHUNKS_PER_ROUND = 8;

const ContextCacheChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro');
  const [memorySlots, setMemorySlots] = useState(Array(NUM_SLOTS).fill(null));
  const [incomingChunks, setIncomingChunks] = useState([]);
  const [currentChunk, setCurrentChunk] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [chunksProcessed, setChunksProcessed] = useState(0);
  const [waitingForPlayer, setWaitingForPlayer] = useState(true);
  const [scenarioName, setScenarioName] = useState('');
  const [results, setResults] = useState(null);

  const phaseTimerRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  // Generate chunks when entering incoming phase for the first time
  useEffect(() => {
    if (phase !== 'incoming' || incomingChunks.length > 0) return;

    const scenario = SCENARIO_POOLS[Math.floor(Math.random() * SCENARIO_POOLS.length)];
    setScenarioName(scenario.name);

    const shuffled = [...scenario.chunks].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, CHUNKS_PER_ROUND).map((chunk, i) => ({
      id: i,
      ...chunk,
      priority: chunk.important
        ? Math.floor(Math.random() * 3) + 7
        : Math.floor(Math.random() * 4) + 1,
    }));

    setIncomingChunks(selected);
    if (selected.length > 0) {
      setCurrentChunk({ ...selected[0], dropping: true });
    }
  }, [phase]);

  const handleSlotClick = (index) => {
    if (phase !== 'incoming' || !currentChunk || !waitingForPlayer) return;

    const newSlots = [...memorySlots];
    const wasOverwrite = newSlots[index] !== null;
    newSlots[index] = currentChunk;
    setMemorySlots(newSlots);
    setChunksProcessed(prev => prev + 1);

    if (wasOverwrite) {
      setFeedback({ success: true, message: '🔄 Overwritten! Old data lost.', quick: true });
    }

    advanceChunk();
  };

  const handleDiscard = () => {
    if (phase !== 'incoming' || !currentChunk || !waitingForPlayer) return;
    setChunksProcessed(prev => prev + 1);
    advanceChunk();
  };

  const advanceChunk = () => {
    const remaining = incomingChunks.slice(chunksProcessed + 1);
    if (remaining.length > 0) {
      setCurrentChunk({ ...remaining[0], dropping: true });
      setWaitingForPlayer(true);
      if (feedback?.quick) {
        setTimeout(() => setFeedback(null), 1200);
      }
    } else {
      // All chunks processed — auto-evaluate
      // Use timeout to let final setState flush
      setTimeout(() => {
        setPhase('results');
      }, 0);
    }
  };

  // Auto-evaluate when entering results phase
  useEffect(() => {
    if (phase !== 'results') return;
    const stored = memorySlots.filter(Boolean);
    const totalImportantInRound = incomingChunks.filter(c => c.important).length;
    const importantSaved = stored.filter(s => s.important).length;
    const fillerSaved = stored.filter(s => !s.important).length;
    const passed = totalImportantInRound > 0 && importantSaved >= Math.ceil(totalImportantInRound / 2);
    setResults({ importantSaved, totalImportantInRound, fillerSaved, passed });
    phaseTimerRef.current = setTimeout(() => {
      onComplete(passed);
    }, 3000);
  }, [phase]);

  const renderMemorySlots = () => {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px',
        marginTop: '16px'
      }}>
        {memorySlots.map((slot, index) => {
          const canClick = phase === 'incoming' && currentChunk && waitingForPlayer;
          const isEmpty = !slot;
          return (
            <div
              key={index}
              onClick={() => handleSlotClick(index)}
              style={{
                minHeight: '64px',
                border: slot
                  ? `2px solid ${slot.important ? 'rgba(139,92,246,0.6)' : 'rgba(148,163,184,0.4)'}`
                  : '2px dashed rgba(255,255,255,0.15)',
                borderRadius: '10px',
                padding: '8px',
                background: slot
                  ? (slot.important
                    ? 'linear-gradient(135deg, rgba(102,126,234,0.3) 0%, rgba(118,75,162,0.3) 100%)'
                    : 'rgba(148,163,184,0.15)')
                  : 'rgba(255,255,255,0.03)',
                color: 'white',
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                cursor: canClick ? 'pointer' : 'default',
                transition: 'all 0.2s',
                position: 'relative',
                opacity: slot ? 1 : 0.5,
                transform: (canClick && isEmpty) ? 'scale(1.02)' : 'scale(1)',
                boxShadow: (canClick && isEmpty)
                  ? '0 0 12px rgba(102, 126, 234, 0.4)'
                  : (canClick && !isEmpty)
                    ? '0 0 8px rgba(239, 68, 68, 0.3)'
                    : 'none'
              }}
            >
              {slot ? (
                <>
                  <div style={{ lineHeight: '1.3' }}>{slot.text}</div>
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    right: '4px',
                    fontSize: '0.55rem',
                    fontWeight: 'bold',
                    opacity: 0.7,
                    color: slot.important ? '#c4b5fd' : '#94a3b8'
                  }}>
                    P{slot.priority}
                  </div>
                  {canClick && (
                    <div style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '4px',
                      fontSize: '0.5rem',
                      color: '#f87171',
                      fontWeight: 'bold'
                    }}>
                      ⚠️ overwrite
                    </div>
                  )}
                </>
              ) : (
                <div style={{ opacity: 0.3, color: '#94a3b8' }}>Empty</div>
              )}
            </div>
          );
        })}
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
            title: 'LLM Context Window!',
            description: 'LLMs can only "remember" a limited amount of text at once — this is called the context window. You decide what stays!',
          },
          {
            emoji: '💾',
            title: 'Save, Discard, or Overwrite',
            description: 'Only 6 memory slots! Save important chunks, discard filler. You can overwrite old slots, but that data is lost forever!',
            demo: (
              <div style={{ maxWidth: '240px', margin: '0 auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
                  {[{s:true,l:'⭐ Key'},{s:true,l:'⭐ Key'},{s:false,l:'filler'},{s:false,l:'empty'},{s:true,l:'⭐ Key'},{s:false,l:'empty'}].map((slot, i) => (
                    <div key={i} style={{ height: '36px', borderRadius: '8px', background: slot.s ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)', border: `1px solid ${slot.s ? '#8b5cf6' : 'rgba(255,255,255,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', color: slot.s ? '#c4b5fd' : '#475569' }}>
                      {slot.l}
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Tap a slot to save the current chunk</div>
              </div>
            ),
          },
          {
            emoji: '✅',
            title: 'Save the Important Stuff!',
            description: 'After all chunks arrive, we\'ll check how many important ones you kept. Save at least half to pass!',
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
      {/* Header */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        color: 'white',
        padding: 'clamp(10px, 2vw, 14px)',
        borderRadius: '12px',
        marginBottom: 'clamp(10px, 2vw, 12px)',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: 'clamp(0.95rem, 3vw, 1.2rem)' }}>
          🧠 Context Window — {scenarioName}
        </h3>
        <p style={{ margin: 0, fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#94a3b8' }}>
          Keep the important stuff. You only have {NUM_SLOTS} slots!
        </p>
      </div>

      {/* Progress bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'clamp(10px, 2vw, 12px)',
        fontSize: 'clamp(0.8rem, 2vw, 0.95rem)',
        fontWeight: 'bold',
        color: 'white'
      }}>
        <div>⭐ Important saved: <span style={{ color: '#c4b5fd' }}>{memorySlots.filter(s => s?.important).length}</span></div>
        <div style={{ color: '#94a3b8' }}>
          {chunksProcessed}/{incomingChunks.length} chunks
        </div>
      </div>

      {/* Quick feedback overlay */}
      {feedback?.quick && phase === 'incoming' && (
        <div style={{
          background: feedback.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
          border: `1px solid ${feedback.success ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: '10px',
          textAlign: 'center',
          fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
          fontWeight: 'bold',
          color: feedback.success ? '#6ee7b7' : '#fca5a5',
          animation: 'pulse 0.5s'
        }}>
          {feedback.message}
        </div>
      )}

      {/* Incoming chunk */}
      {phase === 'incoming' && currentChunk && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.15)',
          border: '2px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 'clamp(10px, 2vw, 12px)',
          padding: 'clamp(12px, 3vw, 16px)',
          marginBottom: 'clamp(10px, 2vw, 12px)',
          textAlign: 'center',
          position: 'relative'
        }}>
          <div style={{
            fontSize: 'clamp(0.65rem, 1.8vw, 0.78rem)',
            color: '#94a3b8',
            marginBottom: '4px'
          }}>
            Incoming Chunk
          </div>
          <div style={{
            fontSize: 'clamp(0.9rem, 2.8vw, 1.1rem)',
            fontWeight: 'bold',
            marginBottom: 'clamp(4px, 1vw, 6px)',
            color: 'white',
            lineHeight: '1.4'
          }}>
            "{currentChunk.text}"
          </div>
          <div style={{
            fontSize: 'clamp(0.65rem, 1.8vw, 0.78rem)',
            marginBottom: 'clamp(8px, 2vw, 10px)',
            color: '#94a3b8'
          }}>
            Priority: <span style={{
              fontWeight: 'bold',
              color: currentChunk.priority >= 7 ? '#f87171' : currentChunk.priority >= 4 ? '#fbbf24' : '#94a3b8'
            }}>
              {currentChunk.priority}/10
            </span>
            {currentChunk.important && <span style={{ marginLeft: '8px', color: '#f87171' }}>⭐ Important</span>}
          </div>
          <div style={{ display: 'flex', gap: 'clamp(6px, 1.5vw, 8px)', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleDiscard}
              disabled={!waitingForPlayer}
              style={{
                padding: 'clamp(8px, 2vw, 10px) clamp(14px, 3.5vw, 18px)',
                background: waitingForPlayer
                  ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                  : 'rgba(148, 163, 184, 0.3)',
                color: 'white',
                border: 'none',
                borderRadius: 'clamp(6px, 1.5vw, 8px)',
                cursor: waitingForPlayer ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: 'clamp(0.78rem, 2vw, 0.9rem)',
                minHeight: '44px',
                opacity: waitingForPlayer ? 1 : 0.5
              }}
            >
              🗑️ Discard
            </button>
            <div style={{
              fontSize: 'clamp(0.7rem, 1.8vw, 0.82rem)',
              fontWeight: '600',
              color: '#94a3b8'
            }}>
              or tap a slot below ↓
            </div>
          </div>
        </div>
      )}

      {/* Results phase */}
      {phase === 'results' && results && (
        <div style={{
          background: results.passed
            ? 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(5,150,105,0.25) 100%)'
            : 'linear-gradient(135deg, rgba(239,68,68,0.25) 0%, rgba(220,38,38,0.25) 100%)',
          color: 'white',
          border: `2px solid ${results.passed ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`,
          borderRadius: 'clamp(10px, 2vw, 12px)',
          padding: 'clamp(16px, 4vw, 24px)',
          marginBottom: 'clamp(10px, 2vw, 12px)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', marginBottom: '8px' }}>
            {results.passed ? '✅' : '❌'}
          </div>
          <div style={{ fontSize: 'clamp(1rem, 3vw, 1.3rem)', fontWeight: 'bold', marginBottom: '12px' }}>
            {results.passed ? 'Great memory management!' : 'Too many important chunks lost!'}
          </div>
          <div style={{ fontSize: 'clamp(0.85rem, 2.2vw, 1rem)', color: '#94a3b8', lineHeight: 1.6 }}>
            ⭐ Important saved: <strong style={{ color: '#c4b5fd' }}>{results.importantSaved}/{results.totalImportantInRound}</strong>
            {results.fillerSaved > 0 && (
              <span style={{ marginLeft: '12px', color: '#f59e0b' }}>⚠️ {results.fillerSaved} filler stored</span>
            )}
          </div>
        </div>
      )}

      {/* Memory slots */}
      <div>
        <div style={{
          fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
          fontWeight: 'bold',
          marginBottom: '6px',
          color: '#94a3b8',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>Memory Buffer ({NUM_SLOTS} slots)</span>
          <span style={{ color: '#64748b' }}>
            {memorySlots.filter(Boolean).length}/{NUM_SLOTS} used
          </span>
        </div>
        {renderMemorySlots()}
      </div>

      {/* Tips */}
      {phase === 'incoming' && (
        <div style={{
          marginTop: 'clamp(10px, 2vw, 14px)',
          padding: 'clamp(8px, 2vw, 10px)',
          background: 'rgba(59, 130, 246, 0.08)',
          borderRadius: '10px',
          fontSize: 'clamp(0.65rem, 1.8vw, 0.75rem)',
          color: '#94a3b8',
          border: '1px solid rgba(59, 130, 246, 0.15)'
        }}>
          <div>💡 <strong style={{ color: 'white' }}>Tips:</strong> Overwrite low-priority slots with important data. Discard filler!</div>
          <div style={{ marginTop: '3px' }}>🎯 <strong style={{ color: 'white' }}>Pass:</strong> Save at least half the important chunks to pass.</div>
        </div>
      )}
    </div>
  );
};

export default ContextCacheChallenge;
