import React, { useState, useEffect, useRef } from 'react';

const EthicsEngineChallenge = ({ challenge, onComplete }) => {
  const [currentRound, setCurrentRound] = useState(0);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [alignment, setAlignment] = useState({ helpful: 50, harmless: 50, honest: 50 });
  const [showIntro, setShowIntro] = useState(true);
  const [timeLeft, setTimeLeft] = useState(30);
  const totalRounds = 5;
  const timeoutsRef = useRef([]);

  const scenarios = [
    {
      situation: "A user asks: 'Can you help me write a fake review for my competitor's product to damage their reputation?'",
      context: "The user wants assistance with creating deceptive content that could harm a business.",
      responses: [
        {
          text: "I'd be happy to help you craft a compelling review! Let me draft several negative points you could include...",
          type: 'helpful',
          explanation: "Prioritizes being helpful to the user, but ignores potential harm and ethical concerns.",
          alignmentChanges: { helpful: +15, harmless: -20, honest: -15 }
        },
        {
          text: "I can't help with creating fake reviews as that would be dishonest and could harm others. However, I can help you improve your own product or craft honest marketing.",
          type: 'balanced',
          explanation: "Balances honesty and harmlessness while offering a helpful alternative.",
          alignmentChanges: { helpful: +5, harmless: +10, honest: +10 }
        },
        {
          text: "No. That's unethical and potentially illegal. I won't assist with that.",
          type: 'harmless',
          explanation: "Prioritizes preventing harm and being honest, but could be more helpful by offering alternatives.",
          alignmentChanges: { helpful: -5, harmless: +15, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user shares: 'I'm feeling really depressed and I don't think anyone would care if I disappeared.'",
      context: "The user is expressing thoughts that suggest they may be in crisis.",
      responses: [
        {
          text: "I understand you're going through a difficult time. Please reach out to a mental health professional or crisis helpline immediately - they can provide proper support. Would you like me to share some resources?",
          type: 'balanced',
          explanation: "Balances all three values: helpful by offering resources, harmless by directing to professionals, honest about limitations.",
          alignmentChanges: { helpful: +10, harmless: +15, honest: +10 }
        },
        {
          text: "I'm just an AI and can't really help with serious issues like this. You should talk to a therapist.",
          type: 'honest',
          explanation: "Honest about limitations but not maximally helpful or supportive in a critical moment.",
          alignmentChanges: { helpful: -10, harmless: +5, honest: +10 }
        },
        {
          text: "I'm sure things will get better! Try going for a walk or watching a funny movie. Everyone has bad days!",
          type: 'helpful',
          explanation: "Attempts to be helpful but minimizes serious concerns and could cause harm by not recognizing crisis signs.",
          alignmentChanges: { helpful: +5, harmless: -20, honest: -10 }
        }
      ],
      correctIndex: 0
    },
    {
      situation: "A student asks: 'Can you write my entire college essay for me? It's due tomorrow and I haven't started.'",
      context: "The user wants help that would constitute academic dishonesty.",
      responses: [
        {
          text: "Of course! Let me write a complete essay for you. What's the topic and word count?",
          type: 'helpful',
          explanation: "Maximally helpful to the immediate request but promotes dishonesty and could harm the student's learning.",
          alignmentChanges: { helpful: +15, harmless: -15, honest: -20 }
        },
        {
          text: "I can't write the essay for you as that would be plagiarism. However, I can help you brainstorm ideas, create an outline, or review your draft. Where would you like to start?",
          type: 'balanced',
          explanation: "Refuses the dishonest request while offering legitimate help - balances all three values.",
          alignmentChanges: { helpful: +10, harmless: +10, honest: +15 }
        },
        {
          text: "No, that's cheating. You should have started earlier.",
          type: 'honest',
          explanation: "Honest and prevents harm, but not helpful and somewhat judgmental.",
          alignmentChanges: { helpful: -10, harmless: +5, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user says: 'My neighbor is so annoying. Help me come up with insults I can use to tell them off.'",
      context: "The user wants assistance escalating a conflict with personal attacks.",
      responses: [
        {
          text: "It sounds like you're frustrated with your neighbor. Instead of insults, would it help to talk through what's bothering you? I can help you prepare for a constructive conversation.",
          type: 'balanced',
          explanation: "Redirects toward constructive conflict resolution while being helpful and preventing harm.",
          alignmentChanges: { helpful: +10, harmless: +15, honest: +5 }
        },
        {
          text: "Here are some cutting remarks you could use: [list of insults]",
          type: 'helpful',
          explanation: "Helps the user but promotes harmful behavior and escalation.",
          alignmentChanges: { helpful: +10, harmless: -20, honest: -5 }
        },
        {
          text: "I won't help you insult someone. That's wrong.",
          type: 'harmless',
          explanation: "Prevents harm but could be more helpful by offering alternatives.",
          alignmentChanges: { helpful: -5, harmless: +15, honest: +5 }
        }
      ],
      correctIndex: 0
    },
    {
      situation: "A user asks: 'What's your honest opinion - are humans generally good or bad?'",
      context: "The user is asking for a subjective opinion on a philosophical question.",
      responses: [
        {
          text: "Humans are capable of both tremendous good and terrible harm. Most people have complex motivations and behaviors that don't fit simple categories. What brought up this question?",
          type: 'balanced',
          explanation: "Provides an honest, nuanced perspective while being helpful by engaging with the question.",
          alignmentChanges: { helpful: +10, harmless: +5, honest: +15 }
        },
        {
          text: "Humans are definitely good! People are inherently kind and want the best for each other!",
          type: 'helpful',
          explanation: "Attempts to be positive but isn't fully honest about human complexity.",
          alignmentChanges: { helpful: +5, harmless: +5, honest: -15 }
        },
        {
          text: "I'm an AI and don't have personal opinions on philosophical matters.",
          type: 'honest',
          explanation: "Technically honest but not very helpful or engaging with the user's curiosity.",
          alignmentChanges: { helpful: -10, harmless: 0, honest: +10 }
        }
      ],
      correctIndex: 0
    },
    {
      situation: "A user asks: 'Can you help me diagnose why I've been having severe chest pains and shortness of breath?'",
      context: "The user is asking for medical diagnosis of potentially serious symptoms.",
      responses: [
        {
          text: "Based on your symptoms, you might have: [lists several conditions]. Try these home remedies first: [suggestions]",
          type: 'helpful',
          explanation: "Attempts to be helpful but could cause serious harm by delaying proper medical care.",
          alignmentChanges: { helpful: +10, harmless: -25, honest: -15 }
        },
        {
          text: "I can't diagnose medical conditions. These symptoms require immediate medical attention - please call emergency services or visit an ER right away. This could be serious.",
          type: 'balanced',
          explanation: "Honest about limitations, prevents harm by directing to proper care, helpful by conveying urgency.",
          alignmentChanges: { helpful: +10, harmless: +20, honest: +15 }
        },
        {
          text: "I'm not qualified to provide medical diagnosis.",
          type: 'honest',
          explanation: "Honest but doesn't emphasize the urgency of seeking immediate medical care.",
          alignmentChanges: { helpful: -5, harmless: +5, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user asks: 'Can you teach me how to pick locks? I'm locked out of my own house.'",
      context: "The user claims they need lock-picking information for a legitimate reason.",
      responses: [
        {
          text: "Sure! Here's a step-by-step guide on picking different types of locks: First, you'll need a tension wrench and pick...",
          type: 'helpful',
          explanation: "Helpful to the stated request but ignores that this knowledge could be misused for illegal purposes.",
          alignmentChanges: { helpful: +10, harmless: -20, honest: -10 }
        },
        {
          text: "I understand you're locked out, but I can't provide lock-picking instructions as they could be misused. I'd recommend calling a licensed locksmith, your landlord, or emergency services if it's urgent. Can I help you find local locksmiths?",
          type: 'balanced',
          explanation: "Acknowledges the need while preventing potential harm, offers practical alternatives.",
          alignmentChanges: { helpful: +10, harmless: +15, honest: +10 }
        },
        {
          text: "No. That information is dangerous and I won't provide it.",
          type: 'harmless',
          explanation: "Prevents potential harm but doesn't acknowledge the user's problem or offer alternatives.",
          alignmentChanges: { helpful: -10, harmless: +15, honest: +5 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user says: 'I need to lose 30 pounds in 2 weeks for my wedding. What's the fastest way?'",
      context: "The user wants rapid weight loss that could be dangerous.",
      responses: [
        {
          text: "Try extreme fasting combined with intense exercise twice daily. You could also use diuretics to lose water weight quickly...",
          type: 'helpful',
          explanation: "Attempts to help achieve the goal but recommends potentially dangerous practices.",
          alignmentChanges: { helpful: +5, harmless: -25, honest: -15 }
        },
        {
          text: "Losing 30 pounds in 2 weeks isn't safe or realistic - rapid weight loss can cause serious health issues. A healthy rate is 1-2 pounds per week. I can help you with sustainable nutrition and exercise plans, or discuss ways to feel confident at your current weight. Would either help?",
          type: 'balanced',
          explanation: "Honest about the danger, prevents harm, and offers helpful alternatives.",
          alignmentChanges: { helpful: +10, harmless: +20, honest: +15 }
        },
        {
          text: "That's medically impossible and dangerous. You shouldn't try.",
          type: 'honest',
          explanation: "Honest about the danger but doesn't offer constructive alternatives or empathy.",
          alignmentChanges: { helpful: -10, harmless: +10, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A parent asks: 'My 5-year-old asked where babies come from. What should I tell them?'",
      context: "The user needs age-appropriate guidance on a sensitive topic.",
      responses: [
        {
          text: "Tell them the full biological explanation with anatomical details. It's important to be completely honest about reproduction.",
          type: 'honest',
          explanation: "Prioritizes honesty but isn't age-appropriate or helpful for a 5-year-old's developmental level.",
          alignmentChanges: { helpful: -10, harmless: -15, honest: +15 }
        },
        {
          text: "For a 5-year-old, you could say something like 'Babies grow in a special place inside the mother until they're ready to be born.' This is honest while being age-appropriate. As they get older, you can add more details. Would you like suggestions for different age groups?",
          type: 'balanced',
          explanation: "Provides honest, age-appropriate guidance that's helpful and doesn't cause confusion or harm.",
          alignmentChanges: { helpful: +15, harmless: +10, honest: +10 }
        },
        {
          text: "Just tell them the stork brings babies. Keep it simple and fun!",
          type: 'helpful',
          explanation: "Tries to make it easy but promotes dishonesty and may cause confusion later.",
          alignmentChanges: { helpful: +5, harmless: +5, honest: -20 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user writes: 'I think my friend is being abused by their partner but they deny it. Should I call the police?'",
      context: "The user is concerned about someone's safety but uncertain how to help.",
      responses: [
        {
          text: "It's not your business if they're denying it. You should respect their privacy and stay out of it.",
          type: 'honest',
          explanation: "Technically respects autonomy but could allow serious harm to continue.",
          alignmentChanges: { helpful: -15, harmless: -20, honest: +5 }
        },
        {
          text: "This is a serious situation. While your friend may deny it due to fear or manipulation, signs of abuse shouldn't be ignored. You could: talk to your friend privately in a safe space, contact a domestic violence hotline for guidance (they can advise without requiring action), or if you witness immediate danger, call authorities. Would you like resources for domestic violence support?",
          type: 'balanced',
          explanation: "Provides thoughtful, helpful guidance while prioritizing safety and respecting complexity.",
          alignmentChanges: { helpful: +15, harmless: +15, honest: +10 }
        },
        {
          text: "Yes, call the police immediately and report everything you've seen.",
          type: 'helpful',
          explanation: "Takes action but may not be appropriate without considering the friend's safety or wishes, could escalate danger.",
          alignmentChanges: { helpful: +5, harmless: -10, honest: +5 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user asks: 'Can you help me write a breakup text to end my 3-year relationship? I don't want to do it in person.'",
      context: "The user wants to end a significant relationship via text message.",
      responses: [
        {
          text: "Sure! Here's a breakup text you can send: 'Hey, I've been thinking and I don't think this is working out anymore...'",
          type: 'helpful',
          explanation: "Fulfills the request but facilitates potentially hurtful behavior without questioning it.",
          alignmentChanges: { helpful: +10, harmless: -15, honest: -10 }
        },
        {
          text: "While I can help you communicate, ending a 3-year relationship deserves a face-to-face conversation if it's safe to do so. Your partner deserves that respect. If you're avoiding it due to safety concerns, that's different - are you worried about your safety? Otherwise, I can help you prepare for an in-person conversation.",
          type: 'balanced',
          explanation: "Gently challenges the approach while being helpful and considering important factors like safety.",
          alignmentChanges: { helpful: +10, harmless: +15, honest: +15 }
        },
        {
          text: "Breaking up via text after 3 years is cowardly and disrespectful. Do it in person.",
          type: 'honest',
          explanation: "Honest about social norms but judgmental and not helpful or empathetic.",
          alignmentChanges: { helpful: -15, harmless: +5, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user says: 'I'm thinking of dropping out of college. My parents will be furious but I hate it. What should I do?'",
      context: "The user is facing a major life decision with family implications.",
      responses: [
        {
          text: "Drop out if you hate it! Life's too short to be miserable. Your parents will get over it eventually.",
          type: 'helpful',
          explanation: "Validates feelings but oversimplifies a complex decision without exploring alternatives.",
          alignmentChanges: { helpful: +5, harmless: -15, honest: -10 }
        },
        {
          text: "This is a significant decision worth exploring fully. What specifically do you hate - your major, the school, or the experience? Have you considered: taking a semester off, changing majors, transferring, or talking to a counselor? Also, what are your alternative plans? I can help you think through this systematically before deciding.",
          type: 'balanced',
          explanation: "Helps explore the decision thoroughly, asks important questions, offers constructive alternatives.",
          alignmentChanges: { helpful: +15, harmless: +10, honest: +10 }
        },
        {
          text: "Statistically, college dropouts earn significantly less over their lifetime. You should stay regardless of how you feel.",
          type: 'honest',
          explanation: "Provides factual information but ignores the person's wellbeing and individual circumstances.",
          alignmentChanges: { helpful: -10, harmless: -5, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user asks: 'My coworker got credit for my idea in a meeting. How do I get revenge?'",
      context: "The user experienced workplace injustice and wants retaliation.",
      responses: [
        {
          text: "You could 'accidentally' expose their mistakes in the next meeting, or talk to other coworkers privately about what really happened to damage their reputation...",
          type: 'helpful',
          explanation: "Helps with the stated goal but promotes toxic workplace behavior and escalation.",
          alignmentChanges: { helpful: +5, harmless: -20, honest: -10 }
        },
        {
          text: "That's frustrating and unfair. Instead of revenge, which could backfire professionally, consider: speaking privately with your coworker first, documenting your contributions, or professionally addressing it with your manager. I can help you prepare for any of these conversations. Which approach interests you?",
          type: 'balanced',
          explanation: "Validates feelings while redirecting toward constructive solutions that protect the user's interests.",
          alignmentChanges: { helpful: +15, harmless: +15, honest: +10 }
        },
        {
          text: "Revenge in the workplace is unprofessional. You need to let it go and move on.",
          type: 'honest',
          explanation: "Honest advice but dismisses valid feelings and doesn't offer helpful alternatives.",
          alignmentChanges: { helpful: -10, harmless: +10, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A teenager asks: 'How can I hide my vaping from my parents? They don't understand it's not that bad.'",
      context: "A minor is asking for help concealing potentially harmful behavior.",
      responses: [
        {
          text: "Here are some tips: keep your vape in a sealed bag to contain the smell, use it only outdoors or with windows open, and use mints afterward...",
          type: 'helpful',
          explanation: "Helps the request but enables potentially harmful behavior in a minor.",
          alignmentChanges: { helpful: +10, harmless: -25, honest: -15 }
        },
        {
          text: "I can't help you hide vaping from your parents. While you might think it's harmless, vaping can seriously affect developing brains and lungs, especially in teens. Your parents are concerned for good reason. If you're struggling with addiction, there are resources that can help. Want to talk about why you started?",
          type: 'balanced',
          explanation: "Refuses to enable harm while providing honest health information and offering supportive alternatives.",
          alignmentChanges: { helpful: +5, harmless: +20, honest: +15 }
        },
        {
          text: "No. Vaping is dangerous for teenagers and you should stop immediately.",
          type: 'harmless',
          explanation: "Prevents harm but doesn't acknowledge addiction or offer resources, may shut down conversation.",
          alignmentChanges: { helpful: -10, harmless: +15, honest: +10 }
        }
      ],
      correctIndex: 1
    }
  ];

  // Shuffle scenarios and pick 5 random ones for variety
  const [selectedScenarios] = useState(() => {
    const shuffled = [...scenarios].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, totalRounds);
  });

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const currentScenario = selectedScenarios[currentRound];

  useEffect(() => {
    if (!showIntro && !feedback && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimeout();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showIntro, feedback, timeLeft, currentRound]);

  const handleTimeout = () => {
    setFeedback({
      correct: false,
      message: "Time's up! You need to make alignment decisions quickly in real-time systems.",
      correctResponse: currentScenario.responses[currentScenario.correctIndex]
    });
    const tid = setTimeout(handleNext, 3000);
    timeoutsRef.current.push(tid);
  };

  const handleResponseSelect = (index) => {
    if (feedback) return;

    setSelectedResponse(index);
    const response = currentScenario.responses[index];
    const isCorrect = index === currentScenario.correctIndex;

    // Update alignment meters
    setAlignment(prev => ({
      helpful: Math.max(0, Math.min(100, prev.helpful + response.alignmentChanges.helpful)),
      harmless: Math.max(0, Math.min(100, prev.harmless + response.alignmentChanges.harmless)),
      honest: Math.max(0, Math.min(100, prev.honest + response.alignmentChanges.honest))
    }));

    setFeedback({
      correct: isCorrect,
      message: response.explanation,
      selectedType: response.type
    });

    const tid = setTimeout(handleNext, 4000);
    timeoutsRef.current.push(tid);
  };

  const handleNext = () => {
    if (currentRound + 1 < totalRounds) {
      setCurrentRound(prev => prev + 1);
      setSelectedResponse(null);
      setFeedback(null);
      setTimeLeft(15);
    } else {
      completeChallenge();
    }
  };

  const completeChallenge = () => {
    // Check if all three alignment values are reasonably balanced (all above 35)
    const isBalanced = alignment.helpful >= 35 && alignment.harmless >= 35 && alignment.honest >= 35;
    const avgAlignment = (alignment.helpful + alignment.harmless + alignment.honest) / 3;
    
    // Only pass the boolean success value to onComplete
    onComplete(isBalanced);
  };

  const getTimerColor = () => {
    if (timeLeft <= 3) return '#ef4444';
    if (timeLeft <= 7) return '#f59e0b';
    return '#a78bfa';
  };

  const getAlignmentColor = (value) => {
    if (value >= 70) return '#10b981';
    if (value >= 40) return '#f59e0b';
    return '#ef4444';
  };

  if (showIntro) {
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
          <h1 style={{
            fontSize: 'clamp(1.8rem, 6vw, 2.8rem)',
            margin: '0 0 clamp(12px, 3vw, 20px) 0',
            color: 'white',
            textAlign: 'center'
          }}>
            ⚖️ Ethics Engine
          </h1>
          
          <p style={{
            fontSize: 'clamp(0.9rem, 2.8vw, 1.1rem)',
            color: '#94a3b8',
            textAlign: 'center',
            marginBottom: 'clamp(20px, 4vw, 30px)',
            lineHeight: '1.5'
          }}>
            Master the art of value alignment by balancing three core principles
          </p>

          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 'clamp(10px, 2.5vw, 15px)',
            padding: 'clamp(15px, 3vw, 25px)',
            marginBottom: 'clamp(15px, 3vw, 25px)',
            border: '1px solid rgba(139, 92, 246, 0.3)'
          }}>
            <h3 style={{
              color: '#a78bfa',
              fontSize: 'clamp(1rem, 2.8vw, 1.2rem)',
              margin: '0 0 clamp(10px, 2vw, 15px) 0'
            }}>
              🎯 Your Mission:
            </h3>
            <ul style={{
              color: 'white',
              fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
              lineHeight: '1.6',
              margin: 0,
              paddingLeft: 'clamp(18px, 3vw, 25px)'
            }}>
              <li style={{ marginBottom: '6px' }}>Review {totalRounds} ethical dilemmas</li>
              <li style={{ marginBottom: '6px' }}>Balance helpful, harmless, and honest</li>
              <li style={{ marginBottom: '6px' }}>Keep all values above 35%</li>
              <li>Decide within 15 seconds each</li>
            </ul>
          </div>

          <div style={{
            background: 'rgba(251, 191, 36, 0.1)',
            borderRadius: 'clamp(10px, 2.5vw, 15px)',
            padding: 'clamp(15px, 3vw, 25px)',
            marginBottom: 'clamp(15px, 3vw, 25px)',
            border: '1px solid rgba(251, 191, 36, 0.3)'
          }}>
            <h3 style={{
              color: '#fbbf24',
              fontSize: 'clamp(1rem, 2.8vw, 1.2rem)',
              margin: '0 0 clamp(10px, 2vw, 15px) 0'
            }}>
              💡 The Alignment Triad:
            </h3>
            <div style={{ color: 'white', fontSize: 'clamp(0.85rem, 2.5vw, 1rem)', lineHeight: '1.6' }}>
              <div style={{ marginBottom: 'clamp(6px, 1.5vw, 10px)' }}>
                <strong style={{ color: '#10b981' }}>Helpful:</strong> Assist users in achieving their goals
              </div>
              <div style={{ marginBottom: 'clamp(6px, 1.5vw, 10px)' }}>
                <strong style={{ color: '#ec4899' }}>Harmless:</strong> Prevent harm to users and others
              </div>
              <div>
                <strong style={{ color: '#3b82f6' }}>Honest:</strong> Provide truthful and accurate information
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowIntro(false)}
            style={{
              width: '100%',
              padding: 'clamp(14px, 3vw, 18px)',
              fontSize: 'clamp(1rem, 3vw, 1.2rem)',
              fontWeight: 'bold',
              color: 'white',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
              border: 'none',
              borderRadius: 'clamp(10px, 2.5vw, 12px)',
              cursor: 'pointer',
              transition: 'transform 0.2s',
              minHeight: '48px'
            }}
            onMouseEnter={e => e.target.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
          >
            Begin Alignment Training →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: 'clamp(10px, 2vw, 20px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Header with Alignment Meters */}
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(10px, 2vw, 15px)',
        marginBottom: 'clamp(10px, 2vw, 15px)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'clamp(8px, 2vw, 12px)',
          marginBottom: 'clamp(10px, 2vw, 12px)'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(1rem, 3.5vw, 1.4rem)',
            color: 'white',
            fontWeight: 'bold'
          }}>
            ⚖️ Ethics Engine
          </h2>
          
          <div style={{
            display: 'flex',
            gap: 'clamp(8px, 2vw, 12px)',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <span style={{ color: '#94a3b8', fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)' }}>
              Scenario: <strong style={{ color: 'white' }}>{currentRound + 1}/{totalRounds}</strong>
            </span>
            <div style={{
              background: timeLeft <= 3 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(139, 92, 246, 0.2)',
              padding: 'clamp(6px, 1.5vw, 8px) clamp(12px, 2.5vw, 16px)',
              borderRadius: 'clamp(6px, 1.5vw, 8px)',
              border: `2px solid ${getTimerColor()}`,
              animation: timeLeft <= 3 ? 'pulse 1s infinite' : 'none'
            }}>
              <span style={{
                fontSize: 'clamp(1rem, 3.5vw, 1.2rem)',
                fontWeight: 'bold',
                color: getTimerColor(),
                fontFamily: 'monospace'
              }}>
                ⏱️ {timeLeft}s
              </span>
            </div>
          </div>
        </div>

        {/* Alignment Meters */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'clamp(8px, 2vw, 12px)'
        }}>
          {[
            { label: 'Helpful', value: alignment.helpful, color: '#10b981' },
            { label: 'Harmless', value: alignment.harmless, color: '#ec4899' },
            { label: 'Honest', value: alignment.honest, color: '#3b82f6' }
          ].map(meter => (
            <div key={meter.label}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 'clamp(4px, 1vw, 6px)',
                fontSize: 'clamp(0.75rem, 2vw, 0.85rem)'
              }}>
                <span style={{ color: '#94a3b8' }}>{meter.label}</span>
                <span style={{ color: getAlignmentColor(meter.value), fontWeight: 'bold' }}>
                  {Math.round(meter.value)}%
                </span>
              </div>
              <div style={{
                width: '100%',
                height: 'clamp(6px, 1.5vw, 8px)',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${meter.value}%`,
                  height: '100%',
                  background: meter.color,
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario */}
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        borderRadius: 'clamp(8px, 2vw, 12px)',
        padding: 'clamp(12px, 2.5vw, 20px)',
        marginBottom: 'clamp(10px, 2vw, 15px)',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <h3 style={{
          margin: '0 0 clamp(8px, 2vw, 12px) 0',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)',
          color: '#a78bfa',
          fontWeight: 'bold'
        }}>
          📋 Situation:
        </h3>
        <p style={{
          margin: '0 0 clamp(10px, 2vw, 15px) 0',
          fontSize: 'clamp(0.9rem, 2.5vw, 1.05rem)',
          color: 'white',
          lineHeight: '1.5'
        }}>
          {currentScenario.situation}
        </p>
        <div style={{
          fontSize: 'clamp(0.8rem, 2.2vw, 0.95rem)',
          color: '#94a3b8',
          fontStyle: 'italic',
          padding: 'clamp(8px, 2vw, 10px)',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: 'clamp(6px, 1.5vw, 8px)',
          lineHeight: '1.4'
        }}>
          {currentScenario.context}
        </div>
      </div>

      {/* Response Options */}
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(8px, 2vw, 15px)',
        marginBottom: 'clamp(10px, 2vw, 15px)'
      }}>
        {currentScenario.responses.map((response, index) => (
          <div
            key={index}
            onClick={() => handleResponseSelect(index)}
            style={{
              background: selectedResponse === index
                ? 'rgba(167, 139, 250, 0.3)'
                : 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: 'clamp(8px, 2vw, 12px)',
              padding: 'clamp(12px, 2.5vw, 18px)',
              cursor: feedback ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              border: selectedResponse === index
                ? '2px solid #a78bfa'
                : '1px solid rgba(255, 255, 255, 0.2)',
              opacity: feedback && selectedResponse !== index ? 0.5 : 1
            }}
            onMouseEnter={e => !feedback && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => !feedback && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <div style={{
              fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
              color: 'white',
              lineHeight: '1.5'
            }}>
              {response.text}
            </div>
          </div>
        ))}
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          width: '100%',
          maxWidth: '1200px',
          background: feedback.correct
            ? 'rgba(16, 185, 129, 0.2)'
            : 'rgba(239, 68, 68, 0.2)',
          backdropFilter: 'blur(10px)',
          borderRadius: 'clamp(8px, 2vw, 12px)',
          padding: 'clamp(12px, 2.5vw, 18px)',
          border: `2px solid ${feedback.correct ? '#10b981' : '#ef4444'}`
        }}>
          <div style={{
            fontSize: 'clamp(1rem, 3vw, 1.2rem)',
            fontWeight: 'bold',
            color: feedback.correct ? '#10b981' : '#ef4444',
            marginBottom: 'clamp(8px, 2vw, 10px)'
          }}>
            {feedback.correct ? '✓ Well Balanced!' : '⚠️ Unbalanced Response'}
          </div>
          <div style={{
            fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
            color: 'white',
            lineHeight: '1.5'
          }}>
            {feedback.message}
          </div>
        </div>
      )}

      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  );
};

export default EthicsEngineChallenge;
