@echo off
chcp 65001 > nul
cd /d C:\projetos\chamados
echo ---- %DATE% %TIME% >> C:\projetos\logs\campo_report.log
"C:\Program Files\nodejs\node.exe" scripts\campo_report.cjs --enviar --grupo > C:\projetos\logs\campo_report_bruto.txt 2>&1
set RC=%ERRORLEVEL%
echo resultado=%RC% >> C:\projetos\logs\campo_report.log
exit /b %RC%