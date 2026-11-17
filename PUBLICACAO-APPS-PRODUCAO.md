# Publicação dos aplicativos JLL em produção

## Identificação preservada

- JLL Atendimento: `br.com.jllmontagens.atendimento`
- JLL Montador: `br.com.jllmontagens.jll_montador`
- API e portal: `https://www.jllmontagens.com.br`

Não altere os IDs Android depois da primeira publicação. A Play Store e o Firebase usam esses valores para identificar cada aplicativo.

## 1. Firebase de produção

1. Crie um projeto Firebase exclusivo para produção.
2. Cadastre dois aplicativos Android usando exatamente os IDs acima.
3. Baixe o `google-services.json` de cada aplicativo.
4. Coloque os arquivos nos locais abaixo, sem trocar um pelo outro:
   - `atendimento-app/android/app/google-services.json`
   - `montador-app/android/app/google-services.json`
5. Em **Configurações do projeto > Contas de serviço**, gere uma chave privada para o servidor.
6. Na Vercel, cadastre o JSON completo na variável `FIREBASE_SERVICE_ACCOUNT_JSON`, apenas no ambiente **Production**.
7. Faça um novo deploy de Production e teste uma notificação pelo diagnóstico administrativo.

Nunca grave a chave privada da conta de serviço no Git.

## 2. Estrutura do aceite do orçamento

Execute uma vez no SQL Editor da branch Neon `main`:

```sql
BEGIN;
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS aceito_cliente_em TIMESTAMPTZ;
COMMENT ON COLUMN public.orcamentos.aceito_cliente_em IS
  'Data e hora em que o cliente confirmou o aceite do orçamento.';
COMMIT;
```

## 3. Chaves de upload

Gere e guarde uma chave de upload para cada aplicativo em uma pasta segura fora do repositório. Faça cópia de segurança dos arquivos `.jks` e das senhas.

Copie `android/key.properties.example` para `android/key.properties` em cada projeto e substitua os valores. O arquivo real já está bloqueado pelo `.gitignore`.

## 4. Compilação final

Depois de configurar Firebase e assinatura:

```powershell
.\atendimento-app\compilar-producao.ps1
.\montador-app\compilar-producao.ps1
```

Os scripts geram APK para instalação direta e AAB para a Play Store nas pastas `release` de cada aplicativo. Eles recusam Firebase de homologação, pacote incorreto ou ausência da chave de assinatura.

## 5. Play Console

Crie um aplicativo separado para JLL Atendimento e JLL Montador. Use o teste interno antes da produção, habilite o Play App Signing e envie o arquivo `.aab` correspondente. Preencha política de privacidade, segurança de dados, acesso ao aplicativo, classificação indicativa, público-alvo, anúncios, categoria, contato e ficha da loja.

Ao publicar uma atualização, aumente sempre o número depois do `+` no campo `version` do `pubspec.yaml`.
