param(
  [string]$ApiBase = 'https://portal-cliente-git-homologacao-jean-melo.vercel.app'
)

$ErrorActionPreference = 'Stop'
$secureBypass = Read-Host 'Cole o segredo do Protection Bypass da Vercel' -AsSecureString
$bypass = [Net.NetworkCredential]::new('', $secureBypass).Password

if ([string]::IsNullOrWhiteSpace($bypass)) {
  throw 'O bypass não foi informado.'
}

Write-Host 'Validando o bypass diretamente na Vercel...'
try {
  $response = Invoke-WebRequest -Uri "$ApiBase/api/health" -Headers @{
    'x-vercel-protection-bypass' = $bypass
  } -UseBasicParsing
  if ($response.StatusCode -ne 200) {
    throw "A Vercel respondeu com status $($response.StatusCode)."
  }
} catch {
  Remove-Variable bypass, secureBypass -ErrorAction SilentlyContinue
  throw 'O bypass foi rejeitado. Confirme o segredo e faça um novo deploy da homologação depois de criá-lo na Vercel.'
}

Push-Location $PSScriptRoot
try {
  Write-Host 'Bypass aprovado. Compilando o APK de homologação...'
  & flutter build apk --release "--dart-define=API_BASE_URL=$ApiBase" "--dart-define=VERCEL_PROTECTION_BYPASS=$bypass"
  if ($LASTEXITCODE -ne 0) { throw 'A compilação do Flutter falhou.' }
  Write-Host "APK criado em: $PSScriptRoot\build\app\outputs\flutter-apk\app-release.apk"
} finally {
  Pop-Location
  Remove-Variable bypass, secureBypass -ErrorAction SilentlyContinue
}
