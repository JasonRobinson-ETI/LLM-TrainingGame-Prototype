import React, { useState, useEffect } from 'react';

/**
 * ChallengeIntro — step-by-step animated walkthrough shown before a challenge.
 *
 * Props:
 *   steps    {Array<{ emoji, title, description, demo? }>}  2–4 steps
 *   onStart  {Function}  called when the student taps "LET'S GO!"
 *   accentGradient {string}  CSS gradient for the start button (optional)
 */
const ChallengeIntro = ({ steps, onStart, onTimerStart, accentGradient }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(true);      // for fade-in/out transition

  const gradient = accentGradient || 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)';
  const isLast = currentStep === steps.length - 1;

  // Inject keyframe animations once
  useEffect(() => {
    const id = 'challenge-intro-keyframes';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        @keyframes ci-slide-in {
          from { opacity: 0; transform: translateX(40px) scale(0.97); }
          to   { opacity: 1; transform: translateX(0)   scale(1);    }
        }
        @keyframes ci-pulse-btn {
          0%, 100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.7), 0 6px 30px rgba(139,92,246,0.5); }
          50%       { box-shadow: 0 0 0 16px rgba(139,92,246,0), 0 6px 30px rgba(139,92,246,0.5); }
        }
        @keyframes ci-bounce-arrow {
          0%, 100% { transform: translateX(0); }
          50%       { transform: translateX(5px); }
        }
        @keyframes ci-dot-pop {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.4); }
          100% { transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const advance = () => {
    if (!visible) return;          // already mid-transition
    if (isLast) return;
    setVisible(false);
    setTimeout(() => {
      setCurrentStep(s => s + 1);
      setVisible(true);
    }, 220);
  };

  const step = steps[currentStep];

  return (
    <div
      style={{
        padding: 'clamp(24px, 5vw, 44px) clamp(20px, 4vw, 36px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '420px',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* Animated step content */}
      <div
        key={currentStep}
        style={{
          textAlign: 'center',
          animation: 'ci-slide-in 0.35s cubic-bezier(.22,1,.36,1) both',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.2s ease',
          width: '100%',
          maxWidth: '480px',
        }}
      >
        {/* Giant emoji */}
        <div style={{
          fontSize: 'clamp(4.5rem, 16vw, 7rem)',
          lineHeight: 1,
          marginBottom: 'clamp(14px, 3vw, 22px)',
          filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.4))',
        }}>
          {step.emoji}
        </div>

        {/* Bold title — max 8 words, BIG */}
        <h2 style={{
          fontSize: 'clamp(1.7rem, 6.5vw, 2.5rem)',
          fontWeight: '900',
          color: 'white',
          margin: '0 0 clamp(10px, 2.5vw, 16px) 0',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          textShadow: '0 2px 12px rgba(0,0,0,0.5)',
        }}>
          {step.title}
        </h2>

        {/* Short description — 1-2 sentences max */}
        <p style={{
          fontSize: 'clamp(1.05rem, 3.8vw, 1.35rem)',
          color: '#cbd5e1',
          margin: '0 0 clamp(20px, 4vw, 28px) 0',
          lineHeight: 1.5,
          padding: '0 8px',
        }}>
          {step.description}
        </p>

        {/* Optional demo visual */}
        {step.demo && (
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '14px',
            padding: 'clamp(12px, 3vw, 18px)',
            marginBottom: 'clamp(20px, 4vw, 28px)',
            display: 'inline-block',
            width: '100%',
          }}>
            {step.demo}
          </div>
        )}
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: 'clamp(20px, 4vw, 28px)' }}>
        {steps.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === currentStep ? '28px' : '10px',
              height: '10px',
              borderRadius: '5px',
              background: i === currentStep
                ? '#a78bfa'
                : i < currentStep
                  ? 'rgba(167,139,250,0.4)'
                  : 'rgba(255,255,255,0.15)',
              transition: 'all 0.4s cubic-bezier(.22,1,.36,1)',
              animation: i === currentStep ? 'ci-dot-pop 0.4s ease' : 'none',
            }}
          />
        ))}
      </div>

      {/* Call-to-action */}
      {isLast ? (
        <button
          onClick={() => { onTimerStart?.(); onStart(); }}
          style={{
            padding: 'clamp(16px, 3.5vw, 22px) clamp(44px, 9vw, 70px)',
            fontSize: 'clamp(1.3rem, 4.5vw, 1.6rem)',
            fontWeight: '900',
            color: 'white',
            background: gradient,
            border: 'none',
            borderRadius: '18px',
            cursor: 'pointer',
            letterSpacing: '0.03em',
            animation: 'ci-pulse-btn 1.8s ease-in-out infinite',
            transform: 'translateZ(0)',
          }}
        >
          🚀 LET&apos;S GO!
        </button>
      ) : (
        <button
          onClick={advance}
          style={{
            padding: 'clamp(14px, 3vw, 18px) clamp(36px, 8vw, 56px)',
            fontSize: 'clamp(1.1rem, 4vw, 1.4rem)',
            fontWeight: '800',
            color: 'white',
            background: 'rgba(255,255,255,0.12)',
            border: '2px solid rgba(255,255,255,0.25)',
            borderRadius: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            letterSpacing: '0.02em',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
        >
          Next
          <span style={{ animation: 'ci-bounce-arrow 1.2s ease-in-out infinite' }}>→</span>
        </button>
      )}
    </div>
  );
};

export default ChallengeIntro;
