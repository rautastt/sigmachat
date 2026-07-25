@echo off
REM Sigma Chat Manual Setup for Windows
REM No Docker required - just Node.js and PostgreSQL

setlocal enabledelayedexpansion

cls
echo.
echo ╔════════════════════════════════════════╗
echo ║   Sigma Chat Setup (No Docker)         ║
echo ╚════════════════════════════════════════╝
echo.

REM Check Node.js
echo [*] Checking Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found!
    echo.
    echo Install from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do echo [OK] Found %%i
for /f "tokens=*" %%i in ('npm -v') do echo [OK] npm %%i

echo.
echo [*] Checking PostgreSQL...
where psql >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PostgreSQL not found!
    echo.
    echo Install from: https://www.postgresql.org/download/windows/
    echo.
    pause
    exit /b 1
)

echo [OK] PostgreSQL found

echo.
echo [*] Creating .env file...

if exist .env (
    echo [OK] .env already exists - skipping
) else (
    (
        echo PORT=3000
        echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sigma_chat
        echo SESSION_SECRET=change_this_to_random_secret_at_least_32_chars
        echo APP_URL=http://localhost:3000
        echo NODE_ENV=development
        echo RESEND_API_KEY=your_resend_api_key_here
        echo UPLOAD_DIR=./uploads
    ) > .env
    echo [OK] .env created
    echo.
    echo IMPORTANT: Edit .env and set your DATABASE_URL if different
)

echo.
echo [*] Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed
    echo.
    pause
    exit /b 1
)

echo.
echo [*] Creating upload directory...
if not exist uploads mkdir uploads
echo [OK] uploads/ ready

echo.
echo ╔════════════════════════════════════════╗
echo ║  Setup complete! Next steps:           ║
echo ╚════════════════════════════════════════╝
echo.

echo STEP 1: Create database
echo --------
echo Open Command Prompt and run:
echo.
echo   createdb -U postgres sigma_chat
echo.
echo (If that fails, you may need to set up PostgreSQL first)
echo.

echo STEP 2: Initialize database schema
echo --------
echo Run this in Command Prompt:
echo.
echo   psql -U postgres -d sigma_chat -f database/schema.sql
echo.

echo STEP 3: Start the server
echo --------
echo Run in this folder:
echo.
echo   npm start
echo.
echo OR for development with auto-reload:
echo.
echo   npm run dev
echo.

echo STEP 4: Access the app
echo --------
echo   http://localhost:3000
echo   Admin: Admin / whatthesigma
echo.

echo For full setup guide, see: SELF_HOSTING.md
echo.

pause
