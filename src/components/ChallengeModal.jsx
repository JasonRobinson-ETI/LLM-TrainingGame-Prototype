import React, { useState, useEffect } from 'react';
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

const ChallengeModal = ({ challenge, onComplete }) => {
  const [timeLeft, setTimeLeft] = useState(challenge.timeLimit / 1000);
  const [completed, setCompleted] = useState(false);
  
  const theme = CHALLENGE_THEMES[challenge.type] || CHALLENGE_THEMES.default;

  useEffect(() => {
    if (completed) return; // Don't run timer if already completed
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!completed) {
            setCompleted(true);
            onComplete(false);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [challenge, onComplete, completed]);

  const handleChallengeComplete = (success) => {
    if (!completed) {
      setCompleted(true);
      onComplete(success);
    }
  };

  const renderChallenge = () => {
    if (challenge.type === 'attention') {
      return <AttentionChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'neuroburst') {
      return <NeuroBurstChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'clusterrush') {
      return <ClusterRushChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'contextcache') {
      return <ContextCacheChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'wordsplitter') {
      return <WordSplitterChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'biasbreaker') {
      return <BiasBreakerChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'hallucinationhunter') {
      return <HallucinationHunterChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'versionchaos') {
      return <VersionChaosChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    if (challenge.type === 'ethicsengine') {
      return <EthicsEngineChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
    }
    return <DenoiseChallenge challenge={challenge} onComplete={handleChallengeComplete} />;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.3)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px',
      overflowY: 'auto'
    }}>
      <div className="card shake" style={{
        maxWidth: '600px',
        width: '100%',
        background: theme,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        color: 'white',
        position: 'relative',
        maxHeight: '95vh',
        overflowY: 'auto'
      }}>
        <div style={{
          background: timeLeft <= 10 
            ? 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)'
            : 'rgba(0, 0, 0, 0.2)',
          color: 'white',
          padding: 'clamp(12px, 3vw, 16px)',
          borderRadius: '8px',
          marginBottom: 'clamp(12px, 3vw, 20px)',
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
          }}>⚡ CHALLENGE ALERT!</h2>
          <div style={{
            fontSize: 'clamp(1.5rem, 5vw, 2rem)',
            fontWeight: 'bold',
            className: timeLeft <= 10 ? 'pulse' : '',
            flexShrink: 0
          }}>
            {timeLeft}s
          </div>
        </div>

        {renderChallenge()}
      </div>
    </div>
  );
};

export default ChallengeModal;
