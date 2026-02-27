import React, { useState, useEffect } from 'react';
import ChallengeIntro from './ChallengeIntro';

const AttentionChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [phase, setPhase] = useState('intro'); // 'intro', 'active', 'complete'
  const [selectedWords, setSelectedWords] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [scores, setScores] = useState([]);
  
  // Multiple sentence examples — shuffled on each mount for variety
  const allSentenceExamples = [
    {
      sentence: "The cat that chased the mouse was tired",
      words: ["The", "cat", "that", "chased", "the", "mouse", "was", "tired"],
      targetWordIndex: 6,
      correctAttentions: [1]
    },
    {
      sentence: "Sarah bought a book and she loved it",
      words: ["Sarah", "bought", "a", "book", "and", "she", "loved", "it"],
      targetWordIndex: 5,
      correctAttentions: [0]
    },
    {
      sentence: "The dog barked because it saw a stranger",
      words: ["The", "dog", "barked", "because", "it", "saw", "a", "stranger"],
      targetWordIndex: 4,
      correctAttentions: [1]
    },
    {
      sentence: "My teacher said that homework helps us learn",
      words: ["My", "teacher", "said", "that", "homework", "helps", "us", "learn"],
      targetWordIndex: 6,
      correctAttentions: [4]
    },
    {
      sentence: "The pizza was delicious so I ate it all",
      words: ["The", "pizza", "was", "delicious", "so", "I", "ate", "it", "all"],
      targetWordIndex: 7,
      correctAttentions: [1]
    },
    {
      sentence: "Jake fell off his bike and hurt himself",
      words: ["Jake", "fell", "off", "his", "bike", "and", "hurt", "himself"],
      targetWordIndex: 7,
      correctAttentions: [0]
    },
    {
      sentence: "The flowers bloomed because they got enough rain",
      words: ["The", "flowers", "bloomed", "because", "they", "got", "enough", "rain"],
      targetWordIndex: 4,
      correctAttentions: [1]
    },
    {
      sentence: "Emma told her sister that she would be there",
      words: ["Emma", "told", "her", "sister", "that", "she", "would", "be", "there"],
      targetWordIndex: 5,
      correctAttentions: [0]
    },
    {
      sentence: "The students worked hard so they passed the test",
      words: ["The", "students", "worked", "hard", "so", "they", "passed", "the", "test"],
      targetWordIndex: 5,
      correctAttentions: [1]
    },
    {
      sentence: "My dog loves running but it gets tired quickly",
      words: ["My", "dog", "loves", "running", "but", "it", "gets", "tired", "quickly"],
      targetWordIndex: 5,
      correctAttentions: [1]
    },
    {
      sentence: "The chef cooked a meal and burned it slightly",
      words: ["The", "chef", "cooked", "a", "meal", "and", "burned", "it", "slightly"],
      targetWordIndex: 7,
      correctAttentions: [4]
    },
    {
      sentence: "Alex finished the race and received her award",
      words: ["Alex", "finished", "the", "race", "and", "received", "her", "award"],
      targetWordIndex: 6,
      correctAttentions: [0]
    },
    {
      sentence: "Tom ran fast but he still missed the bus",
      words: ["Tom", "ran", "fast", "but", "he", "still", "missed", "the", "bus"],
      targetWordIndex: 4,
      correctAttentions: [0]
    },
    {
      sentence: "The kitten was hungry and it meowed all night",
      words: ["The", "kitten", "was", "hungry", "and", "it", "meowed", "all", "night"],
      targetWordIndex: 5,
      correctAttentions: [1]
    },
    {
      sentence: "The old man walked slowly because his knee hurt",
      words: ["The", "old", "man", "walked", "slowly", "because", "his", "knee", "hurt"],
      targetWordIndex: 6,
      correctAttentions: [2]
    },
    {
      sentence: "Maria cooked soup and her whole family loved it",
      words: ["Maria", "cooked", "soup", "and", "her", "whole", "family", "loved", "it"],
      targetWordIndex: 8,
      correctAttentions: [2]
    },
    {
      sentence: "The window shattered and nobody could fix it",
      words: ["The", "window", "shattered", "and", "nobody", "could", "fix", "it"],
      targetWordIndex: 7,
      correctAttentions: [1]
    },
    {
      sentence: "The bright sun made everything hard to see clearly",
      words: ["The", "bright", "sun", "made", "everything", "hard", "to", "see", "clearly"],
      targetWordIndex: 1,
      correctAttentions: [2]
    },
    {
      sentence: "The team won because it practiced every single day",
      words: ["The", "team", "won", "because", "it", "practiced", "every", "single", "day"],
      targetWordIndex: 4,
      correctAttentions: [1]
    },
    {
      sentence: "The rocket launched and everyone watched it disappear",
      words: ["The", "rocket", "launched", "and", "everyone", "watched", "it", "disappear"],
      targetWordIndex: 6,
      correctAttentions: [1]
    },
    {
      sentence: "The new student felt lost until she found her class",
      words: ["The", "new", "student", "felt", "lost", "until", "she", "found", "her", "class"],
      targetWordIndex: 6,
      correctAttentions: [2]
    },
    {
      sentence: "The scientist made a discovery and published her findings",
      words: ["The", "scientist", "made", "a", "discovery", "and", "published", "her", "findings"],
      targetWordIndex: 7,
      correctAttentions: [1]
    },
    {
      sentence: "The baby cried all night and its parents were exhausted",
      words: ["The", "baby", "cried", "all", "night", "and", "its", "parents", "were", "exhausted"],
      targetWordIndex: 6,
      correctAttentions: [1]
    },
    {
      sentence: "David dropped his phone and cracked its screen",
      words: ["David", "dropped", "his", "phone", "and", "cracked", "its", "screen"],
      targetWordIndex: 6,
      correctAttentions: [3]
    },
    {
      sentence: "The bridge was old but it still held the weight",
      words: ["The", "bridge", "was", "old", "but", "it", "still", "held", "the", "weight"],
      targetWordIndex: 5,
      correctAttentions: [1]
    }
  ];

  // Shuffle once per mount so each game session shows different rounds
  const [sentenceExamples] = useState(() => {
    const arr = [...allSentenceExamples];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  });

  const currentChallenge = sentenceExamples[currentRound] || challenge;

  // Inject responsive CSS
  useEffect(() => {
    const styleId = 'attention-challenge-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .attention-word {
          display: inline-block;
          padding: clamp(6px, 1.5vw, 10px) clamp(10px, 2vw, 14px);
          margin: clamp(3px, 0.8vw, 5px);
          border-radius: clamp(6px, 1.5vw, 8px);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: clamp(0.9rem, 2.5vw, 1.1rem);
          font-weight: 500;
          user-select: none;
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: rgba(255, 255, 255, 0.1);
          color: white;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .attention-word:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.15);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        
        .attention-word.selected {
          background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
          color: white;
          border-color: #8b5cf6;
          box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
        }
        
        .attention-word.target {
          background: linear-gradient(135deg, #ec4899 0%, #ef4444 100%);
          color: white;
          border-color: #ec4899;
          font-weight: 700;
          animation: pulse-target 1.5s ease-in-out infinite;
        }
        
        .attention-word.correct {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          border-color: #10b981;
        }
        
        .attention-word.missed {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          border-color: #f59e0b;
        }
        
        .attention-word.wrong {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: white;
          border-color: #ef4444;
        }
        
        @keyframes pulse-target {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        @media (max-width: 600px) {
          .attention-word {
            padding: 8px 12px;
            margin: 3px;
            font-size: 0.95rem;
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

  const handleWordClick = (index) => {
    if (submitted) return;
    
    const newSelected = new Set(selectedWords);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedWords(newSelected);
  };

  const handleSubmit = () => {
    setSubmitted(true);
    
    // Calculate accuracy
    const correctAttentions = new Set(currentChallenge.correctAttentions);
    const playerAttentions = selectedWords;
    
    // Count correct selections (intersection)
    const correctSelections = [...playerAttentions].filter(x => correctAttentions.has(x)).length;
    
    // Calculate score: correct selections / total correct needed
    const accuracy = correctAttentions.size > 0 ? correctSelections / correctAttentions.size : 0;
    
    // Track score for this round
    const isCorrect = accuracy > 0.5;
    setScores(prev => [...prev, isCorrect ? 1 : 0]);
    
    console.log('Attention answer:', {
      round: currentRound + 1,
      selected: [...playerAttentions],
      correct: [...correctAttentions],
      correctSelections,
      accuracy: (accuracy * 100).toFixed(0) + '%',
      isCorrect
    });
    
    // Wait to show feedback, then move to next round or complete
    setTimeout(() => {
      if (currentRound + 1 >= 5) {
        // Challenge complete after 5 rounds
        const totalCorrect = [...scores, isCorrect ? 1 : 0].reduce((sum, s) => sum + s, 0);
        const success = totalCorrect > 2; // Majority of 5
        onComplete(success);
      } else {
        // Move to next round
        setCurrentRound(prev => prev + 1);
        setSelectedWords(new Set());
        setSubmitted(false);
      }
    }, 2000);
  };

  const getWordClass = (index) => {
    const classes = ['attention-word'];
    
    if (index === currentChallenge.targetWordIndex) {
      classes.push('target');
      return classes.join(' ');
    }
    
    if (submitted) {
      const correctAttentions = new Set(currentChallenge.correctAttentions);
      const isSelected = selectedWords.has(index);
      const isCorrect = correctAttentions.has(index);
      
      if (isSelected && isCorrect) {
        classes.push('correct');
      } else if (isSelected && !isCorrect) {
        classes.push('wrong');
      } else if (!isSelected && isCorrect) {
        classes.push('missed');
      }
    } else if (selectedWords.has(index)) {
      classes.push('selected');
    }
    
    return classes.join(' ');
  };

  if (phase === 'intro') {
    return (
      <ChallengeIntro
        onStart={() => setPhase('active')}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '🎯',
            title: 'Teach the AI to focus!',
            description: 'AI needs attention — it must learn which words in a sentence are connected to each other.',
          },
          {
            emoji: '🟣',
            title: 'Find what the PINK word refers to',
            description: 'A word will be highlighted in pink. Figure out which other word in the sentence it refers to.',
            demo: (
              <div style={{ textAlign: 'center', lineHeight: 2 }}>
                <div style={{ fontSize: 'clamp(0.9rem, 3vw, 1.05rem)', marginBottom: '10px' }}>
                  <span style={{ color: '#cbd5e1' }}>Sarah bought a book and </span>
                  <span style={{ background: 'rgba(236,72,153,0.35)', border: '2px solid #ec4899', borderRadius: '6px', padding: '2px 8px', color: 'white', fontWeight: 'bold' }}>she</span>
                  <span style={{ color: '#cbd5e1' }}> loved it</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  👆 &ldquo;she&rdquo; refers to <strong style={{ color: '#10b981' }}>Sarah</strong> — tap it!
                </div>
              </div>
            ),
          },
          {
            emoji: '👆',
            title: 'Tap the right word, then submit!',
            description: 'Click the word it refers to and hit Submit. Get the majority of rounds correct to win!',
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
      {/* Progress indicator */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '12px',
        fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
        fontWeight: '600',
        color: '#94a3b8'
      }}>
        <div>Round {currentRound + 1} of 5</div>
        <div>Score: {scores.reduce((sum, s) => sum + s, 0)}/{scores.length}</div>
      </div>

      {/* Title */}
      <h3 style={{ 
        marginBottom: '8px', 
        color: 'white',
        fontSize: 'clamp(1.1rem, 4vw, 1.8rem)',
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: 'clamp(0.5px, 0.2vw, 1px)',
        textTransform: 'uppercase',
        lineHeight: '1.2'
      }}>
        🎯 Pick the related words
      </h3>
      
      <p style={{ 
        marginBottom: '16px', 
        color: '#94a3b8',
        textAlign: 'center',
        fontSize: 'clamp(0.75rem, 2vw, 0.95rem)',
        fontWeight: '500',
        padding: '0 8px',
        lineHeight: '1.4'
      }}>
        Tap the words that help the <span style={{ color: '#ec4899', fontWeight: '700' }}>highlighted word</span> make sense. Tap again to undo.
      </p>

      {/* Sentence with clickable words */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(16px, 4vw, 24px)',
        marginBottom: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        minHeight: 'clamp(120px, 20vh, 180px)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: '1.8'
      }}>
        {currentChallenge.words.map((word, index) => (
          <span
            key={index}
            className={getWordClass(index)}
            onClick={() => handleWordClick(index)}
          >
            {word}
          </span>
        ))}
      </div>

      {/* Instructions */}
      {!submitted && (
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 'clamp(6px, 1.5vw, 8px)',
          padding: 'clamp(10px, 2vw, 14px)',
          marginBottom: '16px',
          color: '#94a3b8',
          fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          lineHeight: '1.4'
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#60a5fa' }}>💡 How it works</div>
          <ul style={{ paddingLeft: '1.1em', margin: 0 }}>
            <li style={{ marginBottom: 4 }}>Look for the glowing word — that's the target.</li>
            <li style={{ marginBottom: 4 }}>Tap 1–3 words that give the target its meaning or that it refers to.</li>
            <li style={{ marginBottom: 4 }}>Tap a word again to undo your pick.</li>
            <li>When you're ready, press <strong style={{ color: 'white' }}>Check answers</strong>.</li>
          </ul>
          <div style={{ marginTop: 8, opacity: 0.9 }}>
            <em>Example:</em> If the highlighted word is <strong style={{ color: 'white' }}>"it"</strong>, you might pick the noun it stands for earlier in the sentence.
          </div>
        </div>
      )}

      {/* Feedback after submission */}
      {submitted && (
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 'clamp(6px, 1.5vw, 8px)',
          padding: 'clamp(10px, 2vw, 14px)',
          marginBottom: '16px',
          fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
          color: '#94a3b8'
        }}>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#10b981', fontWeight: 'bold' }}>● Green</span> = Correct selection
          </div>
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>● Orange</span> = You missed this one
          </div>
          <div>
            <span style={{ color: '#ef4444', fontWeight: 'bold' }}>● Red</span> = Wrong selection
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={submitted || selectedWords.size === 0}
        style={{
          width: '100%',
          background: submitted 
            ? 'rgba(255, 255, 255, 0.1)'
            : selectedWords.size === 0
            ? 'rgba(255, 255, 255, 0.1)'
            : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
          color: 'white',
          padding: 'clamp(12px, 2.5vw, 16px)',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
          fontWeight: '700',
          borderRadius: 'clamp(8px, 2vw, 12px)',
          border: submitted || selectedWords.size === 0 ? '1px solid rgba(255, 255, 255, 0.2)' : 'none',
          cursor: submitted || selectedWords.size === 0 ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          boxShadow: submitted || selectedWords.size === 0
            ? '0 2px 8px rgba(0,0,0,0.1)' 
            : '0 6px 20px rgba(245, 87, 108, 0.4)',
          transform: 'scale(1)',
          textTransform: 'uppercase',
          letterSpacing: 'clamp(0.5px, 0.2vw, 1px)',
          opacity: submitted || selectedWords.size === 0 ? 0.6 : 1,
          lineHeight: '1.3',
          minHeight: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onMouseEnter={(e) => {
          if (!submitted && selectedWords.size > 0) {
            e.target.style.transform = 'scale(1.02)';
            e.target.style.boxShadow = '0 8px 28px rgba(245, 87, 108, 0.5)';
          }
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.boxShadow = submitted || selectedWords.size === 0
            ? '0 2px 8px rgba(0,0,0,0.1)'
            : '0 6px 20px rgba(245, 87, 108, 0.4)';
        }}
      >
        {submitted 
          ? '⏳ Checking...'
          : selectedWords.size === 0
          ? '⚠ Select at least one word'
          : `✅ Check answers (${selectedWords.size} selected)`
        }
      </button>
    </div>
  );
};

export default AttentionChallenge;
