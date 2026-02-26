import React, { useState, useRef, useEffect } from 'react';

const LLMDisplay = ({ gameState, sendMessage }) => {
  const [confirmIndex, setConfirmIndex] = useState(null);
  const scrollRef = useRef(null);
  const isHovered = useRef(false);
  const scrollDir = useRef(1); // 1 = down, -1 = up

  useEffect(() => {
    if (!sendMessage) return; // only teacher view
    const speed = 0.2; // pixels per frame
    let rafId;
    let accumulated = 0;
    const step = () => {
      const el = scrollRef.current;
      if (el && !isHovered.current) {
        accumulated += speed;
        const pixels = Math.floor(accumulated);
        if (pixels >= 1) {
          el.scrollTop += pixels * scrollDir.current;
          accumulated -= pixels;
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) scrollDir.current = -1;
        if (el.scrollTop <= 0) scrollDir.current = 1;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [sendMessage]);
  // Use the training data length to create a unique key that changes when content updates
  // This ensures the animation restarts whenever new Q&A pairs are added
  const animationKey = `${gameState?.trainingData?.length || 0}-${gameState?.llmKnowledge?.length || 0}`;
  
  // Calculate animation duration based on number of items
  // ~5 seconds per item to maintain consistent scroll speed
  const itemCount = gameState?.llmKnowledge?.length || 0;
  const animationDuration = Math.max(15, itemCount * 5); // Minimum 15s, scales with items
  
  return (
    <div className="card" style={{ 
      padding: '20px',
      flex: 1,
      minHeight: 0,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{ 
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#1d1d1f', letterSpacing: '-0.02em' }}>
            AI Mind
          </h2>
          {gameState?.evolutionCount > 0 && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(20px)',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '13px',
              color: '#1d1d1f',
              fontWeight: '500',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)'
            }}>
              Gen {gameState.evolutionCount}
            </div>
          )}
        </div>
        <div style={{
          fontSize: '14px',
          color: '#86868b',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span style={{ opacity: 0.7 }}>Base Model:</span>
          <span style={{ 
            color: '#1d1d1f',
            background: 'rgba(255, 255, 255, 0.5)',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'monospace'
          }}>
            {gameState?.llmModel || 'gemma3:270m'}
          </span>
        </div>
      </div>

      <style>
        {`
          @keyframes scrollKnowledge {
            0% {
              transform: translateY(0);
            }
            100% {
              transform: translateY(-50%);
            }
          }
          .knowledge-scroll-${itemCount} {
            animation: scrollKnowledge ${animationDuration}s linear infinite;
          }
          .knowledge-scroll-${itemCount}:hover {
            animation-play-state: paused;
          }
        `}
      </style>

      {/* Scrolling Session Activity */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '20px',
        border: '1px solid rgba(255, 255, 255, 0.7)',
        boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '12px', color: '#1d1d1f', flexShrink: 0 }}>
          Session Activity
        </div>
        {gameState?.llmKnowledge && gameState.llmKnowledge.length > 0 ? (
          sendMessage ? (
          /* Teacher view: plain scrollable list with gentle auto-scroll */
          <div
            ref={scrollRef}
            onMouseEnter={() => { isHovered.current = true; }}
            onMouseLeave={() => { isHovered.current = false; }}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maskImage: 'linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 8%, black 92%, transparent)'
            }}>
            {gameState.llmKnowledge.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px',
                  background: confirmIndex === idx ? 'rgba(255, 59, 48, 0.08)' : 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '8px',
                  border: confirmIndex === idx ? '1px solid rgba(255, 59, 48, 0.3)' : '1px solid rgba(255, 255, 255, 0.7)',
                  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
                  position: 'relative',
                  flexShrink: 0
                }}
              >
                <div style={{ fontSize: '13px', color: '#1d1d1f', marginBottom: '4px', fontWeight: '500', paddingRight: '28px' }}>
                  <strong>Q:</strong> {item.q}
                </div>
                <div style={{ fontSize: '13px', color: '#86868b' }}>
                  <strong>A:</strong> {item.a}
                </div>
                {confirmIndex === idx ? (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <button
                      onClick={() => {
                        sendMessage({ type: 'remove_knowledge_item', index: idx });
                        setConfirmIndex(null);
                      }}
                      style={{
                        flex: 1, padding: '4px 8px',
                        background: 'rgba(255, 59, 48, 0.85)', color: '#fff',
                        border: 'none', borderRadius: '6px',
                        fontSize: '12px', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setConfirmIndex(null)}
                      style={{
                        flex: 1, padding: '4px 8px',
                        background: 'rgba(0,0,0,0.06)', color: '#1d1d1f',
                        border: 'none', borderRadius: '6px',
                        fontSize: '12px', cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmIndex(idx)}
                    title="Remove this entry"
                    style={{
                      position: 'absolute', top: '8px', right: '8px',
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '14px', color: '#86868b',
                      lineHeight: 1, padding: '2px 4px', borderRadius: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ff3b30'}
                    onMouseLeave={e => e.currentTarget.style.color = '#86868b'}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          ) : (
          /* Student view: auto-scrolling animation */
          <div style={{
            flex: 1,
            overflowY: 'hidden',
            overflowX: 'hidden',
            position: 'relative',
            maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
          }}>
            <div 
              key={animationKey}
              className={`knowledge-scroll-${itemCount}`} 
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
            >
              {/* Original list */}
              {gameState.llmKnowledge.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                  }}
                >
                  <div style={{ fontSize: '13px', color: '#1d1d1f', marginBottom: '4px', fontWeight: '500' }}>
                    <strong>Q:</strong> {item.q}
                  </div>
                  <div style={{ fontSize: '13px', color: '#86868b' }}>
                    <strong>A:</strong> {item.a}
                  </div>
                </div>
              ))}
              {/* Duplicate list for seamless loop */}
              {gameState.llmKnowledge.map((item, idx) => (
                <div
                  key={`${idx}-duplicate`}
                  style={{
                    padding: '12px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.7)',
                    boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)'
                  }}
                >
                  <div style={{ fontSize: '13px', color: '#1d1d1f', marginBottom: '4px', fontWeight: '500' }}>
                    <strong>Q:</strong> {item.q}
                  </div>
                  <div style={{ fontSize: '13px', color: '#86868b' }}>
                    <strong>A:</strong> {item.a}
                  </div>
                </div>
              ))}
            </div>
          </div>
          ) /* end student animation branch */
        ) : (
          <div style={{
            minHeight: '150px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '17px',
            textAlign: 'center',
            fontStyle: 'italic',
            color: '#86868b'
          }}>
            I know nothing yet. Feed me knowledge!
          </div>
        )}
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr', 
        gap: '16px',
        flexShrink: 0
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.4)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.7)',
          boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '13px', opacity: 0.6, color: '#1d1d1f' }}>Knowledge Base</div>
          <div style={{ fontSize: '20px', fontWeight: '600', marginTop: '4px', color: '#1d1d1f' }}>
            {gameState?.llmKnowledge?.length || 0} items
          </div>
        </div>
      </div>
    </div>
  );
};

export default LLMDisplay;
