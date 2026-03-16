import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

const ClusterRushChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // 'intro', 'setup', 'payoff', 'complete'
  const [tasksCompleted, setTasksCompleted] = useState(0);
  const [currentTask, setCurrentTask] = useState(null);
  const [actionButtons, setActionButtons] = useState([]);
  const [events, setEvents] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [gpuUtilization, setGpuUtilization] = useState(0);
  
  const payoffTimeoutRef = useRef(null);
  
  // Task types for the challenge
  const taskTypes = [
    { type: 'connect', label: 'Connect GPU', icon: '🔌', color: 'from-blue-500 to-blue-700' },
    { type: 'power', label: 'Power Unit', icon: '⚡', color: 'from-yellow-500 to-yellow-700' },
    { type: 'route', label: 'Route Data', icon: '🧩', color: 'from-green-500 to-green-700' },
    { type: 'balance', label: 'Balance Load', icon: '⚖️', color: 'from-purple-500 to-purple-700' },
    { type: 'switch', label: 'Link Switch', icon: '🌐', color: 'from-indigo-500 to-indigo-700' },
    { type: 'cooling', label: 'Add Cooling', icon: '❄️', color: 'from-cyan-500 to-cyan-700' },
  ];

  // Generate new task with randomized button positions
  const generateTask = () => {
    const task = taskTypes[Math.floor(Math.random() * taskTypes.length)];
    setCurrentTask(task);
    
    // Create 3 random action buttons (one correct, two wrong)
    const wrongTasks = taskTypes.filter(t => t.type !== task.type);
    const shuffled = [...wrongTasks].sort(() => Math.random() - 0.5);
    const wrongOptions = shuffled.slice(0, 2);
    
    // Shuffle all three buttons
    const buttons = [task, ...wrongOptions].sort(() => Math.random() - 0.5);
    setActionButtons(buttons);
  };

  // Initialize first task on mount
  useEffect(() => {
    if (phase === 'setup' && !currentTask) {
      console.log('ClusterRush: Generating first task');
      generateTask();
    }
  }, [phase, currentTask]);

  // Debug log
  useEffect(() => {
    console.log('ClusterRush state:', { phase, currentTask: currentTask?.type, actionButtons: actionButtons.length });
  }, [phase, currentTask, actionButtons]);

  // Remove timer - game continues until 15 tasks completed

  // Remove random events system

  // GPU Utilization animation during payoff
  useEffect(() => {
    if (phase === 'payoff' && gpuUtilization < 100) {
      const timer = setTimeout(() => {
        setGpuUtilization(prev => Math.min(100, prev + 5));
      }, 50);
      return () => clearTimeout(timer);
    } else if (phase === 'payoff' && gpuUtilization >= 100) {
      payoffTimeoutRef.current = setTimeout(() => {
        setPhase('complete');
        calculateFinalScore();
      }, 1500);
    }
  }, [phase, gpuUtilization]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (payoffTimeoutRef.current) clearTimeout(payoffTimeoutRef.current);
    };
  }, []);

  const handleTaskComplete = () => {
    const newTasksCompleted = tasksCompleted + 1;
    setTasksCompleted(newTasksCompleted);
    
    showFeedback(`✓ Correct! ${newTasksCompleted}/15`, 'success');
    
    // Check if reached 15 tasks
    if (newTasksCompleted >= 15) {
      initiatePayoff();
    } else {
      // Generate new task
      setTimeout(() => {
        generateTask();
      }, 200);
    }
  };

  const handleWrongAction = () => {
    const newTasksCompleted = Math.max(0, tasksCompleted - 1);
    setTasksCompleted(newTasksCompleted);
    showFeedback(`✗ Wrong Action! -1 (${newTasksCompleted}/15)`, 'error');
  };

  const showFeedback = (message, type) => {
    setFeedback({ message, type });
    setTimeout(() => setFeedback(null), 600);
  };

  const initiatePayoff = () => {
    setPhase('payoff');
    setGpuUtilization(0);
  };

  const calculateFinalScore = () => {
    // Success if reached 15 tasks
    const success = tasksCompleted >= 15;
    
    onComplete(success);
  };

  if (phase === 'setup') {
    // Safety check - ensure task is loaded
    if (!currentTask || actionButtons.length === 0) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>⏳</div>
          <div style={{ color: '#666' }}>Loading challenge...</div>
        </div>
      );
    }

    return (
      <div style={{ 
        position: 'relative', 
        height: 'clamp(500px, 90vh, 600px)', 
        overflow: 'hidden', 
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
        borderRadius: 'clamp(8px, 2vw, 12px)' 
      }}>
        <style>{`
          @keyframes slideIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          .cluster-btn {
            transition: all 0.2s ease;
          }
          .cluster-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
          }
          .cluster-btn:active {
            transform: translateY(0);
          }
        `}</style>

        {/* Stats Bar */}
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
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: 'clamp(1.1rem, 3vw, 1.3rem)',
          fontWeight: '700',
          zIndex: 10
        }}>
          <div style={{ 
            color: tasksCompleted >= 15 ? '#10b981' : '#ffffff'
          }}>
            🎯 {tasksCompleted}/15 tasks
          </div>
        </div>

        {/* Main Content Area */}
        <div style={{
          position: 'absolute',
          top: 'clamp(50px, 12vw, 60px)',
          left: 'clamp(12px, 3vw, 20px)',
          right: 'clamp(12px, 3vw, 20px)',
          bottom: 'clamp(12px, 3vw, 20px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(12px, 3vw, 16px)'
        }}>
          {/* Task Card */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: 'clamp(12px, 3vw, 16px)',
            padding: 'clamp(20px, 5vw, 30px)',
            textAlign: 'center',
            animation: 'slideIn 0.3s ease',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.3)'
          }}>
            <div style={{
              fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
              color: '#667eea',
              fontWeight: '700',
              marginBottom: 'clamp(8px, 2vw, 12px)',
              textTransform: 'uppercase',
              letterSpacing: '2px'
            }}>
              Cluster Needs
            </div>
            <div style={{
              fontSize: 'clamp(3rem, 12vw, 4rem)',
              marginBottom: 'clamp(8px, 2vw, 12px)',
              filter: 'drop-shadow(0 4px 12px rgba(102, 126, 234, 0.4))'
            }}>
              {currentTask.icon}
            </div>
            <div style={{
              fontSize: 'clamp(1.1rem, 3.5vw, 1.4rem)',
              fontWeight: 'bold',
              color: '#1e293b'
            }}>
              {currentTask.label}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'clamp(8px, 2vw, 10px)'
          }}>
            {actionButtons.map((action, idx) => {
              const colorMap = {
                'from-blue-500 to-blue-700': ['#3b82f6', '#1d4ed8'],
                'from-yellow-500 to-yellow-700': ['#eab308', '#a16207'],
                'from-green-500 to-green-700': ['#22c55e', '#15803d'],
                'from-purple-500 to-purple-700': ['#a855f7', '#6b21a8'],
                'from-indigo-500 to-indigo-700': ['#6366f1', '#3730a3'],
                'from-cyan-500 to-cyan-700': ['#06b6d4', '#0e7490']
              };
              const [from, to] = colorMap[action.color] || ['#667eea', '#764ba2'];
              
              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (action.type === currentTask.type) {
                      handleTaskComplete();
                    } else {
                      handleWrongAction();
                    }
                  }}
                  className="cluster-btn"
                  style={{
                    background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
                    color: 'white',
                    border: 'none',
                    borderRadius: 'clamp(10px, 2.5vw, 12px)',
                    padding: 'clamp(12px, 3vw, 16px)',
                    fontSize: 'clamp(0.95rem, 2.5vw, 1.05rem)',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'clamp(10px, 2.5vw, 12px)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    animation: `slideIn ${0.3 + idx * 0.1}s ease`
                  }}
                >
                  <span style={{ fontSize: 'clamp(1.3rem, 4vw, 1.8rem)' }}>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            borderRadius: 'clamp(10px, 2.5vw, 12px)',
            padding: 'clamp(10px, 2.5vw, 14px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            marginTop: 'auto'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'clamp(6px, 1.5vw, 8px)',
              fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
              color: '#475569',
              fontWeight: '700'
            }}>
              <span>PROGRESS</span>
              <span style={{ color: '#667eea' }}>{tasksCompleted}/15</span>
            </div>
            <div style={{
              height: 'clamp(8px, 2vw, 10px)',
              background: 'rgba(226, 232, 240, 0.5)',
              borderRadius: '100px',
              overflow: 'hidden',
              border: '1px solid rgba(100, 116, 139, 0.2)'
            }}>
              <div style={{
                height: '100%',
                width: `${(tasksCompleted / 15) * 100}%`,
                background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '100px',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 16px rgba(102, 126, 234, 0.6)'
              }} />
            </div>
          </div>
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            background: feedback.type === 'success' 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            padding: 'clamp(16px, 4vw, 24px) clamp(24px, 6vw, 36px)',
            borderRadius: 'clamp(12px, 3vw, 16px)',
            fontSize: 'clamp(1.1rem, 3.5vw, 1.4rem)',
            fontWeight: 'bold',
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            animation: 'slideIn 0.3s ease',
            border: '2px solid rgba(255,255,255,0.3)'
          }}>
            {feedback.message}
          </div>
        )}
      </div>
    );
  }

  if (phase === 'payoff') {
    return (
      <div style={{
        position: 'relative',
        background: 'linear-gradient(135deg, #0f172a 0%, #581c87 50%, #0f172a 100%)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(20px, 5vw, 32px)',
        minHeight: '500px',
        overflow: 'hidden'
      }}>
        <style>{`
          @keyframes spark-ping {
            0% { transform: scale(1); opacity: 1; }
            75%, 100% { transform: scale(2); opacity: 0; }
          }
          @keyframes payoff-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}</style>
        {/* Sparks animation */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: '8px',
                height: '8px',
                background: '#facc15',
                borderRadius: '50%',
                animation: `spark-ping ${1 + Math.random()}s ease-in-out infinite`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}
        </div>

        <div style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%'
        }}>
          <h2 style={{
            fontSize: 'clamp(1.5rem, 6vw, 2.25rem)',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: 'clamp(20px, 4vw, 32px)',
            animation: 'payoff-pulse 1.5s ease-in-out infinite',
            textAlign: 'center'
          }}>
            ⚡ CLUSTER POWERING UP ⚡
          </h2>
          
          {/* GPU Utilization */}
          <div style={{ width: '100%', maxWidth: '400px', marginBottom: 'clamp(20px, 4vw, 32px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'white', fontWeight: 'bold', marginBottom: '8px' }}>
              <span>GPU Utilization</span>
              <span style={{ color: '#4ade80' }}>{gpuUtilization}%</span>
            </div>
            <div style={{
              height: '32px',
              background: '#1e293b',
              borderRadius: '9999px',
              overflow: 'hidden',
              border: '2px solid #4ade80'
            }}>
              <div style={{
                height: '100%',
                width: `${gpuUtilization}%`,
                background: 'linear-gradient(90deg, #22c55e 0%, #3b82f6 50%, #a855f7 100%)',
                transition: 'width 0.3s ease-out',
                borderRadius: '9999px',
                boxShadow: '0 0 16px rgba(34,197,94,0.5)'
              }} />
            </div>
          </div>

          {/* Mini Loss Curve Animation */}
          <div style={{
            width: '100%',
            maxWidth: '400px',
            background: 'rgba(30,41,59,0.8)',
            borderRadius: '8px',
            padding: '16px',
            border: '2px solid #a855f7'
          }}>
            <div style={{ color: 'white', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>Training Loss</div>
            <svg width="100%" height="100" viewBox="0 0 200 100">
              <path
                d={`M 0,80 Q 50,${80 - gpuUtilization * 0.6} 100,${80 - gpuUtilization * 0.6} T 200,${80 - gpuUtilization * 0.7}`}
                stroke="#10b981"
                strokeWidth="3"
                fill="none"
                style={{ transition: 'all 0.3s ease' }}
              />
              <circle
                cx={gpuUtilization * 2}
                cy={80 - gpuUtilization * 0.7}
                r="4"
                fill="#10b981"
                style={{ animation: 'payoff-pulse 1.5s ease-in-out infinite' }}
              />
            </svg>
          </div>

          <div style={{
            marginTop: 'clamp(20px, 4vw, 32px)',
            fontSize: 'clamp(1.2rem, 4vw, 1.5rem)',
            fontWeight: 'bold',
            color: '#4ade80',
            animation: 'payoff-pulse 1.5s ease-in-out infinite',
            textAlign: 'center'
          }}>
            {gpuUtilization < 100 ? 'Initializing training...' : '🎉 Training Initiated!'}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={() => setPhase('setup')}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '🖥️',
            title: 'LLM GPU Training Cluster!',
            description: 'Training an LLM like GPT-4 needs thousands of GPUs working together. You\'re the engineer keeping the cluster running!',
          },
          {
            emoji: '👆',
            title: 'A task appears \u2014 tap its action',
            description: 'Read the task and tap the button that matches it. Wrong answers cost you a point!',
            demo: (
              <div style={{ textAlign: 'center', maxWidth: '280px', margin: '0 auto' }}>
                <div style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid #8b5cf6', borderRadius: '10px', padding: '10px 16px', marginBottom: '12px', color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  🖥️ Add GPU Node
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  {[{ label: '⚡ Scale Up', match: false }, { label: '🖥️ Add Node', match: true }, { label: '🗑️ Remove', match: false }].map(({ label, match }) => (
                    <div key={label} style={{ background: match ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.07)', border: `2px solid ${match ? '#10b981' : 'rgba(255,255,255,0.15)'}`, borderRadius: '8px', padding: '8px 12px', color: match ? 'white' : '#64748b', fontSize: '0.85rem', fontWeight: match ? 'bold' : 'normal' }}>
                      {label} {match ? '\u2713' : ''}
                    </div>
                  ))}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '10px' }}>Tap the button that matches the task!</div>
              </div>
            ),
          },
          {
            emoji: '🏆',
            title: 'Keep the LLM training!',
            description: 'If the cluster goes down, training stops and millions of dollars are wasted. Complete 15 tasks to keep it running!',
          },
        ]}
      />
    );
  }

  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #c026d3 100%)',
      borderRadius: 'clamp(8px, 2vw, 12px)',
      padding: 'clamp(16px, 4vw, 24px)',
      minHeight: '500px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{ color: 'white', textAlign: 'center' }}>
        <div style={{ fontSize: 'clamp(2rem, 8vw, 2.5rem)', marginBottom: '16px' }}>⚠️</div>
        <div style={{ fontSize: 'clamp(1rem, 3vw, 1.25rem)', fontWeight: 'bold' }}>Challenge Error</div>
        <div style={{ fontSize: 'clamp(0.8rem, 2vw, 0.9rem)', marginTop: '8px' }}>Phase: {phase}</div>
        <div style={{ fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>Task: {currentTask ? 'Loaded' : 'Missing'}</div>
        <div style={{ fontSize: 'clamp(0.8rem, 2vw, 0.9rem)' }}>Buttons: {actionButtons.length}</div>
      </div>
    </div>
  );
};

export default ClusterRushChallenge;
