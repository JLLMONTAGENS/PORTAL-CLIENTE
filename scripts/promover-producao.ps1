[CmdletBinding()]
param(
    [switch]$Executar,
    [switch]$SubstituirBancoProducao,
    [switch]$SemAuditoriaVercel,
    [string]$Confirmacao = "",
    [string]$ConfirmacaoBanco = ""
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$env:PGCLIENTENCODING = "UTF8"
$DiretorioInicial = (Get-Location).Path

$ConfirmacaoEsperada = "PROMOVER HOMOLOGACAO PARA PRODUCAO"
$ConfirmacaoBancoEsperada = "SUBSTITUIR BANCO DE PRODUCAO"
$MarcaTempo = Get-Date -Format "yyyyMMdd-HHmmss"
$DiretorioTemporario = $null
$WorktreeTemporario = $null
$BranchTemporaria = "promocao-producao-$MarcaTempo"
$DiretorioBackup = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "JLL-Backups\producao-$MarcaTempo"

function Write-Etapa([string]$Mensagem) {
    Write-Host "`n==> $Mensagem" -ForegroundColor Cyan
}

function Invoke-Comando {
    param(
        [Parameter(Mandatory = $true)][string]$Comando,
        [Parameter(Mandatory = $true)][string[]]$Argumentos,
        [switch]$OcultarSaida
    )

    if ($OcultarSaida) {
        & $Comando @Argumentos *> $null
    } else {
        & $Comando @Argumentos
    }

    if ($LASTEXITCODE -ne 0) {
        throw "O comando '$Comando' falhou com o codigo $LASTEXITCODE."
    }
}

function Get-SaidaComando {
    param(
        [Parameter(Mandatory = $true)][string]$Comando,
        [Parameter(Mandatory = $true)][string[]]$Argumentos
    )

    $saida = & $Comando @Argumentos 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "O comando '$Comando' falhou: $($saida -join [Environment]::NewLine)"
    }
    return ($saida -join "`n").Trim()
}

function Assert-ComandoExiste([string]$Nome) {
    if (-not (Get-Command $Nome -ErrorAction SilentlyContinue)) {
        throw "O programa '$Nome' nao foi encontrado no computador."
    }
}

function Read-DotEnv([string]$Caminho) {
    $resultado = @{}
    foreach ($linhaOriginal in [IO.File]::ReadAllLines($Caminho, [Text.Encoding]::UTF8)) {
        $linha = $linhaOriginal.Trim()
        if (-not $linha -or $linha.StartsWith("#")) { continue }
        $posicao = $linha.IndexOf("=")
        if ($posicao -lt 1) { continue }
        $nome = $linha.Substring(0, $posicao).Trim()
        $valor = $linha.Substring($posicao + 1).Trim()
        if ($valor.Length -ge 2 -and (($valor.StartsWith('"') -and $valor.EndsWith('"')) -or ($valor.StartsWith("'") -and $valor.EndsWith("'")))) {
            $valor = $valor.Substring(1, $valor.Length - 2)
        }
        $valor = $valor.Replace('\"', '"').Replace('\n', "`n").Replace('\\', '\')
        $resultado[$nome] = $valor
    }
    return $resultado
}

function Get-ValorBanco($Variaveis) {
    foreach ($nome in @("DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL")) {
        if ($Variaveis.ContainsKey($nome) -and -not [string]::IsNullOrWhiteSpace($Variaveis[$nome])) {
            return $Variaveis[$nome]
        }
    }
    return $null
}

function Get-IdentidadeBanco([string]$Url) {
    try {
        $uri = New-Object System.Uri($Url)
        return ($uri.Host.ToLowerInvariant() + $uri.AbsolutePath.ToLowerInvariant())
    } catch {
        throw "Uma URL de banco configurada na Vercel e invalida. O valor nao sera exibido por seguranca."
    }
}

function Testar-Utf8([string]$Raiz) {
    $extensoes = @(
        ".css", ".dart", ".gradle", ".html", ".java", ".js", ".json", ".kts",
        ".kt", ".md", ".plist", ".properties", ".ps1", ".sql", ".svg", ".swift",
        ".txt", ".xml", ".yaml", ".yml"
    )
    $utf8Estrito = New-Object System.Text.UTF8Encoding($false, $true)
    $arquivos = Get-SaidaComando "git" @("ls-files")
    $invalidos = New-Object System.Collections.Generic.List[string]

    foreach ($relativo in ($arquivos -split "`n")) {
        if ([string]::IsNullOrWhiteSpace($relativo)) { continue }
        if ($extensoes -notcontains [IO.Path]::GetExtension($relativo).ToLowerInvariant()) { continue }
        $absoluto = Join-Path $Raiz $relativo
        if (-not (Test-Path -LiteralPath $absoluto -PathType Leaf)) { continue }
        try {
            [void]$utf8Estrito.GetString([IO.File]::ReadAllBytes($absoluto))
        } catch {
            $invalidos.Add($relativo)
        }
    }

    if ($invalidos.Count -gt 0) {
        throw "Arquivos que nao estao em UTF-8: $($invalidos -join ', ')"
    }
    Write-Host "Todos os arquivos de texto versionados foram validados em UTF-8." -ForegroundColor Green
}

function Invoke-VercelEnvPull([string]$Ambiente, [string]$Destino) {
    $vercel = Get-Command "vercel" -ErrorAction SilentlyContinue
    if ($vercel) {
        Invoke-Comando $vercel.Source @("env", "pull", $Destino, "--environment=$Ambiente", "--yes") -OcultarSaida
        return
    }

    $npx = Get-Command "npx" -ErrorAction SilentlyContinue
    if (-not $npx) {
        throw "Vercel CLI nao encontrado. Instale com 'npm install -g vercel'."
    }
    Write-Host "Vercel CLI nao esta instalado; usando npx para executar a auditoria." -ForegroundColor Yellow
    Invoke-Comando $npx.Source @("--yes", "vercel", "env", "pull", $Destino, "--environment=$Ambiente", "--yes") -OcultarSaida
}

function Assert-VariaveisObrigatorias($Variaveis, [string]$Ambiente) {
    $obrigatorias = @(
        "ADMIN_SESSION_SECRET",
        "MONTADOR_SESSION_SECRET",
        "SMTP_CONFIG_ENCRYPTION_KEY",
        "PAYMENT_CONFIG_ENCRYPTION_KEY",
        "PAYMENT_WEBHOOK_SECRET",
        "BLOB_READ_WRITE_TOKEN",
        "BLOB_STORE_ID",
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "PUBLIC_SITE_URL"
    )
    $faltantes = New-Object System.Collections.Generic.List[string]
    foreach ($nome in $obrigatorias) {
        if (-not $Variaveis.ContainsKey($nome) -or [string]::IsNullOrWhiteSpace($Variaveis[$nome])) {
            $faltantes.Add($nome)
        }
    }
    if (-not (Get-ValorBanco $Variaveis)) {
        $faltantes.Add("DATABASE_URL ou POSTGRES_URL")
    }
    if ($faltantes.Count -gt 0) {
        throw "Variaveis ausentes em ${Ambiente}: $($faltantes -join ', ')."
    }
}

function Assert-UrlPublicaProducao($Producao, $Preview) {
    try {
        $urlProducao = New-Object System.Uri($Producao["PUBLIC_SITE_URL"])
    } catch {
        throw "PUBLIC_SITE_URL de Production nao e uma URL valida."
    }
    if ($urlProducao.Scheme -ne "https") {
        throw "PUBLIC_SITE_URL de Production deve usar HTTPS."
    }
    if ($Preview.ContainsKey("PUBLIC_SITE_URL") -and $Producao["PUBLIC_SITE_URL"] -eq $Preview["PUBLIC_SITE_URL"]) {
        throw "PUBLIC_SITE_URL de Production esta igual ao Preview. Configure o dominio oficial de producao."
    }
}

function New-BackupBanco([string]$UrlBanco, [string]$Destino) {
    Assert-ComandoExiste "pg_dump"
    Invoke-Comando "pg_dump" @(
        "--dbname=$UrlBanco",
        "--format=custom",
        "--encoding=UTF8",
        "--no-owner",
        "--no-privileges",
        "--file=$Destino"
    ) -OcultarSaida
}

function Restore-Banco([string]$UrlBanco, [string]$ArquivoDump) {
    Assert-ComandoExiste "pg_restore"
    Invoke-Comando "pg_restore" @(
        "--dbname=$UrlBanco",
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        $ArquivoDump
    ) -OcultarSaida
}

try {
    Assert-ComandoExiste "git"
    Assert-ComandoExiste "npm"

    $RaizRepositorio = Get-SaidaComando "git" @("rev-parse", "--show-toplevel")
    Set-Location -LiteralPath $RaizRepositorio

    Write-Etapa "Conferindo a branch e o repositorio"
    $branchAtual = Get-SaidaComando "git" @("branch", "--show-current")
    if ($branchAtual -ne "homologacao") {
        throw "Execute este comando na branch homologacao. Branch atual: $branchAtual."
    }
    if (-not [string]::IsNullOrWhiteSpace((Get-SaidaComando "git" @("status", "--porcelain")))) {
        throw "Existem alteracoes locais sem commit. A promocao foi bloqueada."
    }

    Invoke-Comando "git" @("fetch", "origin", "--prune") -OcultarSaida
    $localHomologacao = Get-SaidaComando "git" @("rev-parse", "homologacao")
    $remotaHomologacao = Get-SaidaComando "git" @("rev-parse", "origin/homologacao")
    $remotaMain = Get-SaidaComando "git" @("rev-parse", "origin/main")
    if ($localHomologacao -ne $remotaHomologacao) {
        throw "A branch homologacao local nao coincide com origin/homologacao. Sincronize antes de promover."
    }
    Write-Host "Homologacao: $($remotaHomologacao.Substring(0, 7))"
    Write-Host "Main atual: $($remotaMain.Substring(0, 7))"

    Write-Etapa "Validando a codificacao dos textos"
    Testar-Utf8 $RaizRepositorio

    Write-Etapa "Executando os testes do projeto"
    Invoke-Comando "npm" @("test")

    $producao = $null
    $preview = $null
    $bancoCompartilhado = $false
    $blobCompartilhado = $false

    if ($SemAuditoriaVercel) {
        if ($Executar) {
            throw "A auditoria da Vercel nao pode ser ignorada numa promocao real."
        }
        Write-Host "Auditoria da Vercel ignorada somente nesta simulacao." -ForegroundColor Yellow
    } else {
        Write-Etapa "Auditando variaveis da Vercel sem exibir segredos"
        $DiretorioTemporario = Join-Path ([IO.Path]::GetTempPath()) "jll-promocao-$MarcaTempo"
        [void](New-Item -ItemType Directory -Path $DiretorioTemporario)
        $arquivoProducao = Join-Path $DiretorioTemporario ".env.production"
        $arquivoPreview = Join-Path $DiretorioTemporario ".env.preview"
        Invoke-VercelEnvPull "production" $arquivoProducao
        Invoke-VercelEnvPull "preview" $arquivoPreview
        $producao = Read-DotEnv $arquivoProducao
        $preview = Read-DotEnv $arquivoPreview

        Assert-VariaveisObrigatorias $producao "Production"
        Assert-VariaveisObrigatorias $preview "Preview"
        Assert-UrlPublicaProducao $producao $preview

        $bancoProducao = Get-ValorBanco $producao
        $bancoPreview = Get-ValorBanco $preview
        $bancoCompartilhado = (Get-IdentidadeBanco $bancoProducao) -eq (Get-IdentidadeBanco $bancoPreview)
        $blobCompartilhado = $producao["BLOB_STORE_ID"] -eq $preview["BLOB_STORE_ID"]

        if ($bancoCompartilhado) {
            Write-Host "Production e Preview usam o mesmo banco Neon. Nao sera feita copia sobre o proprio banco." -ForegroundColor Yellow
            foreach ($chave in @("SMTP_CONFIG_ENCRYPTION_KEY", "PAYMENT_CONFIG_ENCRYPTION_KEY")) {
                if ($producao[$chave] -ne $preview[$chave]) {
                    throw "$chave difere entre Production e Preview, mas o banco e compartilhado. Os valores precisam coincidir para ler configuracoes ja criptografadas."
                }
            }
        } else {
            Write-Host "Production e Preview usam bancos diferentes." -ForegroundColor Yellow
            if (-not $SubstituirBancoProducao) {
                throw "Para substituir o banco de Production, informe -SubstituirBancoProducao e a confirmacao especifica."
            }
            if ($ConfirmacaoBanco -cne $ConfirmacaoBancoEsperada) {
                throw "Confirmacao do banco invalida. Use exatamente: $ConfirmacaoBancoEsperada"
            }
        }

        if ($blobCompartilhado) {
            Write-Host "Production e Preview usam o mesmo Blob Store. Nenhuma copia de arquivos e necessaria." -ForegroundColor Yellow
        } else {
            throw "Os Blob Stores sao diferentes. A promocao automatica foi bloqueada para evitar perder anexos."
        }
    }

    if (-not $Executar) {
        Write-Host "`nSIMULACAO CONCLUIDA. Nenhuma alteracao foi feita em Production ou na main." -ForegroundColor Green
        Write-Host "Para executar apos corrigir todos os avisos:" -ForegroundColor White
        Write-Host ".\scripts\promover-producao.ps1 -Executar -Confirmacao `"$ConfirmacaoEsperada`"" -ForegroundColor White
        exit 0
    }

    if ($Confirmacao -cne $ConfirmacaoEsperada) {
        throw "Confirmacao invalida. Use exatamente: $ConfirmacaoEsperada"
    }

    Write-Etapa "Criando backup do banco antes da promocao"
    [void](New-Item -ItemType Directory -Path $DiretorioBackup -Force)
    $backupProducao = Join-Path $DiretorioBackup "producao-antes-da-promocao.dump"
    New-BackupBanco (Get-ValorBanco $producao) $backupProducao
    Write-Host "Backup criado em $backupProducao" -ForegroundColor Green

    $dumpHomologacao = $null
    if (-not $bancoCompartilhado) {
        $dumpHomologacao = Join-Path $DiretorioBackup "homologacao-para-producao.dump"
        New-BackupBanco (Get-ValorBanco $preview) $dumpHomologacao
    }

    Write-Etapa "Preparando a main com o conteudo exato da homologacao"
    $WorktreeTemporario = Join-Path ([IO.Path]::GetTempPath()) "jll-main-$MarcaTempo"
    Invoke-Comando "git" @("worktree", "add", "-b", $BranchTemporaria, $WorktreeTemporario, "origin/main") -OcultarSaida
    Push-Location -LiteralPath $WorktreeTemporario
    try {
        Invoke-Comando "git" @("merge", "-s", "ours", "--no-commit", "origin/homologacao") -OcultarSaida
        Invoke-Comando "git" @("read-tree", "--reset", "-u", "origin/homologacao") -OcultarSaida
        Invoke-Comando "git" @("commit", "-m", "Promove homologacao para producao") -OcultarSaida
        $diferencas = Get-SaidaComando "git" @("diff", "--name-only", "origin/homologacao", "HEAD")
        if (-not [string]::IsNullOrWhiteSpace($diferencas)) {
            throw "A arvore preparada para main nao ficou identica a homologacao."
        }
    } finally {
        Pop-Location
    }

    $tagBackup = "backup-main-$MarcaTempo"
    Write-Etapa "Criando ponto de recuperacao da main"
    Invoke-Comando "git" @("tag", "-a", $tagBackup, $remotaMain, "-m", "Backup automatico antes da promocao $MarcaTempo") -OcultarSaida
    Invoke-Comando "git" @("push", "origin", "refs/tags/$tagBackup") -OcultarSaida

    if (-not $bancoCompartilhado) {
        Write-Etapa "Substituindo o banco de Production pelo banco de homologacao"
        Restore-Banco (Get-ValorBanco $producao) $dumpHomologacao
        Write-Host "Banco restaurado em UTF-8. O backup anterior foi preservado." -ForegroundColor Green
    }

    Write-Etapa "Publicando a promocao na branch main"
    $mainAntesDoPush = Get-SaidaComando "git" @("rev-parse", "origin/main")
    if ($mainAntesDoPush -ne $remotaMain) {
        throw "A main mudou durante a operacao. A publicacao foi bloqueada; o banco nao deve ser alterado novamente."
    }
    Push-Location -LiteralPath $WorktreeTemporario
    try {
        Invoke-Comando "git" @("push", "origin", "HEAD:main")
    } finally {
        Pop-Location
    }

    Write-Host "`nPROMOCAO CONCLUIDA." -ForegroundColor Green
    Write-Host "Main recebeu exatamente a arvore da homologacao."
    Write-Host "Ponto de recuperacao do codigo: $tagBackup"
    Write-Host "Backup do banco: $backupProducao"
    Write-Host "A Vercel iniciara o deploy de Production a partir da main."
} finally {
    Set-Location -LiteralPath $PSScriptRoot
    if ($WorktreeTemporario -and (Test-Path -LiteralPath $WorktreeTemporario)) {
        & git worktree remove --force $WorktreeTemporario *> $null
    }
    if (Get-Command git -ErrorAction SilentlyContinue) {
        & git branch -D $BranchTemporaria *> $null
    }
    if ($DiretorioTemporario -and (Test-Path -LiteralPath $DiretorioTemporario)) {
        Get-ChildItem -LiteralPath $DiretorioTemporario -File | ForEach-Object {
            Remove-Item -LiteralPath $_.FullName -Force
        }
        Remove-Item -LiteralPath $DiretorioTemporario -Force
    }
    Set-Location -LiteralPath $DiretorioInicial
}
