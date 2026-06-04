@echo off
pushd "%~dp0"
echo Iniciando o aplicativo Streamlit...
echo.
echo Acesso no computador:  http://localhost:8501
echo Acesso pelo celular:   http://192.168.3.35:8501  (mesma rede Wi-Fi)
echo.
if exist "%~dp0\.venv\Scripts\python.exe" (
    "%~dp0\.venv\Scripts\python.exe" -m streamlit run main.py --server.address=0.0.0.0 --server.port=8501 --server.runOnSave=true --server.fileWatcherType=auto
) else if exist "%~dp0\venv\Scripts\python.exe" (
    "%~dp0\venv\Scripts\python.exe" -m streamlit run main.py --server.address=0.0.0.0 --server.port=8501 --server.runOnSave=true --server.fileWatcherType=auto
) else (
    echo Nao foi possivel encontrar o interpretador Python no virtualenv.
    echo Verifique se a pasta ".venv" ou "venv" existe e tente novamente.
)
popd