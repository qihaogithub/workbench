#!/bin/sh
set -e

# 前台启动 server，同时后台预热
node packages/author-site/server.js &
SERVER_PID=$!

trap "kill $SERVER_PID 2>/dev/null" EXIT

sleep 2

node -e "
  Promise.allSettled([
    fetch('http://localhost:3200/'),
    fetch('http://localhost:3200/login'),
  ]).then(function(r) {
    var ok = r.filter(function(x) { return x.status === 'fulfilled' && x.value.ok; }).length;
    console.log('[warmup] ' + ok + '/' + r.length + ' routes warmed');
  }).catch(function() {
    console.warn('[warmup] failed');
  });
"

wait $SERVER_PID
