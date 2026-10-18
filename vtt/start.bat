@echo off
chcp 65001 >nul
title DM Mesa
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode de novo.
  echo.
  pause
  exit /b 1
)
node -e "process.exit(+process.versions.node.split(String.fromCharCode(46))[0] < 22 ? 1 : 0)"
if errorlevel 1 (
  echo.
  echo  Seu Node.js e antigo. Instale a versao 22 ou mais nova em https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias - so na primeira vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto erro
)

echo Preparando a mesa...
call npm run build --silent
if errorlevel 1 goto erro

node server\index.ts --open
goto fim

:erro
echo.
echo  Algo deu errado. Veja a mensagem acima.
pause
:fim
