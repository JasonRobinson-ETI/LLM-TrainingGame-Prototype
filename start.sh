#!/bin/bash

echo "🧠 Starting LLM Builder Activity..."
echo ""
echo "🌐 Frontend will be available at: http://localhost:3000"
echo "🔌 Backend will be available at: http://localhost:3001"
echo ""
echo "📝 Instructions:"
echo "   1. Open multiple browser windows/tabs"
echo "   2. One tab for Teacher dashboard"
echo "   3. Multiple tabs for Students (mix of Askers and Answerers)"
echo "   4. Click START on teacher dashboard"
echo "   5. Watch the chaos unfold! 🎉"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Kill any existing processes on our ports
for port in 3000 3001; do
  pids=$(lsof -t -i:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "🔄 Reclaiming port $port..."
    kill -9 $pids 2>/dev/null
    sleep 0.3
  fi
done

npm run dev
