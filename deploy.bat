@echo off
REM Sigma Chat Deployment Script for Windows
REM Usage: deploy.bat [domain] [method]
REM Methods: docker (default), manual

setlocal enabledelayedexpansion

set DOMAIN=%1
set METHOD=%2

if "%DOMAIN%"=="" set DOMAIN=localhost:3000
if "%METHOD%"=="" set METHOD=docker

echo.
echo ╔════════════════════════════════════════╗
echo ║     Sigma Chat Auto-Deploy (Windows)   ║
echo ╚════════════════════════════════════════╝
echo.
echo Domain: %DOMAIN%
echo Method: %METHOD%
echo.

if /i "%METHOD%"=="docker" (
    call :deploy_docker
) else if /i "%METHOD%"=="manual" (
    call :deploy_manual
) else (
    echo ERROR: Unknown method: %METHOD%
    echo.
    echo Usage: deploy.bat [domain] [method]
    echo.
    echo Methods:
    echo   docker   - Docker Compose (recommended^)
    echo   manual   - Manual setup (Node.js required^)
    exit /b 1
)

goto :end

:deploy_docker
echo [*] Checking for Docker...
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker is not installed!
    echo.
    echo Install Docker Desktop from: https://www.docker.com/products/docker-desktop
    exit /b 1
)

where docker-compose >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Docker Compose is not installed!
    exit /b 1
)

echo [OK] Docker found
echo.
echo [*] Creating .env file...

if exist .env (
    echo [OK] .env already exists
) else (
    (
        echo DB_USER=sigma
        echo DB_PASSWORD=changeme_to_random_password
        echo SESSION_SECRET=change_this_to_random_secret_key
        echo APP_URL=https://%DOMAIN%
        echo NODE_ENV=production
        echo RESEND_API_KEY=your_resend_api_key_here
    ) > .env
    echo [OK] .env created - please edit it with your settings
)

echo.
echo [*] Starting Docker Compose...
docker-compose up -d

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ╔════════════════════════════════════════╗
    echo ║  ✓ Docker deployment successful!      ║
    echo ╚════════════════════════════════════════╝
    echo.
    echo Commands:
    echo   Check status:  docker-compose ps
    echo   View logs:     docker-compose logs -f
    echo   Stop:          docker-compose down
    echo   Restart:       docker-compose restart
    echo.
    echo Access app: http://localhost:3000
    echo Admin: Admin / whatthesigma
) else (
    echo [ERROR] Docker Compose startup failed
    exit /b 1
)

goto :end

:deploy_manual
echo [*] Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Install Node.js from: https://nodejs.org
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION% found

echo.
echo [*] Creating .env file...

if exist .env (
    echo [OK] .env already exists
) else (
    (
        echo PORT=3000
        echo DATABASE_URL=postgresql://user:password@localhost:5432/sigma_chat
        echo SESSION_SECRET=change_this_to_random_secret_key
        echo APP_URL=http://localhost:3000
        echo NODE_ENV=development
        echo RESEND_API_KEY=your_resend_api_key_here
        echo UPLOAD_DIR=./uploads
    ) > .env
    echo [OK] .env created - please edit it
)

echo.
echo [*] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed
    exit /b 1
)

echo.
echo [!] Manual setup requires PostgreSQL to be installed and running
echo [!] Please ensure you have:
echo     - PostgreSQL installed and running
echo     - DATABASE_URL configured in .env
echo     - Database schema initialized
echo.
echo To initialize the database:
echo   psql -U postgres -d sigma_chat -f database/schema.sql
echo.

echo [*] Starting server...
call npm start

goto :end

:end
endlocal
