import React, { useState } from 'react';
import DenoiseChallenge from './challenges/DenoiseChallenge';
import AttentionChallenge from './challenges/AttentionChallenge';
import NeuroBurstChallenge from './challenges/NeuroBurstChallenge';
import ClusterRushChallenge from './challenges/ClusterRushChallenge';
import ContextCacheChallenge from './challenges/ContextCacheChallenge';
import WordSplitterChallenge from './challenges/WordSplitterChallenge';
import BiasBreakerChallenge from './challenges/BiasBreakerChallenge';
import HallucinationHunterChallenge from './challenges/HallucinationHunterChallenge';
import VersionChaosChallenge from './challenges/VersionChaosChallenge';
import EthicsEngineChallenge from './challenges/EthicsEngineChallenge';

const CHALLENGE_THEMES = {
  denoise: 'linear-gradient(135deg, #1e293b 0%, #4338ca 100%)',
  attention: 'linear-gradient(135deg, #1e293b 0%, #b91c1c 100%)',
  neuroburst: 'linear-gradient(135deg, #1e293b 0%, #b45309 100%)',
  clusterrush: 'linear-gradient(135deg, #1e293b 0%, #15803d 100%)',
  contextcache: 'linear-gradient(135deg, #1e293b 0%, #be185d 100%)',
  wordsplitter: 'linear-gradient(135deg, #1e293b 0%, #0e7490 100%)',
  biasbreaker: 'linear-gradient(135deg, #1e293b 0%, #b45309 100%)',
  hallucinationhunter: 'linear-gradient(135deg, #1e293b 0%, #6d28d9 100%)',
  versionchaos: 'linear-gradient(135deg, #1e293b 0%, #c2410c 100%)',
  ethicsengine: 'linear-gradient(135deg, #1e293b 0%, #1d4ed8 100%)',
  default: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
};

const ChallengeDebug = () => {
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [result, setResult] = useState(null);

  // Override body overflow to allow scrolling on mobile
  React.useEffect(() => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    
    return () => {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    };
  }, []);

  const challenges = [
    {
      id: 'denoise',
      name: '🔊 Denoise Challenge',
      type: 'denoise',
      description: 'Filter out noise from training data',
      component: DenoiseChallenge
    },
    {
      id: 'attention',
      name: '🎯 Attention Challenge',
      type: 'attention',
      description: 'Focus on important patterns',
      component: AttentionChallenge
    },
    {
      id: 'neuroburst',
      name: '⚡ Neuro Burst',
      type: 'neuroburst',
      description: 'Rapid-fire neural network decisions',
      component: NeuroBurstChallenge
    },
    {
      id: 'clusterrush',
      name: '🖥️ Cluster Rush',
      type: 'clusterrush',
      description: 'Manage GPU cluster operations',
      component: ClusterRushChallenge
    },
    {
      id: 'contextcache',
      name: '🧠 Context Cache',
      type: 'contextcache',
      description: 'Manage LLM memory efficiently',
      component: ContextCacheChallenge
    },
    {
      id: 'wordsplitter',
      name: '✂️ Word Splitter',
      type: 'wordsplitter',
      description: 'Tokenize text into subwords',
      component: WordSplitterChallenge
    },
    {
      id: 'biasbreaker',
      name: '🛡️ Bias Breaker',
      type: 'biasbreaker',
      description: 'Filter biased AI responses',
      component: BiasBreakerChallenge
    },
    {
      id: 'hallucinationhunter',
      name: '🔍 Hallucination Hunter',
      type: 'hallucinationhunter',
      description: 'Spot AI hallucinations and false facts',
      component: HallucinationHunterChallenge
    },
    { 
      id: 'versionchaos', 
      name: '🔄 Version Chaos', 
      type: 'versionchaos',
      description: 'Deploy the right model version',
      component: VersionChaosChallenge 
    },
    { 
      id: 'ethicsengine', 
      name: '⚖️ Ethics Engine', 
      type: 'ethicsengine',
      description: 'Balance helpful, harmless, and honest responses',
      component: EthicsEngineChallenge 
    }
  ];  const handleChallengeComplete = (success) => {
    setResult(success);
    setTimeout(() => {
      setSelectedChallenge(null);
      setResult(null);
    }, 3000);
  };

  const handleSelectChallenge = (challenge) => {
    setSelectedChallenge(challenge);
    setResult(null);
  };

  const generateChallengeData = (challengeType) => {
    // Attention challenge sentences (copied from server)
    const attentionSentences = [
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
      }
    ];

    switch (challengeType) {
      case 'attention': {
        const sentenceData = attentionSentences[Math.floor(Math.random() * attentionSentences.length)];
        return {
          type: 'attention',
          timeLimit: 60000,
          ...sentenceData
        };
      }
      
      case 'neuroburst': {
        const shapes = ['circle', 'square', 'triangle', 'star', 'hexagon'];
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
        
        const examples = [];
        for (let i = 0; i < 8; i++) {
          const shape = shapes[Math.floor(Math.random() * shapes.length)];
          const color = colors[Math.floor(Math.random() * colors.length)];
          const networkAccuracy = 0.4 + (i * 0.06);
          const isCorrect = Math.random() < networkAccuracy;
          
          examples.push({
            shape,
            color,
            correctAnswer: shape,
            prediction: isCorrect ? shape : shapes[Math.floor(Math.random() * shapes.length)]
          });
        }
        
        return {
          type: 'neuroburst',
          timeLimit: 60000,
          rounds: 8,
          examples
        };
      }
      
      case 'denoise': {
        const noisePatterns = ['###', '!!!', '@@@', '$$$', '%%%'];
        const validData = ['data point', 'training sample', 'valid input', 'clean data'];
        const data = [];
        
        for (let i = 0; i < 20; i++) {
          const isNoise = Math.random() < 0.3;
          data.push({
            text: isNoise 
              ? noisePatterns[Math.floor(Math.random() * noisePatterns.length)]
              : validData[Math.floor(Math.random() * validData.length)],
            isNoise
          });
        }
        
        return {
          type: 'denoise',
          timeLimit: 60000,
          data
        };
      }
      
      case 'contextcache': {
        const dialogueTemplates = [
          { text: "Remember I'm allergic to cats", important: true, tags: ['allergy', 'cats'] },
          { text: "My favorite color is blue", important: true, tags: ['preference', 'color'] },
          { text: "The weather is nice today", important: false, tags: ['weather'] },
          { text: "Now write a story about my pet", important: true, tags: ['instruction', 'pet'] },
          { text: "I changed my mind — it's green", important: true, tags: ['preference', 'color'] },
          { text: "By the way, I love pizza", important: true, tags: ['food', 'preference'] },
          { text: "That's interesting", important: false, tags: ['filler'] },
          { text: "My name is Alex", important: true, tags: ['identity', 'name'] }
        ];
        
        const shuffled = [...dialogueTemplates].sort(() => Math.random() - 0.5);
        const dialogueChunks = shuffled.slice(0, 10).map((chunk, i) => ({
          id: i,
          ...chunk,
          priority: chunk.important ? Math.floor(Math.random() * 3) + 7 : Math.floor(Math.random() * 4) + 1
        }));
        
        return {
          type: 'contextcache',
          timeLimit: 60000,
          dialogueChunks
        };
      }
      
      case 'wordsplitter': {
        const words = ['understanding', 'beautiful', 'development', 'comfortable'];
        const targetWord = words[Math.floor(Math.random() * words.length)];
        
        return {
          type: 'wordsplitter',
          timeLimit: 60000,
          targetWord
        };
      }
      
      case 'hallucinationhunter': {
        return {
          type: 'hallucinationhunter',
          timeLimit: 30000
        };
      }
      
      case 'versionchaos': {
        return {
          type: 'versionchaos',
          timeLimit: 60000
        };
      }
      
      default:
        return {
          type: challengeType,
          timeLimit: 60000
        };
    }
  };

  if (selectedChallenge) {
    const ChallengeComponent = selectedChallenge.component;
    const challengeData = generateChallengeData(selectedChallenge.type);
    const theme = CHALLENGE_THEMES[selectedChallenge.type] || CHALLENGE_THEMES.default;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '20px',
        overflowY: 'auto'
      }}>
        <div style={{
          maxWidth: '600px',
          width: '100%',
          background: theme,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          color: 'white',
          position: 'relative',
          maxHeight: '95vh',
          overflowY: 'auto',
          borderRadius: '16px',
        }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            color: 'white',
            padding: 'clamp(12px, 3vw, 16px)',
            borderRadius: '8px',
            margin: 'clamp(12px, 3vw, 20px)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <h2 style={{ 
              margin: 0,
              fontSize: 'clamp(1rem, 4vw, 1.5rem)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>⚡ CHALLENGE DEBUG</h2>
            <button
            onClick={() => setSelectedChallenge(null)}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9rem'
            }}
          >
            ← Back
          </button>
          </div>

          <ChallengeComponent 
            challenge={challengeData}
            onComplete={handleChallengeComplete}
          />

          {result !== null && (
            <div style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              background: result ? '#10b981' : '#ef4444',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '12px',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              zIndex: 9999
            }}>
              {result ? '✅ Challenge Passed!' : '❌ Challenge Failed'}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      height: 'auto',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '40px 20px',
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch'
    }}>
      <div style={{
        maxWidth: '1000px',
        margin: '0 auto'
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '16px',
          padding: '30px',
          marginBottom: '30px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          textAlign: 'center'
        }}>
          <h1 style={{
            margin: '0 0 12px 0',
            fontSize: '2.5rem',
            color: '#764ba2',
            fontWeight: '700'
          }}>
            🎮 Challenge Debug Center
          </h1>
          <p style={{
            margin: 0,
            fontSize: '1.1rem',
            color: '#86868b'
          }}>
            Click any challenge below to test it
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
          paddingBottom: '40px'
        }}>
          {challenges.map(challenge => (
            <div
              key={challenge.id}
              onClick={() => handleSelectChallenge(challenge)}
              style={{
                background: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '12px',
                padding: '24px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                border: '2px solid transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.2)';
                e.currentTarget.style.borderColor = '#764ba2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <h2 style={{
                margin: '0 0 12px 0',
                fontSize: '1.5rem',
                color: '#1d1d1f',
                fontWeight: '700'
              }}>
                {challenge.name}
              </h2>
              <p style={{
                margin: 0,
                color: '#86868b',
                fontSize: '1rem',
                lineHeight: '1.5'
              }}>
                {challenge.description}
              </p>
              <div style={{
                marginTop: '16px',
                padding: '8px 16px',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#1d1d1f',
                borderRadius: '8px',
                fontWeight: 'bold',
                textAlign: 'center',
                fontSize: '0.95rem'
              }}>
                Click to Play →
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChallengeDebug;
