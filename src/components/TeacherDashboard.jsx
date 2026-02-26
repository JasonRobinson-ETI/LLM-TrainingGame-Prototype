import React, { useState, useEffect } from 'react';
import { Transition, Dialog } from '@headlessui/react';
import { QRCodeSVG } from 'qrcode.react';
import LLMDisplay from './LLMDisplay';

const TeacherDashboard = ({ gameState, sendMessage, messages, connected }) => {
  const [activityLog, setActivityLog] = useState([]);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [lastProcessedIndex, setLastProcessedIndex] = useState(0);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [changingModel, setChangingModel] = useState(false);

  // Helper to get API base URL dynamically (works across network)
  const getApiBaseUrl = () => {
    const isLocalAccess = window.location.hostname === 'localhost' || 
                          window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/);
    return isLocalAccess 
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : `${window.location.protocol}//${window.location.host}`;
  };

  // Debug log for starred pairs
  useEffect(() => {
    if (gameState?.starredQAPairs) {
      console.log('[TEACHER] Starred pairs:', gameState.starredQAPairs.length, gameState.starredQAPairs);
    }
  }, [gameState?.starredQAPairs]);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      try {
        console.log('[TEACHER] Fetching available models...');
        const response = await fetch(`${getApiBaseUrl()}/api/models`);
        console.log('[TEACHER] Models response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[TEACHER] Models data:', data);
          setAvailableModels(data.availableModels || []);
          setSelectedModel(data.currentModel || '');
        } else {
          console.error('[TEACHER] Failed to fetch models, status:', response.status);
          const errorText = await response.text();
          console.error('[TEACHER] Error response:', errorText);
        }
      } catch (error) {
        console.error('[TEACHER] Failed to fetch models:', error);
      } finally {
        setLoadingModels(false);
      }
    };
    fetchModels();
  }, []);

  // Update selected model when gameState changes
  useEffect(() => {
    if (gameState?.llmModel && gameState.llmModel !== selectedModel) {
      setSelectedModel(gameState.llmModel);
    }
  }, [gameState?.llmModel]);

  useEffect(() => {
    // Only process new messages (index-based tracking avoids dedup issues)
    if (messages.length <= lastProcessedIndex) return;
    const newMessages = messages.slice(lastProcessedIndex);
    const relevantMessages = newMessages.filter(msg =>
      msg.type === 'training_data_added' || 
      msg.type === 'llm_evolved' || 
      msg.type === 'challenge_failed' ||
      msg.type === 'challenge_success' ||
      msg.type === 'llm_primed'
    );
    if (relevantMessages.length > 0) {
      setActivityLog(prev => [...relevantMessages.reverse(), ...prev]);
    }
    setLastProcessedIndex(messages.length);
  }, [messages, lastProcessedIndex]);

  const startGame = () => {
    sendMessage({ type: 'start_game' });
  };

  const endGame = () => {
    sendMessage({ type: 'end_game' });
  };

  const resetKnowledge = () => {
    setShowResetDialog(true);
  };

  const confirmReset = () => {
    sendMessage({ type: 'reset_knowledge' });
    setShowResetDialog(false);
    // Clear the activity log when resetting
    setActivityLog([]);
    // Reset message index tracking
    setLastProcessedIndex(messages.length);
  };

  const kickStudent = (clientId) => {
    sendMessage({ type: 'kick_student', clientId });
  };

  const changeModel = async () => {
    if (!selectedModel || changingModel) return;
    
    console.log('[TEACHER] Changing model to:', selectedModel);
    setChangingModel(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/models/change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: selectedModel })
      });
      
      console.log('[TEACHER] Change model response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('[TEACHER] Model changed successfully:', result);
        // Model will update via WebSocket broadcast of gameState
      } else {
        const errorText = await response.text();
        console.error('[TEACHER] Failed to change model, status:', response.status);
        console.error('[TEACHER] Error response:', errorText);
        alert('Failed to change model. Check console for details.');
      }
    } catch (error) {
      console.error('[TEACHER] Error changing model:', error);
      alert('Error changing model: ' + error.message);
    } finally {
      setChangingModel(false);
    }
  };

  if (!connected) {
    return (
      <div style={{ 
        width: '100vw',
        height: '100dvh',
        padding: '8px',
        margin: '0',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0
      }}>
        <div style={{
          textAlign: 'center',
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          padding: '40px',
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
          boxSizing: 'border-box'
        }}>
          <div className="pulse emoji-large" style={{ fontSize: '3rem', marginBottom: '20px' }}>🔄</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#1d1d1f', marginBottom: '12px', textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
            Connecting to server...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100vw',
      height: '100dvh',
      padding: '8px',
      margin: '0',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      {/* Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(2, 1fr)', 
        gap: '16px',
        marginBottom: '20px',
        flexShrink: 0
      }}>
        <Transition
          show={true}
          appear={true}
          enter="transition-all duration-500"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
        >
          <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            padding: '20px',
            borderRadius: '18px',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
            transition: 'all 0.3s',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.6)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent)',
              opacity: 0.6
            }} />
            <div style={{ fontSize: '13px', color: 'rgba(29, 29, 31, 0.7)', marginBottom: '8px', fontWeight: '500', letterSpacing: '-0.01em' }}>
              Game Status
            </div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: '#1d1d1f', letterSpacing: '-0.02em', marginBottom: '16px' }}>
              {gameState?.isActive ? '🟢 Active' : '⚪️ Inactive'}
            </div>
            
            {/* Control Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <button
                onClick={resetKnowledge}
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.7), rgba(255, 45, 85, 0.7))',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  color: '#1d1d1f',
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(255, 59, 48, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
                }}
              >
                Reset AI
              </button>
              {!gameState?.isActive ? (
                <button
                  onClick={startGame}
                  style={{
                    background: 'linear-gradient(135deg, rgba(52, 199, 89, 0.7), rgba(48, 209, 88, 0.7))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    color: '#1d1d1f',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: '500',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(52, 199, 89, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
                  }}
                >
                  Start Game
                </button>
              ) : (
                <button
                  onClick={endGame}
                  style={{
                    background: 'linear-gradient(135deg, rgba(255, 149, 0, 0.7), rgba(255, 159, 10, 0.7))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    color: '#1d1d1f',
                    padding: '8px 16px',
                    fontSize: '13px',
                    fontWeight: '500',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(255, 149, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
                  }}
                >
                  End Game
                </button>
              )}
              
              {/* Model Selector */}
              <div style={{ 
                display: 'flex', 
                gap: '6px', 
                marginTop: '8px'
              }}>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={loadingModels || changingModel}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    color: '#1d1d1f',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    borderRadius: '8px',
                    cursor: loadingModels || changingModel ? 'not-allowed' : 'pointer',
                    opacity: loadingModels || changingModel ? 0.6 : 1,
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 0 rgba(255, 255, 255, 0.5)'
                  }}
                >
                  {loadingModels ? (
                    <option>Loading...</option>
                  ) : availableModels.length === 0 ? (
                    <option>No models</option>
                  ) : (
                    availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))
                  )}
                </select>
                <button
                  onClick={changeModel}
                  disabled={changingModel || !selectedModel || selectedModel === gameState?.llmModel}
                  title="Change model and re-benchmark devices"
                  style={{
                    background: changingModel ? 'rgba(142, 142, 147, 0.5)' : 'linear-gradient(135deg, rgba(0, 122, 255, 0.7), rgba(10, 132, 255, 0.7))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    color: '#fff',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    borderRadius: '8px',
                    cursor: (changingModel || !selectedModel || selectedModel === gameState?.llmModel) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 8px rgba(0, 122, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)',
                    opacity: (changingModel || !selectedModel || selectedModel === gameState?.llmModel) ? 0.5 : 1
                  }}
                >
                  {changingModel ? '⏳' : '🔄'}
                </button>
              </div>
            </div>
          </div>
        </Transition>

        <Transition
          show={true}
          appear={true}
          enter="transition-all duration-500 delay-100"
          enterFrom="opacity-0 translate-y-4"
          enterTo="opacity-100 translate-y-0"
        >
          <div style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            padding: '20px',
            borderRadius: '18px',
            border: '1px solid rgba(255, 255, 255, 0.7)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
            transition: 'all 0.3s',
            position: 'relative',
            overflow: 'hidden'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.boxShadow = '0 12px 48px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.6)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.7)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          >
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.7), transparent)',
              opacity: 0.6
            }} />
            <div style={{ fontSize: '13px', color: 'rgba(29, 29, 31, 0.7)', marginBottom: '8px', fontWeight: '500', letterSpacing: '-0.01em' }}>
              Connected Students ({gameState?.clients ? Object.values(gameState.clients).filter(c => c.role === 'student').length : 0})
            </div>
            <style>
              {`
                @keyframes scrollCredits {
                  0% {
                    transform: translateY(0);
                  }
                  100% {
                    transform: translateY(-50%);
                  }
                }
                .credits-scroll {
                  animation: scrollCredits 20s linear infinite;
                }
                .credits-scroll:hover {
                  animation-play-state: paused;
                }
              `}
            </style>
            <div style={{ 
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <div style={{ 
                flex: 1,
                maxHeight: '120px', 
                overflowY: 'hidden',
                overflowX: 'hidden',
                position: 'relative',
                maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
              }}>
              {gameState?.clients && Object.values(gameState.clients).filter(c => c.role === 'student').length > 0 ? (
                <div className={Object.values(gameState.clients).filter(c => c.role === 'student').length >= 3 ? "credits-scroll" : ""} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Original list */}
                  {Object.values(gameState.clients).filter(c => c.role === 'student').map(client => (
                    <div
                      key={client.id}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.7)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                      }}
                    >
                      <div style={{ 
                        fontWeight: '500', 
                        color: '#1d1d1f', 
                        fontSize: '14px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {client.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          onClick={() => kickStudent(client.id)}
                          style={{
                            background: 'rgba(255, 59, 48, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.5)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: '600',
                            width: '18px',
                            height: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            padding: 0
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 59, 48, 1)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 59, 48, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          title="Kick student"
                        >
                          ×
                        </button>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '500',
                          background: client.currentMode === 'asker' ? '#0071e3' : 
                                     client.currentMode === 'answerer' ? '#34c759' : 
                                     client.currentMode === 'challenging' ? '#FF9500' :
                                     '#8e8e93',
                          color: '#1d1d1f'
                        }}>
                          {client.currentMode === 'asker' ? 'Q' : 
                           client.currentMode === 'answerer' ? 'A' : 
                           client.currentMode === 'challenging' ? 'C' : '•'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* Duplicate list for seamless loop - only when scrolling (3+ students) */}
                  {Object.values(gameState.clients).filter(c => c.role === 'student').length >= 3 && Object.values(gameState.clients).filter(c => c.role === 'student').map(client => (
                    <div
                      key={`${client.id}-duplicate`}
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: '1px solid rgba(255, 255, 255, 0.7)',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                      }}
                    >
                      <div style={{ 
                        fontWeight: '500', 
                        color: '#1d1d1f', 
                        fontSize: '14px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: 1
                      }}>
                        {client.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <button
                          onClick={() => kickStudent(client.id)}
                          style={{
                            background: 'rgba(255, 59, 48, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.5)',
                            borderRadius: '4px',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: '600',
                            width: '18px',
                            height: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            padding: 0
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 59, 48, 1)';
                            e.currentTarget.style.transform = 'scale(1.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 59, 48, 0.7)';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          title="Kick student"
                        >
                          ×
                        </button>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: '500',
                          background: client.currentMode === 'asker' ? '#0071e3' : 
                                     client.currentMode === 'answerer' ? '#34c759' : 
                                     client.currentMode === 'challenging' ? '#FF9500' :
                                     '#8e8e93',
                          color: '#1d1d1f'
                        }}>
                          {client.currentMode === 'asker' ? 'Q' : 
                           client.currentMode === 'answerer' ? 'A' : 
                           client.currentMode === 'challenging' ? 'C' : '•'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'rgba(29, 29, 31, 0.7)', textAlign: 'center', padding: '12px 0', fontSize: '14px' }}>
                  No students connected
                </p>
              )}
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.7)',
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                flexShrink: 0
              }}>
                <QRCodeSVG 
                  value={window.location.origin} 
                  size={100}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>
          </div>
        </Transition>
      </div>

      {/* Main Content Grid - 3 columns with Recent Activity spanning 2 rows */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: '20px',
        flex: 1,
        minHeight: 0
      }}>
        {/* AI Mind - spans 2 columns and 2 rows on the left */}
        <div style={{ gridColumn: '1 / 3', gridRow: '1 / 3', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <LLMDisplay gameState={gameState} />
        </div>

        {/* Recent Activity - spans 2 rows on the right */}
        <div style={{ gridColumn: '3', gridRow: '1 / 3', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Activity Log */}
          <div className="card" style={{
            padding: '20px',
            flex: 1,
            minHeight: 0
          }}>
            <h3 style={{ 
              marginBottom: '16px', 
              color: '#1d1d1f',
              fontSize: '17px',
              fontWeight: '600',
              letterSpacing: '-0.01em'
            }}>
              Recent Activity
            </h3>
            <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
              {/* Starred Q&A Pairs Section */}
              {gameState?.starredQAPairs && gameState.starredQAPairs.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#86868b',
                    marginBottom: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    ⭐ Starred Q&A Pairs
                  </div>
                  {gameState.starredQAPairs.slice(0, 3).map((pair) => (
                    <div
                      key={pair.id}
                      style={{
                        padding: '14px',
                        background: 'rgba(255, 204, 0, 0.15)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 204, 0, 0.3)',
                        marginBottom: '10px',
                        borderRadius: '10px',
                        boxShadow: '0 2px 8px rgba(255, 204, 0, 0.1)',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 204, 0, 0.25)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 204, 0, 0.15)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#8B6914',
                        fontWeight: '600',
                        marginBottom: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>{pair.studentName}</span>
                        <span>⭐</span>
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        fontWeight: '500', 
                        color: '#1d1d1f',
                        marginBottom: '6px',
                        lineHeight: '1.4'
                      }}>
                        Q: {pair.question}
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        color: '#86868b',
                        lineHeight: '1.4',
                        paddingTop: '6px',
                        borderTop: '1px solid rgba(0, 0, 0, 0.08)'
                      }}>
                        A: {pair.answer}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Regular Activity Log */}
              {activityLog.length > 0 ? (
                activityLog.slice(0, 5).map((log, idx) => (
                  <Transition
                    key={idx}
                    show={true}
                    appear={true}
                    enter="transition-all duration-300"
                    enterFrom="opacity-0 translate-x-4"
                    enterTo="opacity-100 translate-x-0"
                  >
                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.7)',
                        marginBottom: '8px',
                        borderRadius: '10px',
                        color: '#1d1d1f',
                        transition: 'all 0.2s',
                        fontSize: '14px',
                        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.7)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.4)';
                      }}
                    >
                      {log.type === 'training_data_added' && (
                        <div style={{ lineHeight: '1.5' }}>
                          <div style={{ fontWeight: '500', marginBottom: '4px', color: '#1d1d1f' }}>
                            Q: {log.data.question.substring(0, 50)}...
                          </div>
                          <div style={{ color: '#86868b', fontSize: '13px' }}>
                            A: {log.data.answer.substring(0, 50)}...
                          </div>
                        </div>
                      )}
                      {log.type === 'llm_evolved' && (
                        <div style={{ fontWeight: '500', color: '#0071e3' }}>
                          🧬 LLM Evolved! (Gen {log.evolutionCount}) - {log.personality}
                        </div>
                      )}
                      {log.type === 'challenge_failed' && (
                        <div style={{ color: '#ff3b30', fontWeight: '500' }}>
                          <div style={{ marginBottom: '4px' }}>
                            ⚠️ {log.message}
                          </div>
                          {log.corruptedData && (
                            <div style={{ fontSize: '13px', color: '#86868b', fontWeight: '400', marginTop: '6px', padding: '8px', background: 'rgba(255, 59, 48, 0.1)', borderRadius: '6px' }}>
                              <div><strong>Q:</strong> {log.corruptedData.question}</div>
                              <div style={{ marginTop: '4px' }}><strong>A:</strong> {log.corruptedData.answer}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {log.type === 'challenge_success' && (
                        <div style={{ color: '#34c759', fontWeight: '500' }}>
                          ✅ {log.message}
                        </div>
                      )}
                      {log.type === 'llm_primed' && (
                        <div style={{ fontWeight: '500', color: '#ff9500' }}>
                          <div style={{ marginBottom: '4px' }}>
                            🧠 AI Mind Synced ({log.dataSize} training items)
                          </div>
                          {log.thought && (
                            <div style={{ fontSize: '13px', color: '#86868b', fontWeight: '400', fontStyle: 'italic' }}>
                              "{log.thought.substring(0, 100)}{log.thought.length > 100 ? '...' : ''}"
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </Transition>
                ))
              ) : (
                <p style={{ color: 'rgba(29, 29, 31, 0.7)', textAlign: 'center', padding: '20px', fontSize: '15px' }}>
                  No activity yet
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onClose={() => setShowResetDialog(false)} style={{ position: 'fixed', zIndex: 9999 }}>
        {/* Backdrop */}
        <Transition
          show={showResetDialog}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9998
          }} aria-hidden="true" />
        </Transition>

        {/* Dialog Panel */}
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 9999
        }}>
          <Transition
            show={showResetDialog}
            enter="transition-all duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="transition-all duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel style={{
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(60px) saturate(200%)',
              WebkitBackdropFilter: 'blur(60px) saturate(200%)',
              padding: '32px',
              borderRadius: '20px',
              maxWidth: '500px',
              width: '100%',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.6)'
            }}>
              <Dialog.Title style={{
                fontSize: '28px',
                fontWeight: '600',
                color: '#1d1d1f',
                marginBottom: '12px',
                letterSpacing: '-0.02em'
              }}>
                Reset AI Knowledge?
              </Dialog.Title>
              <Dialog.Description style={{
                color: '#86868b',
                fontSize: '17px',
                lineHeight: '1.5',
                marginBottom: '24px'
              }}>
                This will permanently delete all AI knowledge and training data. This action cannot be undone.
              </Dialog.Description>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowResetDialog(false)}
                  style={{
                    padding: '12px 24px',
                    fontSize: '15px',
                    fontWeight: '500',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.4)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    color: '#1d1d1f',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.7)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'rgba(255, 255, 255, 0.4)';
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReset}
                  style={{
                    padding: '12px 24px',
                    fontSize: '15px',
                    fontWeight: '500',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.7), rgba(255, 45, 85, 0.7))',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    color: '#1d1d1f',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 16px rgba(255, 59, 48, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
                  }}
                  onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
                  onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                >
                  Reset Everything
                </button>
              </div>
            </Dialog.Panel>
          </Transition>
        </div>
      </Dialog>
    </div>
  );
};

export default TeacherDashboard;
