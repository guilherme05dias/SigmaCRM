param(
    [string]$ProjectRef = "fiayxnorzxvrxambetds",
    [string]$CompanyId = "d397c7ba-3133-4ce0-afda-c27566fb025f",
    [string]$ApiPort = "3334",
    [string]$WebOrigin = "http://localhost:5173",
    [string]$DatabaseUrl = "",
    [string]$DirectUrl = ""
)

$ErrorActionPreference = "Stop"

function ConvertTo-PlainText([Security.SecureString]$secure) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function New-HexToken([int]$bytes = 32) {
    $buffer = New-Object byte[] $bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
        return -join ($buffer | ForEach-Object { $_.ToString("x2") })
    } finally {
        $rng.Dispose()
    }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiEnvPath = Join-Path $repoRoot "apps/api/.env"

Write-Host "Configurando apps/api/.env para Supabase + UAZAPI..." -ForegroundColor Cyan
Write-Host "Projeto Supabase: $ProjectRef"

$dbPassword = ""
if ([string]::IsNullOrWhiteSpace($DatabaseUrl) -or [string]::IsNullOrWhiteSpace($DirectUrl)) {
    Write-Host "Cole as connection strings oficiais do Supabase se quiser evitar inferencia de host/usuario." -ForegroundColor Yellow
    Write-Host "No painel: Project Settings > Database > Connection string." -ForegroundColor DarkGray
    $DatabaseUrl = Read-Host "DATABASE_URL pooler/transacional (Enter para gerar automaticamente)"
    $DirectUrl = Read-Host "DIRECT_URL direta (Enter para gerar automaticamente)"
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl) -or [string]::IsNullOrWhiteSpace($DirectUrl)) {
    $dbPassword = ConvertTo-PlainText (Read-Host "Senha do banco Supabase" -AsSecureString)
}
$jwtSecretInput = Read-Host "JWT_SECRET local (Enter para gerar automaticamente)"
$jwtSecret = if ([string]::IsNullOrWhiteSpace($jwtSecretInput)) { New-HexToken 32 } else { $jwtSecretInput.Trim() }
$internalToken = New-HexToken 32

if (Test-Path $apiEnvPath) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$apiEnvPath.backup-$timestamp"
    Copy-Item -LiteralPath $apiEnvPath -Destination $backupPath
    Write-Host "Backup criado: $backupPath" -ForegroundColor DarkGray
}

Write-Host "Atualizando secret SIGMA_INTERNAL_TOKEN no Supabase..." -ForegroundColor Cyan
npx supabase secrets set "SIGMA_INTERNAL_TOKEN=$internalToken" --project-ref $ProjectRef | Out-Host

if ([string]::IsNullOrWhiteSpace($DatabaseUrl) -or [string]::IsNullOrWhiteSpace($DirectUrl)) {
    $encodedPassword = [Uri]::EscapeDataString($dbPassword)
    $DatabaseUrl = "postgresql://postgres.${ProjectRef}:${encodedPassword}@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
    $DirectUrl = "postgresql://postgres:${encodedPassword}@db.${ProjectRef}.supabase.co:5432/postgres"
}

$envContent = @"
DATABASE_URL="$DatabaseUrl"
DIRECT_URL="$DirectUrl"

SUPABASE_URL=https://$ProjectRef.supabase.co
DEFAULT_COMPANY_ID=$CompanyId
SIGMA_DEFAULT_COMPANY_ID=$CompanyId

PORT=$ApiPort
JWT_SECRET=$jwtSecret
CORS_ORIGIN=$WebOrigin

WHATSAPP_PROVIDER=uazapi
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_DEFAULT_SESSION_ID=sigma-teste
UAZAPI_SEND_TEXT_PATH=/send/text
UAZAPI_SEND_VIA_SUPABASE_EDGE=true

SIGMA_INTERNAL_TOKEN=$internalToken
"@

Set-Content -LiteralPath $apiEnvPath -Value $envContent -Encoding UTF8

Write-Host "apps/api/.env configurado com sucesso." -ForegroundColor Green
Write-Host "O token interno foi salvo localmente e no Supabase. Nao compartilhe este arquivo." -ForegroundColor Yellow
Write-Host "Proximo teste sugerido: npm run dev:api" -ForegroundColor Cyan
