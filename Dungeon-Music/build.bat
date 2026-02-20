@echo off
echo ============================================
echo   DM - Dungeon Music - Build Script
echo ============================================
echo.

REM Verifica se pyinstaller está instalado
python -m pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias...
    python -m pip install -r requirements.txt
)

echo.
echo Gerando executável...
echo.

python -m PyInstaller --onefile ^
    --name "DM-DungeonMusic" ^
    --windowed ^
    --icon "DM-dungeoun-music.ico" ^
    --add-data "src;src" ^
    --add-data "DM-dungeoun-music.ico;." ^
    --hidden-import pygame ^
    --hidden-import PIL ^
    --hidden-import mutagen ^
    --hidden-import mutagen.mp3 ^
    --hidden-import mutagen.id3 ^
    --hidden-import mutagen.flac ^
    main.py

echo.
if exist "dist\DM-DungeonMusic.exe" (
    echo ============================================
    echo   Build concluído com sucesso!
    echo   Executável: dist\DM-DungeonMusic.exe
    echo ============================================
) else (
    echo ============================================
    echo   ERRO: Build falhou!
    echo ============================================
)

pause
