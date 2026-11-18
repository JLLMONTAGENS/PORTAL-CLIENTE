param([string]$ApiBase = 'https://www.jllmontagens.com.br')

$ErrorActionPreference = 'Stop'
$googleServices = Join-Path $PSScriptRoot 'android\app\google-services.json'
$keyProperties = Join-Path $PSScriptRoot 'android\key.properties'
if (-not (Test-Path -LiteralPath $googleServices)) { throw 'Adicione o google-services.json de PRODUCAO em android\app.' }
if (-not (Test-Path -LiteralPath $keyProperties)) { throw 'Configure android\key.properties com a chave de upload da Play Store.' }
$firebase = Get-Content -LiteralPath $googleServices -Raw | ConvertFrom-Json
$projectId = [string]$firebase.project_info.project_id
$expectedPackage = 'br.com.jllmontagens.atendimento'
$packages = @($firebase.client | ForEach-Object { [string]$_.client_info.android_client_info.package_name })
if ($projectId -match 'homolog') { throw "O google-services.json ainda aponta para homologacao ($projectId)." }
if ($expectedPackage -notin $packages) { throw "Pacote Firebase esperado nao encontrado: $expectedPackage. Encontrados: $($packages -join ', ')" }

$health = Invoke-RestMethod -Uri "$($ApiBase.TrimEnd('/'))/api/health" -Method Get
if (-not $health) { throw 'A API de producao nao respondeu corretamente.' }

Push-Location $PSScriptRoot
try {
  & flutter pub get
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar as dependencias.' }
  & flutter build appbundle --release "--dart-define=API_BASE_URL=$($ApiBase.TrimEnd('/'))"
  if ($LASTEXITCODE -ne 0) { throw 'A compilacao do AAB falhou.' }
  & flutter build apk --release "--dart-define=API_BASE_URL=$($ApiBase.TrimEnd('/'))"
  if ($LASTEXITCODE -ne 0) { throw 'A compilacao do APK falhou.' }
  $release = Join-Path $PSScriptRoot 'release'; New-Item -ItemType Directory -Path $release -Force | Out-Null
  Copy-Item 'build\app\outputs\bundle\release\app-release.aab' (Join-Path $release 'JLL-Atendimento-1.0.2+3.aab') -Force
  Copy-Item 'build\app\outputs\flutter-apk\app-release.apk' (Join-Path $release 'JLL-Atendimento-1.0.2+3.apk') -Force
  Write-Host "Producao criada em $release" -ForegroundColor Green
} finally { Pop-Location }
