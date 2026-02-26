import React, { useState, useEffect, useRef } from 'react';

const DenoiseChallenge = ({ challenge, onComplete }) => {
  const [phase, setPhase] = useState('intro'); // 'intro', 'active', 'complete'
  const [frequency, setFrequency] = useState(0.5);
  const [amplitude, setAmplitude] = useState(0.5);
  const [signalQuality, setSignalQuality] = useState(0);
  const [particles, setParticles] = useState([]);
  const animationRef = useRef(null);
  const canvasRef = useRef(null);

  // Generate signal parameters internally
  const [targetSignal] = useState(() => ({
    signalStrength: Math.random(),
    targetFrequency: Math.random(),
    tolerance: 0.1
  }));

  // Inject responsive CSS
  useEffect(() => {
    const styleId = 'denoise-challenge-responsive-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        /* Ensure range sliders are touch-friendly on all devices */
        .denoise-slider {
          -webkit-appearance: none;
          appearance: none;
          background: #ddd;
          outline: none;
          transition: all 0.2s;
          touch-action: none;
          cursor: pointer;
          border-radius: 6px;
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
        }
        
        .denoise-slider:hover {
          background: #ccc;
        }
        
        .denoise-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 28px;
          height: 28px;
          background: #fff;
          cursor: pointer;
          border-radius: 50%;
          box-shadow: 0 3px 12px rgba(0,0,0,0.3);
          border: 2px solid #999;
          transition: all 0.2s ease;
        }
        
        .denoise-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          border-color: #666;
        }
        
        .denoise-slider::-webkit-slider-thumb:active {
          transform: scale(1.05);
          border-color: #333;
        }
        
        .denoise-slider::-moz-range-thumb {
          width: 28px;
          height: 28px;
          background: #fff;
          cursor: pointer;
          border-radius: 50%;
          box-shadow: 0 3px 12px rgba(0,0,0,0.3);
          border: 2px solid #999;
          transition: all 0.2s ease;
        }
        
        .denoise-slider::-moz-range-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          border-color: #666;
        }
        
        .denoise-slider::-moz-range-thumb:active {
          transform: scale(1.05);
          border-color: #333;
        }
        
        .denoise-slider::-webkit-slider-runnable-track {
          height: 10px;
          border-radius: 5px;
        }
        
        .denoise-slider::-moz-range-track {
          height: 10px;
          border-radius: 5px;
        }
        
        .denoise-button {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          min-height: 48px; /* Minimum touch target */
        }
        
        /* Extra small devices (phones in portrait) */
        @media (max-width: 400px) {
          .denoise-container {
            font-size: 14px;
          }
          .denoise-title {
            font-size: 1.2rem !important;
            margin-bottom: 6px !important;
          }
          .denoise-description {
            font-size: 0.8rem !important;
            margin-bottom: 12px !important;
          }
          .denoise-visualization {
            height: 140px !important;
            margin-bottom: 12px !important;
          }
          .denoise-slider {
            min-height: 48px;
            padding: 20px 0;
            margin: -20px 0;
          }
        }
        
        /* Small landscape devices (phones in landscape, small tablets) */
        @media (max-width: 850px) and (max-height: 520px) {
          .denoise-visualization {
            height: 120px !important;
          }
          .denoise-title {
            font-size: 1.1rem !important;
            margin-bottom: 4px !important;
          }
          .denoise-description {
            font-size: 0.75rem !important;
            margin-bottom: 8px !important;
          }
        }
        
        /* Touch device optimizations */
        @media (hover: none) and (pointer: coarse) {
          .denoise-slider {
            min-height: 48px;
          }
          .denoise-button {
            min-height: 52px;
          }
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    };
  }, []);

  // Calculate signal quality
  useEffect(() => {
    const freqDiff = Math.abs(frequency - targetSignal.targetFrequency);
    const ampDiff = Math.abs(amplitude - targetSignal.signalStrength);
    const quality = Math.max(0, 1 - (freqDiff + ampDiff) / 2);
    setSignalQuality(quality);
  }, [frequency, amplitude, targetSignal]);

  // Animated particle background
  useEffect(() => {
    if (phase !== 'active') return;
    
    const particleCount = 30;
    const newParticles = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      size: Math.random() * 2 + 1
    }));
    setParticles(newParticles);

    const animate = () => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: (p.x + p.vx + 100) % 100,
        y: (p.y + p.vy + 100) % 100
      })));
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [phase]);

  const handleLock = () => {
    const success = signalQuality > 0.8;
    console.log('Denoise answer:', { 
      frequency, 
      targetFrequency: targetSignal.targetFrequency, 
      amplitude, 
      targetAmplitude: targetSignal.signalStrength, 
      signalQuality, 
      success 
    });
    onComplete(success);
  };

  const getStatusColor = () => {
    if (signalQuality > 0.8) return '#38ef7d';
    if (signalQuality > 0.5) return '#ffc107';
    return '#ee0979';
  };

  const getStatusText = () => {
    if (signalQuality > 0.8) return '✓ SIGNAL LOCKED';
    if (signalQuality > 0.6) return '⚡ ALMOST THERE...';
    if (signalQuality > 0.4) return '⚠ TUNING...';
    return '✗ SIGNAL WEAK';
  };

  if (phase === 'intro') {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: 'clamp(12px, 3vw, 30px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{
          maxWidth: '800px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          borderRadius: 'clamp(12px, 3vw, 20px)',
          padding: 'clamp(20px, 4vw, 40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 'clamp(20px, 4vw, 30px)' }}>
            <div style={{ fontSize: 'clamp(2.5rem, 10vw, 4rem)', marginBottom: 'clamp(12px, 3vw, 20px)' }}>
              🤖
            </div>
            <h2 style={{ 
              fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', 
              margin: '0 0 clamp(10px, 2vw, 15px) 0',
              color: 'white',
              fontWeight: 'bold'
            }}>
              Denoising BERT
            </h2>
            <p style={{ 
              fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', 
              color: '#94a3b8',
              lineHeight: '1.5',
              margin: '0'
            }}>
              Filter the noise to train your model!
            </p>
          </div>

          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 'clamp(10px, 2.5vw, 15px)',
            padding: 'clamp(15px, 3vw, 25px)',
            marginBottom: 'clamp(15px, 3vw, 25px)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            textAlign: 'left',
            color: 'white',
            fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
            lineHeight: '1.6'
          }}>
            <p style={{ marginTop: 0 }}><strong style={{ color: '#a78bfa' }}>🎯 Your Mission:</strong> Tune frequency and amplitude to clean the signal</p>
            <p><strong style={{ color: '#a78bfa' }}>📊 Signal Quality:</strong> Must reach 80%+ to lock in</p>
            <p><strong style={{ color: '#a78bfa' }}>🎚️ Controls:</strong> Adjust both sliders to find the sweet spot</p>
            <p><strong style={{ color: '#a78bfa' }}>⚡ Watch:</strong> Green zone = good, red particles = noise</p>
            <p style={{ marginBottom: 0 }}><strong style={{ color: '#a78bfa' }}>✅ Win Condition:</strong> Lock signal for 2 seconds</p>
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
              transition: 'transform 0.2s',
              minHeight: '48px',
              boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)'
            }}
            onMouseEnter={e => e.target.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
          >
            🚀 Start Tuning
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="denoise-container" style={{ 
      userSelect: 'none', 
      maxWidth: '100%', 
      overflow: 'hidden', 
      padding: 'clamp(10px, 2vw, 20px)',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
    }}>
      {/* Animated title */}
      <h3 className="denoise-title" style={{ 
        marginBottom: '8px', 
        color: 'white',
        fontSize: 'clamp(1.1rem, 4vw, 1.8rem)',
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 'clamp(0.5px, 0.2vw, 1px)',
        textTransform: 'uppercase',
        wordBreak: 'break-word',
        lineHeight: '1.2'
      }}>
        🤖 Denoising BERT
      </h3>
      
      <p className="denoise-description" style={{ 
        marginBottom: '12px', 
        color: '#94a3b8',
        textAlign: 'center',
        fontSize: 'clamp(0.75rem, 2vw, 0.95rem)',
        fontWeight: '500',
        padding: '0 8px',
        lineHeight: '1.3'
      }}>
        Clean the corrupted neural signal to restore the AI!
      </p>

      {/* Enhanced signal visualization with particle background */}
      <div className="denoise-visualization" style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        height: 'clamp(140px, 25vh, 200px)',
        maxHeight: '200px',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        marginBottom: '12px',
        position: 'relative',
        overflow: 'hidden',
        border: `clamp(2px, 0.5vw, 3px) solid ${getStatusColor()}`,
        boxShadow: `0 4px 16px rgba(0,0,0,0.3), inset 0 0 20px ${getStatusColor()}22`,
        transition: 'all 0.3s ease',
        width: '100%'
      }}>
        {/* Animated particle background */}
        <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
          {particles.map((p, i) => (
            <circle
              key={i}
              cx={`${p.x}%`}
              cy={`${p.y}%`}
              r={p.size}
              fill={getStatusColor()}
              opacity={0.3}
            />
          ))}
        </svg>

        {/* Signal waveform */}
        <svg width="100%" height="100%" viewBox="0 0 500 200" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0 }}>
          {/* Grid lines */}
          {Array.from({ length: 10 }).map((_, i) => (
            <line
              key={`grid-${i}`}
              x1="0"
              x2="500"
              y1={(i / 10) * 200}
              y2={(i / 10) * 200}
              stroke={getStatusColor()}
              strokeOpacity="0.1"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          
          {/* Signal path */}
          <path
            d={Array.from({ length: 100 }).map((_, i) => {
              const x = (i / 100) * 500;
              const noise = (1 - signalQuality) * (Math.sin(i * 0.5) * 30);
              const signal = Math.sin((i / 100) * Math.PI * 8 * frequency) * amplitude * 70;
              const y = 100 + signal + noise;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            stroke={getStatusColor()}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            filter="drop-shadow(0 0 8px currentColor)"
            vectorEffect="non-scaling-stroke"
            style={{ 
              transition: 'stroke 0.3s ease',
              opacity: 0.9
            }}
          />

          {/* Signal dots */}
          {Array.from({ length: 50 }).map((_, i) => {
            const x = (i / 50) * 500;
            const noise = (1 - signalQuality) * (Math.sin(i * 0.3) * 30);
            const signal = Math.sin((i / 50) * Math.PI * 8 * frequency) * amplitude * 70;
            const y = 100 + signal + noise;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={signalQuality > 0.8 ? "4" : "3"}
                fill={getStatusColor()}
                opacity={signalQuality > 0.8 ? 1 : 0.7}
                vectorEffect="non-scaling-stroke"
                style={{ 
                  filter: signalQuality > 0.8 ? `drop-shadow(0 0 4px ${getStatusColor()})` : 'none',
                  transition: 'all 0.3s ease'
                }}
              />
            );
          })}
        </svg>
        
        {/* Status badge */}
        <div style={{
          position: 'absolute',
          top: 'clamp(4px, 1vw, 8px)',
          right: 'clamp(4px, 1vw, 8px)',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          padding: 'clamp(4px, 1.5vw, 8px) clamp(8px, 2vw, 12px)',
          borderRadius: 'clamp(4px, 1vw, 8px)',
          fontWeight: 'bold',
          fontSize: 'clamp(0.65rem, 1.8vw, 0.85rem)',
          color: getStatusColor(),
          border: `2px solid ${getStatusColor()}`,
          boxShadow: `0 2px 8px ${getStatusColor()}44`,
          transition: 'all 0.3s ease',
          whiteSpace: 'nowrap',
          maxWidth: 'calc(100% - 16px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {getStatusText()}
        </div>

        {/* Quality meter */}
        <div style={{
          position: 'absolute',
          bottom: 'clamp(4px, 1vw, 8px)',
          left: 'clamp(4px, 1vw, 8px)',
          right: 'clamp(4px, 1vw, 8px)',
          background: 'rgba(0, 0, 0, 0.6)',
          borderRadius: 'clamp(4px, 1vw, 8px)',
          padding: 'clamp(4px, 1vw, 6px)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: '3px',
            fontSize: 'clamp(0.65rem, 1.8vw, 0.8rem)',
            color: '#fff',
            gap: '6px',
            alignItems: 'center'
          }}>
            <span>Signal Quality</span>
            <span style={{ fontWeight: 'bold', color: getStatusColor(), fontSize: 'clamp(0.7rem, 2vw, 0.85rem)' }}>
              {(signalQuality * 100).toFixed(0)}%
            </span>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            height: 'clamp(5px, 1.2vw, 7px)',
            borderRadius: '4px',
            overflow: 'hidden',
            minHeight: '4px'
          }}>
            <div style={{
              width: `${signalQuality * 100}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${getStatusColor()} 0%, ${getStatusColor()}cc 100%)`,
              transition: 'width 0.3s ease',
              boxShadow: `0 0 10px ${getStatusColor()}`
            }} />
          </div>
        </div>
      </div>

      {/* Enhanced sliders */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'clamp(8px, 2vw, 12px)', 
          fontWeight: '700', 
          color: 'white',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.05rem)',
          gap: '8px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span>⚡ Frequency</span>
          <span style={{ 
            color: '#e0e0e0',
            fontFamily: 'monospace',
            fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {frequency.toFixed(2)}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={frequency}
          onChange={(e) => setFrequency(parseFloat(e.target.value))}
          className="denoise-slider"
          style={{ 
            width: '100%',
            height: '10px',
            borderRadius: '5px',
            outline: 'none',
            margin: '0',
            padding: '12px 0'
          }}
        />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 'clamp(8px, 2vw, 12px)', 
          fontWeight: '700', 
          color: 'white',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.05rem)',
          gap: '8px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          <span>📊 Amplitude</span>
          <span style={{ 
            color: '#e0e0e0',
            fontFamily: 'monospace',
            fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {amplitude.toFixed(2)}
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={amplitude}
          onChange={(e) => setAmplitude(parseFloat(e.target.value))}
          className="denoise-slider"
          style={{ 
            width: '100%',
            height: '10px',
            borderRadius: '5px',
            outline: 'none',
            margin: '0',
            padding: '12px 0'
          }}
        />
      </div>

      {/* Enhanced lock button */}
      <button
        onClick={handleLock}
        disabled={signalQuality <= 0.8}
        className="denoise-button"
        style={{
          width: '100%',
          background: signalQuality > 0.8 
            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
            : 'rgba(255, 255, 255, 0.1)',
          color: 'white',
          padding: 'clamp(12px, 2.5vw, 16px)',
          fontSize: 'clamp(0.85rem, 2.5vw, 1.1rem)',
          fontWeight: '700',
          borderRadius: 'clamp(8px, 2vw, 12px)',
          border: signalQuality > 0.8 ? 'none' : '1px solid rgba(255, 255, 255, 0.2)',
          cursor: signalQuality > 0.8 ? 'pointer' : 'not-allowed',
          transition: 'all 0.3s ease',
          boxShadow: signalQuality > 0.8 
            ? '0 6px 20px rgba(16, 185, 129, 0.4)' 
            : '0 3px 10px rgba(0,0,0,0.2)',
          transform: signalQuality > 0.8 ? 'scale(1.01)' : 'scale(1)',
          textTransform: 'uppercase',
          letterSpacing: 'clamp(0.5px, 0.2vw, 1px)',
          opacity: signalQuality > 0.8 ? 1 : 0.7,
          wordBreak: 'break-word',
          lineHeight: '1.3',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseEnter={(e) => {
          if (signalQuality > 0.8) {
            e.target.style.transform = 'scale(1.03)';
            e.target.style.boxShadow = '0 10px 28px rgba(56, 239, 125, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = signalQuality > 0.8 ? 'scale(1.01)' : 'scale(1)';
          e.target.style.boxShadow = signalQuality > 0.8 
            ? '0 6px 20px rgba(56, 239, 125, 0.4)' 
            : '0 3px 10px rgba(0,0,0,0.2)';
        }}
        onTouchStart={(e) => {
          if (signalQuality > 0.8) {
            e.target.style.transform = 'scale(0.98)';
          }
        }}
        onTouchEnd={(e) => {
          e.target.style.transform = signalQuality > 0.8 ? 'scale(1.01)' : 'scale(1)';
        }}
      >
        {signalQuality > 0.8 ? '🔒 LOCK SIGNAL' : '⚠ ADJUST SIGNAL (80%+ REQUIRED)'}
      </button>
    </div>
  );
};

export default DenoiseChallenge;
