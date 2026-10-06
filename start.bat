@echo off
rem Arranca el servidor local y abre la demo en el navegador.
cd /d "%~dp0"
if not exist node_modules\ws (
  echo Instalando dependencias...
  call npm install --no-audit --no-fund
)
start "" "http://localhost:5173"
node server.js
