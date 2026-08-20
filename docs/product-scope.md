# 9¾ Tickets — Product Scope

## 1. Objetivo

O 9¾ Tickets é uma plataforma de descoberta, venda e validação de ingressos para filmes e shows.

A aplicação permite que:

- clientes descubram eventos publicados;
- organizadores criem e gerenciem eventos a partir de conteúdo de catálogos externos;
- clientes reservem assentos ou quantidade de ingressos;
- pagamentos sejam simulados;
- cada ingresso seja emitido individualmente com QR Code e código manual;
- operadores de portaria validem ingressos no acesso ao evento.

A V1 prioriza um fluxo completo e consistente de ticketing, com regras explícitas de inventário, reserva, pagamento, cancelamento e check-in.

---

## 2. Personas

### CUSTOMER

Pode:

- navegar pelo catálogo público;
- pesquisar e filtrar eventos;
- visualizar detalhes de um evento;
- selecionar assentos ou quantidade de ingressos;
- criar e retomar uma reserva;
- realizar pagamento;
- visualizar seus ingressos;
- compartilhar um ingresso individual;
- cancelar uma compra quando elegível.

A criação efetiva de uma Reservation exige autenticação como CUSTOMER.

### ORGANIZER

Pode:

- pesquisar conteúdo nos catálogos externos disponíveis;
- criar eventos locais a partir desse conteúdo;
- escolher Venue previamente cadastrado;
- definir data, horário, preço e capacidade aplicáveis;
- publicar e gerenciar seus eventos;
- cancelar eventos futuros;
- visualizar seus eventos publicados, futuros e históricos.

### GATE

Pode:

- autenticar-se como operador de portaria;
- escolher o Event que está sendo operado;
- validar ingressos por QR Code;
- validar ingressos por código manual;
- receber resultado explícito da validação.

O usuário GATE não fica permanentemente vinculado a um Event.

Após o login, o operador seleciona a ocorrência que está validando. Esse Event permanece como contexto ativo da operação até ser alterado.

---

## 3. Catálogo externo

A plataforma utiliza catálogos externos como fonte de conteúdo, não como fonte de inventário.

### Filmes

Filmes podem ser pesquisados por meio da TMDb.

Podem ser aproveitados dados como:

- título;
- descrição;
- imagem;
- gêneros;
- metadados úteis para apresentação.

### Shows

Shows podem ser pesquisados por meio da Ticketmaster Discovery API.

A integração utiliza principalmente atrações e conteúdo de catálogo.

Podem ser aproveitados dados como:

- nome;
- descrição disponível;
- imagem;
- classificações/gêneros;
- demais metadados úteis para apresentação.

### Regra de propriedade do inventário

TMDb e Ticketmaster não determinam:

- disponibilidade;
- capacidade;
- assentos;
- preço local;
- reservas;
- vendas.

Essas informações pertencem ao Event criado dentro do 9¾ Tickets.

Um Event publicado continua sendo navegável a partir dos dados persistidos localmente, sem exigir nova consulta ao catálogo externo para cada visualização.

URLs de imagens podem continuar apontando para assets externos.

---

## 4. Event

Um `Event` representa **uma única ocorrência agendada**.

Ele possui, entre outros dados:

- organizador;
- conteúdo de catálogo associado;
- título;
- descrição;
- imagem;
- categoria;
- gêneros;
- Venue;
- data e horário;
- preço;
- modalidade de admissão;
- capacidade quando aplicável;
- status.

### Categorias

A V1 trabalha com:

- `MOVIE`
- `SHOW`

Categoria descreve a natureza do conteúdo.

Gêneros são metadados adicionais para apresentação, busca e filtros e não determinam regras transacionais.

### Ocorrência única

Cada Event possui uma única data e um único horário.

Exemplo:

`Duna: Parte Dois · Cine Imperial · Sala A · 21 ago · 20:30`

é um Event completo.

A V1 não oferece:

- múltiplos horários agrupados na mesma página;
- seletor de sessão;
- programação recorrente;
- agrupamento de Events relacionados;
- criação em lote de várias sessões.

Dois Events podem tecnicamente compartilhar o mesmo conteúdo externo, mas a aplicação não introduz uma experiência específica para agrupá-los.

Uma evolução futura poderá criar um conceito de programação ou agrupamento acima de Event sem alterar o significado transacional de cada ocorrência.

---

## 5. Modalidade de admissão

Categoria e modalidade de admissão são conceitos separados.

Na V1, o produto utiliza a seguinte combinação:

| Categoria | Modalidade        |
| --------- | ----------------- |
| MOVIE     | SEATED            |
| SHOW      | GENERAL_ADMISSION |

Essa é uma restrição da V1, não uma regra universal do domínio.

### SEATED

O cliente escolhe assentos específicos em um mapa.

Cada assento comercializado pertence ao inventário daquela ocorrência.

### GENERAL_ADMISSION

O cliente escolhe uma quantidade de ingressos dentro de uma capacidade agregada.

Não existe escolha de assento específico.

### Setores

A V1 **não possui setores**.

Não são suportados:

- pista + camarote;
- VIP + pista;
- diferentes preços por setor;
- setores sentados e em pé no mesmo Event;
- múltiplas capacidades independentes dentro do Event.

Um SHOW da V1 possui uma única modalidade de entrada geral, um preço e uma capacidade.

`EventSector` não faz parte do modelo da V1.

Uma evolução futura poderá introduzir setores abaixo de Event caso exista necessidade real de inventário e preços distintos.

---

## 6. Venue e layout

Eventos acontecem em um Venue local da plataforma.

Um Venue contém informações como:

- nome;
- endereço;
- cidade;
- estado;
- país;
- timezone.

### V1

Venues e layouts são previamente cadastrados/seedados pela plataforma.

O ORGANIZER seleciona um Venue existente.

Não existe na V1:

- editor de Venue;
- editor visual de sala;
- criação de fileiras;
- criação manual de assentos;
- importação de plantas.

### Eventos SEATED

O layout físico é reutilizável.

Assentos possuem informações como:

- identificação;
- fileira;
- número;
- posição lógica no mapa.

O frontend renderiza o layout a partir desses dados e não possui fileiras hardcoded.

---

## 7. Data, horário e timezone

O Venue define seu timezone utilizando identificador IANA.

Exemplo:

`America/Sao_Paulo`

O ORGANIZER informa o horário local da ocorrência.

A aplicação apresenta ao usuário o horário canônico do Event segundo o timezone do Venue.

Quando útil, a UI pode explicitar o offset:

`21 ago · 22:00 · horário local de São Paulo · UTC−03:00`

A V1 não converte silenciosamente o horário do Event para o timezone do navegador do cliente.

Regras temporais de reserva, pagamento, cancelamento e evento iniciado usam o tempo persistido pelo backend como referência.

---

## 8. Status do Event

Um Event pode estar em:

- `DRAFT`
- `PUBLISHED`
- `CANCELLED`

### DRAFT

Ainda não está disponível no catálogo público.

### PUBLISHED

Pode aparecer no catálogo e receber reservas enquanto estiver elegível.

### CANCELLED

Não recebe novas reservas e seus ingressos deixam de permitir entrada.

### Eventos passados

A V1 não precisa persistir um estado `FINISHED`.

Um Event é considerado passado de acordo com `startsAt`.

Eventos passados:

- não aparecem por padrão na descoberta de próximos eventos;
- não recebem novas reservas;
- continuam disponíveis em histórico, painel do organizador e ingressos relacionados.

---

## 9. Publicação e edição de Event

Antes de existir qualquer Reservation associada ao Event, o organizador pode alterar seus dados estruturais.

Depois que o Event possuir sua primeira Reservation, mesmo que essa Reservation posteriormente expire ou seja cancelada, ficam bloqueadas alterações que mudem a identidade do inventário.

Incluem-se:

- data e horário;
- Venue;
- layout;
- modalidade de admissão;
- capacidade.

Continuam permitidas alterações que não invalidem compras já realizadas, como:

- descrição;
- imagem;
- outros metadados de apresentação;
- preço para compras futuras.

O preço pago por uma Reservation anterior não muda quando o preço atual do Event é editado.

---

## 10. Descoberta pública

A descoberta pública apresenta apenas Events locais que podem efetivamente ser comprados na plataforma.

O catálogo externo não é mostrado como um catálogo paralelo de itens não vendáveis.

### Busca e filtros planejados

A V1 prevê:

- busca textual;
- categoria;
- gênero;
- cidade;
- data ou período.

A cidade é informada ou escolhida pelo usuário.

Não faz parte da V1:

- GPS obrigatório;
- geolocalização automática;
- reverse geocoding.

### Catálogo misto

Filmes e shows coexistem na mesma experiência de descoberta.

A categoria pode ser utilizada para filtragem, mas a aplicação não é dividida em dois produtos ou catálogos separados.

---

## 11. Reservation

Uma `Reservation` representa uma intenção temporária de compra que já possui inventário alocado.

Criar uma Reservation significa efetivamente reservar temporariamente aquele estoque.

Não existe um objeto separado de Hold na V1.

### Reservation ACTIVE

Enquanto:

- não foi confirmada;
- não foi cancelada;
- e `expiresAt` ainda não passou,

a Reservation mantém seu inventário reservado.

### Reservation CONFIRMED

Após pagamento aprovado, a Reservation é confirmada e seus itens passam a representar compra concluída.

### Reservation CANCELLED

Foi explicitamente cancelada.

### Reservation EXPIRED

Não foi confirmada ou cancelada e sua validade temporal terminou.

A expiração é determinada pelo timestamp da Reservation.

O produto não depende de o usuário:

- fechar corretamente a página;
- executar logout;
- disparar evento de browser;
- permanecer conectado.

---

## 12. ReservationItem

Cada unidade comprada corresponde a um `ReservationItem`.

### SEATED

Exemplo:

Cliente compra B12 e B13.

Resultado:

- ReservationItem de B12;
- ReservationItem de B13.

### GENERAL_ADMISSION

Cliente compra quantidade 3.

Resultado:

- ReservationItem 1;
- ReservationItem 2;
- ReservationItem 3.

Cada ReservationItem armazena o preço unitário aplicável no momento da reserva.

Consequentemente:

**1 ReservationItem → 1 Ticket**

---

## 13. Reserva de assentos

Em Events SEATED, o cliente visualiza o estado atual do mapa e seleciona assentos.

Seleção local na interface não garante disponibilidade.

O assento só está reservado depois que a Reservation é criada com sucesso pelo backend.

### Estados percebidos

Um assento pode ser apresentado como:

- disponível;
- temporariamente reservado;
- vendido.

### Concorrência

Se dois clientes tentarem reservar o mesmo assento simultaneamente, somente um pode obter sucesso.

O segundo recebe conflito de disponibilidade e deve atualizar sua seleção.

Double selling não é comportamento aceitável.

---

## 14. Reserva GENERAL_ADMISSION

Em Events GENERAL_ADMISSION, o cliente informa a quantidade de ingressos.

A quantidade selecionada localmente ainda não representa estoque reservado.

A capacidade é consumida somente após a criação bem-sucedida da Reservation.

Mesmo sob requisições concorrentes, o número total de unidades mantidas por Reservations válidas e vendas confirmadas não pode ultrapassar a capacidade definida para o Event.

---

## 15. Reservation ativa e retomada da compra

A experiência normal permite uma Reservation ativa por CUSTOMER/Event.

Essa regra é principalmente uma política de UX.

Quando o cliente tenta iniciar uma nova compra para um Event no qual já possui Reservation ativa, a aplicação apresenta:

**Você já tem uma reserva em andamento**

Ações:

- `Voltar à compra`
- `Cancelar reserva em andamento`

Fechar o modal não altera nenhuma Reservation.

### Voltar à compra

Abandona a nova seleção local e retorna ao checkout da Reservation existente.

### Cancelar reserva em andamento

Exige confirmação adicional.

Após confirmação:

- a Reservation atual é cancelada;
- seu inventário é liberado;
- a nova compra pode ser iniciada posteriormente.

Não existe troca atômica de uma Reservation antiga por uma nova.

### Persistência

A Reservation pertence à conta do CUSTOMER.

Enquanto ainda estiver ativa, pode ser retomada:

- após reload;
- depois de novo login;
- em outro browser/dispositivo.

Local storage não é fonte de verdade para esse fluxo.

---

## 16. Expiração durante checkout

O checkout apresenta uma contagem regressiva baseada em `expiresAt`.

O backend é a autoridade sobre a validade da Reservation.

Quando o tempo termina:

- o pagamento fica indisponível;
- o usuário é informado de que a Reservation expirou;
- o estoque deixa de ser considerado reservado;
- o cliente pode retornar explicitamente à seleção.

A interface não precisa redirecionar automaticamente no instante zero.

---

## 17. Pagamento

O pagamento da V1 é simulado.

### Cartão

Cartão é o método base obrigatório.

O formulário pode incluir:

- número;
- nome;
- validade;
- CVV;
- formatação;
- validações básicas;
- detecção visual de bandeira.

O ambiente de demonstração fornece dados/presets capazes de produzir deterministicamente:

- pagamento aprovado;
- pagamento recusado.

### Resultado aprovado

A compra é confirmada e Tickets são emitidos.

### Resultado recusado

A Reservation continua disponível enquanto ainda estiver dentro de sua validade, permitindo nova tentativa.

Nenhum Ticket é emitido.

### Erro técnico

A tentativa pode falhar tecnicamente sem ser confundida com recusa do cartão.

O usuário pode realizar nova tentativa quando a anterior estiver em estado terminal.

### PIX simulado

PIX é uma evolução planejada da V1, implementada incrementalmente.

Ele só deve aparecer na interface e no domínio executável depois que seu fluxo estiver efetivamente disponível.

Quando implementado:

- o pagamento começa pendente;
- um QR simulado é apresentado;
- a aprovação ocorre de forma assíncrona simulada;
- reload da página não perde o processamento;
- a Reservation é revalidada antes da confirmação.

Não existe integração financeira real.

---

## 18. Ticket

Cada Ticket representa um único direito de entrada.

Não existem subclasses como:

- MovieTicket;
- ShowTicket.

O mesmo conceito atende filmes e shows.

### Em evento SEATED

O Ticket identifica seu assento.

### Em GENERAL_ADMISSION

O Ticket identifica sua entrada geral.

### Individualidade

Uma compra de dois assentos gera dois Tickets.

Uma compra de três entradas gerais gera três Tickets.

Nunca existe um único QR representando várias pessoas.

---

## 19. Meus Ingressos

O CUSTOMER pode consultar seus Tickets.

### Compra com um Ticket

A experiência pode abrir diretamente o ingresso individual.

### Compra com múltiplos Tickets

A compra pode ser agrupada visualmente, mas apresenta cada Ticket como item individual e clicável.

Cada Ticket possui:

- QR próprio;
- código manual próprio;
- estado próprio;
- ação de compartilhamento própria;
- assento quando aplicável.

O compartilhamento também ocorre por Ticket individual.

---

## 20. QR Code e código manual

Cada Ticket possui uma credencial não forjável representada por QR Code.

A aplicação também oferece um código manual no formato:

`XXXX-XXXX`

Exemplo:

`7K4P-M9Q2`

O código utiliza caracteres adequados para digitação humana e evita combinações visualmente ambíguas quando possível.

QR e código manual levam ao mesmo processo de validação.

---

## 21. Compartilhamento

Um Ticket pode ser compartilhado por link.

O link representa acesso ao Ticket individual correspondente.

Compartilhar não transfere formalmente propriedade ou titularidade.

Na V1:

- não existe transferência de ingresso;
- não existe revenda;
- não existe aceite do novo titular.

Quem possuir o link compartilhável poderá apresentar aquela credencial, portanto o link deve ser tratado como uma capacidade bearer.

Se o Ticket posteriormente for:

- utilizado;
- cancelado;

o link continua refletindo seu estado atual.

---

## 22. Portaria

O GATE seleciona qual Event será operado.

A tela de validação permanece explicitamente contextualizada por essa ocorrência.

O contexto operacional mostra:

- título do Event;
- Venue;
- sala quando aplicável;
- horário local.

Exemplo:

`Duna: Parte Dois · Cine Imperial · Sala A · 20:30`

O operador pode mudar o Event ativo quando necessário.

### Métodos de entrada

A validação pode ocorrer por:

- leitura do QR pela câmera;
- digitação do código manual.

### Resultados

A portaria possui cinco resultados funcionais:

#### VALID

O Ticket:

- existe;
- pertence ao Event ativo;
- não foi cancelado;
- ainda não foi utilizado.

O check-in é realizado.

#### INVALID

A credencial é inexistente, malformada ou inválida.

#### ALREADY_USED

O Ticket já teve entrada registrada.

Uma nova leitura não realiza outro check-in.

#### EVENT_MISMATCH

O Ticket é válido, mas pertence a outro Event.

#### CANCELLED

O Ticket existe, porém foi cancelado e não permite entrada.

### Uso único

Duas tentativas simultâneas de validar o mesmo Ticket devem resultar em apenas uma validação bem-sucedida.

---

## 23. Cancelamento pelo CUSTOMER

A V1 utiliza uma política simplificada de cancelamento inspirada na janela de arrependimento de sete dias, sem afirmar cobertura completa de requisitos legais de produção.

O CUSTOMER pode cancelar a Reservation confirmada quando:

- ainda estiver dentro de sete dias corridos da aprovação do pagamento;
- o Event ainda não tiver iniciado;
- nenhum Ticket daquela compra tiver sido utilizado;
- a Reservation ainda não estiver cancelada.

Conceitualmente:

`eligibleUntil = min(paymentApprovedAt + 7 dias, event.startsAt)`

### Unidade de cancelamento

Cancelamento é por Reservation inteira.

Não é possível cancelar apenas um dos Tickets da compra.

Quando cancelada:

- todos os Tickets da Reservation são cancelados;
- é realizado refund integral simulado;
- o estoque retorna à disponibilidade quando aplicável.

---

## 24. Cancelamento pelo ORGANIZER

O ORGANIZER pode cancelar um Event antes de seu início.

Quando isso ocorre:

- o Event deixa de aceitar novas reservas;
- Reservations ainda ativas são canceladas;
- Tickets emitidos deixam de ser válidos;
- compras confirmadas recebem refund integral simulado;
- o inventário deixa de ser comercializado.

A janela normal de cancelamento do CUSTOMER não limita o refund causado pelo cancelamento do Event.

Cancelamento de evento já iniciado, interrupção operacional e políticas especiais pós-início não fazem parte da V1.

---

## 25. Refund

Refund representa o estorno de uma compra já aprovada.

Na V1:

- apenas refund integral;
- nenhum refund parcial;
- Payment aprovado continua representando historicamente um pagamento que de fato ocorreu;
- Refund registra separadamente a devolução simulada.

Um Ticket cancelado continua existindo no histórico, mas não permite entrada.

---

## 26. Realtime do mapa de assentos

Em Events SEATED, mudanças relevantes de inventário devem ser refletidas entre clientes conectados.

A experiência prevista permite visualizar, sem reload manual:

- novo hold;
- venda;
- liberação explícita.

Realtime melhora a experiência de seleção, mas não altera a regra de produto:

a confirmação final da Reservation pelo backend é sempre a autoridade sobre disponibilidade.

Se a tela estiver momentaneamente desatualizada, uma tentativa sobre assento indisponível deve ser rejeitada de maneira segura.

---

## 27. Seeds e demonstração

A entrega deve fornecer dados suficientes para demonstrar o sistema sem configuração manual extensa.

Devem existir pelo menos:

- 1 usuário ORGANIZER;
- 2 usuários CUSTOMER;
- 1 usuário GATE;
- Venue configurado;
- layout de assentos utilizável;
- pelo menos 1 Event publicado.

A entrega planejada inclui exemplos que permitam demonstrar tanto:

- filme SEATED;
- show GENERAL_ADMISSION.

Credenciais de demonstração devem ser documentadas no README.

---

## 28. Cadastro público

A demonstração não depende de cadastro público, pois usuários seedados são fornecidos.

Se o cadastro de cliente estiver disponível:

- cria exclusivamente usuários CUSTOMER;
- pode ser controlado por configuração;
- não permite criação pública de ORGANIZER ou GATE.

Não fazem parte da V1:

- recuperação de senha;
- confirmação por e-mail;
- OAuth/social login.

---

## 29. Escopo planejado de entrega

Além do caminho principal exigido pelo desafio, fazem parte do plano de entrega da V1:

- busca e filtros;
- painel do organizador;
- cancelamento com retorno de estoque;
- realtime do mapa de assentos;
- Docker Compose;
- testes das invariantes críticas;
- deploy público.

Esses itens fazem parte do plano de execução, mas o fluxo transacional principal e sua correção possuem prioridade sobre refinamentos caso seja necessário reduzir escopo durante a implementação.

---

## 30. Fora de escopo da V1

Não fazem parte da V1:

- múltiplas sessões agrupadas;
- recorrência de Events;
- seletor de horários de um mesmo conteúdo;
- EventSector;
- múltiplos setores;
- pista + camarote;
- diferentes preços por setor;
- mixed seating/general admission;
- editor de Venue;
- editor de mapa de assentos;
- venda por lotes;
- virada automática de lote;
- preço dinâmico;
- partial cancellation;
- partial refund;
- revenda;
- transferência formal de titularidade;
- emissão de nota fiscal;
- envio de ingresso por e-mail;
- recuperação de senha;
- aplicativo nativo;
- operação offline da portaria;
- pagamentos financeiros reais;
- boleto;
- integração com inventário da Ticketmaster;
- geolocalização obrigatória;
- analytics avançado;
- políticas de evento interrompido depois do início.

---

## 31. Princípios de escopo

As decisões da V1 seguem quatro princípios:

### Consistência antes de amplitude

Nenhuma funcionalidade adicional deve comprometer:

- exclusividade de inventário;
- integridade de pagamento;
- emissão única de Ticket;
- uso único no check-in.

### Catálogo externo não é domínio de venda

TMDb e Ticketmaster enriquecem a criação dos Events, mas o 9¾ Tickets controla o inventário comercializado.

### Cada ocorrência é independente

Event é a unidade operacional de:

- inventário;
- reserva;
- pagamento;
- Ticket;
- cancelamento;
- check-in.

### Evolução sem generalização prematura

Conceitos futuros como:

- setores;
- agrupamento de sessões;
- lotes;
- múltiplas modalidades dentro do mesmo Event;

podem ser introduzidos quando houver requisito concreto.

A V1 não implementa abstrações apenas para antecipar essas possibilidades.
