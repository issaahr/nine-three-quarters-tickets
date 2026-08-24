# 9¾ Tickets — Decisões de Identidade Visual

Este documento resume as decisões de marca e UI tomadas para o projeto, e o raciocínio por trás de cada uma — pensado para ser reaproveitado no README como justificativa de design.

## Nome e referência

**9¾ Tickets** parte de um brainstorm de nomes ligados a filmes/séries/games/animes, com referência direta à Plataforma 9¾ de Harry Potter. A referência é assumida e pode ser reconhecida em poucos segundos — mas a interface não recria a estética "mágica" da franquia (sem pergaminho, brasões, fonte do logo oficial ou heráldica). A inspiração visual real é **ticketing editorial vintage**: cinema de rua antigo, sinalização ferroviária de época, talão de ingresso físico.

**Linha vermelha deliberada:** nunca usar o brasão de Hogwarts, a fonte do logo oficial, ícones específicos do universo (raio, óculos, chapéu seletor) ou citações dos livros/filmes. A referência vive no nome e na paleta, não em elementos apropriados da marca oficial.

## Paleta e tokens

A identidade utiliza uma paleta baseada em papel envelhecido, vinho, bordô e latão, complementada por neutros quentes e cores funcionais dessaturadas.

Os valores abaixo representam os principais papéis visuais. A implementação utiliza tokens CSS para permitir que esses papéis sejam reaproveitados de forma consistente pelos componentes.

| Papel / Token                           | Valor     | Uso                                    |
| --------------------------------------- | --------- | -------------------------------------- |
| Ink (`--foreground`)                    | `#121212` | Texto principal em fundo claro         |
| Paper (`--background`)                  | `#F5F2EC` | Fundo base (papel envelhecido)         |
| Vinho escuro (`--secondary-foreground`) | `#2B0A10` | Header, superfícies escuras e ingresso |
| Bordô (`--primary`)                     | `#681E2B` | Botões primários e destaques           |
| Latão (`--secondary`)                   | `#C9A768` | Logo e elementos de assinatura         |
| Champanhe (`--primary-foreground`)      | `#D9C7A0` | Texto de destaque em fundo escuro      |
| Graphite (`--muted-foreground`)         | `#5A5650` | Texto secundário                       |
| Warm Gray (`--border`)                  | `#8A857C` | Bordas padrão e elementos terciários   |

A paleta também possui tokens complementares para situações específicas de interface, incluindo bordas editoriais, bordas de inputs e painéis, divisores sutis, superfícies escuras e variantes de latão e estados funcionais. Esses tokens refinam a aplicação da identidade sem introduzir novas cores de marca.

### Paletas descartadas e por quê

- Verde profundo + verde-limão neon → lida imediatamente como identidade de casa de apostas (Betnacional, Sportingbet), mesmo tendo lógica ferroviária no papel.
- Dourado saturado sobre vinho sólido → lê como brasão de casa de Hogwarts (vermelho+dourado = Grifinória). Resolvido tratando o dourado como **latão de bilheteria antiga**, não como ouro heráldico — mais opaco e mais acastanhado.

### Estados funcionais

Válido / confirmado utiliza verde musgo (`--status-valid`, `#3E6B4F`).

Inválido / recusado utiliza vermelho terroso (`--destructive`, `#8B3A3A`).

Existem variantes suaves e de fundo para esses estados, utilizadas conforme a superfície em que o estado aparece.

A escolha deliberada é evitar verde e vermelho saturados de semáforo, preservando a linguagem editorial da interface e evitando uma leitura de aplicativo financeiro ou de apostas.

Cor nunca é o único indicador de estado: deve ser combinada com texto, ícone e/ou forma.

## Tipografia

- **Display / logo:** Fraunces (serifada, peso editorial/impresso)
- **UI / corpo:** Work Sans
- **Códigos, preços, horários:** IBM Plex Mono — reforça sensação de "carimbado/impresso" em vez de texto solto

## Elementos de assinatura

1. **Logo como placa de plataforma:** "9¾" grande + "TICKETS" pequeno, mesma linha de base, mesma cor — tratados como uma peça tipográfica única, não como ícone + texto separados.

2. **Fileira de furos de perfuração:** substitui qualquer traço tracejado genérico. Reaproveitada como base do logo, divisor e detalhe de composição em elementos ligados ao ingresso físico. Além da leitura de canhoto/talão, a perfuração também remete sutilmente ao rolo de filme.

3. **Selo circular perfurado:** versão compacta da assinatura da marca, adequada para favicon / ícone de app.

4. **Carimbo de validação:** desenho reservado exclusivamente para o momento em que a portaria confirma um ingresso válido — marca e função do produto se tornam o mesmo elemento visual.

5. **Corte de canto:** cards de evento e peças de ticketing utilizam um pequeno corte diagonal no canto inferior direito. A alteração é de silhueta, não de decoração: transforma o retângulo genérico em um objeto que lembra um ingresso físico sem competir com imagem ou conteúdo.

6. **Chips com canto quase reto:** filtros, horários informativos e pequenas etiquetas utilizam raio baixo, próximo de `2px`, evitando o formato pill típico de interfaces SaaS. A referência visual é etiqueta de bagagem, bilhete impresso e sinalização física.

### Uso do corte de canto

Quando diferentes possibilidades foram comparadas na home, o modelo escolhido foi **apenas o corte de canto**.

Elementos adicionais de linguagem ferroviária não devem competir com os dados mais importantes do card. Data, horário, local e preço permanecem prioritariamente tipográficos.

O corte funciona como assinatura recorrente e suficientemente discreta para ser aplicado em diferentes tipos de conteúdo.

## Decisões de UX relevantes

- **Catálogo misto (filme + show):** card com moldura única e hierarquia de informação idêntica para os dois tipos de conteúdo (API TMDb e Ticketmaster), variando principalmente imagem, categoria e metadados. Evita a sensação de "dois catálogos colados".

- **Cards orientados pelo conteúdo:** pôsteres e imagens dos provedores carregam grande parte da variação visual. A interface ao redor permanece sóbria para não competir com o material dos eventos.

- **Horário do evento:** data e horário são apresentados segundo o horário local do venue. Quando relevante, a interface pode explicitar também o offset, por exemplo `22:00 · horário local de São Paulo · UTC−03:00`. A interface não converte silenciosamente o horário do evento para o fuso do navegador.

- **Detalhe de filme:** data, horário, venue e sala aparecem como informações fixas daquela ocorrência. A seleção de assentos acontece diretamente sobre o inventário correspondente.

- **Detalhe de show:** a área de compra apresenta a modalidade de entrada aplicável, preço, quantidade e total sem alterar a linguagem visual utilizada no restante do catálogo.

- **Assentos:** estados de livre, selecionado e indisponível usam forma e contraste além da cor. A identificação textual do assento continua disponível no resumo da seleção.

- **Sem dark mode geral:** o papel envelhecido é parte da identidade, não um "modo claro" substituível. Não existe toggle de tema.

- **Exceção funcional — tela de portaria:** fundo escuro por justificativa operacional (uso em entrada de evento, potencialmente à noite, e redução de reflexo), não por preferência de usuário.

- **Pagamento:** estados de aprovação e recusa mantêm a identidade visual geral e utilizam cores funcionais apenas como reforço. A copy deve refletir somente métodos efetivamente disponíveis; enquanto apenas cartão estiver implementado, uma recusa orienta o usuário a revisar os dados ou tentar novamente, sem sugerir um método ainda inexistente.

- **Ações destrutivas:** cancelamentos nunca dependem somente da estilização do botão. A interface sempre apresenta uma confirmação intermediária explicando a consequência da ação.

### Meus ingressos

Cada unidade comprada gera um ingresso individual.

Quando uma compra possui apenas um ingresso, a experiência pode levar diretamente à visualização individual daquele Ticket.

Quando uma compra possui múltiplos ingressos:

1. a compra apresenta uma lista com todos os Tickets individuais;
2. cada item identifica o assento quando aplicável ou a modalidade de entrada geral;
3. cada item é clicável;
4. a seleção abre a visualização individual do Ticket.

Cada Ticket possui individualmente:

- seu próprio QR;
- seu próprio código manual;
- seu estado;
- sua ação de compartilhamento;
- seu assento, quando `SEATED`;
- sua identificação de entrada geral, quando aplicável.

O QR nunca representa dois ou mais ingressos simultaneamente.

A visualização individual utiliza a linguagem do talão físico: superfície vinho, corte de canto, informações principais em blocos tipográficos, QR em alto contraste e código manual em IBM Plex Mono.

### Portaria

O usuário de portaria seleciona o Event que será operado antes de iniciar a validação.

O Event selecionado permanece como contexto ativo da tela, e cada Ticket validado é comparado contra esse contexto.

O header deve tornar o contexto operacional imediatamente visível, apresentando:

- título do evento;
- venue;
- sala, quando aplicável;
- horário local do evento.

Exemplo:

`Duna: Parte Dois · Cine Imperial · Sala A · 20:30`

A leitura precisa deixar claro para o operador **o que está sendo validado, onde e quando**.

A portaria oferece:

- leitura por câmera;
- entrada manual do código `XXXX-XXXX`.

Os estados visuais previstos são:

1. **Válido**
2. **Inválido**
3. **Já utilizado**
4. **Evento errado**
5. **Cancelado**

Cada estado possui texto, ícone e tratamento visual próprio.

O carimbo de validação da identidade aparece exclusivamente no resultado **Válido**, preservando seu significado de confirmação.

## Relação entre mockups e implementação

Os mockups definem principalmente:

- linguagem visual;
- hierarquia;
- proporções;
- assinatura gráfica;
- tratamento dos estados principais;
- direção dos componentes.

Eles não constituem uma especificação funcional independente.

Quando um mockup exploratório apresentar conteúdo ou controles diferentes do comportamento final definido para o produto, a implementação mantém a linguagem visual aprovada e utiliza o fluxo funcional consolidado.

Os mockups também não precisam representar todas as opções, mensagens, estados intermediários ou erros existentes em cada tela.

## Telas cobertas nos mockups

1. **Home / catálogo de eventos**
   - catálogo misto;
   - filtros;
   - cards com corte de canto;
   - hierarquia de título, data, local e preço.

2. **Detalhe do evento — assentos**
   - dados do filme;
   - ocorrência selecionada;
   - venue e sala;
   - mapa de assentos;
   - seleção e resumo da compra.

3. **Detalhe do evento — entrada geral**
   - dados do show;
   - ocorrência selecionada;
   - modalidade de entrada;
   - quantidade;
   - resumo da compra.

4. **Checkout simulado**
   - resumo da Reservation;
   - total;
   - pagamento confirmado;
   - pagamento recusado.

5. **Meus ingressos**
   - agrupamento visual por compra;
   - múltiplos Tickets individuais;
   - acesso à visualização individual;
   - QR;
   - código manual;
   - compartilhamento;
   - histórico.

6. **Ingresso individual**
   - evento;
   - data e horário;
   - venue;
   - sala/assento ou modalidade de entrada;
   - QR;
   - código manual;
   - estado;
   - compartilhamento.

7. **Portaria**
   - Event em operação;
   - leitor por câmera;
   - entrada manual;
   - estados válido, inválido, já utilizado, evento errado e cancelado.

## Cobertura atual das personas

Os mockups cobrem principalmente a experiência do **CUSTOMER**, além da tela operacional de **GATE**.

A direção visual estabelecida deve ser reaproveitada posteriormente nas interfaces de:

- autenticação;
- criação e gestão de eventos;
- painel do organizador;
- estados e modais ainda não representados.

Essas telas devem utilizar os mesmos tokens, tipografia, linguagem de bordas, cortes, superfícies e hierarquia, sem exigir que cada uma introduza um novo elemento de assinatura.
