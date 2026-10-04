$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) { throw 'ANDROID_HOME não configurado.' }
$javaHome = $env:JAVA_HOME
if (-not $javaHome) { throw 'JAVA_HOME não configurado.' }
$javac = Join-Path $javaHome 'bin\javac.exe'
$jar = Join-Path $javaHome 'bin\jar.exe'
$keytool = Join-Path $javaHome 'bin\keytool.exe'

$buildTools = Join-Path $androidHome 'build-tools\34.0.0'
$androidJar = Join-Path $androidHome 'platforms\android-34\android.jar'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
@($androidJar,$aapt2,$d8,$zipalign,$apksigner,$javac,$jar,$keytool) | ForEach-Object { if (-not (Test-Path -LiteralPath $_)) { throw "Ferramenta de compilação ausente: $_" } }

$build = Join-Path $PSScriptRoot 'build'
$compiled = Join-Path $build 'compiled'
$generated = Join-Path $build 'generated'
$classes = Join-Path $build 'classes'
$dex = Join-Path $build 'dex'
$output = Join-Path $PSScriptRoot 'output'
if (Test-Path -LiteralPath $build) { Remove-Item -LiteralPath $build -Recurse -Force }
New-Item -ItemType Directory -Force -Path $compiled,$generated,$classes,$dex,$output | Out-Null

& $aapt2 compile --dir (Join-Path $PSScriptRoot 'res') -o (Join-Path $compiled 'resources.zip')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar recursos Android.' }

$unsignedApk = Join-Path $build 'jll-atendimento-unsigned.apk'
& $aapt2 link -o $unsignedApk -I $androidJar --manifest (Join-Path $PSScriptRoot 'AndroidManifest.xml') --java $generated --min-sdk-version 24 --target-sdk-version 34 --version-code 1 --version-name '1.0.0' --auto-add-overlay -R (Join-Path $compiled 'resources.zip')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao vincular recursos Android.' }

$javaSources = @((Join-Path $PSScriptRoot 'src\br\com\jllmontagens\atendimento\MainActivity.java')) + @(Get-ChildItem -LiteralPath $generated -Recurse -Filter '*.java' | Select-Object -ExpandProperty FullName)
& $javac -g -parameters -encoding UTF-8 -source 8 -target 8 -bootclasspath $androidJar -d $classes $javaSources
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o código Android.' }

$classesJar = Join-Path $build 'compiled-classes.jar'
& $jar cf $classesJar -C $classes '.'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao empacotar as classes Java.' }
& $d8 --lib $androidJar --min-api 24 --output $dex $classesJar
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar o código DEX.' }

& $jar uf $unsignedApk -C $dex 'classes.dex'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao adicionar o DEX ao APK.' }

$alignedApk = Join-Path $build 'jll-atendimento-aligned.apk'
& $zipalign -f 4 $unsignedApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'Falha ao alinhar o APK.' }

$keystore = Join-Path $build 'jll-debug.keystore'
& $keytool -genkeypair -v -keystore $keystore -storepass android -alias androiddebugkey -keypass android -dname 'CN=JLL Montagens Debug,OU=Atendimento,O=JLL Montagens,L=Rio de Janeiro,ST=RJ,C=BR' -keyalg RSA -keysize 2048 -validity 3650
if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar a assinatura de teste.' }

$finalApk = Join-Path $output 'JLL-Atendimento-homologacao.apk'
& $apksigner sign --ks $keystore --ks-pass pass:android --key-pass pass:android --out $finalApk $alignedApk
if ($LASTEXITCODE -ne 0) { throw 'Falha ao assinar o APK.' }
& $apksigner verify --verbose --print-certs $finalApk
if ($LASTEXITCODE -ne 0) { throw 'A assinatura do APK não foi validada.' }

Write-Output "APK gerado: $finalApk"
