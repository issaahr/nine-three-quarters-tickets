## Uso de IA

A IA foi utilizada como ferramenta de apoio durante todo o desenvolvimento, principalmente para análise de requisitos, discussão de alternativas, investigação de problemas, refinamento de tarefas, implementação assistida, revisão de código, testes e documentação. As decisões finais de produto, regras de negócio, arquitetura e UX permaneceram sob minha responsabilidade, com as sugestões das ferramentas sendo analisadas, adaptadas e validadas antes de serem incorporadas.

### Processo e artefatos

O desenvolvimento foi conduzido com apoio de arquivos de contexto, especificações e decisões técnicas versionados no repositório, incluindo `AGENTS.md`, documentação canônica e registros de decisões. As tasks foram refinadas em slices e organizadas no GitHub Projects, permitindo acompanhar a evolução do projeto e o contexto das decisões.

O ChatGPT foi utilizado principalmente na análise e planejamento: discussão de decisões, identificação de brechas nos planos, investigação de potenciais problemas e avaliação de trade-offs entre complexidade e benefício. Também foi utilizado para refinar as tasks de implementação e estruturar grande parte da documentação a partir das ideias e decisões definidas durante o desenvolvimento.

Essas discussões contribuíram para decisões como adiar a introdução de filas e lote progressivo, não implementar inicialmente o upload de salas pelo organizador, tipos de ingresso mistos e o tratamento sistêmico do status `finished`. A decisão final sobre esses trade-offs permaneceu minha, considerando escopo, prazo e prioridades do produto.

### Ferramentas

* **ChatGPT/Codex** — análise, brainstorming técnico, discussão de trade-offs, refinamento de tasks, documentação e desenvolvimento assistido. O Codex atuou como pair programmer em uma parte significativa da implementação, seguindo as tasks refinadas, a documentação canônica e as diretrizes do `AGENTS.md`. Os diffs gerados foram revisados manualmente e validados durante o desenvolvimento.
* **Claude** — utilizado ao longo do desenvolvimento para brainstorming visual e identidade da 9¾ Tickets, além de revisões técnicas de segurança, concorrência e consistência de dados, auditorias pontuais da codebase, revisão de documentação e identificação de problemas que poderiam passar despercebidos durante as implementações.
* **Laguna via OpenRouter** — utilizado para implementar o plano de tokenização de valores hexadecimais soltos no frontend.

A implementação foi construída de forma iterativa, combinando desenvolvimento manual e assistido. O Codex produziu grande parte do boilerplate e dos testes unitários e E2E, enquanto as regras de negócio, decisões de produto e arquitetura, UI/UX, integração e validação dos fluxos, testes de navegação e responsividade, leitura de QR Codes, revisão dos resultados e deploy foram conduzidos e validados por mim.

Algumas decisões foram tomadas após discussões com IA; outras partiram diretamente de conhecimento técnico, experiência e julgamento próprio. Em ambos os casos, a responsabilidade pela solução final e pela qualidade do produto permaneceu comigo.

Mais detalhes sobre o processo, ferramentas e artefatos estão disponíveis em:
- [`Projeto Nine Three Quarters Tickets`](https://github.com/users/issaahr/projects/3/views/1).
- [`Docs Canônicas`](/docs).
- [`AGENTS.md`](../AGENTS.md).
