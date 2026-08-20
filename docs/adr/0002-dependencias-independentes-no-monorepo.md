# ADR 0002 — Dependências independentes no monorepo

- Status: aceito
- Data: 2026-08-20

## Contexto

API e web utilizam toolchains e ciclos de evolução diferentes. Um workspace compartilhado no root não oferece economia relevante neste momento e faria atualizações de dependências de uma aplicação interferirem no lock e na instalação da outra.

A execução conjunta já possui um coordenador adequado: Docker Compose.

## Decisão

O repositório continuará sendo um monorepo, mas cada aplicação manterá:

- seu próprio `package.json`;
- seu próprio `package-lock.json`;
- suas próprias dependências e scripts;
- execução independente a partir de `apps/api` ou `apps/web`.

O root não terá package de coordenação, workspace de package manager ou scripts para iniciar e construir as duas aplicações. Packages compartilhados só serão considerados diante de reutilização concreta que compense o acoplamento.

## Consequências

- Instalações e atualizações ficam isoladas por aplicação.
- Versões de ferramentas comuns podem divergir e precisam ser revisadas conscientemente.
- Alguns contratos podem ser representados separadamente em API e web.
- Execução conjunta depende do Compose ou de dois comandos independentes durante desenvolvimento local.
