# Design system — Local Session

Este é o documento **normativo** da interface. Ele decide; as duas referências ao lado
explicam o porquê e citam as fontes:

- [`ui-ux-referencias.md`](ui-ux-referencias.md): fundamentos (heurísticas, WCAG 2.2,
  toque, estados, microcopy);
- [`material-design-referencias.md`](material-design-referencias.md): Material 3 (tokens,
  componentes, implementação na web e no Flutter).

O protótipo que materializa estas regras está em
<https://claude.ai/artifact/JCp4NQHxbQsmLphmMv6LvX> (sessões, conversa, permissão e pergunta,
arquivos, telas nativas e a prancha de tokens). Quando o protótipo e este documento divergirem,
vale este documento.

## 1. Escopo

| Superfície | Onde mora | Como aplica o sistema |
| --- | --- | --- |
| Página do hub | `web/index.html`, `web/style.css`, `web/app.js` | tokens em CSS custom properties `--md-sys-*`, sem biblioteca de componentes |
| App Android | `mobile/` (Flutter + WebView com a mesma página) | a página herda tudo; as telas nativas (busca do hub, pareamento, ajustes) usam `ThemeData` com o mesmo esquema |
| Janela Electron | `desktop/` | fora do escopo desta primeira etapa; quando migrar, usa os mesmos tokens CSS |

O público é uma pessoa só, o próprio desenvolvedor, quase sempre no **celular**, muitas vezes
com uma mão e com pressa ("aprovo esse comando e volto"). Toda decisão abaixo favorece ler
rápido, acertar o toque e nunca aprovar algo sem querer.

## 2. Princípios

1. **O que espera você vem primeiro.** Permissão e pergunta pendentes têm a cor mais
   chamativa da tela que não é a de ação (`tertiary`) e sobem para o topo da lista.
2. **Âmbar é ação, não decoração.** `primary` aparece em: botão principal, FAB, aba ativa,
   foco, progresso. Nunca em texto corrido nem em borda decorativa.
3. **Profundidade por tom, não por sombra.** Camadas usam `surface-container-*`; sombra só no
   que flutua sobre conteúdo que rola (FAB, snackbar, menu, diálogo).
4. **Um toque, um alvo.** Nada interativo menor que 48×48 px de área de toque, mesmo que o
   desenho seja menor.
5. **Estado sempre visível.** Conectando, trabalhando, esperando, encerrada, sem conexão: cada
   estado tem cor **e** texto, nunca só cor.
6. **Ação perigosa é explícita.** Aprovar comando, matar sessão, sobrescrever: rótulo com
   verbo, nunca "OK"; colar nunca sobrescreve.

## 3. Cor

### 3.1 Esquema

Gerado com `@material/material-color-utilities` 0.3.0, `SchemeFidelity`, semente **`#f5a524`**,
tema escuro, contraste 0. Os neutros **não** são os do algoritmo: a fidelity tinge as superfícies
de marrom (`#19120a`), o que muda a cara sóbria atual. As superfícies usam a mesma escala de tons
do M3 numa paleta neutra com o matiz da semente e **croma 2** (decisão nossa, ver seção 13).

Ação e destaque:

| Token CSS | Hex | Par de conteúdo | Uso |
| --- | --- | --- | --- |
| `--md-sys-color-primary` | `#ffc77f` | `--md-sys-color-on-primary` `#462b00` | botão filled, enviar, switch ligado, aba ativa, foco, progresso |
| `--md-sys-color-primary-container` | `#f5a524` | `#462b00` | FAB, avatar do Claude |
| `--md-sys-color-secondary` | `#ecbf86` | `#462b00` | raro; preferir o contêiner |
| `--md-sys-color-secondary-container` | `#624315` | `#ffddb4` | botão tonal, segmento selecionado, balão do seu prompt |
| `--md-sys-color-tertiary` | `#9ad9ff` | `#003549` | texto e ícone de "esperando você" |
| `--md-sys-color-tertiary-container` | `#36c2ff` | `#004d69` | avatar de sessão esperando você |
| `--md-sys-color-inverse-primary` | `#835400` | — | ação dentro do snackbar |

Erro e sucesso:

| Token CSS | Hex | Par de conteúdo | Uso |
| --- | --- | --- | --- |
| `--md-sys-color-error` | `#ffb4ab` | `#690005` | interromper, "negado", contexto acima de 80%, "sem resposta" |
| `--md-sys-color-error-container` | `#93000a` | `#ffdad6` | ícone de estado de erro em tela cheia |
| `--ls-color-success` | `#85db5d` | `#103900` | "permitido", ferramenta concluída, "resposta enviada" |
| `--ls-color-success-container` | `#1b5200` | `#a0f976` | fundo de confirmação, quando precisar |

`success` não é papel do M3: é a cor `#4ade80` atual harmonizada com a semente
(`Blend.harmonize`) e cortada nos mesmos tons (80/20/30/90). O prefixo `--ls-` marca o que é
nosso.

Superfícies e texto:

| Token CSS | Hex | Uso |
| --- | --- | --- |
| `--md-sys-color-surface` | `#151311` | fundo da página e das telas |
| `--md-sys-color-surface-container-lowest` | `#100e0c` | bloco de código, preview de comando, visor da câmera |
| `--md-sys-color-surface-container-low` | `#1e1b19` | barra do topo da sessão, grupo de atividade, card informativo |
| `--md-sys-color-surface-container` | `#221f1d` | menus e sheets |
| `--md-sys-color-surface-container-high` | `#2c2927` | cards de permissão e pergunta, composer, balão do prompt vindo do terminal, `code` inline |
| `--md-sys-color-surface-container-highest` | `#373432` | trilho de progresso, avatar de sessão ociosa, switch desligado |
| `--md-sys-color-surface-bright` | `#3c3936` | raro (hover em superfície alta) |
| `--md-sys-color-on-surface` | `#e8e1dd` | texto principal |
| `--md-sys-color-on-surface-variant` | `#cec5bd` | texto secundário, ícones de ação, metadados |
| `--md-sys-color-outline` | `#978f88` | borda de botão outlined, de segmented e de campo |
| `--md-sys-color-outline-variant` | `#4b4640` | divisórias, borda de chip e de card informativo |
| `--md-sys-color-inverse-surface` | `#e8e1dd` | snackbar |
| `--md-sys-color-inverse-on-surface` | `#33302d` | texto do snackbar |
| `--md-sys-color-scrim` | `#000000` | véu atrás de diálogo e sheet modal (32%) |

### 3.2 Regras

- **Sempre o par.** Texto sobre `X` usa `on-X`. Combinação inventada (texto `primary` sobre
  `secondary-container`, por exemplo) não tem contraste garantido.
- **Exceção registrada:** o balão do seu prompt usa `#ffddb4` (tom 90 da secondary) em vez de
  `on-secondary-container` `#ddb179`: em texto corrido de 16 px o tom 90 lê melhor e ainda dá
  6,8:1.
- Texto pequeno ≥ 4,5:1, texto grande e ícones ≥ 3:1 (WCAG 1.4.3 e 1.4.11). Todos os pares da
  tabela passam; cor nova precisa ser medida antes de entrar.
- **Nada de branco nem preto puros** em superfície ou texto.
- Sem cor dinâmica do papel de parede (Android 12+): a página na WebView não a recebe, e as duas
  partes do app ficariam com identidades diferentes.

### 3.3 Estados de sessão

Cada estado tem cor, ícone e texto. Nenhum depende só da cor.

| Estado | Cor do texto | Avatar (fundo / ícone) | Ícone | Texto |
| --- | --- | --- | --- | --- |
| Esperando você (permissão ou pergunta) | `tertiary` | `tertiary-container` / `on-tertiary-container` | `shield_lock` ou `help` | "Permissão · Bash: …" / "Pergunta · …" |
| Trabalhando | `primary` | `#643f00` (tom 30 da primary) com anel de 3 px `primary` / `primary` | `bolt` | "Trabalhando · Edit arquivo" |
| Ociosa | `on-surface-variant` | `surface-container-highest` / `on-surface-variant` | `schedule` | "Ociosa há 12 min" |
| Encerrada | `outline` | contorno `outline-variant` / `outline` | `terminal` | "Encerrada às 11:40" |
| Sem conexão com o hub | `error` | — | `error` | faixa "sem conexão — reconectando" |

Contexto da janela: barra de 4 px, `primary` até 80%, `error` acima de 80%, com a porcentagem
ao lado em `label-small` com `tnum`.

## 4. Tipografia

### 4.1 Fonte

- **Inter**, variável, eixos `wght` e `opsz`. Na web: self-host de
  `inter-latin-opsz-normal.woff2` (73 KB, subconjunto latin, cobre o português) servido pelo
  próprio hub, `font-display: swap` e `<link rel="preload" as="font" type="font/woff2"
  crossorigin>`. Nada de Google Fonts em produção: o celular fala com o hub na LAN e pode não ter
  internet.
- No Flutter: arquivos estáticos 400, 500 e 600 como asset no `pubspec.yaml`. Não usar
  `google_fonts` (busca a fonte por HTTP em tempo de execução).
- `font-feature-settings: "liga" 1, "calt" 1` no `:root`. `tnum` em tudo que é número que muda
  (porcentagem, contadores, tamanhos, horas).
- **Monoespaçada** para comando, caminho, código e terminal: a pilha do sistema
  (`ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`), sem fonte
  extra.
- Pesos permitidos: **400, 500 e 600**. 700 do Inter "estoura" no escuro.

### 4.2 Escala

Tamanhos e alturas de linha do M3; tracking ajustado para Inter (proposta, validar no aparelho).

| Token | Tamanho / linha | Peso | Tracking | Uso no app |
| --- | --- | --- | --- | --- |
| `headline-large` | 32 / 40 | 400 | −0,01em | título da prancha, telas largas |
| `headline-small` | 24 / 32 | 400 | 0 | título de estado vazio ou de erro, título de diálogo |
| `title-large` | 22 / 28 | 500 | 0 | título da top app bar |
| `title-medium` | 16 / 24 | 500 | 0 | nome da sessão, título de card, nome da ferramenta |
| `title-small` | 14 / 20 | 500 | 0 | subtítulo de seção, abas |
| `body-large` | 16 / 24 | 400 | 0 | resposta do Claude, prompt, item de lista |
| `body-medium` | 14 / 20 | 400 | 0 | texto de apoio, descrição de opção |
| `body-small` | 12 / 16 | 400 | 0,01em | metadado, hora, caminho |
| `label-large` | 14 / 20 | 500 (600 em botão sobre cor) | 0 | botão, chip |
| `label-medium` | 12 / 16 | 500 | 0,02em | rótulo de card ("Pedido de permissão") |
| `label-small` | 11 / 16 | 500 | 0,03em | modelo, porcentagem, hora na lista |

Regras:

- Corpo de leitura nunca abaixo de 16 px no celular (evita o zoom automático do iOS no campo e
  cansa menos). 14 px só para apoio; 11–12 px só para metadado.
- Medida de linha da resposta: até ~75 caracteres; no desktop, `max-width: 72ch` no feed.
- Respeitar o tamanho de fonte do sistema: unidades em `rem` na página, `textScaler` no Flutter;
  layout testado a 200%.

## 5. Espaçamento e layout

- **Base 4 px.** Escala: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Valores fora dela (2, 6, 10,
  14 que existem hoje em `style.css`) saem na migração; 1–2 px só para borda e traço.
- Margem lateral: **16 px** no celular (< 600 px), **24 px** a partir de 600 px.
- Espaço entre blocos do feed: 16 px. Dentro de card: 12–16 px. Entre botões vizinhos: 8 px.
- Item de lista: 56 px (uma linha), 72 px (duas), 88 px (três); padding horizontal 16 px;
  ícone/avatar à esquerda com 16 px de vão.
- Breakpoints: `600px` (medium) e `840px` (expanded). Em expanded, lista de sessões e conversa
  ficam lado a lado (layout list-detail do M3); abaixo disso, uma tela por vez.
- Safe areas: `env(safe-area-inset-*)` no composer e no FAB.

## 6. Forma

| Token | Valor | Onde |
| --- | --- | --- |
| `--md-sys-shape-corner-none` | 0 | top app bar, item de lista, abas |
| `--md-sys-shape-corner-extra-small` | 4 px | snackbar, menu |
| `--md-sys-shape-corner-small` | 8 px | chip, bloco de código, preview de comando, `code` inline (6 px tolerado) |
| `--md-sys-shape-corner-medium` | 12 px | cards (permissão, pergunta, atividade, informativo), item de opção selecionado |
| `--md-sys-shape-corner-large` | 16 px | FAB, extended FAB |
| `--md-sys-shape-corner-extra-large` | 28 px | diálogo, bottom sheet (só cantos de cima), composer, visor da câmera |
| `--md-sys-shape-corner-full` | 9999 px | botões, icon buttons, segmented, switch, avatar, barra de progresso (2 px) |

Balão de mensagem: 20 px com o canto do lado do remetente em 4 px (`20px 20px 4px 20px` para os
seus prompts, que ficam à direita).

## 7. Elevação

- Profundidade = tom de `surface-container-*` (seção 3.1). Sem `box-shadow` como hierarquia.
- Sombra curta permitida só em: FAB (nível 3), snackbar (nível 3), menu (nível 2), diálogo
  (nível 3). Valor de referência: `0 3px 6px rgba(0,0,0,.35), 0 1px 2px rgba(0,0,0,.4)`.
- Top app bar rolada por cima de conteúdo passa de `surface` para `surface-container-low`, não
  ganha sombra.

## 8. Movimento

| Token | Valor | Uso |
| --- | --- | --- |
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | mudança de estado, deslocamento na tela |
| `--md-sys-motion-easing-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | entrada (card novo no feed, sheet, snackbar) |
| `--md-sys-motion-easing-emphasized-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | saída |
| `--md-sys-motion-duration-short2` | 100 ms | hover, pressed, troca de cor |
| `--md-sys-motion-duration-short4` | 200 ms | saída, fechar |
| `--md-sys-motion-duration-medium2` | 300 ms | entrada de card, abrir sheet |
| `--md-sys-motion-duration-medium4` | 400 ms | transição entre telas (teto) |

- Nada acima de 400 ms na interação comum; sair é mais rápido que entrar.
- Animação serve para dizer **de onde veio** e **para onde foi**; nada decorativo, nada em loop
  além do indicador de progresso.
- `prefers-reduced-motion: reduce`: deslocamentos viram fade de 100 ms ou nada; o spinner vira
  barra indeterminada estática com texto.
- Sem molas do M3 Expressive nesta etapa (o Flutter não as implementa; ver referência).

## 9. Estados de interação

Camada da cor do conteúdo (`on-*`) sobre o contêiner:

| Estado | Opacidade |
| --- | --- |
| hover | 8% (só dentro de `@media (hover: hover)`) |
| focus | 10% + anel de foco |
| pressed | 10% |
| dragged | 16% |
| desabilitado | contêiner `on-surface` 12%, conteúdo `on-surface` 38%, sem camada |
| selecionado | troca de contêiner (`secondary-container`) e ícone preenchido |

- **Anel de foco:** `outline: 3px solid var(--md-sys-color-primary); outline-offset: 2px` em
  `:focus-visible`. Nunca `outline: none` sem substituto.
- Implementação web: `::before` absoluto com `background: currentColor` e `opacity` por estado.
- Desabilitado **explica o porquê** quando não for óbvio (ex.: "esta sessão não roda dentro de
  tmux — responda pelo terminal" no lugar dos botões, nunca botão morto sem texto).

## 10. Ícones

- **Material Symbols Outlined, peso 400, grade 0, tamanho óptico 24.** Licença Apache-2.0.
- Web: só os SVGs usados, copiados de `@material-symbols/svg-400` para um sprite em
  `web/icons.svg` (`<symbol id="i-folder" viewBox="0 -960 960 960">`), referenciado por
  `<svg><use href="icons.svg#i-folder"></use></svg>`, `fill: currentColor`. Sem fonte de ícones,
  sem JS. Cerca de 0,4 KB por ícone.
- Flutter: pacote `material_symbols_icons`, com `fontVariations` peso 400.
- Selecionado ou ativo: variante `-fill` do mesmo ícone (estrela de favorito, aba ativa).
- Tamanhos: **24** padrão; **20** dentro de botão com texto, avatar de 40 e chip de navegação;
  **18** em chip e breadcrumb; **16** em metadado inline. Área de toque continua 48.
- Ícone sozinho como botão tem `aria-label` com verbo ("Copiar academy", "Interromper");
  ícone decorativo tem `aria-hidden="true"`.
- Conjunto do app (nome do Material Symbols → função):

| Ícone | Função |
| --- | --- |
| `arrow_back` | voltar |
| `more_vert` | menu da sessão |
| `stop_circle` | interromper |
| `history` | sessões encerradas |
| `add` | nova sessão |
| `send` / `arrow_upward` | enviar (o protótipo usa `arrow_upward` no botão redondo) |
| `attach_file` | anexar imagem |
| `terminal` | terminal remoto, sessão encerrada |
| `computer` | "no terminal" (origem do turno) |
| `folder`, `description` | pasta, arquivo |
| `create_new_folder`, `content_copy`, `content_paste`, `download` | gerenciador de arquivos |
| `star` / `star-fill` | favoritar / favorito |
| `search`, `sort`, `chevron_right` | busca, ordenar, breadcrumb |
| `play_arrow` | abrir sessão nesta pasta |
| `shield_lock` | pedido de permissão |
| `help` | pergunta |
| `bolt` | trabalhando, auto mode |
| `schedule` | ociosa |
| `check`, `close` | permitido / concluído, negado / fechar |
| `error` | erro de conexão |
| `refresh` | procurar de novo |
| `qr_code_scanner` | parear |
| `wifi`, `vpn_lock`, `lan` | rede local, tailnet, conexão |
| `notifications`, `settings` | avisos, ajustes |
| `keyboard_arrow_down` | expandir grupo |
| `radio_button_checked` / `radio_button_unchecked` | opção de pergunta |

## 11. Componentes

Medidas em px (= dp). Tudo o que é interativo tem área de toque ≥ 48.

### Top app bar

- Altura 64; padding 4 nas pontas (o icon button já tem 48); título `title-large` na lista e
  nas telas nativas.
- Na tela inicial (lista de sessões), o ícone do app (`desktop/icon.svg`, 32 px, 12 de vão)
  vem antes do título "Local Session", como em app nativo. Telas internas trocam o ícone por
  `arrow_back`.
- Na conversa: título da sessão em `title-medium` + linha de estado em `body-small` com ponto de
  8 px na cor do estado (seção 3.3); fundo `surface-container-low`; barra de contexto de 4 px
  colada embaixo.
- No máximo duas ações à direita; o resto vai para o `more_vert`.

### Abas (Sessões / Abrir pasta)

- Primary tabs: altura 48, rótulo `title-small`, ativa em `primary` com indicador de 3 px e
  cantos de cima arredondados; inativa em `on-surface-variant`; divisória `outline-variant`
  embaixo.

### Item de sessão

- Três linhas: nome (`title-medium`) + modelo ou hora à direita (`label-small`); estado na cor
  do estado (`body-medium`); terceira linha com caminho em mono 12 **ou** barra de contexto.
- Avatar de 40 com o ícone do estado (seção 3.3).
- Agrupado por seção na ordem: **Esperando você**, **Ativas**, **Encerradas**. Subtítulo de
  seção em `title-small` `on-surface-variant`.
- Tocar abre a conversa; tocar num item "esperando você" abre direto no card pendente.

### Extended FAB "Nova sessão"

- 56 de altura, cantos 16, `primary-container` + `on-primary-container`, ícone `add` 24 +
  `label-large` 600, sombra nível 3, 16 das bordas (mais safe area).
- Leva para "Abrir pasta". Some (encolhe para FAB de ícone) quando a lista rola para baixo.

### Balões e respostas do feed

- **Seu prompt:** alinhado à direita, `max-width: 85%`, `secondary-container`, texto `#ffddb4`,
  `body-large`, padding 10×16, cantos `20 20 4 20`; hora embaixo em `body-small`. Tocar a hora
  oferece "↻ reenviar".
- **Prompt vindo do terminal:** igual, mas `surface-container-high` e texto `on-surface`, com
  `computer` 16 + "14:31 · no terminal".
- **Resposta do Claude:** sem balão, largura total. Cabeçalho com avatar "C" de 28
  (`primary-container`), "claude" em `label-large` e, se veio do terminal, "· no terminal" em
  `body-small`. Corpo `body-large` renderizado como markdown; `code` inline em mono 14 sobre
  `surface-container-high`, cantos 6; bloco de código sobre `surface-container-lowest`, cantos 8,
  rolagem horizontal própria (`min-width: 0`).

### Grupo de atividade (régua)

- `<details>` com fundo `surface-container-low`, borda `outline-variant`, cantos 12.
- Resumo de 48: "3 ferramentas · 8 s" em `title-small` `on-surface-variant` + `keyboard_arrow_down`.
- Linha por ferramenta: nome em `label-medium` 500 (largura fixa de 56, com `ellipsis` porque
  nome de tool MCP passa de 45 caracteres), alvo em mono 12 `on-surface-variant` com `ellipsis`,
  estado à direita: `check` em `success` (concluída), spinner `primary` (rodando), `close` em
  `error` (falhou).
- Abre sozinho até 4 itens; acima disso começa fechado (lembra a escolha manual).

### Card de permissão

- Fundo `surface-container-high`, cantos 12, padding 16, gap 12.
- Cabeçalho: avatar de 40 `on-tertiary-container`/`tertiary` com `shield_lock`; rótulo
  "Pedido de permissão" em `label-medium` `tertiary`; nome da ferramenta em `title-medium`.
- Descrição em `body-medium` `on-surface-variant`.
- Preview do comando ou do diff em `pre` mono 13/20 sobre `surface-container-lowest`, cantos 8,
  quebra de linha preservada, até 40 linhas e então "…".
- Ações à direita: **Negar** (outlined, texto `on-surface`) e **Permitir** (filled `primary`).
  Permitir fica **por último, à direita** (convenção do M3 para a ação confirmatória), e nunca é
  o único botão.
- Resolvido: os botões dão lugar a uma linha de estado — `check` + "Permitido por você" em
  `success`, ou `close` + "Negado por você" em `error`, ou "Permitido (auto)" quando foi o auto
  mode.

### Card de pergunta

- Mesmo contêiner do card de permissão; ícone `help`; rótulo "Pergunta · {header}"; pergunta em
  `title-medium`.
- Opções como `role="radio"` (ou `checkbox` quando `multiSelect`), cada uma com ≥ 56 de altura:
  ícone de rádio 24, rótulo `body-large`, descrição `body-medium` `on-surface-variant`.
  Selecionada: rádio em `primary` e fundo `primary` a 10%.
- "Enviar resposta" filled, **desabilitado até haver escolha**; depois de enviar, vira
  `check` + "Resposta enviada" em `success`.
- Sessão fora do tmux: as opções ficam visíveis só como leitura e o lugar do botão mostra
  "esta sessão não roda dentro de tmux — responda pelo terminal" (decisão por sessão, não por
  máquina).

### Composer

- Faixa de chips de atalho (suggestion chips: 32 de altura, cantos 8, borda `outline-variant`,
  `label-large` `on-surface-variant`), rolagem horizontal com `min-width: 0`.
- Campo em pílula: `surface-container-high`, cantos 28, altura mínima 56, cresce até 6 linhas.
  Anexar (icon button 48) à esquerda; enviar à direita como icon button filled de 40
  (`primary`), desabilitado com o campo vazio.
- `body-large` 16 px (evita o zoom do iOS); `enterkeyhint="send"`.
- Sem conexão: o prompt entra na fila e aparece no feed com rótulo "na fila".

### Botões

| Tipo | Contêiner | Conteúdo | Quando |
| --- | --- | --- | --- |
| Filled | `primary` | `on-primary`, 600 | a ação principal da tela ou do card (uma só) |
| Tonal | `secondary-container` | `#ffddb4`, 600 | ação importante não principal ("Sessão aqui") |
| Outlined | borda `outline` | `primary` (ou `on-surface` em "Negar") | alternativa da principal |
| Text | — | `primary` | ação de baixa ênfase ("Ajustes", "Escanear outro QR") |
| Icon | — | `on-surface-variant` | ações de barra; 48 de alvo, 24 de ícone |

Altura 40, cantos `full`, padding 24 (16 do lado do ícone), `label-large`. Rótulo é verbo no
infinitivo ou imperativo curto: "Permitir", "Enviar resposta", "Procurar de novo". Nunca "OK".

### Chips

- **Filtro/favorito:** 32, cantos 8, borda `outline-variant`, ícone 18 à esquerda (`star-fill`
  `primary` nos favoritos).
- **Sugestão:** sem ícone, mesmo desenho.

### Segmented button

- 40 de altura, borda `outline`, cantos `full`, até 3 segmentos; selecionado em
  `secondary-container` com `check` 18. Texto curto ("Automático", "Só LAN", "Só VPN") e a
  explicação da opção escolhida logo abaixo em `body-medium`.

### Switch

- Trilho 52×32. Ligado: trilho `primary`, alça 24 `on-primary` com `check` 16. Desligado:
  trilho `surface-container-highest` com borda 2 `outline`, alça 16 `outline`.
- A linha inteira (título + apoio + switch) é o alvo de toque.

### Snackbar

- `inverse-surface`, texto `inverse-on-surface` `body-medium`, cantos 4, altura mínima 48,
  ação em `inverse-primary` 600, `close` opcional; 12 das laterais, acima do composer/FAB.
- Some sozinho em 4–10 s, exceto quando tem ação pendente (ex.: "Copiado: academy · Colar
  aqui", que fica até colar ou cancelar). Anunciado por `role="status"`.

### Progresso

- Linear de 4 (contexto e carregamento de tela), circular de 16 com traço 2 (ferramenta
  rodando). Indeterminado só quando não há como medir.

### Diálogo e bottom sheet

- Diálogo: `surface-container-high`, cantos 28, título `headline-small`, ações text à direita,
  scrim 32%. Só para confirmar ação destrutiva irreversível (matar sessão, ligar auto mode).
- Bottom sheet: cantos 28 em cima, alça de 32×4, `surface-container-low`; usado para "o que
  mudou" (diff) e para o terminal remoto.

## 12. Padrões

- **Estado vazio:** ícone 48 `on-surface-variant`, frase do que falta e a ação que resolve
  ("Nenhuma sessão ativa" + "Nova sessão").
- **Erro em tela cheia** (hub não encontrado): ícone em `error-container` de 96, título
  `headline-small`, o que foi tentado (lista de endereços com o resultado de cada um), a ação
  principal filled e as alternativas outlined/text. Erro ambíguo (token errado e "não é o hub"
  dão o mesmo 404) diz as duas causas em vez de adivinhar.
- **Sem conexão na página:** faixa fixa no topo em `error` com "sem conexão — reconectando";
  controles que dependem do hub ficam desabilitados com explicação.
- **Ação destrutiva:** confirmação com o verbo e o alvo no botão ("Encerrar escola60"); quando
  der, preferir desfazer por snackbar a perguntar antes.
- **Tempo de resposta:** < 100 ms sem indicador; até 1 s, só o estado pressed; 1–10 s, spinner
  ou esqueleto; > 10 s, progresso com texto.
- **Navegação:** celular = pilha (lista → conversa → sheet); expanded = list-detail. Voltar do
  Android sempre fecha o que está mais em cima (sheet, depois conversa).

## 13. Decisões tomadas aqui (e o que validar)

| Decisão | Por quê | Validar |
| --- | --- | --- |
| Semente âmbar `#f5a524`, variante fidelity | escolha do dono; fidelity preserva o âmbar | — |
| Neutros com croma 2 em vez dos da fidelity | a fidelity deixa o fundo marrom | olhar no celular, à noite |
| Balão do prompt com `#ffddb4` | legibilidade em 16 px | contraste já medido (6,8:1) |
| Tracking do Inter ajustado | os valores do M3 são para Roboto | no aparelho, antes de fixar |
| `tertiary` (ciano) para "esperando você" | separa atenção de ação (âmbar) | se chama atenção o suficiente |
| Material Symbols em sprite SVG | leve, sem build, mesma linguagem do M3 | — |
| Tokens CSS em vez de `@material/web` | a biblioteca está em manutenção e pede CDN | — |
| Sem M3 Expressive | o Flutter não implementa | revisitar em 2027 |

## 14. Implementação

### Web

1. Criar `web/tokens.css` com todos os `--md-sys-*` e `--ls-*` deste documento; `style.css`
   passa a consumir só tokens. Mapeamento dos atuais:

| Atual | Novo |
| --- | --- |
| `--bg` | `--md-sys-color-surface` |
| `--sunken` | `--md-sys-color-surface-container-lowest` |
| `--surface` | `--md-sys-color-surface-container-low` |
| `--control` | `--md-sys-color-surface-container` |
| `--raise` | `--md-sys-color-surface-container-high` |
| `--active` | `--md-sys-color-surface-container-highest` |
| `--line-faint`, `--line` | `--md-sys-color-outline-variant` |
| `--line-strong`, `--line-contrast` | `--md-sys-color-outline` |
| `--ink`, `--ink-body` | `--md-sys-color-on-surface` |
| `--ink-2`, `--ink-3` | `--md-sys-color-on-surface-variant` |
| `--ink-4`, `--ink-5` | `on-surface` a 38% (só desabilitado) |
| `--amber`, `--amber-lift`, `--amber-tint` | `primary`, `primary-container`, `secondary-container` |
| `--red`, `--red-tint` | `error`, `error-container` |
| `--green`, `--green-tint` | `--ls-color-success`, `--ls-color-success-container` |
| `--fs-*` | `--md-sys-typescale-*` |
| `--sp-*` | escala de 4 (seção 5) |
| `--r-*` | `--md-sys-shape-corner-*` |

2. Self-host do Inter em `web/fonts/` e entrada no `src/web-assets.ts` (o binário embute a
   pasta `web/`). Se a página ou a janela Electron declararem CSP, incluir `font-src 'self'` —
   a janela Electron hoje **não** tem, e bloquearia a fonte.
3. Sprite `web/icons.svg` com os ícones da seção 10.
4. Manter os invariantes de `tests/web-css.test.ts` (`min-width: 0` em quem rola, `max-width`
   em fixed centralizado, `ellipsis` em nome de ferramenta, `#id[hidden]`, controles maiores em
   `@media (hover: none)`).
5. Migrar por tela, na ordem do uso: lista de sessões, conversa e cards, composer, arquivos,
   terminal, sheets.

### Flutter

`ColorScheme` explícito (não `fromSeed`, porque os neutros são nossos), Inter como asset e
Material Symbols:

```dart
const esquema = ColorScheme(
  brightness: Brightness.dark,
  primary: Color(0xFFFFC77F), onPrimary: Color(0xFF462B00),
  primaryContainer: Color(0xFFF5A524), onPrimaryContainer: Color(0xFF462B00),
  secondary: Color(0xFFECBF86), onSecondary: Color(0xFF462B00),
  secondaryContainer: Color(0xFF624315), onSecondaryContainer: Color(0xFFFFDDB4),
  tertiary: Color(0xFF9AD9FF), onTertiary: Color(0xFF003549),
  tertiaryContainer: Color(0xFF36C2FF), onTertiaryContainer: Color(0xFF004D69),
  error: Color(0xFFFFB4AB), onError: Color(0xFF690005),
  errorContainer: Color(0xFF93000A), onErrorContainer: Color(0xFFFFDAD6),
  surface: Color(0xFF151311), onSurface: Color(0xFFE8E1DD),
  onSurfaceVariant: Color(0xFFCEC5BD),
  surfaceContainerLowest: Color(0xFF100E0C), surfaceContainerLow: Color(0xFF1E1B19),
  surfaceContainer: Color(0xFF221F1D), surfaceContainerHigh: Color(0xFF2C2927),
  surfaceContainerHighest: Color(0xFF373432), surfaceBright: Color(0xFF3C3936),
  surfaceDim: Color(0xFF151311),
  outline: Color(0xFF978F88), outlineVariant: Color(0xFF4B4640),
  inverseSurface: Color(0xFFE8E1DD), onInverseSurface: Color(0xFF33302D),
  inversePrimary: Color(0xFF835400),
  scrim: Color(0xFF000000), shadow: Color(0xFF000000),
);

final tema = ThemeData(
  useMaterial3: true,
  colorScheme: esquema,
  fontFamily: 'Inter',
  scaffoldBackgroundColor: esquema.surface,
);
```

O `#7C5CFF` (roxo) atual do app sai. A splash (`values-v31`, `values-night-v31`,
`drawable-v21/launch_background.xml`) passa a `#151311`.

## 15. Checklist de tela pronta

- [ ] Só tokens; nenhum hex solto fora de `tokens.css` / do `ColorScheme`.
- [ ] Todo par texto/fundo é um par `X`/`on-X` ou está medido ≥ 4,5:1.
- [ ] Todo alvo interativo ≥ 48×48; ícone sozinho tem `aria-label` com verbo.
- [ ] Estados: normal, hover (só com mouse), foco visível, pressed, desabilitado com motivo,
      carregando, vazio, erro.
- [ ] Nada depende só de cor (estado tem texto e ícone).
- [ ] Texto de leitura ≥ 16 px; números que mudam com `tnum`.
- [ ] Funciona a 320 px de largura e com fonte a 200%.
- [ ] Movimento ≤ 400 ms e respeita `prefers-reduced-motion`.
- [ ] Ação principal única por tela/card; ação perigosa com verbo e alvo.
- [ ] `bun test` verde (inclui `tests/web-css.test.ts`) e validação visual no celular.
