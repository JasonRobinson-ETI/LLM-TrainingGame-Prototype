import React, { useState, useEffect, useRef } from 'react';

const ClusterRushChallenge = ({ challenge, onComplete }) => {
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
      <div className="relative bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-xl p-8 min-h-[500px] overflow-hidden">
        {/* Sparks animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-ping"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${1 + Math.random()}s`
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <h2 className="text-4xl font-bold text-white mb-8 animate-pulse">
            ⚡ CLUSTER POWERING UP ⚡
          </h2>
          
          {/* GPU Utilization */}
          <div className="w-full max-w-md mb-8">
            <div className="flex justify-between text-white font-bold mb-2">
              <span>GPU Utilization</span>
              <span className="text-green-400">{gpuUtilization}%</span>
            </div>
            <div className="h-8 bg-slate-800 rounded-full overflow-hidden border-2 border-green-400">
              <div
                className="h-full bg-gradient-to-r from-green-500 via-blue-500 to-purple-500 transition-all duration-300 ease-out
                          shadow-lg shadow-green-500/50"
                style={{ width: `${gpuUtilization}%` }}
              />
            </div>
          </div>

          {/* Mini Loss Curve Animation */}
          <div className="w-full max-w-md bg-slate-800/80 rounded-lg p-4 border-2 border-purple-400">
            <div className="text-white font-bold mb-2 text-center">Training Loss</div>
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
                className="animate-pulse"
              />
            </svg>
          </div>

          <div className="mt-8 text-2xl font-bold text-green-400 animate-pulse">
            {gpuUtilization < 100 ? 'Initializing training...' : '🎉 Training Initiated!'}
          </div>
        </div>
      </div>
    );
  }

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
          }}>🖥️ Cluster Rush</h2>
          <p style={{ 
            margin: 0, 
            fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', 
            color: '#94a3b8',
            lineHeight: '1.6'
          }}>
            Build and manage your GPU cluster at lightning speed!
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
          <p><strong style={{ color: 'white' }}>🎯 Your Mission:</strong> Complete 15 cluster tasks</p>
          <p><strong style={{ color: 'white' }}>⚡ Speed:</strong> Click the matching action for each task</p>
          <p><strong style={{ color: 'white' }}>⚠️ Warning:</strong> Wrong actions reduce your progress by 1</p>
          <p style={{ marginBottom: 0 }}><strong style={{ color: 'white' }}>✅ Win Condition:</strong> Reach 15 completed tasks</p>
        </div>

        <button
          onClick={() => setPhase('setup')}
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
          🚀 Start Building
        </button>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 rounded-xl p-6 min-h-[500px] flex items-center justify-center">
      <div className="text-white text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <div className="text-xl font-bold">Challenge Error</div>
        <div className="text-sm mt-2">Phase: {phase}</div>
        <div className="text-sm">Task: {currentTask ? 'Loaded' : 'Missing'}</div>
        <div className="text-sm">Buttons: {actionButtons.length}</div>
      </div>
    </div>
  );
};

export default ClusterRushChallenge;
