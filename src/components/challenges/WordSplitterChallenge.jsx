import React, { useState, useEffect, useRef } from 'react';

const WordSplitterChallenge = ({ challenge, onComplete }) => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [splits, setSplits] = useState([]);
  const [vocabulary, setVocabulary] = useState(new Set());
  const [scores, setScores] = useState([]);
  const [phase, setPhase] = useState('intro'); // 'intro', 'active', 'result'
  const [feedback, setFeedback] = useState(null);
  const [waitingForPlayer, setWaitingForPlayer] = useState(false);

  const allWords = [
    'running',
    'jumping',
    'walking',
    'unhappy',
    'unkind',
    'unfair',
    'quickly',
    'slowly',
    'happily',
    'teacher',
    'writer',
    'singer',
    'bigger',
    'smaller',
    'faster',
    'cats',
    'dogs',
    'books',
    'playing',
    'eating',
    'sleeping',
    'jumped',
    'walked',
    'talked',
    'friendship',
    'childhood',
    'freedom'
  ];

  // Select 5 random words from the full list
  const [words] = useState(() => {
    if (challenge.words) return challenge.words;
    const shuffled = [...allWords].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 5);
  });

  const currentWord = words[currentWordIndex];
  const [splitPositions, setSplitPositions] = useState([]);

  const toggleSplit = (position) => {
    if (phase !== 'active' || waitingForPlayer) return;
    
    setSplitPositions(prev => {
      if (prev.includes(position)) {
        return prev.filter(p => p !== position);
      } else {
        return [...prev, position].sort((a, b) => a - b);
      }
    });
  };

  const getTokens = () => {
    if (splitPositions.length === 0) {
      return [currentWord];
    }

    const tokens = [];
    let start = 0;
    
    splitPositions.forEach(pos => {
      tokens.push(currentWord.slice(start, pos));
      start = pos;
    });
    tokens.push(currentWord.slice(start));
    
    return tokens.filter(t => t.length > 0);
  };

  const calculateScore = (tokens) => {
    // Reusability: how many tokens already exist in vocab
    const existingCount = tokens.filter(t => vocabulary.has(t)).length;
    const reusabilityScore = tokens.length > 0 ? (existingCount / tokens.length) * 100 : 0;

    // Compression: fewer tokens = better (but not too few)
    const idealTokenCount = Math.ceil(currentWord.length / 4); // ~4 chars per token is good
    const compressionScore = Math.max(0, 100 - Math.abs(tokens.length - idealTokenCount) * 20);

    // Clarity: avoid over-splitting (single chars) or under-splitting (whole word if >10 chars)
    let clarityScore = 100;
    tokens.forEach(token => {
      if (token.length === 1) clarityScore -= 20; // Penalize single chars
    });
    if (tokens.length === 1 && currentWord.length > 10) clarityScore -= 30; // Penalize no split on long words

    clarityScore = Math.max(0, clarityScore);

    // Overall score
    const overall = Math.round((reusabilityScore * 0.4 + compressionScore * 0.4 + clarityScore * 0.2));

    return {
      overall,
      reusability: Math.round(reusabilityScore),
      compression: Math.round(compressionScore),
      clarity: Math.round(clarityScore),
      tokens
    };
  };

  const handleSubmit = () => {
    if (waitingForPlayer) return;

    const tokens = getTokens();
    const score = calculateScore(tokens);
    
    // Add tokens to vocabulary
    const newVocab = new Set(vocabulary);
    tokens.forEach(t => newVocab.add(t));
    setVocabulary(newVocab);

    // Track score
    setScores(prev => [...prev, score]);

    // Show feedback and wait for player
    setFeedback({
      tokens,
      score: score.overall,
      reusability: score.reusability,
      compression: score.compression,
      clarity: score.clarity
    });
    setWaitingForPlayer(true);
  };

  const handleContinue = () => {
    setFeedback(null);
    setWaitingForPlayer(false);
    
    if (currentWordIndex < words.length - 1) {
      setCurrentWordIndex(prev => prev + 1);
      setSplitPositions([]);
    } else {
      // Challenge complete
      showResults();
    }
  };

  const resultTimeoutRef = useRef(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    };
  }, []);

  const showResults = () => {
    setPhase('result');
    
    // Calculate final stats
    const avgScore = scores.reduce((sum, s) => sum + s.overall, 0) / scores.length;
    const totalTokens = scores.reduce((sum, s) => sum + s.tokens.length, 0);
    const avgTokensPerWord = totalTokens / scores.length;
    const compressionRatio = Math.round((1 - (vocabulary.size / (words.length * 8))) * 100); // Assume avg 8 chars
    
    // Simple majority: pass if average score is above 50%
    const success = avgScore >= 50;
    
    // Delay so the result screen is visible before the modal closes
    resultTimeoutRef.current = setTimeout(() => {
      onComplete(success);
    }, 2000);
  };

  const renderWord = () => {
    const chars = currentWord.split('');
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '2px',
        fontSize: 'clamp(1rem, 2.5vw, 1.5rem)',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        margin: '12px 0',
        maxWidth: '100%',
        overflowX: 'auto'
      }}>
        {chars.map((char, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div
                onClick={() => toggleSplit(i)}
                style={{
                  width: '3px',
                  background: splitPositions.includes(i) ? '#e74c3c' : 'rgba(255, 255, 255, 0.2)',
                  cursor: waitingForPlayer ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  alignSelf: 'stretch',
                  margin: '0 2px',
                  borderRadius: '2px',
                  opacity: splitPositions.includes(i) ? 1 : 0.3
                }}
                title={waitingForPlayer ? '' : 'Click to split here'}
              />
            )}
            <span style={{
              padding: '4px 2px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: '#e2e8f0'
            }}>
              {char}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderTokens = () => {
    const tokens = getTokens();
    return (
      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
          Current Split:
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {tokens.map((token, i) => (
            <div
              key={i}
              style={{
                padding: '6px 12px',
                background: vocabulary.has(token) 
                  ? 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)'
                  : 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
                color: '#fff',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                position: 'relative'
              }}
            >
              {token}
              {vocabulary.has(token) && (
                <span style={{ 
                  position: 'absolute', 
                  top: '-8px', 
                  right: '-8px',
                  background: '#00b894',
                  borderRadius: '50%',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem'
                }}>
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderStats = () => {
    const tokens = getTokens();
    const score = calculateScore(tokens);
    
    return (
      <div style={{
        marginTop: '16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
        gap: '8px',
        maxWidth: '100%'
      }}>
        <div style={{
          padding: '8px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Reusability</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0984e3' }}>
            {score.reusability}%
          </div>
        </div>
        <div style={{
          padding: '8px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Compression</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#00b894' }}>
            {score.compression}%
          </div>
        </div>
        <div style={{
          padding: '8px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Clarity</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#6c5ce7' }}>
            {score.clarity}%
          </div>
        </div>
      </div>
    );
  };

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
          }}>🔡 Word Splitter</h2>
          <p style={{ 
            margin: 0, 
            fontSize: 'clamp(0.9rem, 3vw, 1.2rem)', 
            color: '#94a3b8',
            lineHeight: '1.6'
          }}>
            Build an efficient tokenizer for your LLM!
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
          <p><strong style={{ color: 'white' }}>🎯 Your Mission:</strong> Split words into reusable tokens</p>
          <p><strong style={{ color: 'white' }}>📏 Goal:</strong> Balance vocabulary size with compression</p>
          <p><strong style={{ color: 'white' }}>✂️ How:</strong> Click between letters to create split points</p>
          <p><strong style={{ color: 'white' }}>💡 Strategy:</strong> Reuse common prefixes/suffixes (un-, -ing, -tion)</p>
          <p style={{ marginBottom: 0 }}><strong style={{ color: 'white' }}>✅ Win Condition:</strong> Average efficiency above 50%</p>
        </div>

        <button
          onClick={() => setPhase('active')}
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
          🚀 Start Tokenizing
        </button>
      </div>
    );
  }

  if (phase === 'result') {
    const avgScore = scores.reduce((sum, s) => sum + s.overall, 0) / scores.length;
    const totalTokens = scores.reduce((sum, s) => sum + s.tokens.length, 0);
    const avgTokensPerWord = (totalTokens / scores.length).toFixed(1);
    const compressionRatio = Math.round((1 - (vocabulary.size / (words.length * 8))) * 100);
    const efficiency = Math.round(avgScore);

    return (
      <div style={{ 
        padding: 'clamp(10px, 2vw, 20px)', 
        maxWidth: '100%', 
        overflowX: 'hidden',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          color: 'white',
          padding: 'clamp(12px, 2vw, 16px)',
          borderRadius: '12px',
          textAlign: 'center',
          marginBottom: 'clamp(12px, 2vw, 16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{ margin: '0 0 6px 0', fontSize: 'clamp(1rem, 3vw, 1.3rem)' }}>🔡 Model Efficiency Report</h2>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)' }}>Tokenization Complete!</p>
        </div>

        <div style={{
          display: 'grid',
          gap: 'clamp(10px, 2vw, 12px)'
        }}>
          <div style={{
            padding: 'clamp(12px, 2vw, 16px)',
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontWeight: 'bold', color: 'white' }}>Vocabulary Size:</span>
              <span style={{ color: vocabulary.size < 100 ? '#10b981' : '#ef4444' }}>
                {vocabulary.size} tokens
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontWeight: 'bold', color: 'white' }}>Avg Tokens per Word:</span>
              <span style={{ color: avgTokensPerWord < 3 ? '#10b981' : '#f59e0b' }}>
                {avgTokensPerWord}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontWeight: 'bold', color: 'white' }}>Compression Ratio:</span>
              <span style={{ color: compressionRatio > 50 ? '#10b981' : '#ef4444' }}>
                {compressionRatio}%
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'clamp(0.75rem, 2vw, 0.9rem)', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ fontWeight: 'bold', color: 'white' }}>Tokenizer Efficiency:</span>
              <span style={{ 
                color: efficiency >= 60 ? '#10b981' : '#ef4444',
                fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
                fontWeight: 'bold'
              }}>
                {efficiency}% {efficiency >= 60 ? '✅' : '❌'}
              </span>
            </div>
          </div>

          <div style={{
            padding: 'clamp(12px, 2vw, 14px)',
            background: efficiency >= 60 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: 'white',
            borderRadius: '12px',
            textAlign: 'center',
            fontSize: 'clamp(0.85rem, 2vw, 1rem)',
            fontWeight: 'bold',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {efficiency >= 60 && compressionRatio >= 50
              ? '🎉 Excellent tokenization! Model optimized!'
              : '📚 Keep practicing - balance compression and clarity!'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: 'clamp(10px, 2vw, 20px)', 
      maxWidth: '100%', 
      overflowX: 'hidden',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(20px)',
        color: 'white',
        padding: 'clamp(10px, 2vw, 12px)',
        borderRadius: '12px',
        marginBottom: 'clamp(10px, 2vw, 12px)',
        textAlign: 'center',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 6px 0', fontSize: 'clamp(0.95rem, 3vw, 1.15rem)' }}>🔡 Word Splitter</h3>
        <p style={{ margin: 0, fontSize: 'clamp(0.75rem, 2vw, 0.85rem)', color: '#94a3b8' }}>
          Tokenize the stream — smaller vocab = faster model!
        </p>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 'clamp(10px, 2vw, 12px)',
        fontSize: 'clamp(0.75rem, 2vw, 0.85rem)',
        flexWrap: 'wrap',
        gap: '8px',
        color: 'white'
      }}>
        <div>
          <strong>Progress:</strong> <span style={{ color: '#94a3b8' }}>{currentWordIndex + 1}/{words.length}</span>
        </div>
        <div>
          <strong>Vocab Size:</strong> <span style={{ 
            color: vocabulary.size < 50 ? '#10b981' : vocabulary.size < 100 ? '#f59e0b' : '#ef4444',
            fontWeight: 'bold'
          }}>
            {vocabulary.size}
          </span>
        </div>
      </div>

      {feedback && (
        <div style={{
          padding: 'clamp(10px, 2vw, 12px)',
          background: feedback.score >= 60
            ? 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)'
            : 'linear-gradient(135deg, #fdcb6e 0%, #e17055 100%)',
          color: '#1d1d1f',
          borderRadius: '8px',
          marginBottom: '12px',
          textAlign: 'center',
          animation: 'shake 0.3s'
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '6px' }}>
            Score: {feedback.score}%
          </div>
          <div style={{ fontSize: '0.75rem', display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <span>Reuse: {feedback.reusability}%</span>
            <span>Compress: {feedback.compression}%</span>
            <span>Clarity: {feedback.clarity}%</span>
          </div>
          <button
            onClick={handleContinue}
            style={{
              marginTop: '12px',
              padding: '8px 24px',
              background: 'rgba(255,255,255,0.3)',
              color: '#1d1d1f',
              border: '2px solid white',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.5)'}
            onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
          >
            Continue →
          </button>
        </div>
      )}

      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        padding: 'clamp(12px, 2vw, 16px)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        minHeight: '150px',
        opacity: waitingForPlayer ? 0.5 : 1,
        pointerEvents: waitingForPlayer ? 'none' : 'auto'
      }}>
        <div style={{
          fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
          color: '#94a3b8',
          textAlign: 'center',
          marginBottom: '8px'
        }}>
          Click between letters to split into tokens ▏
        </div>

        {renderWord()}
        {renderTokens()}
        {renderStats()}

        <div style={{ marginTop: 'clamp(12px, 2vw, 16px)', textAlign: 'center' }}>
          <button
            onClick={handleSubmit}
            disabled={waitingForPlayer}
            style={{
              padding: '10px 28px',
              background: waitingForPlayer 
                ? '#ccc' 
                : 'linear-gradient(135deg, #00b894 0%, #00cec9 100%)',
              color: '#1d1d1f',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: 'bold',
              cursor: waitingForPlayer ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              opacity: waitingForPlayer ? 0.5 : 1
            }}
          >
            Submit Split →
          </button>
        </div>
      </div>

      <div style={{
        marginTop: 'clamp(10px, 2vw, 12px)',
        padding: 'clamp(8px, 2vw, 10px)',
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '12px',
        fontSize: 'clamp(0.65rem, 2vw, 0.75rem)',
        color: '#94a3b8',
        border: '1px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div>💡 <strong style={{ color: 'white' }}>Tip:</strong> Common prefixes/suffixes (un-, -ing, -tion) should be separate tokens</div>
        <div style={{ marginTop: '4px' }}>⚡ Green tokens = already in vocabulary (reusable!)</div>
      </div>
    </div>
  );
};

export default WordSplitterChallenge;
