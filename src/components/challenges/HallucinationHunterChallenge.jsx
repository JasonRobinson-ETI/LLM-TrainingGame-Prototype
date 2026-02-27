import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

const HallucinationHunterChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // intro, playing, complete
  const [currentStatements, setCurrentStatements] = useState([]);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hallucinationsCaught, setHallucinationsCaught] = useState(0);
  const [hallucinationsMissed, setHallucinationsMissed] = useState(0);
  const [falsePositives, setFalsePositives] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const gameTimerRef = useRef(null);
  const statementTimerRef = useRef(null);

  // Statement pool with truth flags
  const statementPool = [
    // False statements (hallucinations - should be tapped)
    { text: "The Eiffel Tower is located in Berlin.", isTrue: false },
    { text: "Penguins live in the Sahara Desert.", isTrue: false },
    { text: "The Great Wall of China is visible from space.", isTrue: false },
    { text: "Humans have 12 fingers on each hand.", isTrue: false },
    { text: "The sun rises in the west.", isTrue: false },
    { text: "Sharks are mammals.", isTrue: false },
    { text: "The moon is made of cheese.", isTrue: false },
    { text: "Water boils at room temperature.", isTrue: false },
    { text: "Dinosaurs and humans lived together.", isTrue: false },
    { text: "The Earth is flat.", isTrue: false },
    { text: "Lightning never strikes twice.", isTrue: false },
    { text: "Gold is a common metal.", isTrue: false },
    { text: "Plants breathe through their roots.", isTrue: false },
    { text: "The speed of light is 300 km/h.", isTrue: false },
    { text: "Rain falls upward sometimes.", isTrue: false },

    // True statements (should NOT be tapped)
    { text: "Water boils at 100°C at sea level.", isTrue: true },
    { text: "The Earth orbits around the Sun.", isTrue: true },
    { text: "Humans need oxygen to breathe.", isTrue: true },
    { text: "The sky appears blue during the day.", isTrue: true },
    { text: "Plants need sunlight to grow.", isTrue: true },
    { text: "The heart pumps blood through the body.", isTrue: true },
    { text: "Ice floats on water.", isTrue: true },
    { text: "The moon reflects sunlight.", isTrue: true },
    { text: "Gravity pulls objects toward Earth.", isTrue: true },
    { text: "The seasons change throughout the year.", isTrue: true },
    { text: "Sound travels through air.", isTrue: true },
    { text: "The ocean contains salt water.", isTrue: true },
    { text: "Trees produce oxygen.", isTrue: true },
    { text: "The human body has 206 bones.", isTrue: true },
    { text: "Electricity can power lights.", isTrue: true },
  ];

  const addRandomStatementRef = useRef(null);

  const addRandomStatement = () => {
    setCurrentStatements(prev => {
      if (prev.length >= 3) return prev; // Max 3 statements on screen

      const availableStatements = statementPool.filter(s =>
        !prev.some(cs => cs.text === s.text)
      );

      if (availableStatements.length > 0) {
        const randomStatement = availableStatements[Math.floor(Math.random() * availableStatements.length)];
        const newStatement = {
          ...randomStatement,
          id: Date.now() + Math.random(),
          spawnTime: Date.now(),
          lifetime: 4000, // 4 seconds before fade
        };

        return [...prev, newStatement];
      }
      return prev;
    });
  };

  // Keep ref in sync
  useEffect(() => {
    addRandomStatementRef.current = addRandomStatement;
  });

  // Auto-remove statements after lifetime and count missed hallucinations
  useEffect(() => {
    if (phase !== 'playing') return;

    const interval = setInterval(() => {
      const now = Date.now();
      setCurrentStatements(prev => {
        const expired = prev.filter(s => now - s.spawnTime >= s.lifetime);
        const remaining = prev.filter(s => now - s.spawnTime < s.lifetime);
        
        // Count missed hallucinations (false statements that expired)
        const missedHallucinations = expired.filter(s => !s.isTrue).length;
        if (missedHallucinations > 0) {
          setHallucinationsMissed(count => count + missedHallucinations);
        }
        
        return remaining;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [phase]);

  const handleStatementClick = (statement) => {
    if (phase !== 'playing') return;

    if (!statement.isTrue) {
      // Correctly identified hallucination
      setHallucinationsCaught(prev => prev + 1);
      showFeedback('✓ Caught hallucination!', 'success');
    } else {
      // Incorrectly tapped true statement (false positive)
      setFalsePositives(prev => prev + 1);
      showFeedback('✗ That was true!', 'error');
    }

    // Remove the statement
    setCurrentStatements(prev => prev.filter(s => s.id !== statement.id));
  };

  const feedbackTimeoutRef = useRef(null);

  const showFeedback = (message, type) => {
    setFeedback({ message, type });
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 600);
  };

  const startGame = () => {
    setPhase('playing');
    setTimeLeft(30);
    setHallucinationsCaught(0);
    setHallucinationsMissed(0);
    setFalsePositives(0);
    setCurrentStatements([]);

    // Start game timer
    gameTimerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Add statements periodically (use ref to avoid stale closure)
    statementTimerRef.current = setInterval(() => {
      if (addRandomStatementRef.current) addRandomStatementRef.current();
    }, 2000);
  };

  const endGame = () => {
    setPhase('complete');
    if (gameTimerRef.current) clearInterval(gameTimerRef.current);
    if (statementTimerRef.current) clearInterval(statementTimerRef.current);
  };

  useEffect(() => {
    return () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      if (statementTimerRef.current) clearInterval(statementTimerRef.current);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={startGame}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '🔍',
            title: 'The AI is making stuff up!',
            description: 'AI hallucinations are fake \u201cfacts\u201d that sound real but are completely wrong. Don\u2019t let them spread!',
          },
          {
            emoji: '👆',
            title: 'Tap statements that are FAKE',
            description: 'If a statement is false or nonsensical \u2014 tap it! If it\u2019s true \u2014 leave it alone.',
            demo: (
              <div style={{ maxWidth: '300px', margin: '0 auto' }}>
                {[
                  { text: '\u201cThe Eiffel Tower is in Berlin\u201d', fake: true },
                  { text: '\u201cWater boils at 100\u00b0C\u201d', fake: false },
                ].map((item, i) => (
                  <div key={i} style={{ background: item.fake ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.1)', border: `1px solid ${item.fake ? '#ef4444' : '#10b981'}`, borderRadius: '10px', padding: '8px 14px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', fontSize: '0.85rem' }}>
                    <span>{item.text}</span>
                    <span style={{ marginLeft: '10px', fontWeight: 'bold', color: item.fake ? '#ef4444' : '#10b981' }}>{item.fake ? '👆 TAP' : '\u2713 OK'}</span>
                  </div>
                ))}
              </div>
            ),
          },
          {
            emoji: '🏹',
            title: 'Catch as many hallucinations as you can!',
            description: '30 seconds of rapid fact-checking. Score higher than random chance and you win!',
          },
        ]}
      />
    );
  }

  if (phase === 'playing') {
    return (
      <div style={{ 
        position: 'relative', 
        height: 'clamp(500px, 90vh, 600px)', 
        overflow: 'hidden', 
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
        borderRadius: 'clamp(8px, 2vw, 12px)' 
      }}>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px) scale(0.9); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes fadeOut {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.8); }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-3px); }
            75% { transform: translateX(3px); }
          }
          @keyframes glow {
            0%, 100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.3); }
            50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.6); }
          }
          
          @media (max-width: 600px) {
            .statement-card {
              padding: 16px 20px !important;
              font-size: 0.95rem !important;
            }
          }
        `}</style>

        {/* Header */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: 'clamp(12px, 2.5vw, 16px) clamp(16px, 4vw, 24px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 'bold',
          fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)',
          zIndex: 10,
          borderBottom: '2px solid rgba(139, 92, 246, 0.3)',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            ⏰ <span style={{ color: timeLeft <= 5 ? '#ef4444' : '#10b981' }}>{timeLeft}s</span>
          </div>
          <div style={{ fontSize: 'clamp(0.9rem, 2.8vw, 1.2rem)', whiteSpace: 'nowrap' }}>🔍 Hunter</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            🎯 <span style={{ color: '#10b981' }}>{hallucinationsCaught}</span>
            {hallucinationsMissed > 0 && <span style={{ color: '#ef4444' }}>/{hallucinationsMissed}</span>}
          </div>
        </div>

        {/* Center area for statements */}
        <div style={{
          position: 'absolute',
          top: 'clamp(70px, 15vh, 80px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'clamp(280px, 92%, 700px)',
          height: 'calc(100% - clamp(130px, 25vh, 160px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(10px, 2.5vw, 16px)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 clamp(8px, 2vw, 12px)'
        }}>
          {currentStatements.map((statement) => {
            const now = Date.now();
            const age = now - statement.spawnTime;
            const remainingLife = statement.lifetime - age;
            const opacity = remainingLife < 1000 ? remainingLife / 1000 : 1;

            return (
              <div
                key={statement.id}
                onClick={() => handleStatementClick(statement)}
                className="statement-card"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  color: '#1d1d1f',
                  padding: 'clamp(16px, 4vw, 20px) clamp(20px, 5vw, 28px)',
                  borderRadius: 'clamp(10px, 2vw, 12px)',
                  cursor: 'pointer',
                  fontSize: 'clamp(0.95rem, 2.8vw, 1.1rem)',
                  fontWeight: '600',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  animation: age < 300 ? 'fadeIn 0.3s ease-out' : 'none',
                  opacity: opacity,
                  transition: 'all 0.2s ease',
                  width: '100%',
                  textAlign: 'center',
                  border: 'clamp(2px, 0.5vw, 3px) solid rgba(139, 92, 246, 0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  lineHeight: '1.5'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                  e.currentTarget.style.borderColor = '#8b5cf6';
                  e.currentTarget.style.boxShadow = '0 12px 32px rgba(139, 92, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
                }}
              >
                {/* Fading progress bar */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  height: 'clamp(3px, 0.8vw, 4px)',
                  width: `${(remainingLife / statement.lifetime) * 100}%`,
                  background: 'linear-gradient(90deg, #8b5cf6 0%, #ec4899 100%)',
                  transition: 'width 0.1s linear'
                }} />
                
                {statement.text}
              </div>
            );
          })}
        </div>

        {/* Instructions */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          padding: 'clamp(10px, 2vw, 12px)',
          textAlign: 'center',
          fontSize: 'clamp(0.7rem, 2vw, 0.95rem)',
          color: '#d1d5db',
          borderTop: '2px solid rgba(139, 92, 246, 0.3)',
          lineHeight: '1.4'
        }}>
          <strong style={{ color: '#8b5cf6' }}>TAP FALSE STATEMENTS</strong> to catch hallucinations
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: feedback.type === 'success' ? '#10b981' : '#ef4444',
            color: 'white',
            padding: 'clamp(16px, 4vw, 20px) clamp(28px, 7vw, 40px)',
            borderRadius: 'clamp(12px, 3vw, 16px)',
            fontSize: 'clamp(1.1rem, 4vw, 1.5rem)',
            fontWeight: 'bold',
            zIndex: 20,
            animation: 'shake 0.3s',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            maxWidth: '90%',
            textAlign: 'center'
          }}>
            {feedback.message}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'complete') {
    const totalHallucinations = hallucinationsCaught + hallucinationsMissed;
    const accuracy = totalHallucinations > 0 ? Math.round((hallucinationsCaught / totalHallucinations) * 100) : 0;
    const netScore = hallucinationsCaught - falsePositives;
    
    // Pass if caught majority of hallucinations AND didn't have too many false positives
    const passed = accuracy >= 60 && netScore > 0;

    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#ffffff',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '2rem' }}>🎯 Hunt Complete!</h2>
          <p style={{ margin: 0, fontSize: '1rem', opacity: 0.9 }}>Hallucination Report</p>
        </div>

        <div style={{
          background: '#1a1a2e',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '20px',
          fontSize: '1.1rem',
          lineHeight: '2',
          color: '#e0e0e0'
        }}>
          <div><strong>Hallucinations Caught:</strong> <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#10b981' }}>{hallucinationsCaught}</span></div>
          <div><strong>Hallucinations Missed:</strong> <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ef4444' }}>{hallucinationsMissed}</span></div>
          <div><strong>False Positives:</strong> <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#f59e0b' }}>{falsePositives}</span></div>
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '2px solid rgba(255,255,255,0.15)' }}>
            <strong>Accuracy:</strong> <span style={{ color: accuracy >= 60 ? '#10b981' : '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>{accuracy}%</span>
          </div>
        </div>

        <div style={{
          background: passed ? '#10b981' : '#ef4444',
          color: '#ffffff',
          padding: '16px',
          borderRadius: '12px',
          fontSize: '1.3rem',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}>
          {passed ? '✅ PASSED - Reliable Guardian!' : '❌ FAILED - More Training Needed'}
        </div>

        <button
          onClick={() => {
            onComplete(passed);
          }}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#ffffff',
            border: 'none',
            padding: '14px 28px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            borderRadius: '10px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
          }}
        >
          Continue →
        </button>
      </div>
    );
  }

  return null;
};

export default HallucinationHunterChallenge;