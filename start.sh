#!/bin/bash
# 啟動工廠生產排程系統

echo "啟動後端 API (port 5100)..."
cd /root/factory/backend && node index.js &
BACKEND_PID=$!

echo "啟動前端 (port 5174)..."
cd /root/factory/frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "系統已啟動："
echo "  前端: http://localhost:5174"
echo "  API:  http://localhost:5100/api"
echo ""
echo "按 Ctrl+C 停止"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo '已停止'" INT
wait
