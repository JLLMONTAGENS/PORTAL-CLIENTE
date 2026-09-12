# JLL Montagens

Site institucional otimizado para apresentação dos serviços de montagem de móveis e instalação de TVs e painéis no estado do Rio de Janeiro.

## Alterar WhatsApp e dados da empresa

Edite o arquivo `dist/config.json`:

- `whatsappNumber`: número com código do país e DDD, somente dígitos. Exemplo: `5521999999999`.
- `whatsappMessage`: mensagem inicial que será aberta no WhatsApp.
- `cnpj`: CNPJ exibido no rodapé.
- `companyName`: nome da empresa.

Enquanto `whatsappNumber` estiver vazio, os botões exibem um aviso de configuração em vez de abrir o WhatsApp.

## SEO e campanhas

Ao conectar um domínio próprio, atualize o endereço absoluto em `dist/index.html`, `dist/robots.txt`, `dist/sitemap.xml` e `dist/politica-de-privacidade.html`. Antes de ativar Google Ads, Analytics ou outras tags, revise a política de privacidade e implemente o consentimento necessário para as ferramentas escolhidas.
