@echo off
pushd "%~dp0"
echo Encerrando o aplicativo Streamlit...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'streamlit run main.py' } | ForEach-Object { Write-Host 'Encerrando processo PID:' $_.ProcessId; Stop-Process -Id $_.ProcessId -Force }"
popd
