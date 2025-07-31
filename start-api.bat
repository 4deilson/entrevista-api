@echo off
:: start-api.bat - Script para iniciar a API matando processos anteriores

echo.
echo 🚀 Iniciando API Entrevista - Versao Atualizada
echo ================================================

:: Mata todos os processos Node.js existentes
echo 🔪 Matando processos Node.js existentes...
taskkill /F /IM node.exe 2>nul || echo   - Nenhum processo Node.js ativo

:: Mata processos específicos na porta 3000
echo 🔍 Verificando porta 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
    echo   - Matando processo PID %%a
    taskkill /F /PID %%a 2>nul
)

:: Aguarda um momento para liberação da porta
echo ⏳ Aguardando liberação da porta...
timeout /t 3 /nobreak >nul

:: Verifica se logo existe
if not exist "logo_abertura.png" (
    echo ❌ ERRO: logo_abertura.png não encontrado!
    echo    Este arquivo é obrigatório para o funcionamento da API.
    pause
    exit /b 1
)

:: Verifica dependências
if not exist "node_modules" (
    echo 📦 Instalando dependências...
    call npm install
    if errorlevel 1 (
        echo ❌ Erro na instalação das dependências!
        pause
        exit /b 1
    )
)

:: Cria diretórios necessários
if not exist "tmp" mkdir tmp
if not exist "output" mkdir output

echo ✅ Preparação concluída!
echo.
echo 🌐 Iniciando servidor na porta 3000...
echo    - Health Check: http://localhost:3000/health
echo    - Status: http://localhost:3000/api/stats
echo    - Debug: http://localhost:3000/api/debug
echo.
echo ⏹️  Para parar: Ctrl+C
echo ================================================

:: Inicia a API
node server.js
