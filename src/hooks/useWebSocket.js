import { useState, useEffect, useRef } from 'react';

const useWebSocket = () => {
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [wasKickedState, setWasKickedState] = useState(() => sessionStorage.getItem('wasKicked') === 'true'); // Expose kicked status as state
  const ws = useRef(null);
  const clientId = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);
  const wasKicked = useRef(false); // Track if student was kicked

  useEffect(() => {
    // Check if user was kicked in a previous session
    const kickedFlag = sessionStorage.getItem('wasKicked');
    if (kickedFlag === 'true') {
      console.log('User was kicked, preventing reconnection');
      wasKicked.current = true;
      return;
    }

    const connect = () => {
      // Don't reconnect if kicked
      if (wasKicked.current) {
        console.log('Reconnection blocked - user was kicked');
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // If accessing via localhost or IP, connect directly to port 3001
      // If accessing via domain (https), use /ws path through proxy
      const isLocalAccess = window.location.hostname === 'localhost' || 
                            window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/);
      const wsUrl = isLocalAccess 
        ? `${protocol}//${window.location.hostname}:3001`
        : `${protocol}//${window.location.host}/ws`; // Use proxy path
      
      console.log('Connecting to WebSocket:', wsUrl);
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        reconnectAttempts.current = 0; // Reset attempts on successful connection
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleMessage(data);
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        
        // Don't reconnect if kicked
        if (wasKicked.current) {
          console.log('Connection closed - user was kicked, not reconnecting');
          return;
        }
        
        // Attempt to reconnect with exponential backoff
        const maxAttempts = 10;
        if (reconnectAttempts.current < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Max 30 seconds
          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttempts.current + 1}/${maxAttempts})`);
          reconnectAttempts.current++;
          reconnectTimeout.current = setTimeout(connect, delay);
        } else {
          console.error('Max reconnection attempts reached. Please refresh the page.');
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

  const handleMessage = (data) => {
    console.log('Received message:', data);
    
    switch (data.type) {
      case 'connected':
        clientId.current = data.clientId;
        setGameState(data.gameState);
        break;
      
      case 'game_started':
      case 'game_ended':
        setGameState(data.gameState);
        break;
      
      case 'knowledge_reset':
        // Force a complete state replacement with fresh empty arrays
        console.log('[CLIENT] Received knowledge_reset, clearing all AI data');
        console.log('[CLIENT] Reset data:', data.gameState);
        setGameState({
          ...data.gameState,
          trainingData: [],
          llmKnowledge: [],
          evolutionCount: 0,
          llmPersonality: 'neutral',
          pendingQuestions: []
        });
        break;
      
      case 'clients_update':
        setGameState(prev => ({
          ...prev,
          clients: data.clients
        }));
        break;
      
      case 'llm_evolved':
        // Update gameState with new evolution data
        setGameState(prev => ({
          ...prev,
          evolutionCount: data.evolutionCount,
          llmPersonality: data.personality,
          llmKnowledge: data.llmKnowledge !== undefined ? data.llmKnowledge : prev.llmKnowledge
        }));
        // Also add to messages for activity log
        setMessages((prev) => [...prev, data]);
        break;
      
      case 'llm_primed':
        // AI Mind was primed with current data - add to messages for activity log
        setMessages((prev) => [...prev, data]);
        break;
      
      case 'game_state':
        // Full game state update (includes starred pairs, etc.)
        console.log('[CLIENT] Received game_state update:', data.gameState);
        setGameState(data.gameState);
        break;
      
      case 'kicked':
        // Student was kicked - set flag and prevent reconnection
        console.log('[CLIENT] Kicked by teacher');
        wasKicked.current = true;
        setWasKickedState(true);
        sessionStorage.setItem('wasKicked', 'true');
        setMessages((prev) => [...prev, data]);
        // Close connection gracefully
        if (ws.current) {
          ws.current.close();
        }
        break;
      
      default:
        setMessages((prev) => [...prev, data]);
        break;
    }
  };

  const sendMessage = (message) => {
    console.log('[CLIENT] Sending message:', message);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify(message));
        console.log('[CLIENT] Message sent successfully');
      } catch (error) {
        console.error('[CLIENT] Error sending message:', error);
      }
    } else {
      console.error('[CLIENT] WebSocket not open. ReadyState:', ws.current?.readyState);
    }
  };

  return {
    connected,
    gameState,
    messages,
    sendMessage,
    clientId: clientId.current,
    wasKicked: wasKickedState
  };
};

export default useWebSocket;
