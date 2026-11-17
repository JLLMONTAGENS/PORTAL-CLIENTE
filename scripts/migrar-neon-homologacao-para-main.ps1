[CmdletBinding()]
param(
    [switch]$Executar,
    [string]$Confirmacao = "",
    [string]$AdminLogin = "jean.melo",
    [string]$AdminEmail = "jjmelo-g@hotmail.com",
    [string]$AdminNome = "Jean Melo"
)

$ErrorActionPreference = "Stop"
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$env:PGCLIENTENCODING = "UTF8"
$env:PGCONNECT_TIMEOUT = "20"
$env:PGAPPNAME = "jll-migracao-neon"

$ConfirmacaoEsperada = "SUBSTITUIR NEON MAIN PELA HOMOLOGACAO"
$MarcaTempo = Get-Date -Format "yyyyMMdd-HHmmss"
$DiretorioBackup = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "JLL-Backups\neon-main-$MarcaTempo"

function Write-Etapa([string]$Mensagem) {
    Write-Host "`n==> $Mensagem" -ForegroundColor Cyan
}

function Assert-Comando([string]$Nome) {
    if (-not (Get-Command $Nome -ErrorAction SilentlyContinue)) {
        throw "O programa '$Nome' nao foi encontrado. Instale o PostgreSQL Client Tools."
    }
}

function Read-SegredoTexto([string]$Mensagem) {
    $seguro = Read-Host $Mensagem -AsSecureString
    $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro).Trim().Trim('"').Trim("'")
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
    }
}

function New-SenhaHash([string]$Senha) {
    if ($Senha.Length -lt 6) {
        throw "A senha provisoria do administrador deve ter pelo menos 6 caracteres."
    }

    $codigo = @'
const crypto = require('crypto');
const password = process.env.JLL_ADMIN_PASSWORD_TEMP;
if (!password) process.exit(2);
const salt = crypto.randomBytes(16).toString('hex');
process.stdout.write('scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 64).toString('hex'));
'@
    $env:JLL_ADMIN_PASSWORD_TEMP = $Senha
    try {
        $saida = Invoke-Nativo "node" @("-e", $codigo) -OcultarSaida
        $hash = ([string]($saida -join "")).Trim()
        if ($hash -notmatch '^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$') {
            throw "Nao foi possivel gerar o hash seguro da senha do administrador."
        }
        return $hash
    } finally {
        Remove-Item Env:JLL_ADMIN_PASSWORD_TEMP -ErrorAction SilentlyContinue
    }
}

function Get-Conexao([string]$Url, [string]$Nome) {
    try {
        $uri = New-Object System.Uri($Url)
    } catch {
        throw "A connection string da branch $Nome nao e uma URL PostgreSQL valida."
    }

    if ($uri.Scheme -notin @("postgres", "postgresql")) {
        throw "A connection string de $Nome deve iniciar com postgres:// ou postgresql://."
    }
    if (-not $uri.Host -or -not $uri.UserInfo -or $uri.AbsolutePath -eq "/") {
        throw "A connection string da branch $Nome esta incompleta."
    }
    if ($uri.Host -match "-pooler") {
        throw "A URL de $Nome e pooled. No Neon, selecione Direct connection (host sem '-pooler') para fazer dump e restore."
    }

    $separador = $uri.UserInfo.IndexOf(":")
    if ($separador -lt 1) {
        throw "A connection string da branch $Nome nao contem usuario e senha."
    }

    return [pscustomobject]@{
        Nome = $Nome
        Host = $uri.Host
        Port = if ($uri.Port -gt 0) { [string]$uri.Port } else { "5432" }
        Database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
        User = [Uri]::UnescapeDataString($uri.UserInfo.Substring(0, $separador))
        Password = [Uri]::UnescapeDataString($uri.UserInfo.Substring($separador + 1))
        Identity = ($uri.Host.ToLowerInvariant() + "/" + $uri.AbsolutePath.TrimStart("/").ToLowerInvariant())
    }
}

function Set-Conexao($Conexao) {
    $env:PGHOST = $Conexao.Host
    $env:PGPORT = $Conexao.Port
    $env:PGDATABASE = $Conexao.Database
    $env:PGUSER = $Conexao.User
    $env:PGPASSWORD = $Conexao.Password
    $env:PGSSLMODE = "require"
    $env:PGCHANNELBINDING = "require"
}

function Invoke-Nativo([string]$Comando, [string[]]$Argumentos, [switch]$OcultarSaida) {
    $preferenciaAnterior = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        if ($OcultarSaida) {
            $saida = & $Comando @Argumentos 2>&1
        } else {
            & $Comando @Argumentos
        }
        $codigo = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $preferenciaAnterior
    }

    if ($codigo -ne 0) {
        if ($OcultarSaida) {
            throw "O comando '$Comando' falhou: $($saida -join [Environment]::NewLine)"
        }
        throw "O comando '$Comando' falhou com o codigo $codigo."
    }
    return $saida
}

function Get-Tabelas($Conexao) {
    Set-Conexao $Conexao
    $sql = @"
SELECT n.nspname || '.' || c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname = 'public'
ORDER BY 1;
"@
    $saida = Invoke-Nativo "psql" @("-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", $sql) -OcultarSaida
    return @($saida | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ })
}

function Test-Conexao($Conexao) {
    Set-Conexao $Conexao
    $saida = Invoke-Nativo "psql" @("-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", "SELECT current_database() || '|' || current_user;") -OcultarSaida
    if (-not $saida) { throw "A branch $($Conexao.Nome) nao respondeu ao teste de conexao." }
    Write-Host "Conexao com $($Conexao.Nome) validada." -ForegroundColor Green
}

try {
    Assert-Comando "pg_dump"
    Assert-Comando "pg_restore"
    Assert-Comando "psql"
    Assert-Comando "node"

    Write-Host "Use as connection strings DIRECT obtidas em Neon > Branch > Connect." -ForegroundColor Yellow
    Write-Host "Nao use DATABASE_URL compartilhada da Vercel e nao use hosts com '-pooler'." -ForegroundColor Yellow

    $urlHomologacao = Read-SegredoTexto "Cole a connection string DIRECT da branch Neon HOMOLOGACAO"
    $urlMain = Read-SegredoTexto "Cole a connection string DIRECT da branch Neon MAIN (destino)"
    $homologacao = Get-Conexao $urlHomologacao "homologacao"
    $main = Get-Conexao $urlMain "main"

    if ($homologacao.Identity -eq $main.Identity) {
        throw "Origem e destino apontam para o mesmo endpoint/banco. Selecione branches Neon diferentes."
    }

    Write-Etapa "Validando conexoes e inventario"
    Test-Conexao $homologacao
    Test-Conexao $main
    $tabelasOrigem = Get-Tabelas $homologacao
    $tabelasDestinoAntes = Get-Tabelas $main
    Write-Host "Homologacao: $($tabelasOrigem.Count) tabela(s)."
    Write-Host "Main antes da migracao: $($tabelasDestinoAntes.Count) tabela(s)."

    if (-not $Executar) {
        Write-Host "`nSIMULACAO CONCLUIDA. Nenhum dado foi alterado." -ForegroundColor Green
        Write-Host "Para executar:" -ForegroundColor White
        Write-Host ".\scripts\migrar-neon-homologacao-para-main.ps1 -Executar -Confirmacao `"$ConfirmacaoEsperada`"" -ForegroundColor White
        exit 0
    }

    if ($Confirmacao -cne $ConfirmacaoEsperada) {
        throw "Confirmacao invalida. Use exatamente: $ConfirmacaoEsperada"
    }

    $senhaAdmin = Read-SegredoTexto "Digite a senha provisoria do administrador $AdminLogin"
    $senhaAdminHash = New-SenhaHash $senhaAdmin
    $senhaAdmin = $null

    [void](New-Item -ItemType Directory -Path $DiretorioBackup -Force)
    $backupMain = Join-Path $DiretorioBackup "main-antes-da-migracao.dump"
    $dumpHomologacao = Join-Path $DiretorioBackup "homologacao-fonte.dump"
    $listaRestauracao = Join-Path $DiretorioBackup "homologacao-restauracao.list"

    Write-Etapa "Criando backup completo da branch main"
    Set-Conexao $main
    Invoke-Nativo "pg_dump" @("--format=custom", "--encoding=UTF8", "--no-owner", "--no-privileges", "--schema=public", "--file=$backupMain") -OcultarSaida
    Write-Host "Backup: $backupMain" -ForegroundColor Green

    Write-Etapa "Gerando dump da branch homologacao"
    Set-Conexao $homologacao
    $argumentosDump = @("--format=custom", "--encoding=UTF8", "--no-owner", "--no-privileges", "--schema=public", "--schema-only", "--file=$dumpHomologacao")
    Invoke-Nativo "pg_dump" $argumentosDump -OcultarSaida

    # O schema public pode ter extensoes gerenciadas pela Neon (por exemplo,
    # pgcrypto). Preservamos o schema e restauramos somente os objetos contidos
    # nele para que --clean nao tente executar DROP SCHEMA public.
    $linhasLista = @(Invoke-Nativo "pg_restore" @("--list", $dumpHomologacao) -OcultarSaida)
    $linhasListaFiltradas = @($linhasLista | ForEach-Object {
        $linha = [string]$_
        if ($linha -match '^\d+;\s+\d+\s+\d+\s+SCHEMA\s+-\s+public\s+' -or
            $linha -match '^\d+;\s+\d+\s+\d+\s+COMMENT\s+-\s+SCHEMA\s+public\s+') {
            "; preservado pela migracao: $linha"
        } else {
            $linha
        }
    })
    [IO.File]::WriteAllLines($listaRestauracao, $linhasListaFiltradas, (New-Object Text.UTF8Encoding($false)))

    Write-Etapa "Restaurando homologacao sobre a branch main"
    Set-Conexao $main
    Invoke-Nativo "pg_restore" @("--dbname=$($main.Database)", "--use-list=$listaRestauracao", "--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--single-transaction", $dumpHomologacao) -OcultarSaida

    Write-Etapa "Criando o unico usuario administrador inicial"
    $nomeSql = $AdminNome.Replace("'", "''")
    $loginSql = $AdminLogin.Replace("'", "''")
    $emailSql = $AdminEmail.Replace("'", "''")
    $hashSql = $senhaAdminHash.Replace("'", "''")
    $sqlAdmin = @"
INSERT INTO public.usuarios_atendimento
  (nome, nome_exibicao, nome_completo, login, email, senha_hash, perfil, ativo)
VALUES
  ('$nomeSql', '$nomeSql', '$nomeSql', '$loginSql', '$emailSql', '$hashSql', 'ADMINISTRADOR', TRUE)
ON CONFLICT (email) DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_exibicao = EXCLUDED.nome_exibicao,
  nome_completo = EXCLUDED.nome_completo,
  login = EXCLUDED.login,
  senha_hash = EXCLUDED.senha_hash,
  perfil = 'ADMINISTRADOR',
  ativo = TRUE;
"@
    Invoke-Nativo "psql" @("-X", "-v", "ON_ERROR_STOP=1", "-c", $sqlAdmin) -OcultarSaida
    $senhaAdminHash = $null

    Write-Etapa "Validando as tabelas restauradas"
    $tabelasDestinoDepois = Get-Tabelas $main
    $faltantes = @($tabelasOrigem | Where-Object { $_ -notin $tabelasDestinoDepois })
    if ($faltantes.Count -gt 0) {
        throw "A restauracao terminou, mas estas tabelas nao foram localizadas na main: $($faltantes -join ', ')"
    }
    $extras = @($tabelasDestinoDepois | Where-Object { $_ -notin $tabelasOrigem })
    if ($extras.Count -gt 0) {
        throw "A main ainda contem tabelas public que nao existem na homologacao: $($extras -join ', ')"
    }
    $quantidadeAdmin = Invoke-Nativo "psql" @("-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", "SELECT COUNT(*) FROM public.usuarios_atendimento WHERE login = '$loginSql' AND email = '$emailSql' AND perfil = 'ADMINISTRADOR' AND ativo = TRUE;") -OcultarSaida
    if (([string]($quantidadeAdmin -join "")).Trim() -ne "1") {
        throw "As tabelas foram restauradas, mas o usuario administrador inicial nao foi confirmado."
    }

    Write-Host "`nMIGRACAO NEON CONCLUIDA." -ForegroundColor Green
    Write-Host "Main agora contem a estrutura das $($tabelasOrigem.Count) tabela(s) da homologacao, sem os dados de teste."
    Write-Host "Administrador inicial ativo: $AdminLogin ($AdminEmail)."
    Write-Host "Backup anterior da main: $backupMain"
    Write-Host "Dump usado na migracao: $dumpHomologacao"
} finally {
    foreach ($nome in @("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGCHANNELBINDING", "PGCLIENTENCODING", "PGCONNECT_TIMEOUT", "PGAPPNAME")) {
        Remove-Item "Env:$nome" -ErrorAction SilentlyContinue
    }
}
