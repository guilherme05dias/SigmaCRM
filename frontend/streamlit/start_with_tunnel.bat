@echo off
pushd "%~dp0"
title CRM Tecnicos - Acesso Remoto (Tailscale)

echo Verificando Tailscale...
for /f "tokens=*" %%I in ('tailscale ip -4 2^>nul') do set TAILSCALE_IP=%%I

if "%TAILSCALE_IP%"=="" (
    echo.
    echo [AVISO] Tailscale nao encontrado ou nao conectado.
    echo Baixe em: https://tailscale.com/download/windows
    echo.
    echo Abrindo mesmo assim apenas na rede local...
    set TAILSCALE_IP=localhost
) else (
    echo Tailscale ativo! IP: %TAILSCALE_IP%
)

echo.
echo ================================================================
echo  Acesso no computador : http://localhost:8501
echo  Acesso pelo celular  : http://%TAILSCALE_IP%:8501
echo  (instale o app Tailscale no celular e faca login na mesma conta)
echo ================================================================
echo.

if exist "%~dp0\.venv\Scripts\python.exe" (
    "%~dp0\.venv\Scripts\python.exe" -m streamlit run main.py ^
        --server.address=0.0.0.0 ^
        --server.port=8501 ^
        --server.runOnSave=true ^
        --server.fileWatcherType=auto
) else (
    echo Nao foi possivel encontrar o Python no virtualenv.
    pause
)
popd
