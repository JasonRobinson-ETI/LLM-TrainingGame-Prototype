import React, { useState, useEffect, useRef } from 'react';
import TeacherDashboard from './components/TeacherDashboard';
import StudentClient from './components/StudentClient';
import RoleSelector from './components/RoleSelector';
import ChallengeDebug from './components/ChallengeDebug';
import useWebSocket from './hooks/useWebSocket';
import { censorText } from './utils/contentFilter';
import './animations.css';

function App() {
  const [role, setRole] = useState(null);
  const [clientName, setClientName] = useState('');
  const hasRegistered = useRef(false);
  const { 
    connected, 
    gameState, 
    sendMessage, 
    messages 
  } = useWebSocket();

  // Check if /teacher is in the URL path
  const isTeacherRoute = window.location.pathname === '/teacher';
  const isChallengeDebugRoute = window.location.pathname === '/debug-challenges';

  // If on debug route, show challenge debug page
  if (isChallengeDebugRoute) {
    return <ChallengeDebug />;
  }

  useEffect(() => {
    // Auto-assign teacher role if on /teacher route
    if (isTeacherRoute && !role) {
      setRole('teacher');
      setClientName('Teacher');
    }
    // Auto-assign student role if NOT on /teacher route
    else if (!isTeacherRoute && !role && !clientName) {
      // Show name input for students only
      return;
    }
  }, [isTeacherRoute, role, clientName]);

  // No registration approval/rejection messages

  useEffect(() => {
    // Register immediately when we have role, name, and connection
    if (role && connected && clientName) {
      if (!hasRegistered.current) {
        console.log('[APP] Registering as:', role, clientName);
        sendMessage({
          type: 'register',
          role,
          name: clientName
        });
        hasRegistered.current = true;
      }
    } else if (!connected) {
      // Reset flag when disconnected so we can re-register on reconnect
      hasRegistered.current = false;
      // no-op
    }
  }, [role, connected, clientName]);

  // Show name input for students (not on teacher route)
  if (!role && !isTeacherRoute) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          padding: '40px',
          borderRadius: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          maxWidth: '400px',
          width: '100%',
          animation: 'scaleUp 0.4s ease-out'
        }}>
          <h1 style={{
            fontSize: '2.5rem',
            marginBottom: '12px',
            textAlign: 'center',
            color: '#764ba2',
            fontWeight: '700',
            letterSpacing: '-0.02em'
          }}>
            Make your own AI
          </h1>
          <p style={{
            textAlign: 'center',
            color: '#86868b',
            marginBottom: '32px',
            fontSize: '1.1rem'
          }}>
            You'll ask questions and answer questions, and discover some of the challenges behind making AI!
          </p>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (clientName.trim()) {
              // Apply content filter to name before setting role
              const filteredName = censorText(clientName.trim());
              setClientName(filteredName);
              setRole('student');
            }
          }}>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Enter your name"
              className="fade-in"
              style={{
                width: '100%',
                padding: '18px',
                fontSize: '1.2rem',
                border: '2px solid #e0e0e0',
                borderRadius: '12px',
                marginBottom: '16px',
                boxSizing: 'border-box',
                transition: 'all 0.3s ease'
              }}
              autoFocus
              onFocus={(e) => {
                e.target.style.borderColor = '#667eea';
                e.target.style.boxShadow = '0 4px 16px rgba(102, 126, 234, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e0e0e0';
                e.target.style.boxShadow = 'none';
              }}
            />
            <button
              type="submit"
              disabled={!clientName.trim()}
              className="slide-in-right"
              style={{
                width: '100%',
                background: clientName.trim()
                  ? 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
                  : '#ccc',
                color: '#1d1d1f',
                padding: '18px',
                fontSize: '1.2rem',
                border: 'none',
                borderRadius: '12px',
                cursor: clientName.trim() ? 'pointer' : 'not-allowed',
                fontWeight: '700',
                boxShadow: clientName.trim() ? '0 4px 16px rgba(79, 172, 254, 0.3)' : 'none',
                transition: 'all 0.3s ease',
                marginBottom: '16px'
              }}
              onMouseEnter={(e) => {
                if (clientName.trim()) {
                  e.target.style.transform = 'translateY(-3px)';
                  e.target.style.boxShadow = '0 8px 24px rgba(79, 172, 254, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = clientName.trim() ? '0 4px 16px rgba(79, 172, 254, 0.3)' : 'none';
              }}
            >
              JOIN GAME →
            </button>

            <button
              type="button"
              onClick={() => window.location.href = '/debug-challenges'}
              className="slide-in-right"
              style={{
                width: '100%',
                background:'linear-gradient(135deg, #ec4ffeff 0%, #fec700ff 100%)',
                color: '#1d1d1f',
                padding: '18px',
                fontSize: '1.2rem',
                border: 'none',
                borderRadius: '12px',
                cursor:'pointer',
                fontWeight: '700',
                boxShadow: '0 4px 16px rgba(79, 172, 254, 0.3)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-3px)';
                e.target.style.boxShadow = '0 8px 24px rgba(79, 172, 254, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow ='0 4px 16px rgba(79, 172, 254, 0.3)';
              }}
            >
              View Specific Challenges
            </button>

          </form>
        </div>
      </div>
    );
  }

  if (!role) {
    return <RoleSelector onSelectRole={(r, name) => {
      setRole(r);
      setClientName(name);
    }} isTeacherRoute={isTeacherRoute} />;
  }

  return (
    <div style={{ minHeight: '100vh', padding: '20px' }}>
      {role === 'teacher' && (
        <TeacherDashboard 
          gameState={gameState}
          sendMessage={sendMessage}
          messages={messages}
          connected={connected}
        />
      )}
      
      {role === 'student' && (
        <StudentClient 
          role={role}
          name={clientName}
          gameState={gameState}
          sendMessage={sendMessage}
          messages={messages}
          connected={connected}
        />
      )}
    </div>
  );
}

export default App;
