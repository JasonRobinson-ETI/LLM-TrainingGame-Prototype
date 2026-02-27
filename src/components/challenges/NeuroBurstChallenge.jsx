import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

const NeuroBurstChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // 'intro', 'active', 'complete'
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPrediction, setShowPrediction] = useState(false);
  const [neuronStates, setNeuronStates] = useState({
    hidden1: [true, true, false, true], // 4 neurons in first hidden layer
    hidden2: [true, false, true, false]  // 4 neurons in second hidden layer
  });
  const animationRef = useRef(null);

  // Generate examples data internally
  const [examples] = useState(() => {
    const shapes = ['circle', 'square', 'triangle', 'star', 'hexagon'];
    const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
    const totalRounds = challenge.rounds || 8;
    
    const generatedExamples = [];
    for (let i = 0; i < totalRounds; i++) {
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      // Network accuracy starts low and improves
      const networkAccuracy = 0.4 + (i * 0.06); // 40% to 82% accuracy progression
      const isCorrect = Math.random() < networkAccuracy;
      
      generatedExamples.push({
        shape,
        color,
        correctAnswer: shape,
        prediction: isCorrect ? shape : shapes[Math.floor(Math.random() * shapes.length)]
      });
    }
    return generatedExamples;
  });

  const totalRounds = challenge.rounds || 8;
  const currentExample = examples[currentRound];
  
  // Calculate current prediction based on active neurons
  const getCurrentPrediction = () => {
    const activeCount = [...neuronStates.hidden1, ...neuronStates.hidden2].filter(Boolean).length;
    // Simple logic: if we have the right number of neurons active, predict correctly
    const correctActiveCount = getCorrectActiveCount(currentExample.correctAnswer);
    
    if (Math.abs(activeCount - correctActiveCount) <= 1) {
      return currentExample.correctAnswer;
    }
    
    // Otherwise predict something else
    const shapes = ['circle', 'square', 'triangle', 'star', 'hexagon'];
    const wrongShapes = shapes.filter(s => s !== currentExample.correctAnswer);
    return wrongShapes[activeCount % wrongShapes.length];
  };
  
  const getCorrectActiveCount = (shape) => {
    // Each shape has an ideal number of active neurons
    const idealCounts = {
      circle: 4,
      square: 5,
      triangle: 3,
      star: 6,
      hexagon: 7
    };
    return idealCounts[shape] || 4;
  };

  useEffect(() => {
    if (phase !== 'active') return;
    
    // Reset neuron states for each new round with random starting configuration
    setNeuronStates({
      hidden1: Array(4).fill(0).map(() => Math.random() > 0.5),
      hidden2: Array(4).fill(0).map(() => Math.random() > 0.5)
    });
    setShowPrediction(true);
    setFeedback(null);
  }, [currentRound, phase]);
  
  const toggleNeuron = (layer, index) => {
    if (isAnimating || feedback) return;
    
    setNeuronStates(prev => ({
      ...prev,
      [layer]: prev[layer].map((state, i) => i === index ? !state : state)
    }));
  };
  
  const checkPrediction = () => {
    if (isAnimating) return;
    
    const currentPrediction = getCurrentPrediction();
    const isCorrect = currentPrediction === currentExample.correctAnswer;
    
    setIsAnimating(true);
    
    if (isCorrect) {
      setScore(score + 1);
      setFeedback('correct');
    } else {
      setFeedback('wrong');
    }
    
    // Calculate accuracy
    const newAccuracy = ((score + (isCorrect ? 1 : 0)) / (currentRound + 1)) * 100;
    setAccuracy(newAccuracy);
    
    // Move to next round or complete
    setTimeout(() => {
      setFeedback(null);
      setShowPrediction(false);
      setIsAnimating(false);
      
      if (currentRound + 1 >= totalRounds) {
        // Challenge complete - simple majority
        const finalAccuracy = ((score + (isCorrect ? 1 : 0)) / totalRounds) * 100;
        const success = finalAccuracy > 50;
        onComplete(success);
      } else {
        setCurrentRound(currentRound + 1);
      }
    }, 1500);
  };

  const getShapeColor = (shape) => {
    const colors = {
      circle: '#3b82f6',
      square: '#ef4444', 
      triangle: '#10b981',
      star: '#f59e0b',
      hexagon: '#8b5cf6'
    };
    return colors[shape] || '#6b7280';
  };

  const renderShape = (shape, color, size = 80) => {
    const shapeColor = color || getShapeColor(shape);
    
    const shapes = {
      circle: (
        <circle cx={size/2} cy={size/2} r={size/3} fill={shapeColor} />
      ),
      square: (
        <rect x={size/4} y={size/4} width={size/2} height={size/2} fill={shapeColor} />
      ),
      triangle: (
        <polygon points={`${size/2},${size/4} ${size*3/4},${size*3/4} ${size/4},${size*3/4}`} fill={shapeColor} />
      ),
      star: (
        <polygon 
          points={`${size/2},${size*0.15} ${size*0.59},${size*0.4} ${size*0.85},${size*0.4} ${size*0.65},${size*0.58} ${size*0.75},${size*0.85} ${size/2},${size*0.7} ${size*0.25},${size*0.85} ${size*0.35},${size*0.58} ${size*0.15},${size*0.4} ${size*0.41},${size*0.4}`} 
          fill={shapeColor} 
        />
      ),
      hexagon: (
        <polygon points={`${size/2},${size/5} ${size*3/4},${size/3} ${size*3/4},${size*2/3} ${size/2},${size*4/5} ${size/4},${size*2/3} ${size/4},${size/3}`} fill={shapeColor} />
      )
    };
    
    return shapes[shape] || shapes.circle;
  };

  const renderNeuralNetwork = () => {
    const currentPrediction = getCurrentPrediction();
    const isCurrentlyCorrect = currentPrediction === currentExample.correctAnswer;
    const baseOpacity = showPrediction ? 1 : 0.3;
    
    return (
      <svg width="100%" height="180" viewBox="0 0 400 180" style={{ marginBottom: '12px' }}>
        {/* Input Layer - 3 nodes representing feature extraction */}
        {[0, 1, 2].map(i => (
          <g key={`input-${i}`}>
            <circle
              cx={40}
              cy={50 + i * 40}
              r={10}
              fill={showPrediction ? '#3b82f6' : '#cbd5e1'}
              opacity={baseOpacity}
              style={{ transition: 'all 0.5s ease' }}
            />
            {showPrediction && (
              <text 
                x={40} 
                y={50 + i * 40 + 4} 
                fontSize={8} 
                fill="white" 
                textAnchor="middle"
                fontWeight="bold"
              >
                {i === 0 ? 'S' : i === 1 ? 'C' : 'P'}
              </text>
            )}
          </g>
        ))}
        
        {/* Input Labels */}
        <text x={40} y={30} fontSize={9} fill="#64748b" textAnchor="middle" fontWeight="600">Input</text>
        <text x={15} y={54} fontSize={7} fill="#94a3b8" textAnchor="end">Shape</text>
        <text x={15} y={94} fontSize={7} fill="#94a3b8" textAnchor="end">Color</text>
        <text x={15} y={134} fontSize={7} fill="#94a3b8" textAnchor="end">Pattern</text>
        
        {/* Hidden Layer 1 - 4 INTERACTIVE nodes */}
        {[0, 1, 2, 3].map(i => {
          const isActive = neuronStates.hidden1[i];
          return (
            <g 
              key={`hidden1-${i}`}
              onClick={() => toggleNeuron('hidden1', i)}
              style={{ cursor: (feedback || isAnimating) ? 'not-allowed' : 'pointer' }}
            >
              <circle
                cx={150}
                cy={35 + i * 40}
                r={10}
                fill={isActive ? '#8b5cf6' : '#cbd5e1'}
                opacity={baseOpacity}
                style={{ transition: 'all 0.3s ease' }}
              />
              {/* Tap indicator ring */}
              {!feedback && !isAnimating && (
                <circle
                  cx={150}
                  cy={35 + i * 40}
                  r={14}
                  fill="none"
                  stroke={isActive ? '#8b5cf6' : '#94a3b8'}
                  strokeWidth={1.5}
                  opacity={0.4}
                  style={{ transition: 'all 0.3s ease' }}
                />
              )}
            </g>
          );
        })}
        <text x={150} y={30} fontSize={9} fill="#64748b" textAnchor="middle" fontWeight="600">Transform ⚡</text>
        
        {/* Hidden Layer 2 - 4 INTERACTIVE nodes */}
        {[0, 1, 2, 3].map(i => {
          const isActive = neuronStates.hidden2[i];
          return (
            <g 
              key={`hidden2-${i}`}
              onClick={() => toggleNeuron('hidden2', i)}
              style={{ cursor: (feedback || isAnimating) ? 'not-allowed' : 'pointer' }}
            >
              <circle
                cx={260}
                cy={35 + i * 40}
                r={10}
                fill={isActive ? '#a78bfa' : '#cbd5e1'}
                opacity={baseOpacity}
                style={{ transition: 'all 0.3s ease' }}
              />
              {/* Tap indicator ring */}
              {!feedback && !isAnimating && (
                <circle
                  cx={260}
                  cy={35 + i * 40}
                  r={14}
                  fill="none"
                  stroke={isActive ? '#a78bfa' : '#94a3b8'}
                  strokeWidth={1.5}
                  opacity={0.4}
                  style={{ transition: 'all 0.3s ease' }}
                />
              )}
            </g>
          );
        })}
        <text x={260} y={30} fontSize={9} fill="#64748b" textAnchor="middle" fontWeight="600">Refine ⚡</text>
        
        {/* Output Layer - larger node for final prediction */}
        <circle
          cx={360}
          cy={90}
          r={14}
          fill={showPrediction ? (isCurrentlyCorrect ? '#10b981' : '#ef4444') : '#cbd5e1'}
          opacity={baseOpacity}
          style={{ transition: 'all 0.5s ease' }}
        />
        {showPrediction && (
          <text 
            x={360} 
            y={95} 
            fontSize={10} 
            fill="white" 
            textAnchor="middle"
            fontWeight="bold"
          >
            {currentPrediction.charAt(0).toUpperCase()}
          </text>
        )}
        <text x={360} y={30} fontSize={9} fill="#64748b" textAnchor="middle" fontWeight="600">Output</text>
        
        {/* Connections - Input to Hidden 1 */}
        {[0, 1, 2].map(i =>
          [0, 1, 2, 3].map(j => {
            const isActive = neuronStates.hidden1[j];
            return (
              <line
                key={`conn-ih1-${i}-${j}`}
                x1={50}
                y1={50 + i * 40}
                x2={140}
                y2={35 + j * 40}
                stroke={isActive ? '#8b5cf6' : '#cbd5e1'}
                strokeWidth={isActive ? 2 : 1}
                opacity={isActive ? 0.6 : 0.2}
                style={{ transition: 'all 0.3s ease' }}
              />
            );
          })
        )}
        
        {/* Connections - Hidden 1 to Hidden 2 */}
        {[0, 1, 2, 3].map(i =>
          [0, 1, 2, 3].map(j => {
            const isActive = neuronStates.hidden1[i] && neuronStates.hidden2[j];
            return (
              <line
                key={`conn-h1h2-${i}-${j}`}
                x1={160}
                y1={35 + i * 40}
                x2={250}
                y2={35 + j * 40}
                stroke={isActive ? '#a78bfa' : '#cbd5e1'}
                strokeWidth={isActive ? 2 : 1}
                opacity={isActive ? 0.7 : 0.2}
                style={{ transition: 'all 0.3s ease' }}
              />
            );
          })
        )}
        
        {/* Connections - Hidden 2 to Output */}
        {[0, 1, 2, 3].map(i => {
          const isActive = neuronStates.hidden2[i];
          return (
            <line
              key={`conn-ho-${i}`}
              x1={270}
              y1={35 + i * 40}
              x2={346}
              y2={90}
              stroke={isActive ? '#a78bfa' : '#cbd5e1'}
              strokeWidth={isActive ? 2.5 : 1}
              opacity={isActive ? 0.7 : 0.2}
              style={{ transition: 'all 0.3s ease' }}
            />
          );
        })}
        
        {/* Data flow animation for active paths */}
        {showPrediction && !feedback && neuronStates.hidden1.some(Boolean) && (
          <>
            <circle cx={95} cy={90} r={3} fill="#3b82f6" opacity={0.6}>
              <animate attributeName="cx" from="50" to="140" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </>
        )}
        {showPrediction && !feedback && neuronStates.hidden2.some(Boolean) && (
          <>
            <circle cx={205} cy={90} r={3} fill="#8b5cf6" opacity={0.6}>
              <animate attributeName="cx" from="160" to="250" dur="1.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={305} cy={90} r={3} fill="#a78bfa" opacity={0.6}>
              <animate attributeName="cx" from="270" to="346" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </>
        )}
      </svg>
    );
  };

  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={() => setPhase('active')}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '⚡',
            title: 'Your neural network is broken!',
            description: 'Neurons are firing randomly and predictions are wrong. You need to reconfigure them!',
          },
          {
            emoji: '🔘',
            title: 'Tap neurons to flip ON or OFF',
            description: 'Each neuron you toggle changes the network output. Experiment until predictions look right.',
            demo: (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', maxWidth: '220px', margin: '0 auto' }}>
                {[true, false, true, false, false, true, false, true].map((on, i) => (
                  <div key={i} style={{ width: '40px', height: '40px', borderRadius: '50%', background: on ? 'linear-gradient(135deg, #f59e0b, #ef4444)' : 'rgba(255,255,255,0.08)', border: `2px solid ${on ? '#f59e0b' : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: on ? 'white' : '#475569', fontWeight: 'bold' }}>
                    {on ? 'ON' : 'OFF'}
                  </div>
                ))}
                <div style={{ width: '100%', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', marginTop: '4px' }}>Tap any neuron to toggle it</div>
              </div>
            ),
          },
          {
            emoji: '✅',
            title: 'Match the target pattern!',
            description: 'Get the majority of predictions correct across all rounds and you win!',
          },
        ]}
      />
    );
  }

  return (
    <div style={{ 
      userSelect: 'none', 
      maxWidth: '100%', 
      overflow: 'hidden',
      padding: 'clamp(10px, 2vw, 20px)',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
    }}>
      {/* Title */}
      <h3 style={{ 
        marginBottom: '6px', 
        color: 'white',
        fontSize: 'clamp(1.1rem, 4vw, 1.8rem)',
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 'clamp(0.5px, 0.2vw, 1px)',
        textTransform: 'uppercase',
        lineHeight: '1.2'
      }}>
        ⚡ NeuroBurst
      </h3>
      
      <p style={{ 
        marginBottom: '12px', 
        color: '#94a3b8',
        textAlign: 'center',
        fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
        fontWeight: '500',
        padding: '0 8px',
        lineHeight: '1.3'
      }}>
        Tap neurons ⚡ to toggle them on/off until the output matches!
      </p>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '8px',
        marginBottom: '12px',
        fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
        fontWeight: '600'
      }}>
        <div style={{
          flex: 1,
          background: 'rgba(59, 130, 246, 0.2)',
          padding: 'clamp(6px, 1.5vw, 8px)',
          borderRadius: '6px',
          textAlign: 'center',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          color: '#60a5fa'
        }}>
          Round: {currentRound + 1}/{totalRounds}
        </div>
        <div style={{
          flex: 1,
          background: 'rgba(16, 185, 129, 0.2)',
          padding: 'clamp(6px, 1.5vw, 8px)',
          borderRadius: '6px',
          textAlign: 'center',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#34d399'
        }}>
          Score: {score}/{totalRounds}
        </div>
        <div style={{
          flex: 1,
          background: 'rgba(245, 158, 11, 0.2)',
          padding: 'clamp(6px, 1.5vw, 8px)',
          borderRadius: '6px',
          textAlign: 'center',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          color: '#fbbf24'
        }}>
          Accuracy: {accuracy.toFixed(0)}%
        </div>
      </div>

      {/* Input Display */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(16px, 3vw, 20px)',
        marginBottom: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        minHeight: '100px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <svg width={80} height={80}>
          {renderShape(currentExample.shape, currentExample.color)}
        </svg>
      </div>

      {/* Neural Network Visualization */}
      <div style={{
        background: '#ffffff',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(10px, 2vw, 12px)',
        marginBottom: '12px',
        border: '2px solid #e2e8f0'
      }}>
        {renderNeuralNetwork()}
      </div>

      {/* Prediction Display */}
      {showPrediction && (
        <div style={{
          background: getCurrentPrediction() === currentExample.correctAnswer ? '#dcfce7' : '#f1f5f9',
          border: `2px solid ${getCurrentPrediction() === currentExample.correctAnswer ? '#10b981' : '#94a3b8'}`,
          borderRadius: 'clamp(6px, 1.5vw, 8px)',
          padding: 'clamp(10px, 2vw, 14px)',
          marginBottom: '12px',
          textAlign: 'center',
          fontSize: 'clamp(0.85rem, 2.2vw, 1rem)',
          fontWeight: '600',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ marginBottom: '4px', color: '#64748b', fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
            Network Prediction:
          </div>
          <div style={{ 
            color: getCurrentPrediction() === currentExample.correctAnswer ? '#10b981' : '#1e293b',
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
            textTransform: 'capitalize',
            fontWeight: 'bold'
          }}>
            {getCurrentPrediction()}
          </div>
          <div style={{ 
            marginTop: '6px',
            fontSize: 'clamp(0.65rem, 1.6vw, 0.75rem)',
            color: '#64748b'
          }}>
            Target: {currentExample.correctAnswer}
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div style={{
          background: feedback === 'correct' ? '#dcfce7' : '#fee2e2',
          border: `2px solid ${feedback === 'correct' ? '#10b981' : '#ef4444'}`,
          borderRadius: 'clamp(6px, 1.5vw, 8px)',
          padding: 'clamp(8px, 2vw, 12px)',
          marginBottom: '12px',
          textAlign: 'center',
          fontSize: 'clamp(0.85rem, 2.2vw, 1rem)',
          fontWeight: '700',
          color: feedback === 'correct' ? '#10b981' : '#ef4444',
          animation: 'slideIn 0.3s ease'
        }}>
          {feedback === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
          {feedback === 'wrong' && ' Adjusting weights...'}
        </div>
      )}

      {/* Action Button */}
      {showPrediction && !feedback && (
        <button
          onClick={checkPrediction}
          disabled={isAnimating || getCurrentPrediction() !== currentExample.correctAnswer}
          style={{
            background: getCurrentPrediction() === currentExample.correctAnswer
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, rgba(142, 142, 147, 0.3), rgba(120, 120, 125, 0.3))',
            color: getCurrentPrediction() === currentExample.correctAnswer ? '#1d1d1f' : '#94a3b8',
            padding: 'clamp(14px, 3vw, 18px)',
            fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
            fontWeight: '700',
            borderRadius: 'clamp(8px, 2vw, 12px)',
            border: 'none',
            cursor: getCurrentPrediction() === currentExample.correctAnswer && !isAnimating ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
            boxShadow: getCurrentPrediction() === currentExample.correctAnswer
              ? '0 4px 16px rgba(16, 185, 129, 0.3)'
              : 'none',
            minHeight: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: getCurrentPrediction() === currentExample.correctAnswer && !isAnimating ? 1 : 0.5,
            width: '100%',
            marginBottom: '8px'
          }}
          onMouseEnter={(e) => {
            if (getCurrentPrediction() === currentExample.correctAnswer && !isAnimating) {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = getCurrentPrediction() === currentExample.correctAnswer
              ? '0 4px 16px rgba(16, 185, 129, 0.3)'
              : 'none';
          }}
        >
          {getCurrentPrediction() === currentExample.correctAnswer 
            ? '✓ Submit Answer' 
            : '⚡ Keep adjusting neurons...'}
        </button>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
};

export default NeuroBurstChallenge;
