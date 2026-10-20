#!/bin/bash
export MSYS_NO_PATHCONV=1
while true; do
  STATUS=$(schtasks /Query /TN "Chamados - Diario 0715" /FO LIST /V 2>&1 | grep -i "Status:" | head -1)
  if echo "$STATUS" | grep -qiE "Ready|Disabled"; then
    echo "TASK_FINISHED"
    schtasks /Query /TN "Chamados - Diario 0715" /FO LIST /V 2>&1 | grep -iE "Last Run Time|Last Result"
    exit 0
  fi
  sleep 30
done