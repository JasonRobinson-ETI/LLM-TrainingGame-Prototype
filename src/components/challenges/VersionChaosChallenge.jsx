import React, { useState, useEffect, useRef } from 'react';

const VersionChaosChallenge = ({ challenge, onComplete }) => {
  const [phase, setPhase] = useState('intro');
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const roundTimeoutRef = useRef(null);

  const totalRounds = 5;

  // Version scenarios with different model issues
  const scenarios = [
    {
      context: "Your chatbot needs to answer customer questions about returns",
      versions: [
        { 
          id: 'v1.2.3', 
          accuracy: '94%', 
          latency: '120ms', 
          status: 'stable',
          issues: 'None reported'
        },
        { 
          id: 'v1.2.4', 
          accuracy: '67%', 
          latency: '95ms', 
          status: 'poor',
          issues: 'Regression in accuracy'
        },
        { 
          id: 'v1.3.0', 
          accuracy: '12%', 
          latency: '2400ms', 
          status: 'corrupted',
          issues: 'Critical errors, crashes'
        },
        { 
          id: 'v1.2.2', 
          accuracy: '88%', 
          latency: '180ms', 
          status: 'outdated',
          issues: 'Legacy dependencies'
        }
      ],
      correctIndex: 0
    },
    {
      context: "Your sentiment analyzer needs to process product reviews",
      versions: [
        { 
          id: 'v2.0.1', 
          accuracy: '41%', 
          latency: '3100ms', 
          status: 'corrupted',
          issues: 'Memory leaks detected'
        },
        { 
          id: 'v2.0.0', 
          accuracy: '89%', 
          latency: '150ms', 
          status: 'stable',
          issues: 'None reported'
        },
        { 
          id: 'v1.9.8', 
          accuracy: '72%', 
          latency: '180ms', 
          status: 'poor',
          issues: 'Inconsistent predictions'
        },
        { 
          id: 'v1.9.9', 
          accuracy: '85%', 
          latency: '220ms', 
          status: 'outdated',
          issues: 'Security vulnerabilities'
        }
      ],
      correctIndex: 1
    },
    {
      context: "Your code completion model needs to suggest Python functions",
      versions: [
        { 
          id: 'v3.1.2', 
          accuracy: '58%', 
          latency: '250ms', 
          status: 'poor',
          issues: 'Outdated suggestions'
        },
        { 
          id: 'v3.2.0', 
          accuracy: '92%', 
          latency: '140ms', 
          status: 'stable',
          issues: 'None reported'
        },
        { 
          id: 'v3.2.1', 
          accuracy: '23%', 
          latency: '4200ms', 
          status: 'corrupted',
          issues: 'Syntax errors in output'
        },
        { 
          id: 'v3.0.5', 
          accuracy: '79%', 
          latency: '310ms', 
          status: 'outdated',
          issues: 'Missing new features'
        }
      ],
      correctIndex: 1
    },
    {
      context: "Your translation model needs to convert English to Spanish",
      versions: [
        { 
          id: 'v1.5.0', 
          accuracy: '19%', 
          latency: '5100ms', 
          status: 'corrupted',
          issues: 'Produces gibberish'
        },
        { 
          id: 'v1.4.9', 
          accuracy: '64%', 
          latency: '320ms', 
          status: 'poor',
          issues: 'Misses context'
        },
        { 
          id: 'v1.4.8', 
          accuracy: '91%', 
          latency: '180ms', 
          status: 'stable',
          issues: 'None reported'
        },
        { 
          id: 'v1.3.7', 
          accuracy: '82%', 
          latency: '260ms', 
          status: 'outdated',
          issues: 'Deprecated API usage'
        }
      ],
      correctIndex: 2
    },
    {
      context: "Your image classifier needs to detect objects in photos",
      versions: [
        { 
          id: 'v4.0.2', 
          accuracy: '96%', 
          latency: '95ms', 
          status: 'stable',
          issues: 'None reported'
        },
        { 
          id: 'v4.1.0', 
          accuracy: '8%', 
          latency: '6700ms', 
          status: 'corrupted',
          issues: 'Model weights corrupted'
        },
        { 
          id: 'v4.0.1', 
          accuracy: '71%', 
          latency: '110ms', 
          status: 'poor',
          issues: 'False positives'
        },
        { 
          id: 'v3.9.4', 
          accuracy: '87%', 
          latency: '140ms', 
          status: 'outdated',
          issues: 'Compatibility issues'
        }
      ],
      correctIndex: 0
    }
  ];

  const currentScenario = scenarios[currentRound];

  // Timer countdown
  useEffect(() => {
    if (phase !== 'active' || feedback) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up - auto-fail with explicit -1 to indicate timeout
          handleVersionSelect(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, feedback, currentRound]);

  // Cleanup round timeout on unmount
  useEffect(() => {
    return () => {
      if (roundTimeoutRef.current) clearTimeout(roundTimeoutRef.current);
    };
  }, []);

  // Reset timer for each round
  useEffect(() => {
    if (phase === 'active' && !feedback) {
      setTimeLeft(10);
    }
  }, [currentRound, phase, feedback]);

  const handleVersionSelect = (index) => {
    if (feedback || phase !== 'active') return;

    setSelectedVersion(index);
    const isCorrect = index === currentScenario.correctIndex;
    
    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) {
      setScore(score + 1);
    }

    roundTimeoutRef.current = setTimeout(() => {
      if (currentRound + 1 >= totalRounds) {
        const finalScore = score + (isCorrect ? 1 : 0);
        const success = finalScore >= 3; // Need 3/5 correct
        onComplete(success);
      } else {
        setCurrentRound(currentRound + 1);
        setSelectedVersion(null);
        setFeedback(null);
      }
    }, 2000);
  };

  const getVersionStatusIcon = (status) => {
    // Return neutral icon for all versions to avoid giving away answers
    return '📊';
  };  const getTimerColor = () => {
    if (timeLeft > 6) return '#10b981';
    if (timeLeft > 3) return '#f59e0b';
    return '#ef4444';
  };

  if (phase === 'intro') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 3vw, 20px)'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          borderRadius: 'clamp(12px, 3vw, 20px)',
          padding: 'clamp(20px, 4vw, 40px)',
          maxWidth: '600px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(20px, 4vw, 30px)' }}>
            <div style={{ fontSize: 'clamp(2.5rem, 10vw, 4rem)', marginBottom: 'clamp(12px, 3vw, 20px)' }}>
              🔄
            </div>
            <h2 style={{ 
              fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', 
              margin: '0 0 clamp(10px, 2vw, 15px) 0',
              color: 'white',
              fontWeight: 'bold'
            }}>
              Version Chaos
            </h2>
            <p style={{ 
              fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', 
              color: '#94a3b8',
              lineHeight: '1.5',
              margin: '0'
            }}>
              Model Version Control & Rollback
            </p>
          </div>

          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 'clamp(10px, 2.5vw, 15px)',
            padding: 'clamp(15px, 3vw, 20px)',
            marginBottom: 'clamp(15px, 3vw, 25px)',
            border: '2px solid rgba(139, 92, 246, 0.3)'
          }}>
            <h3 style={{ 
              fontSize: 'clamp(1rem, 3vw, 1.2rem)', 
              margin: '0 0 clamp(10px, 2vw, 15px) 0',
              color: '#a78bfa'
            }}>
              🎯 Your Mission:
            </h3>
            <ul style={{ 
              margin: '0',
              paddingLeft: 'clamp(18px, 3vw, 20px)',
              fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
              color: '#cbd5e1',
              lineHeight: '1.6'
            }}>
              <li style={{ marginBottom: '6px' }}>Review 4 model versions per scenario</li>
              <li style={{ marginBottom: '6px' }}>Analyze accuracy, latency, and issues</li>
              <li style={{ marginBottom: '6px' }}>Deploy the <strong style={{ color: 'white' }}>stable version</strong></li>
              <li style={{ marginBottom: '6px' }}>You have <strong style={{ color: 'white' }}>10 seconds</strong> per decision</li>
              <li>Complete 5 deployment scenarios</li>
            </ul>
          </div>

          <div style={{
            background: 'rgba(251, 191, 36, 0.1)',
            borderRadius: 'clamp(10px, 2.5vw, 12px)',
            padding: 'clamp(12px, 2.5vw, 16px)',
            marginBottom: 'clamp(15px, 3vw, 20px)',
            border: '2px solid rgba(251, 191, 36, 0.3)'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-start',
              gap: 'clamp(8px, 2vw, 10px)'
            }}>
              <span style={{ fontSize: 'clamp(1.2rem, 4vw, 1.5rem)', flexShrink: 0 }}>💡</span>
              <div>
                <strong style={{ color: '#fbbf24', fontSize: 'clamp(0.9rem, 2.5vw, 1rem)' }}>
                  Pro Tip:
                </strong>
                <p style={{ 
                  margin: '4px 0 0 0',
                  color: '#cbd5e1',
                  fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)',
                  lineHeight: '1.5'
                }}>
                  Stable versions have high accuracy, low latency, and no issues!
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setPhase('active')}
            style={{
              width: '100%',
              padding: 'clamp(14px, 3vw, 18px)',
              fontSize: 'clamp(1rem, 3.5vw, 1.2rem)',
              fontWeight: 'bold',
              color: 'white',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              border: 'none',
              borderRadius: 'clamp(10px, 2.5vw, 12px)',
              cursor: 'pointer',
              transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)',
              minHeight: '48px'
            }}
            onMouseEnter={e => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.6)';
            }}
            onMouseLeave={e => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.4)';
            }}
          >
            Start Deployment 🚀
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: 'clamp(10px, 2vw, 20px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Compact Header */}
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(10px, 2vw, 15px)',
        marginBottom: 'clamp(10px, 2vw, 15px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'clamp(8px, 2vw, 12px)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2vw, 15px)', flexWrap: 'wrap' }}>
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(1rem, 3.5vw, 1.4rem)',
            color: 'white',
            fontWeight: 'bold'
          }}>
            🔄 Version Chaos
          </h2>
          <div style={{
            display: 'flex',
            gap: 'clamp(10px, 2vw, 15px)',
            fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)',
            color: '#94a3b8'
          }}>
            <span>Round: <strong style={{ color: 'white' }}>{currentRound + 1}/5</strong></span>
            <span>Score: <strong style={{ color: 'white' }}>{score}</strong></span>
          </div>
        </div>
        
        <div style={{
          background: timeLeft <= 3 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(139, 92, 246, 0.2)',
          padding: 'clamp(6px, 1.5vw, 10px) clamp(12px, 2.5vw, 20px)',
          borderRadius: 'clamp(6px, 1.5vw, 10px)',
          border: `2px solid ${getTimerColor()}`,
          animation: timeLeft <= 3 ? 'pulse 1s infinite' : 'none'
        }}>
          <div style={{
            fontSize: 'clamp(1.2rem, 4vw, 1.8rem)',
            fontWeight: 'bold',
            color: getTimerColor(),
            fontFamily: 'monospace'
          }}>
            ⏱️ {timeLeft}s
          </div>
        </div>
      </div>

      {/* Compact Scenario Context */}
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(10px, 2vw, 15px)',
        marginBottom: 'clamp(10px, 2vw, 15px)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{
          fontSize: 'clamp(0.8rem, 2.5vw, 0.95rem)',
          color: '#a78bfa',
          fontWeight: 'bold',
          marginBottom: 'clamp(4px, 1vw, 6px)'
        }}>
          📋 Scenario:
        </div>
        <div style={{
          fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
          color: 'white',
          lineHeight: '1.4'
        }}>
          {currentScenario.context}
        </div>
      </div>

      {/* Version Cards - 2x2 Grid */}
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
        gap: 'clamp(8px, 2vw, 15px)',
        marginBottom: 'clamp(10px, 2vw, 15px)'
      }}>
        {currentScenario.versions.map((version, index) => (
          <div
            key={index}
            onClick={() => handleVersionSelect(index)}
            style={{
              background: selectedVersion === index 
                ? 'rgba(167, 139, 250, 0.3)' 
                : 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: 'clamp(8px, 2vw, 12px)',
              padding: 'clamp(10px, 2.5vw, 15px)',
              cursor: feedback ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              border: selectedVersion === index 
                ? '2px solid #a78bfa' 
                : '1px solid rgba(255, 255, 255, 0.2)',
              transform: selectedVersion === index ? 'scale(1.02)' : 'scale(1)',
              opacity: feedback && selectedVersion !== index ? 0.5 : 1,
              animation: feedback && index === currentScenario.correctIndex ? 'glow 1s ease-in-out' : 'none',
              minHeight: 'fit-content'
            }}
            onMouseEnter={e => !feedback && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => !feedback && selectedVersion !== index && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {/* Version Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'clamp(8px, 2vw, 10px)',
              paddingBottom: 'clamp(6px, 1.5vw, 8px)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: 'clamp(1rem, 3vw, 1.2rem)',
                color: 'white',
                fontFamily: 'monospace',
                fontWeight: 'bold'
              }}>
                {version.id}
              </h3>
              <span style={{ fontSize: 'clamp(1.2rem, 3vw, 1.5rem)' }}>
                {getVersionStatusIcon(version.status)}
              </span>
            </div>

            {/* Metrics - Horizontal Layout */}
            <div style={{
              display: 'flex',
              gap: 'clamp(6px, 1.5vw, 10px)',
              marginBottom: 'clamp(8px, 2vw, 10px)'
            }}>
              <div style={{
                flex: 1,
                padding: 'clamp(6px, 1.5vw, 8px)',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 'clamp(4px, 1vw, 6px)',
                textAlign: 'center'
              }}>
                <div style={{ 
                  color: '#94a3b8', 
                  fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
                  marginBottom: 'clamp(2px, 0.5vw, 4px)'
                }}>
                  Accuracy
                </div>
                <div style={{ 
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)'
                }}>
                  {version.accuracy}
                </div>
              </div>
              
              <div style={{
                flex: 1,
                padding: 'clamp(6px, 1.5vw, 8px)',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 'clamp(4px, 1vw, 6px)',
                textAlign: 'center'
              }}>
                <div style={{ 
                  color: '#94a3b8', 
                  fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
                  marginBottom: 'clamp(2px, 0.5vw, 4px)'
                }}>
                  Latency
                </div>
                <div style={{ 
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: 'clamp(0.85rem, 2.5vw, 0.95rem)'
                }}>
                  {version.latency}
                </div>
              </div>
            </div>

            {/* Issues */}
            <div style={{
              padding: 'clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 10px)',
              background: 'rgba(139, 92, 246, 0.1)',
              borderRadius: 'clamp(4px, 1vw, 6px)',
              border: '1px solid rgba(139, 92, 246, 0.3)'
            }}>
              <div style={{
                fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
                color: '#94a3b8',
                marginBottom: 'clamp(2px, 0.5vw, 3px)'
              }}>
                Issues:
              </div>
              <div style={{
                fontSize: 'clamp(0.8rem, 2.2vw, 0.9rem)',
                color: 'white',
                fontWeight: '600',
                wordBreak: 'break-word'
              }}>
                {version.issues}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          width: '100%',
          maxWidth: '1000px',
          padding: 'clamp(15px, 3vw, 20px)',
          borderRadius: 'clamp(10px, 2.5vw, 15px)',
          background: feedback === 'correct' 
            ? 'rgba(16, 185, 129, 0.2)' 
            : 'rgba(239, 68, 68, 0.2)',
          border: `2px solid ${feedback === 'correct' ? '#10b981' : '#ef4444'}`,
          textAlign: 'center',
          animation: 'fadeIn 0.5s ease-in-out'
        }}>
          <div style={{
            fontSize: 'clamp(2rem, 8vw, 3rem)',
            marginBottom: 'clamp(8px, 2vw, 10px)'
          }}>
            {feedback === 'correct' ? '✅' : '❌'}
          </div>
          <div style={{
            fontSize: 'clamp(1rem, 3.5vw, 1.3rem)',
            color: 'white',
            fontWeight: 'bold',
            lineHeight: '1.4'
          }}>
            {feedback === 'correct' 
              ? '🎉 Perfect! Stable version deployed!' 
              : `⚠️ Wrong! The stable version was ${currentScenario.versions[currentScenario.correctIndex].id}`}
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px #10b981; }
          50% { box-shadow: 0 0 40px #10b981, 0 0 60px #10b981; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
};

export default VersionChaosChallenge;
