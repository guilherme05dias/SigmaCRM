@echo off
setlocal

cd /d "%~dp0.."

start "sigma-api" /b cmd /d /c call "%ProgramFiles%\nodejs\npm.cmd" run dev --workspace @sigma/api ^> api-dev-runtime.log 2^> api-dev-runtime.err.log
start "sigma-web" /b cmd /d /c call "%ProgramFiles%\nodejs\npm.cmd" run dev --workspace @sigma/web -- --host 127.0.0.1 ^> web-dev-runtime.log 2^> web-dev-runtime.err.log

echo Sigma API e Web iniciados.
echo API: http://127.0.0.1:3334
echo Web: http://127.0.0.1:5173
