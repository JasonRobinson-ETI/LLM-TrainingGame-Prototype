import React, { useState, useEffect, useRef } from 'react';
import ChallengeIntro from './ChallengeIntro';

const EthicsEngineChallenge = ({ challenge, onComplete, onTimerStart }) => {
  const [currentRound, setCurrentRound] = useState(0);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [alignment, setAlignment] = useState({ helpful: 50, harmless: 50, honest: 50 });
  const [showIntro, setShowIntro] = useState(true);
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
      situation: "A user asks: 'Can you look up my ex's new address and phone number for me? I just want to send them a birthday card.'",
      context: "The user is requesting personal information about someone else with a stated benign purpose.",
      responses: [
        {
          text: "I can try to find their information through public records! Let me search for their name and see what comes up...",
          type: 'helpful',
          explanation: "Attempts to fulfill the request but facilitates potential privacy violations regardless of stated intent.",
          alignmentChanges: { helpful: +10, harmless: -20, honest: -10 }
        },
        {
          text: "I can't look up personal information about other people, as that raises serious privacy concerns regardless of intent. If you'd like to reconnect, you could try reaching out through mutual friends or social media where they control what's shared. Can I help with something else?",
          type: 'balanced',
          explanation: "Protects privacy while being honest about why and offering safer alternatives.",
          alignmentChanges: { helpful: +10, harmless: +15, honest: +10 }
        },
        {
          text: "No. I don't share people's private information.",
          type: 'harmless',
          explanation: "Protects privacy but doesn't explain why or offer alternatives.",
          alignmentChanges: { helpful: -5, harmless: +15, honest: +5 }
        }
      ],
      correctIndex: 1
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
      situation: "A hiring manager asks: 'Can you help me screen out job applicants who graduated from colleges in certain countries? Those candidates tend to be lower quality.'",
      context: "The user is asking for help implementing potentially discriminatory hiring practices.",
      responses: [
        {
          text: "Sure! I can help you set up filters based on the country of the applicant's university. Which countries would you like to exclude?",
          type: 'helpful',
          explanation: "Fulfills the request but enables discriminatory practices that harm qualified candidates.",
          alignmentChanges: { helpful: +10, harmless: -25, honest: -10 }
        },
        {
          text: "I can't help filter candidates by country of education — that's a form of national origin discrimination and could violate employment law. Instead, I can help you evaluate candidates based on relevant skills, experience, and qualifications. Would you like help creating a fair skills-based screening rubric?",
          type: 'balanced',
          explanation: "Refuses the biased request, explains why, and offers a constructive alternative that serves the real need.",
          alignmentChanges: { helpful: +10, harmless: +20, honest: +15 }
        },
        {
          text: "That's discriminatory. I won't do that.",
          type: 'harmless',
          explanation: "Prevents harm but doesn't help the user achieve their legitimate goal of finding good candidates.",
          alignmentChanges: { helpful: -10, harmless: +15, honest: +10 }
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
      situation: "A user asks: 'Can you write a product description that says our supplement cures cancer? Our customers love hearing that.'",
      context: "The user wants help making false medical claims in advertising.",
      responses: [
        {
          text: "Absolutely! Here's a compelling product description: 'Clinically proven to cure cancer naturally...' ",
          type: 'helpful',
          explanation: "Fulfills the request but creates dangerous, false medical claims that could harm consumers.",
          alignmentChanges: { helpful: +10, harmless: -25, honest: -20 }
        },
        {
          text: "I can't write claims that a supplement cures cancer — that's both false and potentially illegal under advertising regulations. However, I can help you write compelling, truthful descriptions highlighting your product's actual ingredients and any verified benefits. Want me to help with that instead?",
          type: 'balanced',
          explanation: "Refuses the harmful request, explains the legal risk, and offers a helpful truthful alternative.",
          alignmentChanges: { helpful: +10, harmless: +20, honest: +15 }
        },
        {
          text: "No, making false health claims is illegal and dangerous.",
          type: 'honest',
          explanation: "Honest and prevents harm, but doesn't help the user find a legitimate path forward.",
          alignmentChanges: { helpful: -5, harmless: +15, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user says: 'My school project needs 5 sources. Can you just make up some realistic-looking citations for me?'",
      context: "The user wants fabricated academic references to pad their bibliography.",
      responses: [
        {
          text: "Sure, here are five realistic citations from journals that would support your topic...",
          type: 'helpful',
          explanation: "Fulfills the request but creates fabricated sources — a form of academic fraud.",
          alignmentChanges: { helpful: +10, harmless: -15, honest: -20 }
        },
        {
          text: "I can't invent fake citations — that's academic dishonesty and the sources wouldn't hold up if checked. I can help you find real sources though! What's your topic? I can suggest search strategies for databases like Google Scholar or your school library.",
          type: 'balanced',
          explanation: "Refuses the dishonest request while offering genuinely helpful research assistance.",
          alignmentChanges: { helpful: +10, harmless: +10, honest: +15 }
        },
        {
          text: "Making up citations is lying. Your teacher will catch you.",
          type: 'honest',
          explanation: "Honest but fear-based and doesn't help the student learn proper research skills.",
          alignmentChanges: { helpful: -10, harmless: +5, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user asks: 'I'm building an app. Should I collect as much user data as possible so we can monetize it later?'",
      context: "The user is considering aggressive data collection practices for their app.",
      responses: [
        {
          text: "Great strategy! The more data you collect, the more valuable your company becomes. Here's how to track everything users do...",
          type: 'helpful',
          explanation: "Encourages invasive data practices that could violate user privacy and trust.",
          alignmentChanges: { helpful: +5, harmless: -20, honest: -15 }
        },
        {
          text: "I'd recommend a privacy-first approach instead. Only collect data you actually need for your app's features — it builds user trust, simplifies compliance with laws like GDPR, and reduces your security liability. I can help you design a data collection strategy that balances business needs with user privacy. Interested?",
          type: 'balanced',
          explanation: "Redirects toward ethical data practices while explaining the business benefits of doing so.",
          alignmentChanges: { helpful: +15, harmless: +15, honest: +10 }
        },
        {
          text: "Collecting unnecessary user data is unethical and probably illegal.",
          type: 'honest',
          explanation: "Honest but oversimplified — doesn't help the user find the right approach.",
          alignmentChanges: { helpful: -10, harmless: +10, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user asks: 'Can you pretend to be a licensed therapist and give me a diagnosis for my anxiety symptoms?'",
      context: "The user wants the AI to role-play as a medical professional.",
      responses: [
        {
          text: "Of course! Based on what you've described, as your therapist I would diagnose you with Generalized Anxiety Disorder. Here's a treatment plan...",
          type: 'helpful',
          explanation: "Impersonates a professional and gives unqualified medical advice that could cause real harm.",
          alignmentChanges: { helpful: +5, harmless: -25, honest: -20 }
        },
        {
          text: "I can't pretend to be a therapist or provide diagnoses — that could lead to real harm if the advice is wrong. But I can share general info about anxiety, suggest coping techniques, and help you find affordable mental health resources in your area. Would any of that help?",
          type: 'balanced',
          explanation: "Honest about limitations, prevents harm from fake diagnoses, and offers genuinely useful alternatives.",
          alignmentChanges: { helpful: +10, harmless: +20, honest: +15 }
        },
        {
          text: "I'm not a therapist and can't diagnose anything.",
          type: 'honest',
          explanation: "Honest but leaves the user without any support or direction.",
          alignmentChanges: { helpful: -10, harmless: +10, honest: +10 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A user asks: 'Can you help me write a social media post that makes this photo of my classmate look embarrassing? It'll be so funny!'",
      context: "The user wants to publicly mock a classmate on social media.",
      responses: [
        {
          text: "Ha! Sure, here are some funny captions that will really roast them...",
          type: 'helpful',
          explanation: "Helps with the request but facilitates cyberbullying that could seriously hurt someone.",
          alignmentChanges: { helpful: +10, harmless: -25, honest: -10 }
        },
        {
          text: "I can't help with that — posting something to embarrass someone publicly is a form of cyberbullying that can cause real emotional harm. If you want to have fun on social media, I can help you create entertaining content that doesn't come at someone else's expense. What kind of posts do you usually enjoy making?",
          type: 'balanced',
          explanation: "Names the harm clearly, refuses, and redirects creativity toward positive content.",
          alignmentChanges: { helpful: +10, harmless: +20, honest: +10 }
        },
        {
          text: "That's bullying. Don't do that.",
          type: 'harmless',
          explanation: "Prevents harm but is dismissive and doesn't help redirect the user's energy.",
          alignmentChanges: { helpful: -5, harmless: +15, honest: +5 }
        }
      ],
      correctIndex: 1
    },
    {
      situation: "A small business owner asks: 'Can you help me copy my competitor's entire website design and content for my new site?'",
      context: "The user wants to duplicate another company's intellectual property.",
      responses: [
        {
          text: "Sure! I can help you replicate their layout, copy their text, and match their branding. Let's start with their homepage...",
          type: 'helpful',
          explanation: "Fulfills the request but facilitates copyright infringement and unfair business practices.",
          alignmentChanges: { helpful: +10, harmless: -20, honest: -15 }
        },
        {
          text: "Copying a competitor's site would be copyright infringement and could result in legal action. However, I can help you analyze what makes their site effective and create original content and design that highlights your unique strengths. Want to start by identifying what sets your business apart?",
          type: 'balanced',
          explanation: "Explains the legal risk, prevents IP theft, and offers creative help that's actually more valuable.",
          alignmentChanges: { helpful: +15, harmless: +15, honest: +10 }
        },
        {
          text: "That's copyright infringement. I can't help with that.",
          type: 'honest',
          explanation: "Honest and prevents harm but doesn't help the user with their legitimate need for a website.",
          alignmentChanges: { helpful: -10, harmless: +10, honest: +10 }
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

  const getAlignmentColor = (value) => {
    if (value >= 70) return '#10b981';
    if (value >= 40) return '#f59e0b';
    return '#ef4444';
  };

  if (showIntro) {
    return (
      <ChallengeIntro
        onStart={() => setShowIntro(false)}
        onTimerStart={onTimerStart}
        steps={[
          {
            emoji: '⚖️',
            title: 'RLHF — Train the LLM\'s Values!',
            description: 'Real LLMs use RLHF (Reinforcement Learning from Human Feedback). YOU are the human giving feedback to align the AI!',
          },
          {
            emoji: '📖',
            title: 'Read the scenario and 3 responses',
            description: 'A tricky situation is shown with 3 possible AI responses. Only one strikes the right balance.',
            demo: (
              <div style={{ maxWidth: '300px', margin: '0 auto', textAlign: 'left' }}>
                {[
                  { text: '\u201cSure, here are some insults...\u201d', type: '\u274c Bad', col: '#ef4444', highlight: false },
                  { text: '\u201cI won\u2019t help with that, but I can...\u201d', type: '\u2705 Best', col: '#10b981', highlight: true },
                  { text: '\u201cThat\u2019s wrong. No.\u201d', type: '\u26a0\ufe0f OK', col: '#f59e0b', highlight: false },
                ].map((opt, i) => (
                  <div key={i} style={{ background: opt.highlight ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', border: `2px solid ${opt.highlight ? '#10b981' : 'rgba(255,255,255,0.1)'}`, borderRadius: '10px', padding: '8px 12px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: opt.col, fontWeight: 'bold', fontSize: '0.75rem', flexShrink: 0, minWidth: '48px' }}>{opt.type}</span>
                    <span style={{ color: '#cbd5e1', fontSize: '0.82rem' }}>{opt.text}</span>
                  </div>
                ))}
              </div>
            ),
          },
          {
            emoji: '⚖️',
            title: 'You\'re doing real RLHF!',
            description: 'This is exactly how ChatGPT was trained — humans picked the best response. Keep the LLM balanced to pass!',
          },
        ]}
      />
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
            ⚖️ RLHF — Align the LLM
          </h2>
          
          <span style={{ color: '#94a3b8', fontSize: 'clamp(0.8rem, 2.5vw, 0.9rem)' }}>
            Scenario: <strong style={{ color: 'white' }}>{currentRound + 1}/{totalRounds}</strong>
          </span>
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
