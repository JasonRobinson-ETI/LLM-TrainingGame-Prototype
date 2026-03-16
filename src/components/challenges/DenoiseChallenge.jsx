import React, { useState, useEffect, useRef, useCallback } from 'react';
import ChallengeIntro from './ChallengeIntro';

// Pool of clean sentences related to AI / LLM topics (longer sentences = more scanning)
const SENTENCE_POOL = [
  'Language models learn patterns from very large text datasets collected from the internet',
  'Training data quality directly determines how well an artificial intelligence system performs',
  'Neural networks carefully adjust their internal weights during the learning and training process',
  'Tokenization breaks raw text into smaller pieces so the model can process them efficiently',
  'The attention mechanism helps the model focus on the most relevant words in a sentence',
  'Clean and accurate data is absolutely essential for reliable model predictions and outputs',
  'Transformer models can process all the words in a sentence at the same time in parallel',
  'Bias hidden in training data can lead to unfair and discriminatory outputs from the model',
  'Fine tuning takes a general pretrained model and adapts it to work on specific tasks',
  'Word embeddings represent each word as a dense vector of numbers in high dimensional space',
  'The language model generates its output text one single token at a time from left to right',
  'Reinforcement learning from human feedback helps align the model with what people actually want',
  'The context window sets a hard limit on how much text the model can remember at once',
  'Data preprocessing carefully removes formatting errors and duplicates before training can begin',
  'Overfitting is a problem that happens when a model simply memorizes its training data',
  'Prompt engineering is the practice of crafting inputs that guide the model to better answers',
  'Gradient descent is the algorithm that optimizes the model parameters step by step over time',
  'Larger models with more parameters can capture increasingly complex patterns in natural language',
  'Researchers use validation sets to check whether the model generalizes beyond its training examples',
  'Safety filters screen model outputs to prevent harmful or misleading content from reaching users',
];

// Noise tokens that look obviously wrong / corrupted
const NOISE_TOKENS = [
  '###', '@@@', '$$$', '%%%', '***', '&&&', '!!!',
  '▓▓▓', '░░░', '█▒█', '◈◈◈', '⊗⊗⊗',
  'xJ7q', 'p0#k', 'zZ!f', 'q$9m', 'r%%w',
  '0x3F', 'NaN', 'NULL', '\\err', '<brk>',
  '🔴ERR', '⚠BUG', '💀BAD',
];

/**
 * Injects noise tokens into a sentence.
 * Returns an array of { text, isNoise, removed } objects.
 */
function corruptSentence(sentence) {
  const words = sentence.split(' ');
  const tokens = words.map(w => ({ text: w, isNoise: false, removed: false }));

  // Insert 5-8 noise tokens at random positions
  const noiseCount = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < noiseCount; i++) {
    const noise = NOISE_TOKENS[Math.floor(Math.random() * NOISE_TOKENS.length)];
    const pos = Math.floor(Math.random() * (tokens.length + 1));
    tokens.splice(pos, 0, { text: noise, isNoise: true, removed: false });
  }
  return tokens;
}

const TOTAL_ROUNDS = 5;
const REQUIRED_CLEAN = 4; // must clean at least 4 out of 5
const MAX_MISTAKES_PER_ROUND = 3;
const TAP_COOLDOWN_MS = 400; // prevent spam-tapping

const DenoiseChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // 'intro' | 'active' | 'complete'
  const [roundIndex, setRoundIndex] = useState(0);
  const [sentences, setSentences] = useState([]);
  const [currentTokens, setCurrentTokens] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [roundsClean, setRoundsClean] = useState(0);
  const [roundFailed, setRoundFailed] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tokenIdx, type: 'correct'|'wrong' }
  const [showRoundResult, setShowRoundResult] = useState(null); // 'clean' | 'too-many-errors' | null
  const [tapCooldown, setTapCooldown] = useState(false);
  const feedbackTimeout = useRef(null);
  const cooldownTimeout = useRef(null);
  const roundAdvanced = useRef(false); // guard against double-advancing

  // Pick random sentences on mount
  useEffect(() => {
    const shuffled = [...SENTENCE_POOL].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, TOTAL_ROUNDS);
    setSentences(picked);
  }, []);

  // Build tokens for current round
  useEffect(() => {
    if (sentences.length === 0 || phase !== 'active') return;
    if (roundIndex >= TOTAL_ROUNDS) return;
    setCurrentTokens(corruptSentence(sentences[roundIndex]));
    setMistakes(0);
    setRoundFailed(false);
    setShowRoundResult(null);
    roundAdvanced.current = false;
  }, [roundIndex, sentences, phase]);

  const noiseRemaining = currentTokens.filter(t => t.isNoise && !t.removed).length;

  const advanceRound = useCallback((wasClean) => {
    // Prevent double-fire from effect re-runs
    if (roundAdvanced.current) return;
    roundAdvanced.current = true;

    setRoundsClean(prev => {
      const newRoundsClean = wasClean ? prev + 1 : prev;

      setRoundIndex(prevRound => {
        if (prevRound + 1 >= TOTAL_ROUNDS) {
          // Game over
          const success = newRoundsClean >= REQUIRED_CLEAN;
          setPhase('complete');
          setTimeout(() => onComplete(success), 600);
        } else {
          setShowRoundResult(wasClean ? 'clean' : 'too-many-errors');
          setTimeout(() => {
            setRoundIndex(r => r + 1);
          }, 1200);
        }
        return prevRound; // don't change yet — the setTimeout above does it
      });

      return newRoundsClean;
    });
  }, [onComplete]);

  // Check if all noise removed
  useEffect(() => {
    if (phase !== 'active' || currentTokens.length === 0) return;
    if (noiseRemaining === 0 && currentTokens.some(t => t.isNoise)) {
      // All noise removed — round clean!
      advanceRound(true);
    }
  }, [noiseRemaining, currentTokens, phase, advanceRound]);

  const handleTokenTap = (idx) => {
    if (phase !== 'active' || roundFailed || showRoundResult || tapCooldown) return;
    const token = currentTokens[idx];
    if (!token || token.removed) return;

    // Start cooldown
    setTapCooldown(true);
    if (cooldownTimeout.current) clearTimeout(cooldownTimeout.current);
    cooldownTimeout.current = setTimeout(() => setTapCooldown(false), TAP_COOLDOWN_MS);

    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);

    if (token.isNoise) {
      // Correct — remove noise
      setCurrentTokens(prev =>
        prev.map((t, i) => (i === idx ? { ...t, removed: true } : t))
      );
      setFeedback({ tokenIdx: idx, type: 'correct' });
    } else {
      // Mistake — tapped a clean word
      const newMistakes = mistakes + 1;
      setMistakes(newMistakes);
      setFeedback({ tokenIdx: idx, type: 'wrong' });

      if (newMistakes >= MAX_MISTAKES_PER_ROUND) {
        setRoundFailed(true);
        setTimeout(() => advanceRound(false), 1000);
      }
    }

    feedbackTimeout.current = setTimeout(() => setFeedback(null), 500);
  };

  // ===== Intro =====
  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={() => setPhase('active')}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '🧹',
            title: 'Training Data is Messy!',
            description:
              'Before an LLM learns, humans clean its training data — removing corrupted text, broken symbols, and garbage characters.',
          },
          {
            emoji: '👆',
            title: 'Tap the Noise Tokens',
            description:
              'You\'ll see a sentence with noisy junk tokens mixed in. Tap ONLY the noise to remove it — don\'t tap real words!',
            demo: (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '320px', margin: '0 auto' }}>
                {['Language', '###', 'models', '@@@', 'learn'].map((t, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      background: ['###', '@@@'].includes(t)
                        ? 'rgba(239, 68, 68, 0.25)'
                        : 'rgba(255,255,255,0.1)',
                      color: ['###', '@@@'].includes(t) ? '#f87171' : '#e2e8f0',
                      border: ['###', '@@@'].includes(t)
                        ? '2px solid rgba(239, 68, 68, 0.5)'
                        : '1px solid rgba(255,255,255,0.2)',
                      textDecoration: ['###', '@@@'].includes(t) ? 'line-through' : 'none',
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            ),
          },
          {
            emoji: '🎯',
            title: 'Clean 3 of 4 Sentences',
            description:
              `Remove all noise from each sentence. You get up to ${MAX_MISTAKES_PER_ROUND} mistakes per sentence — more than that and it fails. Clean at least ${REQUIRED_CLEAN} out of ${TOTAL_ROUNDS} to pass!`,
          },
        ]}
      />
    );
  }

  return (
    <div
      style={{
        userSelect: 'none',
        maxWidth: '100%',
        overflow: 'hidden',
        padding: 'clamp(12px, 3vw, 24px)',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* Title */}
      <h3
        style={{
          marginBottom: '4px',
          color: 'white',
          fontSize: 'clamp(1.1rem, 4vw, 1.6rem)',
          fontWeight: 700,
          textAlign: 'center',
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
          lineHeight: 1.2,
        }}
      >
        🧹 Data Cleaning
      </h3>
      <p
        style={{
          marginBottom: '14px',
          color: '#94a3b8',
          textAlign: 'center',
          fontSize: 'clamp(0.75rem, 2vw, 0.9rem)',
          fontWeight: 500,
          lineHeight: 1.3,
        }}
      >
        Tap the noise tokens to clean the training data!
      </p>

      {/* Progress bar — rounds */}
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          marginBottom: '14px',
          display: 'flex',
          gap: '6px',
          alignItems: 'center',
        }}
      >
        {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
          let bg = 'rgba(255,255,255,0.1)';
          let border = '1px solid rgba(255,255,255,0.15)';
          if (i < roundIndex || (i === roundIndex && showRoundResult)) {
            if (i < roundsClean || (i === roundIndex && showRoundResult === 'clean')) {
              bg = 'rgba(56, 239, 125, 0.35)';
              border = '1px solid #38ef7d';
            } else {
              bg = 'rgba(239, 68, 68, 0.3)';
              border = '1px solid #ef4444';
            }
          } else if (i === roundIndex) {
            bg = 'rgba(96, 165, 250, 0.3)';
            border = '2px solid #60a5fa';
          }
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: '8px',
                borderRadius: '4px',
                background: bg,
                border,
                transition: 'all 0.3s ease',
              }}
            />
          );
        })}
        <span
          style={{
            color: '#94a3b8',
            fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            marginLeft: '4px',
          }}
        >
          {roundIndex + 1}/{TOTAL_ROUNDS}
        </span>
      </div>

      {/* Mistakes indicator */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '14px',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#94a3b8', fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)' }}>
          Mistakes:
        </span>
        {Array.from({ length: MAX_MISTAKES_PER_ROUND }).map((_, i) => (
          <span
            key={i}
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: i < mistakes ? '#ef4444' : 'rgba(255,255,255,0.15)',
              border: i < mistakes ? '1px solid #f87171' : '1px solid rgba(255,255,255,0.2)',
              transition: 'all 0.25s ease',
              boxShadow: i < mistakes ? '0 0 8px rgba(239,68,68,0.5)' : 'none',
            }}
          />
        ))}
        <span
          style={{
            color: '#94a3b8',
            fontSize: 'clamp(0.65rem, 1.5vw, 0.75rem)',
            marginLeft: '4px',
          }}
        >
          ({noiseRemaining} noise left)
        </span>
      </div>

      {/* Round result overlay */}
      {showRoundResult && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            zIndex: 1000,
            animation: 'denoise-fade-in 0.3s ease',
          }}
        >
          <div
            style={{
              padding: '24px 40px',
              borderRadius: '16px',
              background:
                showRoundResult === 'clean'
                  ? 'linear-gradient(135deg, #065f46, #047857)'
                  : 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              color: 'white',
              fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
              fontWeight: 700,
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            }}
          >
            {showRoundResult === 'clean' ? '✅ Sentence Cleaned!' : '❌ Too Many Mistakes!'}
          </div>
        </div>
      )}

      {/* Token grid */}
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
          borderRadius: 'clamp(10px, 2vw, 16px)',
          padding: 'clamp(14px, 3vw, 24px)',
          border: '2px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3), inset 0 0 30px rgba(99,102,241,0.05)',
          minHeight: '180px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'clamp(6px, 1.5vw, 10px)',
          alignContent: 'flex-start',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Scanline effect */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 'inherit',
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 4px)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {currentTokens.map((token, idx) => {
          if (token.removed) {
            // Show a small gap where noise was
            return (
              <span
                key={idx}
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '36px',
                  opacity: 0.3,
                  transition: 'all 0.3s ease',
                }}
              />
            );
          }

          const isFeedbackTarget = feedback && feedback.tokenIdx === idx;
          const isCorrectFeedback = isFeedbackTarget && feedback.type === 'correct';
          const isWrongFeedback = isFeedbackTarget && feedback.type === 'wrong';

          let bg = 'rgba(255,255,255,0.08)';
          let borderColor = 'rgba(255,255,255,0.2)';
          let textColor = '#e2e8f0';
          let shadow = 'none';
          let transform = 'scale(1)';

          if (isCorrectFeedback) {
            bg = 'rgba(56, 239, 125, 0.3)';
            borderColor = '#38ef7d';
            textColor = '#38ef7d';
            shadow = '0 0 12px rgba(56,239,125,0.5)';
            transform = 'scale(0.9)';
          } else if (isWrongFeedback) {
            bg = 'rgba(239, 68, 68, 0.3)';
            borderColor = '#ef4444';
            textColor = '#f87171';
            shadow = '0 0 12px rgba(239,68,68,0.5)';
            transform = 'scale(1.05)';
          } else if (token.isNoise) {
            // Subtle noise hint: slightly different styling
            bg = 'rgba(255, 255, 255, 0.04)';
            textColor = '#a78bfa';
          }

          return (
            <button
              key={idx}
              onClick={() => handleTokenTap(idx)}
              disabled={roundFailed || !!showRoundResult}
              style={{
                padding: 'clamp(6px, 1.5vw, 10px) clamp(10px, 2vw, 16px)',
                borderRadius: '10px',
                fontSize: 'clamp(0.85rem, 2.5vw, 1.05rem)',
                fontWeight: 600,
                fontFamily: token.isNoise ? 'monospace' : 'inherit',
                background: bg,
                color: textColor,
                border: `2px solid ${borderColor}`,
                cursor: roundFailed || showRoundResult ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: shadow,
                transform,
                zIndex: 2,
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
                minHeight: '40px',
                lineHeight: 1.2,
                letterSpacing: token.isNoise ? '1px' : '0',
                opacity: roundFailed && !token.isNoise ? 1 : roundFailed ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!roundFailed && !showRoundResult) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = bg;
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {token.text}
            </button>
          );
        })}
      </div>

      {/* Clean sentence preview (fades in as noise is removed) */}
      {phase === 'active' && currentTokens.length > 0 && (
        <div
          style={{
            marginTop: '16px',
            width: '100%',
            maxWidth: '520px',
            padding: 'clamp(10px, 2vw, 16px)',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <div
            style={{
              color: '#64748b',
              fontSize: 'clamp(0.65rem, 1.5vw, 0.75rem)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              marginBottom: '6px',
            }}
          >
            Cleaned output:
          </div>
          <div
            style={{
              color: noiseRemaining === 0 ? '#38ef7d' : '#94a3b8',
              fontSize: 'clamp(0.85rem, 2.2vw, 1rem)',
              fontWeight: 500,
              lineHeight: 1.5,
              transition: 'color 0.3s ease',
              fontStyle: noiseRemaining > 0 ? 'italic' : 'normal',
            }}
          >
            {currentTokens
              .filter((t) => !t.removed)
              .map((t) => t.text)
              .join(' ')}
          </div>
        </div>
      )}

      {/* Score summary */}
      <div
        style={{
          marginTop: '14px',
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            background: 'rgba(56, 239, 125, 0.1)',
            border: '1px solid rgba(56, 239, 125, 0.3)',
            color: '#38ef7d',
            fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
            fontWeight: 600,
          }}
        >
          ✅ Cleaned: {roundsClean}/{REQUIRED_CLEAN} needed
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes denoise-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default DenoiseChallenge;
