# Como trocar as imagens do site

As fotos das páginas de serviço ficam em `dist/assets/servicos/`. Elas estão em WebP, no formato horizontal 16:9, para equilibrar qualidade e velocidade.

## Maneira mais simples

1. Escolha uma foto horizontal de boa qualidade.
2. Confirme que você possui autorização para utilizá-la. Para fotos de serviços reais, peça autorização do cliente e evite mostrar documentos, endereços ou pessoas sem consentimento.
3. Redimensione para aproximadamente `1600 x 900` pixels.
4. Converta para WebP em uma ferramenta como [Squoosh](https://squoosh.app/). Procure manter o arquivo abaixo de 300 KB.
5. Dê à nova imagem exatamente o mesmo nome da imagem que será substituída.
6. No GitHub, abra `dist/assets/servicos/`, envie o novo arquivo e confirme a substituição.
7. Faça o commit e o push. A Vercel publicará a mudança automaticamente.

Mantendo o mesmo nome, não é necessário alterar o HTML.

## Arquivos e páginas correspondentes

| Arquivo | Página |
|---|---|
| `montagem-moveis-rj.webp` | Montagem de móveis no RJ |
| `montagem-guarda-roupa.webp` | Montagem de guarda-roupa |
| `montagem-cozinha.webp` | Montagem de cozinhas |
| `montagem-camas-racks-mesas.webp` | Camas, racks e mesas |
| `instalacao-tv-painel.webp` | Instalação de TV e painel |
| `montador-moveis-rio.webp` | Montador no Rio de Janeiro |
| `atendimento-baixada.webp` | Baixada Fluminense |
| `atendimento-niteroi-sao-goncalo.webp` | Niterói e São Gonçalo |

## Se quiser mudar também o nome do arquivo

Atualize o caminho da imagem em três locais da página correspondente:

1. Na imagem visível: `src="/assets/servicos/nome-do-arquivo.webp"`.
2. Na imagem de compartilhamento: `og:image`.
3. Em `dist/sitemap.xml`, dentro de `image:loc`.

Atualize também o texto `alt` para descrever objetivamente a nova foto. Não coloque uma lista de palavras-chave no `alt`.

## Fontes das fotos ilustrativas atuais

As imagens foram baixadas do Pexels e são permitidas para uso comercial segundo a licença da plataforma. A atribuição não é obrigatória, mas foi mantida nas páginas.

- Montagem geral: https://www.pexels.com/photo/man-drilling-holes-with-screwdriver-in-wood-plank-5974052/
- Guarda-roupa: https://www.pexels.com/photo/clothes-hanging-in-a-cabinet-8893908/
- Cozinha: https://www.pexels.com/photo/home-renovation-caulking-a-kitchen-cabinet-38934134/
- Camas, racks e mesas: https://www.pexels.com/photo/modern-bedroom-interior-with-furniture-at-home-6956619/
- TV e painel: https://www.pexels.com/photo/room-interior-with-a-television-set-on-the-wall-18289778/
- Montador no Rio: https://www.pexels.com/photo/carpenters-in-masks-working-15016526/
- Baixada: https://www.pexels.com/photo/the-sun-rises-over-the-city-of-rio-23732415/
- Niterói e São Gonçalo: https://www.pexels.com/photo/monochrome-view-of-rio-niteroi-bridge-in-brazil-29867524/

Fotos reais da JLL Montagens são preferíveis às imagens de banco. Elas demonstram experiência, aumentam a confiança e podem ser reutilizadas no Perfil da Empresa no Google, desde que exista autorização para publicação.
