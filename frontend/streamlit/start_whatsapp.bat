@echo off
title WhatsApp CRM Bridge
pushd "%~dp0..\..\backend\whatsapp-bridge"

echo Verificando Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo Instalando dependencias, aguarde...
    call npm install
    if errorlevel 1 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo  WhatsApp CRM Bridge
echo  Na primeira vez, um QR code aparecera abaixo.
echo  Escaneie com o WhatsApp do tecnico (igual ao WhatsApp Web).
echo  A sessao e salva - nao precisara repetir depois.
echo  Feche esta janela para encerrar a captura.
echo ============================================================
echo.

node index.js

popd
echo.
echo Bridge encerrado.
pause
