import React, { useState, useEffect, useRef } from 'react';

const BiasBreakerChallenge = ({ challenge, onComplete }) => {
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
      <div style={{ 
        padding: 'clamp(15px, 3vw, 30px)', 
        textAlign: 'center',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          color: 'white',
          padding: 'clamp(20px, 4vw, 40px)',
          borderRadius: '20px',
          marginBottom: 'clamp(20px, 4vw, 30px)',
          maxWidth: '600px',
          width: '100%',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
        }}>
          <h2 style={{ 
            margin: '0 0 clamp(12px, 2vw, 20px) 0', 
            fontSize: 'clamp(1.5rem, 5vw, 2.5rem)',
            fontWeight: '800'
          }}>🛡️ Bias Breaker</h2>
          <p style={{ 
            margin: 0, 
            fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', 
            color: '#94a3b8',
            lineHeight: '1.6'
          }}>
            You're the final safeguard before AI responses go live to millions!
          </p>
        </div>

        <div style={{
          background: 'rgba(139, 92, 246, 0.1)',
          padding: 'clamp(20px, 4vw, 30px)',
          borderRadius: '16px',
          marginBottom: 'clamp(20px, 4vw, 30px)',
          textAlign: 'left',
          fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
          lineHeight: '1.8',
          maxWidth: '600px',
          width: '100%',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          color: '#94a3b8'
        }}>
          <p><strong style={{ color: 'white' }}>🎯 Your Mission:</strong> Filter the AI's output feed</p>
          <p><strong style={{ color: 'white' }}>🚫 Flag:</strong> Biased, stereotyping, or unfair statements</p>
          <p><strong style={{ color: 'white' }}>✅ Let Pass:</strong> Neutral, factual, or harmless content</p>
          <p style={{ marginBottom: 0 }}><strong style={{ color: 'white' }}>✅ Win Condition:</strong> Get majority of answers correct</p>
        </div>

        <button
          onClick={startGame}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            padding: 'clamp(14px, 3vw, 18px) clamp(28px, 6vw, 40px)',
            fontSize: 'clamp(1rem, 3vw, 1.3rem)',
            fontWeight: 'bold',
            borderRadius: '12px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 25px rgba(139, 92, 246, 0.5)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(139, 92, 246, 0.4)';
          }}
        >
          🚀 Start Filtering
        </button>
      </div>
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
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#1d1d1f',
          padding: '20px',
          borderRadius: '12px',
          marginBottom: '20px'
        }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '2rem' }}>🔒 Challenge Complete!</h2>
          <p style={{ margin: 0, fontSize: '1rem' }}>Final Results</p>
        </div>

        <div style={{
          background: '#f7f7f7',
          padding: '24px',
          borderRadius: '12px',
          marginBottom: '20px',
          fontSize: '1.1rem',
          lineHeight: '2'
        }}>
          <div><strong>Correct Answers:</strong> <span style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#764ba2' }}>{correctCount}/{totalCount}</span></div>
          <div><strong>Accuracy:</strong> <span style={{ color: accuracy >= 50 ? '#10b981' : '#ef4444', fontSize: '1.3rem', fontWeight: 'bold' }}>{accuracy}%</span></div>
        </div>

        <div style={{
          background: passed ? '#10b981' : '#ef4444',
          color: '#1d1d1f',
          padding: '16px',
          borderRadius: '12px',
          fontSize: '1.3rem',
          fontWeight: 'bold',
          marginBottom: '20px'
        }}>
          {passed ? '✅ PASSED - Majority Correct!' : '❌ FAILED - Need More Correct Answers'}
        </div>

        <button
          onClick={() => {
            onComplete(passed);
          }}
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: '#1d1d1f',
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
