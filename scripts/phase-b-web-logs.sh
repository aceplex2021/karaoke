#!/bin/bash
cd /opt/kara2
docker compose logs web --tail 200 2>/dev/null | grep -E 'join|expired|Error|error|json_err|410|404|participants' | tail -80
