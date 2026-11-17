[CmdletBinding()]
param(
    [string]$ProjectId = "jllmontagens-producao",
    [switch]$Login
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$RaizRepositorio = Split-Path -Parent $PSScriptRoot
$MarcaTempo = Get-Date -Format "yyyyMMdd-HHmmss"
$DiretorioTemporario = Join-Path ([IO.Path]::GetTempPath()) "jll-firebase-$MarcaTempo"

$Aplicativos = @(
    [pscustomobject]@{
        Nome = "JLL Atendimento"
        Pacote = "br.com.jllmontagens.atendimento"
        Destino = Join-Path $RaizRepositorio "atendimento-app\android\app\google-services.json"
    },
    [pscustomobject]@{
        Nome = "JLL Montador"
        Pacote = "br.com.jllmontagens.jll_montador"
        Destino = Join-Path $RaizRepositorio "montador-app\android\app\google-services.json"
    }
)

$Firebase = Get-Command firebase -ErrorAction SilentlyContinue
if ($Firebase) {
    $FirebaseExecutavel = $Firebase.Source
    $FirebasePrefixo = @()
} else {
    $Npx = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $Npx) {
        throw "Node.js/npx nao foi encontrado. Instale o Node.js antes de continuar."
    }
    $FirebaseExecutavel = $Npx.Source
    $FirebasePrefixo = @("--yes", "firebase-tools@latest")
    Write-Host "Firebase CLI nao esta instalado globalmente; sera executado por npx." -ForegroundColor Yellow
}

function Invoke-Firebase {
    param(
        [Parameter(Mandatory)]
        [string[]]$Argumentos,
        [switch]$Json
    )

    $ArgumentosCompletos = @($FirebasePrefixo) + @($Argumentos)
    $Saida = @(& $FirebaseExecutavel @ArgumentosCompletos)
    if ($LASTEXITCODE -ne 0) {
        throw "O Firebase CLI falhou: firebase $($Argumentos -join ' ')"
    }

    $Texto = $Saida -join "`n"
    if ($Json) {
        try {
            return $Texto | ConvertFrom-Json
        } catch {
            throw "O Firebase CLI nao devolveu um JSON valido. Saida: $Texto"
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($Texto)) {
        Write-Host $Texto
    }
}

function Get-ResultadoLista {
    param([Parameter(Mandatory)]$Resposta)

    $Resultado = $Resposta
    if ($Resposta.PSObject.Properties.Name -contains "result") {
        $Resultado = $Resposta.result
    }
    if ($null -ne $Resultado -and $Resultado.PSObject.Properties.Name -contains "apps") {
        $Resultado = $Resultado.apps
    }
    if ($null -eq $Resultado) { return @() }
    return @($Resultado)
}

function Get-AplicativosAndroid {
    $Resposta = Invoke-Firebase -Json -Argumentos @(
        "apps:list", "ANDROID",
        "--project", $ProjectId,
        "--json",
        "--non-interactive"
    )
    return @(Get-ResultadoLista $Resposta)
}

function Test-GoogleServices {
    param(
        [Parameter(Mandatory)][string]$Arquivo,
        [Parameter(Mandatory)][string]$Pacote
    )

    $Configuracao = Get-Content -LiteralPath $Arquivo -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($Configuracao.project_info.project_id -cne $ProjectId) {
        throw "O arquivo baixado pertence ao projeto '$($Configuracao.project_info.project_id)', nao a '$ProjectId'."
    }

    $Pacotes = @($Configuracao.client | ForEach-Object {
        $_.client_info.android_client_info.package_name
    })
    if ($Pacote -notin $Pacotes) {
        throw "O arquivo baixado nao contem o pacote Android '$Pacote'."
    }
}

try {
    [void](New-Item -ItemType Directory -Path $DiretorioTemporario -Force)

    if ($Login) {
        Write-Host "`n==> Abrindo o login do Firebase" -ForegroundColor Cyan
        Invoke-Firebase -Argumentos @("login")
    }

    Write-Host "`n==> Confirmando acesso ao projeto $ProjectId" -ForegroundColor Cyan
    $Projetos = Get-ResultadoLista (Invoke-Firebase -Json -Argumentos @(
        "projects:list", "--json", "--non-interactive"
    ))
    $Projeto = @($Projetos | Where-Object { $_.projectId -ceq $ProjectId }) | Select-Object -First 1
    if (-not $Projeto) {
        throw "O projeto '$ProjectId' nao esta acessivel para a conta autenticada. Execute novamente com -Login."
    }

    foreach ($Aplicativo in $Aplicativos) {
        Write-Host "`n==> Configurando $($Aplicativo.Nome)" -ForegroundColor Cyan
        $Apps = Get-AplicativosAndroid
        $App = @($Apps | Where-Object { $_.packageName -ceq $Aplicativo.Pacote }) | Select-Object -First 1

        if (-not $App) {
            Write-Host "Cadastrando pacote $($Aplicativo.Pacote)..."
            Invoke-Firebase -Argumentos @(
                "apps:create", "ANDROID", $Aplicativo.Nome,
                "--package-name", $Aplicativo.Pacote,
                "--project", $ProjectId,
                "--non-interactive"
            )

            for ($Tentativa = 1; $Tentativa -le 10 -and -not $App; $Tentativa++) {
                Start-Sleep -Seconds 2
                $Apps = Get-AplicativosAndroid
                $App = @($Apps | Where-Object { $_.packageName -ceq $Aplicativo.Pacote }) | Select-Object -First 1
            }
            if (-not $App) {
                throw "O app '$($Aplicativo.Pacote)' foi solicitado, mas ainda nao apareceu na listagem do Firebase."
            }
        } else {
            Write-Host "O pacote ja estava cadastrado; nenhum app duplicado foi criado." -ForegroundColor Yellow
        }

        $ArquivoTemporario = Join-Path $DiretorioTemporario "$($Aplicativo.Pacote).google-services.json"
        Invoke-Firebase -Argumentos @(
            "apps:sdkconfig", "ANDROID", $App.appId,
            "--project", $ProjectId,
            "--out", $ArquivoTemporario,
            "--non-interactive"
        )
        Test-GoogleServices -Arquivo $ArquivoTemporario -Pacote $Aplicativo.Pacote

        $DiretorioDestino = Split-Path -Parent $Aplicativo.Destino
        [void](New-Item -ItemType Directory -Path $DiretorioDestino -Force)
        if (Test-Path -LiteralPath $Aplicativo.Destino) {
            $Backup = "$($Aplicativo.Destino).backup-$MarcaTempo"
            Copy-Item -LiteralPath $Aplicativo.Destino -Destination $Backup -Force
            Write-Host "Configuracao anterior preservada em: $Backup" -ForegroundColor DarkGray
        }
        Copy-Item -LiteralPath $ArquivoTemporario -Destination $Aplicativo.Destino -Force
        Write-Host "Configuracao validada e instalada em: $($Aplicativo.Destino)" -ForegroundColor Green
    }

    Write-Host "`nFIREBASE DE PRODUCAO CONFIGURADO COM SUCESSO." -ForegroundColor Green
    Write-Host "Projeto: $ProjectId"
    Write-Host "Os dois google-services.json foram validados antes da instalacao."
    Write-Host "Proximo passo: configurar FIREBASE_SERVICE_ACCOUNT_JSON na Vercel e compilar os apps."
} finally {
    if (Test-Path -LiteralPath $DiretorioTemporario) {
        Remove-Item -LiteralPath $DiretorioTemporario -Recurse -Force -ErrorAction SilentlyContinue
    }
}
