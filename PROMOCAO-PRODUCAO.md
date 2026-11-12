# Promoção da homologação para produção

Este processo faz a `main` terminar com o mesmo conteúdo da branch `homologacao`, preserva a versão anterior da `main` em uma tag de recuperação, valida todos os arquivos de texto em UTF-8, executa os testes e cria um backup do banco antes da publicação.

## Antes da promoção

Na Vercel, confira estes pontos:

1. `FIREBASE_SERVICE_ACCOUNT_JSON` deve existir também em **Production**. Pela tela atual, ela aparenta estar apenas em Preview e marcada como “Needs Attention”.
2. `PUBLIC_SITE_URL` deve existir em **Production** e conter a URL pública oficial, com `https://`. Não use a URL da homologação.
3. `SMTP_CONFIG_ENCRYPTION_KEY` e `PAYMENT_CONFIG_ENCRYPTION_KEY` precisam ter o mesmo valor em Production e Preview quando o banco for compartilhado. Essas chaves abrem configurações já criptografadas no banco.
4. `ADMIN_SESSION_SECRET` e `MONTADOR_SESSION_SECRET` podem ser específicos por ambiente. Ao trocar essas chaves, sessões existentes deixam de valer e os usuários precisam entrar novamente.
5. `PAYMENT_WEBHOOK_SECRET` deve coincidir com o segredo configurado no provedor de pagamentos para o endereço de produção.

Pelas telas fornecidas, o Neon `JLLMONTAGEM` e o Blob Store `JLLMONTAGENS-BLOB` estão conectados simultaneamente a Production e Preview. Nesse cenário os dados e anexos já são compartilhados: o processo **não copia o banco ou o Blob sobre eles mesmos**. Ainda assim, cria um `pg_dump` do banco antes da promoção.

## Simulação obrigatória

Abra o PowerShell na pasta do projeto, na branch `homologacao`, sem alterações locais, e execute:

```powershell
.\scripts\promover-producao.ps1
```

A simulação não modifica a `main`, o banco ou a produção. Ela valida:

- sincronismo com `origin/homologacao`;
- arquivos em UTF-8, inclusive `ç`, `ã`, `í` e `á`;
- testes do projeto;
- variáveis obrigatórias de Production e Preview;
- se Neon e Blob são compartilhados ou separados;
- compatibilidade das chaves de criptografia.

Se a Vercel CLI não estiver instalada, o comando usa `npx vercel`. A primeira execução pode pedir autenticação e associação ao projeto `portal-cliente`.

## Promoção efetiva

Somente depois de a simulação terminar sem erros:

```powershell
.\scripts\promover-producao.ps1 -Executar -Confirmacao "PROMOVER HOMOLOGACAO PARA PRODUCAO"
```

O comando:

1. repete todas as validações;
2. cria um dump UTF-8 em `Documentos\JLL-Backups`;
3. prepara a `main` em uma área temporária, sem trocar a branch de trabalho;
4. cria e envia uma tag `backup-main-AAAAMMDD-HHMMSS`;
5. publica na `main` um commit de promoção cuja árvore é idêntica à homologação;
6. deixa o GitHub/Vercel iniciar o deploy de Production.

Não é usado `git push --force`: o histórico anterior da `main` e os dois commits exclusivos dela permanecem na ancestralidade e na tag de recuperação, embora o conteúdo final seja substituído pela homologação.

## Se os bancos forem diferentes

O processo para e não altera nada. Depois de conferir o backup e reservar uma janela de manutenção, a execução explícita é:

```powershell
.\scripts\promover-producao.ps1 -Executar -SubstituirBancoProducao -Confirmacao "PROMOVER HOMOLOGACAO PARA PRODUCAO" -ConfirmacaoBanco "SUBSTITUIR BANCO DE PRODUCAO"
```

Nesse modo, é feito backup do banco de produção, dump da homologação em UTF-8 e restauração completa sobre Production. Se os Blob Stores forem diferentes, a automação bloqueia a promoção, porque os anexos exigem uma migração separada e validada.

## Reversão

O código anterior fica na tag informada ao final. O banco anterior fica no arquivo `producao-antes-da-promocao.dump`, dentro da pasta de backup informada pelo comando. A reversão deve ser feita conscientemente, em janela de manutenção, pois restaura código e dados para um estado anterior.
