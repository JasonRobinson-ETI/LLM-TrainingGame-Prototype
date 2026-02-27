import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

const BiasBreakerChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // intro, playing, complete
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [shuffledMessages, setShuffledMessages] = useState([]);
  const timeoutsRef = useRef([]);

  // Message pool with bias flags
  const messagePool = [
    // Biased messages (should be flagged)
    { text: "Girls don't like playing sports.", biased: true },
    { text: "Boys shouldn't cry when they're sad.", biased: true },
    { text: "Smart kids are always nerdy and boring.", biased: true },
    { text: "Poor kids can't grow up to be successful.", biased: true },
    { text: "Only popular kids get to have fun.", biased: true },
    { text: "You can't be friends with people who are different.", biased: true },
    { text: "Everyone should like the same music and games.", biased: true },
    { text: "New kids in class are weird and don't belong.", biased: true },
    { text: "Teachers are always right, no matter what.", biased: true },
    { text: "Rules are more important than people's feelings.", biased: true },
    { text: "Kids who wear glasses are not cool.", biased: true },
    { text: "Only skinny people can be good at running.", biased: true },
    { text: "Kids who read books are too serious.", biased: true },
    { text: "People who talk differently are strange.", biased: true },
    { text: "Only kids with expensive clothes matter.", biased: true },
    { text: "Girls should only play with dolls.", biased: true },
    { text: "Boys should only play with trucks.", biased: true },
    { text: "Quiet kids don't have anything important to say.", biased: true },
    { text: "Loud kids are always troublemakers.", biased: true },
    { text: "Kids who ask questions are annoying.", biased: true },
    { text: "Only perfect grades make you worthwhile.", biased: true },
    { text: "Kids who make mistakes are failures.", biased: true },
    { text: "You should only like what everyone else likes.", biased: true },
    { text: "Different is always bad.", biased: true },
    { text: "Change is scary and should be avoided.", biased: true },
    
    // Neutral messages (should NOT be flagged)
    { text: "I like playing soccer after school.", biased: false },
    { text: "The sun comes up in the morning.", biased: false },
    { text: "My favorite subject is art class.", biased: false },
    { text: "I need to do my homework tonight.", biased: false },
    { text: "School starts at 8:30 AM.", biased: false },
    { text: "Can you help me with this math problem?", biased: false },
    { text: "I'm learning about dinosaurs.", biased: false },
    { text: "The sky is blue on sunny days.", biased: false },
    { text: "I prefer apples over bananas.", biased: false },
    { text: "My birthday is in March.", biased: false },
    { text: "Blue is my favorite color.", biased: false },
    { text: "I like reading adventure books.", biased: false },
    { text: "The computer game got a new level.", biased: false },
    { text: "I walked home from school today.", biased: false },
    { text: "The pizza place has good food.", biased: false },
  ];

  useEffect(() => {
    if (phase === 'playing') {
      // Shuffle messages at start of game
      const shuffled = [...messagePool].sort(() => Math.random() - 0.5).slice(0, 10);
      setShuffledMessages(shuffled);
    }
  }, [phase]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const handleResponse = (flagAsBiased) => {
    const currentMessage = shuffledMessages[currentIndex];
    const isCorrect = (flagAsBiased && currentMessage.biased) || (!flagAsBiased && !currentMessage.biased);
    
    if (isCorrect) {
      setCorrectCount(p => p + 1);
      showFeedback('✓ Correct!', 'success');
    } else {
      showFeedback('✗ Incorrect', 'error');
    }
    
    setTotalCount(p => p + 1);
    
    // Move to next message or end game
    const tid = setTimeout(() => {
      setFeedback(null);
      if (currentIndex + 1 >= shuffledMessages.length) {
        endGame();
      } else {
        setCurrentIndex(p => p + 1);
      }
    }, 1000);
    timeoutsRef.current.push(tid);
  };

  const showFeedback = (message, type) => {
    setFeedback({ message, type });
    const tid = setTimeout(() => setFeedback(null), 800);
    timeoutsRef.current.push(tid);
  };

  const endGame = () => {
    setPhase('complete');
  };

  const startGame = () => {
    setPhase('playing');
    setCurrentIndex(0);
    setCorrectCount(0);
    setTotalCount(0);
  };

  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={startGame}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '🛡️',
            title: 'Stop biased AI responses going live!',
            description: 'You are the final filter. Real AI systems need humans to catch bias before it spreads to millions.',
          },
          {
            emoji: '📋',
            title: 'Is it biased? FLAG it!',
            description: 'A statement appears. Tap FLAG for biased or unfair content. Tap LET PASS for neutral facts.',
            demo: (
              <div style={{ textAlign: 'center', maxWidth: '290px', margin: '0 auto' }}>
                <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: '10px', padding: '10px 14px', marginBottom: '14px', color: '#cbd5e1', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  &ldquo;Women are naturally less logical.&rdquo;
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <div style={{ background: 'rgba(239,68,68,0.3)', border: '2px solid #ef4444', borderRadius: '10px', padding: '10px 20px', color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>
                    🚫 FLAG
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', padding: '10px 16px', color: '#64748b', fontSize: '0.95rem' }}>
                    ✅ Let Pass
                  </div>
                </div>
              </div>
            ),
          },
          {
            emoji: '✅',
            title: 'Get the majority correct to win!',
            description: 'Statements fly by fast. Trust your instincts \u2014 biased stereotyping = FLAG, neutral facts = LET PASS.',
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
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @media (max-width: 600px) {
            .bias-btn {
              padding: 14px 20px !important;
              font-size: 0.85rem !important;
              min-height: 48px;
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
          padding: 'clamp(10px, 2vw, 12px) clamp(12px, 3vw, 20px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontWeight: 'bold',
          fontSize: 'clamp(0.8rem, 2.5vw, 1rem)',
          zIndex: 10,
          borderBottom: '2px solid rgba(139, 92, 246, 0.3)',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          <div style={{ whiteSpace: 'nowrap' }}>📊 {currentIndex + 1}/{shuffledMessages.length}</div>
          <div style={{ whiteSpace: 'nowrap' }}>🛡️ Bias Breaker</div>
          <div style={{ whiteSpace: 'nowrap' }}>✓ {correctCount}</div>
        </div>

        {/* Current Statement */}
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'clamp(280px, 90%, 600px)',
          background: 'rgba(255, 255, 255, 0.95)',
          border: 'clamp(2px, 0.5vw, 3px) solid rgba(139, 92, 246, 0.5)',
          borderRadius: 'clamp(10px, 2vw, 12px)',
          padding: 'clamp(20px, 5vw, 32px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          textAlign: 'center',
          animation: 'fadeIn 0.4s ease-out'
        }}>
          <div style={{
            fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
            color: '#8b5cf6',
            marginBottom: 'clamp(12px, 3vw, 16px)',
            fontWeight: '600'
          }}>
            Statement {currentIndex + 1} of {shuffledMessages.length}
          </div>
          
          <div style={{
            fontSize: 'clamp(1rem, 3vw, 1.3rem)',
            color: '#1d1d1f',
            marginBottom: 'clamp(20px, 5vw, 32px)',
            lineHeight: '1.6',
            minHeight: 'clamp(60px, 15vw, 80px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '500'
          }}>
            "{shuffledMessages[currentIndex]?.text}"
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: 'clamp(8px, 2vw, 16px)', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => handleResponse(true)}
              disabled={!!feedback}
              className="bias-btn"
              style={{
                background: feedback ? '#ccc' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                border: 'none',
                padding: 'clamp(12px, 3vw, 16px) clamp(24px, 6vw, 40px)',
                borderRadius: 'clamp(8px, 2vw, 10px)',
                cursor: feedback ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
                boxShadow: feedback ? 'none' : '0 4px 16px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.2s',
                flex: '1 1 auto',
                minWidth: '120px',
                maxWidth: '200px'
              }}
              onMouseEnter={(e) => {
                if (!feedback) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = feedback ? 'none' : '0 4px 16px rgba(239, 68, 68, 0.4)';
              }}
            >
              <span style={{ display: 'block', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)' }}>🚫 FLAG</span>
              <span style={{ display: 'block', fontSize: 'clamp(0.65rem, 1.8vw, 0.75rem)', opacity: 0.9 }}>Biased</span>
            </button>
            <button
              onClick={() => handleResponse(false)}
              disabled={!!feedback}
              className="bias-btn"
              style={{
                background: feedback ? '#ccc' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                padding: 'clamp(12px, 3vw, 16px) clamp(24px, 6vw, 40px)',
                borderRadius: 'clamp(8px, 2vw, 10px)',
                cursor: feedback ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
                boxShadow: feedback ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.4)',
                transition: 'all 0.2s',
                flex: '1 1 auto',
                minWidth: '120px',
                maxWidth: '200px'
              }}
              onMouseEnter={(e) => {
                if (!feedback) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = feedback ? 'none' : '0 4px 16px rgba(16, 185, 129, 0.4)';
              }}
            >
              <span style={{ display: 'block', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)' }}>✅ PASS</span>
              <span style={{ display: 'block', fontSize: 'clamp(0.65rem, 1.8vw, 0.75rem)', opacity: 0.9 }}>Neutral</span>
            </button>
          </div>
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
            padding: 'clamp(12px, 3vw, 16px) clamp(20px, 5vw, 32px)',
            borderRadius: 'clamp(10px, 2vw, 12px)',
            fontSize: 'clamp(1rem, 3vw, 1.3rem)',
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
    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passed = correctCount > totalCount / 2; // Simple majority

    return (
      <div style={{ padding: '20px', textAlign: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', borderRadius: '12px', minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px',
          width: '100%',
          maxWidth: '500px'
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '2rem' }}>🔒 Challenge Complete!</h2>
          <p style={{ margin: 0, fontSize: '1rem' }}>Final Results</p>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '20px',
          fontSize: '1.1rem',
          lineHeight: '2',
          width: '100%',
          maxWidth: '500px',
          color: 'white'
        }}>
          <div><strong>Correct Answers:</strong> <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#a78bfa' }}>{correctCount}/{totalCount}</span></div>
          <div><strong>Accuracy:</strong> <span style={{ color: accuracy >= 50 ? '#10b981' : '#ef4444', fontSize: '1.3rem', fontWeight: 'bold' }}>{accuracy}%</span></div>
        </div>

        <div style={{
          background: passed ? '#10b981' : '#ef4444',
          color: 'white',
          padding: '16px',
          borderRadius: '12px',
          fontSize: '1.3rem',
          fontWeight: 'bold',
          marginBottom: '20px',
          width: '100%',
          maxWidth: '500px'
        }}>
          {passed ? '✅ PASSED - Majority Correct!' : '❌ FAILED - Need More Correct Answers'}
        </div>

        <button
          onClick={() => {
            onComplete(passed);
          }}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
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

export default BiasBreakerChallenge;
