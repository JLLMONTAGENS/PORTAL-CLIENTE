# Backend da homologação

A branch `homologacao` agora possui a base para a API da mensageria:

- `api/health.js` testa se a função da Vercel consegue acessar o PostgreSQL.
- `database/schema.sql` cria as tabelas `usuarios_atendimento`, `montadores`, `atendimentos`, `mensagens`, `anexos_mensagem` e `eventos_atendimento`.
- A regra de banco `atendimentos_um_aberto_por_telefone` impede dois atendimentos não encerrados para o mesmo telefone.

Se o schema original em inglês já foi executado, use `database/migracao-nomes-portugues.sql` uma única vez. A migração renomeia as tabelas e preserva os dados.

Os status oficiais são `PENDENTE`, `GEROU_ORCAMENTO`, `ATRIBUIDO_MONTADOR` e `SERVICO_FINALIZADO`.

## Primeira configuração

1. Execute `database/schema.sql` no SQL Editor do projeto Neon.
2. Faça commit e push da branch `homologacao`.
3. Após o deploy, abra `/api/health` na URL de preview da Vercel.
4. O resultado esperado é `{"ok":true,"database":true}`.

As credenciais continuam apenas nas variáveis da Vercel. Nunca coloque a URL do banco em arquivos públicos ou no repositório.

## Evolução de usuários e orçamentos

Para uma base que já está em uso, execute `database/migracao-usuarios-orcamentos.sql` antes de publicar esta versão. A migração:

- preserva os usuários existentes e usa o e-mail atual como login inicial;
- acrescenta nome de exibição e nome completo;
- cria a tabela de orçamentos vinculada ao atendimento;
- pode ser executada novamente sem duplicar estruturas.

Depois da migração, o administrador pode ajustar o login e os demais dados pelo menu **Usuários** do painel.
