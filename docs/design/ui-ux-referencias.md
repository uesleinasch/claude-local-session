# Referências de UI/UX

Fundamentos de design de interface que valem para qualquer sistema visual, reunidos a partir de
fontes de referência (Nielsen Norman Group, Laws of UX, W3C/WAI, web.dev, Apple HIG, Android
Developers, Refactoring UI, Baymard, Interaction Design Foundation). Cada regra traz a fonte; a
lista completa, com URL, está na seção 14. Quando um número não pôde ser conferido na fonte
original, o texto diz isso.

## 1. Como usar este documento

**Para quem.** Para quem for desenhar ou revisar qualquer tela do claude-local-session: a página
servida pelo hub (`web/`), o app Android em Flutter que a encapsula (`mobile/`) e a janela
Electron (`desktop/`). O público do produto é o próprio desenvolvedor, quase sempre no celular,
às vezes no desktop, acompanhando sessões do Claude Code a distância.

**O que ele é.** Um documento de *fundamentos*: princípios, números e critérios de revisão que
não dependem de biblioteca de componentes. Ele não escolhe cores, tokens nem componentes.

**Como se relaciona com o design system.** O design system que vai morar em `docs/design/`
(tokens de cor, tipografia, espaçamento, componentes, adoção do Material Design 3 com Inter e
uma biblioteca de ícones leve) é a camada *concreta*. Este arquivo é a camada *de critério*:

- quando o design system definir um token, ele deve respeitar os mínimos daqui (contraste,
  alvo, escala de espaçamento, duração de animação);
- quando o Material e estes fundamentos parecerem divergir, vale o mais restritivo para
  acessibilidade, e a divergência deve ser registrada no design system;
- a seção 13 (checklist) é o que se aplica em toda revisão de tela, com ou sem Material.

**Como ler.** Cada seção termina com uma linha "Para este projeto:" que liga a regra a uma tela
concreta. Números entre parênteses com nível WCAG (A, AA, AAA) são critérios normativos; os
demais são recomendações de pesquisa ou de guias de plataforma.

## 2. Princípios e heurísticas

### 2.1 As 10 heurísticas de Nielsen (NN/g)

As heurísticas são regras gerais, não diretrizes de usabilidade específicas. Servem para
avaliar uma tela e para nomear o problema numa revisão.

| # | Heurística | Regra acionável |
| --- | --- | --- |
| 1 | Visibilidade do estado do sistema | Toda ação recebe resposta visível em tempo razoável; o estado atual (conectado, executando, aguardando) está sempre na tela. |
| 2 | Correspondência entre o sistema e o mundo real | Use as palavras do usuário, não as do código. "Aguardando sua aprovação", não "pending_permission". |
| 3 | Controle e liberdade do usuário | Ofereça saída clara: cancelar, voltar, desfazer. Ninguém deve ficar preso num fluxo. |
| 4 | Consistência e padrões | O mesmo conceito tem o mesmo nome, ícone e posição em todas as telas; siga as convenções da plataforma. |
| 5 | Prevenção de erros | Melhor que uma boa mensagem de erro é não deixar o erro acontecer: restrinja entradas inválidas, confirme o que é irreversível. |
| 6 | Reconhecer em vez de lembrar | Mostre opções, histórico e contexto na tela em vez de exigir que a pessoa memorize. |
| 7 | Flexibilidade e eficiência de uso | Atalhos para quem usa muito (aceleradores) sem atrapalhar quem usa pouco. |
| 8 | Estética e design minimalista | Cada elemento extra compete com o que importa; tire o que não ajuda a tarefa. |
| 9 | Ajudar a reconhecer, diagnosticar e corrigir erros | Mensagem em linguagem simples, dizendo o problema e a saída. |
| 10 | Ajuda e documentação | Quando necessária, contextual, focada na tarefa e curta. |

Fonte: NN/g, "10 Usability Heuristics for User Interface Design".

### 2.2 Leis de UX mais úteis aqui

- **Lei de Fitts**: o tempo para atingir um alvo é função da distância até ele e do seu
  tamanho. Consequências práticas (Laws of UX): alvos grandes o bastante, espaço amplo entre
  eles, e posicionados onde são fáceis de alcançar. No celular isso significa: ação frequente
  perto do polegar e grande.
- **Lei de Hick**: o tempo de decisão cresce com o número e a complexidade das escolhas.
  Quando a resposta precisa ser rápida, reduza opções; destaque a recomendada; divida tarefas
  complexas em passos. A própria Laws of UX alerta para não simplificar até virar abstração.
- **Lei de Jakob**: as pessoas passam a maior parte do tempo em *outros* produtos e esperam que
  o seu funcione igual. Reaproveite modelos mentais (chat com composer embaixo, lista de
  conversas, gerenciador de arquivos com caminho no topo) em vez de inventar.
- **Lei de Miller, com a ressalva correta**: a formulação clássica é "cerca de 7 ± 2 itens na
  memória de trabalho". A própria Laws of UX diz para **não** usar o "número mágico sete" para
  justificar limitações arbitrárias de design; o que vale é *agrupar em blocos* (chunking). O
  NN/g lembra que a capacidade varia por pessoa, idade e contexto. Pesquisa posterior (Cowan,
  2001) estima um limite central menor, de cerca de 4 blocos, e o número continua em debate na
  literatura. Regra prática: não conte itens de menu para "caber em 7"; reduza o que a pessoa
  precisa *lembrar* entre uma tela e outra.
- **Limiar de Doherty**: a produtividade sobe quando sistema e pessoa interagem num ritmo
  abaixo de 400 ms, sem que um espere pelo outro. Dê retorno em menos de 400 ms; quando o
  trabalho real demora, use desempenho percebido (resposta imediata, progresso).
- **Proximidade (Gestalt)**: objetos próximos são percebidos como grupo e como tendo função
  parecida. Espaço é o separador mais barato: mais espaço *entre* grupos do que *dentro* deles.
  As leis de agrupamento da Gestalt incluem ainda similaridade, continuidade, fechamento e
  conectividade; o NN/g acrescenta região comum (borda ou fundo que envolve o grupo).

### 2.3 Processo

O design thinking (IxDF) é descrito em cinco fases não lineares e iterativas: empatizar,
definir, idear, prototipar e testar. O programa do Google UX Design Certificate cobre o mesmo
arco (personas, jornadas, wireframes, protótipos, estudos de usabilidade, iteração). Para
testes, o NN/g mostra que 5 participantes encontram cerca de 85% dos problemas de usabilidade, e
recomenda gastar o orçamento em vários testes pequenos (por exemplo, 3 rodadas de 5) em vez de
um grande, porque o objetivo é melhorar o design, não catalogar defeitos.

Para este projeto: o usuário é uma pessoa só, então "teste de usabilidade" é o próprio
desenvolvedor usando a página no celular em situação real (andando, com uma mão, rede
instável) depois de cada mudança, e anotando o atrito; a heurística 1 é a mais crítica, porque
a razão de existir da página é saber o que a sessão está fazendo sem olhar o terminal.

## 3. Hierarquia visual e layout

### 3.1 Hierarquia

- A hierarquia guia o olho para o mais importante; é criada por **cor e contraste**, **escala**
  e **agrupamento** (NN/g, "Visual Hierarchy in UX").
- Cores saturadas e claras chamam atenção: reserve-as para o que é importante e use cores
  menos saturadas para o secundário (NN/g).
- Rebaixar o secundário é tão importante quanto destacar o principal: se tudo compete,
  nada vence. Peso e cor fazem tanto trabalho quanto tamanho, e raramente são necessários mais
  de dois pesos de fonte (regular e semibold) (Refactoring UI, conferido por resumo
  secundário do livro, não no texto original).
- "Rótulos são o último recurso": em vez de `rótulo: valor` para cada dado, deixe o formato e o
  contexto dizerem o que é o dado (um horário, um caminho, um nome) e dê ênfase ao que importa
  (Refactoring UI, prévia oficial).

### 3.2 Espaçamento

- Use uma **escala fixa** de espaçamento em vez de valores arbitrários. A recomendação comum é
  base 4 ou 8 px, com passos como 4, 8, 12, 16, 24, 32, 48, 64. Refactoring UI defende o
  sistema de espaçamento e observa que, em valores pequenos, a diferença de 4 para 8 px é
  grande, enquanto em contêineres grandes 4 px não se percebe; os passos exatos acima vêm de
  resumos do livro e não foram conferidos no texto original.
- **Mais espaço entre grupos do que dentro deles** (proximidade). O NN/g: "deixe respirar" — um
  elemento com mais espaço em volta é lido como grupo próprio e recebe mais atenção.
- Comece com espaço demais e retire; o erro comum é o contrário (Refactoring UI, por resumo).
- Apple HIG: considere o espaço entre controles tão importante quanto o tamanho; em geral
  funciona bem cerca de 12 pt de respiro em volta de elementos com borda.

### 3.3 Alinhamento e grade

- Alinhe elementos para facilitar a varredura; as pessoas assumem que itens alinhados são
  relacionados, e recuo comunica subordinação (Apple HIG, Layout).
- Agrupe itens relacionados com espaço negativo, contêineres ou separadores (Apple HIG).
- Respeite as áreas seguras e margens do sistema (Apple HIG; ver seção 7 para a web).
- Elementos de largura fixa (barra lateral) usam valor fixo; o restante ganha `max-width` e
  encolhe (Refactoring UI, por resumo).
- **Reflow** (WCAG 1.4.10, AA): o conteúdo deve funcionar a 320 CSS px de largura sem rolagem
  em duas dimensões (equivale a 1280 px com zoom de 400%). Exceção: o que exige duas dimensões
  por natureza, como tabelas, mapas e terminais.

### 3.4 Densidade

Densidade alta favorece quem volta sempre à mesma tela (heurística 7), mas no toque cobra
preço em alvos e erros (seção 7). A saída é densidade de *informação*, não de *controles*:
texto compacto, ações espaçadas.

Para este projeto: no feed, o texto da resposta do Claude é o conteúdo principal e deve ter o
maior contraste; metadados (horário, nome da ferramenta, caminho) ficam menores e em cinza,
sem rótulo "Horário:"; entre uma mensagem e outra o espaço é maior que entre a mensagem e seus
metadados. A lista de sessões é o lugar para densidade de informação; o card de permissão é o
lugar para espaço generoso, porque ali se decide algo.

## 4. Tipografia

### 4.1 Escala e peso

- Use uma escala tipográfica **curta e fixa** (poucos tamanhos, definidos no design system) e
  diferencie por peso e cor antes de criar um tamanho novo (seção 3.1).
- Texto pequeno pede altura-x maior e espaçamento entre letras um pouco maior; títulos grandes
  pedem espaçamento mais apertado (Refactoring UI, por resumo). A Inter faz isso de forma
  automática com o eixo de tamanho ótico (4.4).
- Use unidades relativas (`rem`, `em`) para que o texto acompanhe a preferência de tamanho do
  sistema; tamanho só em `vw` impede o zoom de texto (web.dev, Learn Design: Typography).

### 4.2 Altura de linha

- Corpo de texto: entre 1,4 e 1,6 é a faixa usual. A WCAG 1.4.8 (AAA) pede pelo menos 1,5 em
  parágrafos e espaço entre parágrafos pelo menos 1,5 vez a altura de linha.
- Títulos e textos curtos podem usar altura de linha menor.
- **Espaçamento de texto** (WCAG 1.4.12, AA): nada pode quebrar ou sumir se a pessoa forçar
  altura de linha 1,5, espaço após parágrafo 2× o tamanho, espaçamento entre letras 0,12× e
  entre palavras 0,16×. Na prática: não fixe altura de contêiner de texto; deixe crescer.

### 4.3 Medida (comprimento de linha)

- **45 a 75 caracteres** por linha é a faixa clássica (Bringhurst, citado pelo web.dev);
  a Baymard, por teste em larga escala, recomenda **50 a 75**. Em CSS, `max-width` em `ch`
  (cerca de 60–70ch) resolve.
- A WCAG 1.4.8 (AAA) pede no máximo 80 caracteres e texto não justificado.
- No celular a largura da tela já limita a linha; o cuidado é no desktop e no tablet.

### 4.4 Inter

Fonte: site oficial da Inter (rsms.me/inter).

- Família variável: peso de 100 a 900, itálico verdadeiro e eixo de **tamanho ótico** (`opsz`)
  de "text" a "display". Use o corte de texto no corpo e deixe o `opsz` automático, ou o corte
  display em títulos grandes.
- **`tnum` (algarismos tabulares)**: dígitos de largura fixa, para números que se comparam em
  coluna ou que mudam de valor no lugar (contadores, horários, percentuais). Sem isso o texto
  "pula" a cada atualização. No CSS: `font-variant-numeric: tabular-nums`; no Flutter:
  `FontFeature.tabularFigures()`.
- **`zero` (zero cortado)**: distingue `0` de `O`; útil em hashes, IDs, tokens, portas e IPs.
- **`ss02` (desambiguação)**: conjunto alternativo que aumenta a diferença entre caracteres
  parecidos (`l`, `I`, `1` etc.).
- **`cv11` (a de um andar)** e outras variantes de caractere são escolhas de personalidade,
  não de legibilidade; use com parcimônia.
- `calt` (alternativas contextuais) vem ligado e ajusta pontuação conforme o entorno; o site
  recomenda declarar `font-feature-settings: 'liga' 1, 'calt' 1` como correção para o Chrome.
- Para código e saída de terminal, continue com fonte monoespaçada: `tnum` alinha dígitos, não
  letras.

Para este projeto: o feed de respostas em markdown é o único texto longo da tela; limite a
medida no desktop e mantenha altura de linha em torno de 1,5. A régua de atividade, a barra de
contexto (percentual) e os horários usam `tnum` para não tremer a cada atualização; o token e
endereços na janela de acesso usam `zero`. O terminal remoto e os blocos de código seguem em
monoespaçada.

## 5. Cor e contraste

### 5.1 Papéis de cor

- Separe cor por **papel**, não por matiz: fundo, superfícies, texto (primário, secundário,
  desabilitado), bordas, ação primária, e estados (sucesso, aviso, erro, informação).
- **Cinzas são a maior parte da interface** (texto, fundos, painéis, controles); três ou quatro
  tons não bastam, na prática são 8 a 10 (Refactoring UI, prévia oficial).
- Uma, no máximo duas cores de ação primária; os tons de cada cor também em escala
  (Refactoring UI).
- **Preto puro parece artificial**: comece de um cinza bem escuro (Refactoring UI). O web.dev
  recomenda também não usar branco puro em texto sobre fundo escuro, para evitar brilho e
  "sangramento" (por exemplo `rgb(250, 250, 250)`).

### 5.2 Tema escuro bem feito

- **Não use preto puro** no fundo nem branco puro no texto (Refactoring UI; web.dev).
- **Elevação por tom**: no escuro, sombra quase não aparece; a profundidade vem do fundo. A
  Apple HIG usa dois conjuntos de fundo, *base* (mais escuro, recua) e *elevated* (mais claro,
  vem à frente), e lembra que as cores escuras não são inversões das claras.
- **Dessature as cores de destaque**: cores saturadas sobre superfície escura tendem a não
  atingir 4,5:1 em texto e "vibram" opticamente, cansando a vista; prefira tons mais claros da
  mesma cor (orientação do Material, conferida na página de cor do Wear OS no Android
  Developers; a página original do Material 2 não renderizou para conferência).
- **Contraste em todas as superfícies**: o texto precisa passar 4,5:1 contra *cada* nível de
  elevação em que aparece, não só contra o fundo base.
- **Imagens**: no escuro, escureça ou dessature imagens claras para não ofuscar (web.dev).
- **Claro ou escuro?** O NN/g mostra que, para visão normal, o modo claro tende a dar melhor
  desempenho visual, enquanto pessoas com catarata e condições parecidas podem se sair melhor
  no escuro. Ofereça o tema escuro bem feito e respeite a preferência do sistema
  (`prefers-color-scheme`, web.dev) em vez de uma chave própria do app (Apple HIG).

### 5.3 Contraste (números)

| O quê | Mínimo | Critério |
| --- | --- | --- |
| Texto normal | **4,5:1** | WCAG 1.4.3 (AA) |
| Texto grande (≥ 18 pt, ou ≥ 14 pt em negrito; cerca de 24 px / 18,66 px) | **3:1** | WCAG 1.4.3 (AA) |
| Componentes de interface e gráficos necessários para entender (borda de campo, ícone sem texto, estado de seleção, indicador de foco) | **3:1** contra o entorno | WCAG 1.4.11 (AA) |
| Texto de componente inativo (desabilitado) | sem exigência | exceção da WCAG 1.4.3 |

O desabilitado está isento, mas ainda precisa ser legível o bastante para a pessoa entender o
que está indisponível.

Para este projeto: o tema atual já é escuro; a migração deve trocar qualquer `#000` de fundo
por um cinza escuro e dar aos painéis sobrepostos (card de permissão, gerenciador de arquivos,
diálogos) um tom mais claro que o feed, em vez de sombra. Verde de "aprovado" e vermelho de
"negar" precisam ser versões dessaturadas e conferidas a 4,5:1 sobre a superfície do card, não
sobre o fundo da página.

## 6. Acessibilidade (WCAG 2.2 AA aplicável)

A WCAG 2.2 acrescentou, entre outros, 2.4.11 Foco não encoberto (AA), 2.5.7 Movimentos de
arrastar (AA), 2.5.8 Tamanho do alvo mínimo (AA), 3.2.6 Ajuda consistente (A), 3.3.7 Entrada
redundante (A) e 3.3.8 Autenticação acessível (AA).

### 6.1 Contraste

Ver 5.3: 4,5:1 texto, 3:1 texto grande, 3:1 componentes e foco.

### 6.2 Alvos

- **24 × 24 CSS px** é o mínimo normativo (WCAG 2.5.8, AA). Alvo menor só passa se um círculo
  de 24 px centrado nele não encostar em outro alvo nem no círculo de outro alvo pequeno.
  Exceções: alvo equivalente maior na mesma tela, link no meio de frase, controle nativo do
  navegador não modificado, e casos essenciais.
- **44 × 44 CSS px** é o nível reforçado (WCAG 2.5.5, AAA).
- Recomendado na prática: **44–48**. Apple HIG: 44 × 44 pt no iOS (mínimo 28 × 28 pt).
  Android: 48 × 48 dp, cerca de 9 mm. NN/g: pelo menos 1 cm × 1 cm físico; dedos têm em
  média 1,6–2 cm e a área de contato do polegar, cerca de 2,5 cm.

### 6.3 Foco

- **Foco visível** (WCAG 2.4.7, AA): todo elemento focável mostra indicador quando recebe foco
  pelo teclado. Não remova `outline` sem pôr outro no lugar.
- O indicador precisa de 3:1 contra o entorno (1.4.11). A WCAG 2.4.13 (AAA) detalha: área pelo
  menos igual a um contorno de 2 CSS px do componente, com 3:1 entre focado e não focado.
- **Foco não encoberto** (WCAG 2.4.11, AA): o elemento focado fica ao menos parcialmente
  visível; cabeçalho fixo, rodapé fixo e painel não modal são os culpados típicos. Use
  `scroll-padding` para compensar barras fixas.

### 6.4 Rótulos e nomes

- **Rótulo no nome** (WCAG 2.5.3, A): o nome acessível do controle contém o texto visível,
  para que comando de voz funcione ("tocar em Aprovar").
- Botão só com ícone precisa de nome acessível (`aria-label` na web, `semanticsLabel` /
  `tooltip` no Flutter, `contentDescription` no Android).
- **Mensagens de status** (WCAG 4.1.3, AA): mudança de estado que não leva o foco
  ("reconectando", "arquivo copiado", "3 sessões ativas") é anunciada à tecnologia assistiva,
  na web com `role="status"` ou `aria-live`.

### 6.5 Não depender só de cor

Cor não pode ser o único meio de transmitir informação, indicar ação ou distinguir elemento
(WCAG 1.4.1, A). Acompanhe com texto, ícone, forma ou posição. A Apple HIG repete a regra e
lembra o daltonismo.

### 6.6 Movimento

- Respeite `prefers-reduced-motion: reduce` (web.dev): desligue animações decorativas,
  deslocamentos grandes, paralaxe e zoom; troque deslizamento por esmaecimento curto. A Apple
  HIG pede o mesmo quando "Reduzir movimento" está ligado.
- A WCAG 2.3.3 (animação disparada por interação poder ser desligada) é AAA, mas é barata e
  vale adotar.
- Animação nativa no Flutter: consulte `MediaQuery.disableAnimationsOf(context)`.

### 6.7 Arrastar

Toda ação feita por arrasto tem alternativa por toque simples (WCAG 2.5.7, AA): reordenar
com botões, deslizar para apagar com menu.

Para este projeto: os botões Aprovar/Negar do card de permissão e as opções do card de
pergunta são os alvos mais críticos da tela inteira (aprovar `Bash` errado tem consequência) e
devem ter 48 px de altura com espaço entre si. Ícones soltos (copiar, baixar, fechar painel)
precisam de nome acessível. O indicador de conexão não pode ser só uma bolinha verde ou
vermelha: leva texto ("conectado", "reconectando…") e é anunciado como status.

## 7. Mobile e toque

### 7.1 Zona do polegar

Na observação de Steven Hoober (1.333 casos, citada por Luke Wroblewski), cerca de 75% das
interações usam o polegar e 49% acontecem com a pegada de uma mão. Em telas grandes, o canto
oposto superior fica fora de alcance confortável. Regras:

- ações frequentes e primárias na metade de baixo da tela;
- ações raras ou destrutivas podem ficar longe do polegar (o que também evita toque acidental);
- gesto a partir da borda é alternativa para alcançar o que está longe, desde que exista também
  um controle visível.

### 7.2 Alvos e espaçamento

Ver 6.2. Além do tamanho, o NN/g aponta que alvos apertados causam *deslizes* (tocar o vizinho)
e que listas de links e botões empilhados são as vítimas típicas: dê espaço entre linhas de
lista clicáveis.

### 7.3 Gestos sempre com alternativa visível

Gesto não é descobrível. Todo gesto (deslizar para apagar, puxar para atualizar, pinça) tem um
controle visível equivalente; e todo arrasto tem alternativa de toque simples (WCAG 2.5.7).

### 7.4 Teclado virtual e composer

- O campo em foco precisa continuar visível com o teclado aberto, nas duas orientações (NN/g,
  checklist de campos mobile). O composer deve subir junto com o teclado, nunca ficar atrás
  dele.
- Escolha o teclado certo: `inputmode` (`text`, `numeric`, `decimal`, `search`, `email`,
  `url`, `tel`, `none`) e `enterkeyhint` na web; `keyboardType` e `textInputAction` no
  Flutter (MDN).
- Não use autocorreção em nomes, endereços, e-mails (NN/g); por extensão, desligue em caminhos,
  comandos e nomes de arquivo.
- Ofereça padrões, histórico e colar; aceite colar em todo campo (NN/g).

### 7.5 Áreas seguras

Barra de gestos, entalhe e cantos arredondados encobrem conteúdo. Na web, com
`viewport-fit=cover`, some `env(safe-area-inset-bottom)` (e os demais lados) ao padding de
barras fixas (MDN). No Flutter, `SafeArea` / `MediaQuery.paddingOf` / `viewInsets` para o
teclado.

### 7.6 Desempenho percebido no celular

O INP (Interaction to Next Paint) é bom até **200 ms**, precisa melhorar até **500 ms** e é ruim
acima disso, medido no percentil 75 (web.dev). O modelo RAIL mira resposta a entrada em menos de
100 ms, com orçamento de 50 ms para o tratamento, porque outras tarefas podem estar na fila.
Não deixe o layout pular quando algo carrega (web.dev, CLS): reserve o espaço de imagens e
blocos que chegam depois.

Para este projeto: no celular, o composer e o botão de enviar ficam embaixo, na zona do polegar,
e acima da barra de gestos (`safe-area-inset-bottom`); os botões do card de permissão ficam no
pé do card. A troca de sessão e o gerenciador de arquivos, se usarem deslizar, também precisam
de botão. No campo de nova pasta e na busca de arquivos, autocorreção e capitalização automática
desligadas.

## 8. Estados e feedback

### 8.1 Tempos de resposta

| Limite | O que significa | O que fazer |
| --- | --- | --- |
| **0,1 s** | sensação de manipulação direta | retorno visual imediato no toque (realce, estado pressionado) |
| **1 s** | fluxo de pensamento preservado; atraso já é percebido | acima de 1 s, mostre que está trabalhando |
| **10 s** | limite de atenção na tarefa | acima disso, progresso com estimativa e opção de cancelar |

Fonte: NN/g, "Response Times: The 3 Important Limits". O Limiar de Doherty (400 ms) é a versão
"produtividade" da mesma ideia.

### 8.2 Carregando

- Abaixo de 1 s: não mostre spinner, que pisca e gera ansiedade (NN/g).
- **2 a 10 s**: animação em loop (spinner) num módulo; **esqueleto** quando a tela inteira está
  carregando, porque antecipa o formato e reduz carga cognitiva (NN/g, "Skeleton Screens 101").
- **Acima de 10 s**: barra de progresso com percentual ou estimativa; spinner infinito faz a
  pessoa achar que travou (NN/g, "Progress Indicators").

### 8.3 Vazio

Estado vazio nunca é tela em branco. O NN/g dá três usos: **comunicar o estado** ("nenhuma
sessão ativa", e não um vazio que parece erro), **ensinar** o que aparecerá ali, e **oferecer o
caminho direto** para a tarefa principal (o botão que cria a primeira coisa).

### 8.4 Erro

- Visível e perto da origem; legível, sem jargão; diga o problema **e** a saída; não culpe a
  pessoa; **preserve o que ela digitou** para que corrija em vez de recomeçar (NN/g,
  "Error-Message Guidelines").
- Erro de campo fica junto ao campo, não só num aviso no topo.

### 8.5 Sucesso

Confirmação proporcional: ação pequena e óbvia não precisa de aviso (o resultado já aparece);
ação cujo efeito não é visível (copiar, baixar, enviar para outra sessão) ganha um aviso curto
e anunciado como status (WCAG 4.1.3).

### 8.6 Desabilitado

Diga por que está desabilitado quando não for óbvio (texto ao lado ou explicação ao tocar). Um
botão cinza mudo é um beco sem saída (heurísticas 1 e 9).

### 8.7 Offline e reconectando

A heurística 1 vale também para a conexão: estado da rede sempre visível, tentativa automática
de reconectar com retorno do que está acontecendo, e nada que a pessoa digitou se perde
enquanto a conexão volta (NN/g, "Visibility of System Status"; a regra de preservar entrada vem
das diretrizes de erro).

### 8.8 Ações destrutivas

- Confirmação só para o que é **irreversível ou caro**; para ações rotineiras ela vira ruído e
  passa a ser clicada sem leitura (NN/g, "Confirmation Dialogs").
- A confirmação é **específica**: diz o que vai acontecer com quê ("Apagar a pasta
  `relatorios/` e 12 arquivos?"), e o botão repete o verbo ("Apagar"), nunca "OK".
- Quando possível, prefira **desfazer** a confirmar: o NN/g considera melhor manter uma cópia
  por um tempo para que a ação possa ser revertida.

Para este projeto: ao enviar prompt, o retorno no composer é imediato (0,1 s) mesmo que a sessão
leve segundos para começar; a régua de atividade é o indicador de "trabalhando". A lista sem
sessões explica o que é uma sessão e oferece o botão de iniciar uma nova. Se o hub cair, a
página mostra "reconectando…" e o rascunho do composer sobrevive. No gerenciador de arquivos,
colar nunca sobrescreve (o que já evita a confirmação), e apagar, se existir, pede confirmação
específica ou oferece desfazer.

## 9. Conteúdo e microcopy

- **Botão com verbo** que descreve o resultado: "Aprovar", "Negar", "Enviar", "Criar pasta",
  "Baixar". Evite "OK", "Sim", "Confirmar" soltos; o rótulo deve fazer sentido lido sozinho,
  inclusive por leitor de tela (NN/g, confirmação e mensagens de erro).
- **Linguagem do usuário** (heurística 2): sem nome de variável, código HTTP ou stack trace na
  primeira camada; detalhes técnicos podem ficar num "detalhes" expansível.
- **Mensagem de erro útil** = o que aconteceu + por quê (se souber) + o que fazer. Sem culpar.
- **Consistência de termo** (heurística 4): escolha "sessão", "pasta", "aprovar" e não alterne
  com sinônimos.
- **Curto e na frente**: a informação que decide vem nas primeiras palavras.
- **Ícone com dúvida ganha texto** (seção 12).

Para este projeto: o card de permissão diz o que será executado e onde ("Executar `rm -rf
build/` em `~/proj`?") com botões "Aprovar" e "Negar"; a tela de falha de pareamento do app já
segue a boa prática de citar as duas causas possíveis (token errado ou endereço que não é o hub)
em vez de adivinhar uma.

## 10. Formulários e entrada

Fonte principal: NN/g, "Website Forms Usability: Top 10 Recommendations" e "A Checklist for
Designing Mobile Input Fields".

- Peça o mínimo; elimine campo opcional antes de discutir como marcá-lo.
- Rótulo **visível e fora do campo**, acima dele. **Não use placeholder como rótulo**: some ao
  digitar, tem contraste baixo e confunde com valor preenchido.
- Uma coluna; ordem lógica.
- Largura do campo proporcional ao conteúdo esperado.
- Distinga obrigatório de opcional.
- Erro de validação perto do campo, preservando o que foi digitado (NN/g, diretrizes de erro).
  Validar ao sair do campo ou ao enviar, e não a cada tecla, é prática comum, mas não está nos
  artigos consultados.
- Teclado certo, sem autocorreção onde não cabe, colar sempre permitido, padrões e histórico
  (seção 7.4).
- **Entrada redundante** (WCAG 3.3.7, A): não peça de novo o que a pessoa já informou no mesmo
  fluxo; preencha ou ofereça para escolher.

Para este projeto: o composer é o formulário mais usado do app; ele mantém o rascunho por
sessão, aceita colar texto e imagem, e mostra claramente o que vai acontecer ao enviar. O campo
de nova pasta mostra a regra de nome inválido junto ao campo, no momento da confirmação, sem
apagar o que foi digitado.

## 11. Movimento

Fonte principal: NN/g, "Executing UX Animations: Duration and Motion Characteristics".

- **Propósito**: animação serve para dar retorno, mostrar de onde algo veio e para onde foi, e
  manter a continuidade entre estados. Decoração pura é a primeira coisa a cortar.
- **Durações**:
  - retorno simples (toggle, checkbox, pressionar): **~100 ms**;
  - mudança grande de tela (diálogo, painel entrando): **200–300 ms**;
  - faixa geral: **100–500 ms**, na maioria dos casos **100–400 ms**; a 500 ms já parece
    arrastado. Erro mais comum é animação longa demais, não curta demais.
- **Easing**: movimento linear parece artificial. **Ease-out** (começa rápido, desacelera) é o
  padrão para o que entra ou responde ao toque; ease-in / ease-in-out às vezes para o que sai,
  com cuidado porque o início lento parece demora.
- Distância maior pede movimento mais suave, sobretudo para quem é sensível a movimento.
- Respeite `prefers-reduced-motion` (seção 6.6).
- Não anime o que bloqueia a próxima ação: a pessoa não deve esperar a animação acabar para
  poder tocar.

Para este projeto: o card de permissão e o card de pergunta entram com ~200–250 ms em ease-out,
porque pedem atenção; mensagens novas no feed aparecem com esmaecimento curto (~150 ms) ou
nenhum, já que chegam o tempo todo; a régua de atividade não pisca nem pulsa sem parar, e com
movimento reduzido vira estática.

## 12. Ícones

Fonte principal: NN/g, "Icon Usability".

- **Ícone "universal" é raro**: lupa, casa, imprimir e poucos outros. Até o "hambúrguer" ainda
  está em processo de virar convenção.
- **Rotule**: como quase não há uso padronizado, o NN/g considera o rótulo de texto necessário
  para comunicar o significado e reduzir a ambiguidade; ícone sem texto exige que a pessoa já o
  conheça. Regra prática: rótulo visível em navegação e em ações primárias; ícone sozinho só
  para os universais e para ações secundárias repetidas, sempre com nome acessível e, no
  desktop, tooltip.
- **Regra dos 5 segundos**: se levar mais de 5 s para pensar num ícone para algo, um ícone
  provavelmente não vai comunicar aquilo; use texto.
- Simples e pouco detalhado, porque detalhe some em tamanho pequeno.
- **Consistência**: um ícone, um significado em todo o app; um mesmo estilo (contorno ou
  preenchido), uma mesma espessura de traço e o mesmo grid em toda a biblioteca. Misturar
  bibliotecas é a forma mais rápida de quebrar isso.
- **Tamanho ótico**: ícones são desenhados para um tamanho (ex.: 20 ou 24); usar muito fora
  dele engrossa ou afina o traço. Escolha poucos tamanhos e mantenha.
- **Alvo ≠ desenho**: o desenho pode ter 20–24 px, mas a área tocável tem 44–48 (seção 6.2).
- Ícone necessário para entender a interface precisa de 3:1 de contraste (WCAG 1.4.11).

Para este projeto: com a biblioteca leve a ser adotada, padronize um estilo (contorno, por
exemplo) e uma espessura. Ações do gerenciador de arquivos (copiar, colar, baixar, nova pasta)
são ambíguas como ícone puro e devem ter rótulo pelo menos na primeira vez ou no menu; aprovar e
negar nunca aparecem só como ✓ e ✗, sempre com o verbo.

## 13. Checklist de revisão de tela

Rode antes de dar uma tela por pronta (e peça a validação visual no aparelho real):

1. **Estado visível**: dá para saber em 1 segundo o que a sessão está fazendo e se a conexão
   está de pé? (heurística 1)
2. **Hierarquia**: a coisa mais importante da tela é a que mais chama atenção? O secundário está
   rebaixado?
3. **Contraste**: texto ≥ 4,5:1, texto grande ≥ 3:1, bordas, ícones e foco ≥ 3:1, em *todas* as
   superfícies onde aparecem.
4. **Alvos**: tudo tocável tem ≥ 24 px (normativo) e, de preferência, 44–48 px, com espaço
   entre vizinhos?
5. **Polegar**: as ações frequentes estão na metade de baixo e fora da barra de gestos?
6. **Cor não é a única pista**: estado e erro também têm texto, ícone ou forma?
7. **Foco**: navegando por teclado, o foco é visível e não fica atrás de barra fixa?
8. **Rótulos**: todo botão de ícone tem nome acessível; todo campo tem rótulo visível fora do
   campo.
9. **Estados**: existe versão carregando, vazia, com erro, desabilitada e offline desta tela?
10. **Destrutivo**: o irreversível pede confirmação específica ou oferece desfazer; o rotineiro
    não pede.
11. **Texto**: botões com verbo; sem jargão; mensagens de erro dizem a saída.
12. **Movimento**: animações entre 100 e 400 ms, com propósito, e desligadas com movimento
    reduzido.
13. **Espaçamento**: todos os valores saem da escala; mais espaço entre grupos que dentro deles.
14. **Reflow e zoom**: funciona a 320 px de largura e com texto aumentado, sem rolagem horizontal
    da página (contratos de `tests/web-css.test.ts`).
15. **Resposta**: o toque tem retorno em até 0,1 s e nada fica sem indicação acima de 1 s.

Para este projeto: os itens 4, 5, 9 e 14 são os que mais quebram na prática, porque a página é
desenvolvida no desktop e usada no celular; o teste `tests/web-css.test.ts` já cobre parte do
item 14 e o bloco `@media (hover: none)` é onde controles pequenos crescem para o toque.

## 14. Fontes

Consultadas diretamente:

- Nielsen Norman Group
  - 10 Usability Heuristics for User Interface Design — https://www.nngroup.com/articles/ten-usability-heuristics/
  - Response Times: The 3 Important Limits — https://www.nngroup.com/articles/response-times-3-important-limits/
  - Visibility of System Status — https://www.nngroup.com/articles/visibility-system-status/
  - Visual Hierarchy in UX: Definition — https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
  - Touch Targets on Touchscreens — https://www.nngroup.com/articles/touch-target-size/
  - A Checklist for Designing Mobile Input Fields — https://www.nngroup.com/articles/mobile-input-checklist/
  - Website Forms Usability: Top 10 Recommendations — https://www.nngroup.com/articles/web-form-design/
  - Designing Empty States in Complex Applications — https://www.nngroup.com/articles/empty-state-interface-design/
  - Error-Message Guidelines — https://www.nngroup.com/articles/error-message-guidelines/
  - Progress Indicators Make a Slow System Less Insufferable — https://www.nngroup.com/articles/progress-indicators/
  - Skeleton Screens 101 — https://www.nngroup.com/articles/skeleton-screens/
  - Confirmation Dialogs Can Prevent User Errors — https://www.nngroup.com/articles/confirmation-dialog/
  - Preventing User Errors: Avoiding Conscious Mistakes — https://www.nngroup.com/articles/user-mistakes/
  - OK-Cancel or Cancel-OK? — https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/
  - Icon Usability — https://www.nngroup.com/articles/icon-usability/
  - Executing UX Animations: Duration and Motion Characteristics — https://www.nngroup.com/articles/animation-duration/
  - Dark Mode vs. Light Mode: Which Is Better? — https://www.nngroup.com/articles/dark-mode/
  - Working Memory and External Memory — https://www.nngroup.com/articles/working-memory-external-memory/
  - Why You Only Need to Test with 5 Users — https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/
  - The Need for Speed, 23 Years Later — https://www.nngroup.com/articles/the-need-for-speed/
- Laws of UX
  - Fitts's Law — https://lawsofux.com/fittss-law/
  - Hick's Law — https://lawsofux.com/hicks-law/
  - Jakob's Law — https://lawsofux.com/jakobs-law/
  - Miller's Law — https://lawsofux.com/millers-law/
  - Doherty Threshold — https://lawsofux.com/doherty-threshold/
  - Law of Proximity — https://lawsofux.com/law-of-proximity/
- W3C / WAI (WCAG 2.2)
  - What's New in WCAG 2.2 — https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
  - 1.4.1 Use of Color — https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html
  - 1.4.3 Contrast (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
  - 1.4.8 Visual Presentation — https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html
  - 1.4.10 Reflow — https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
  - 1.4.11 Non-text Contrast — https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
  - 1.4.12 Text Spacing — https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
  - 2.3.3 Animation from Interactions — https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
  - 2.4.7 Focus Visible — https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
  - 2.4.11 Focus Not Obscured (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
  - 2.4.13 Focus Appearance — https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
  - 2.5.3 Label in Name — https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html
  - 2.5.5 Target Size (Enhanced) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html
  - 2.5.7 Dragging Movements — https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
  - 2.5.8 Target Size (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
  - 4.1.3 Status Messages — https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- web.dev
  - prefers-color-scheme: Hello darkness, my old friend — https://web.dev/articles/prefers-color-scheme
  - prefers-reduced-motion — https://web.dev/articles/prefers-reduced-motion
  - Interaction to Next Paint (INP) — https://web.dev/articles/inp
  - Measure performance with the RAIL model — https://web.dev/articles/rail
  - Optimize Cumulative Layout Shift — https://web.dev/articles/optimize-cls
  - Learn Design: Typography — https://web.dev/learn/design/typography
  - Learn Design: Theming — https://web.dev/learn/design/theming
- Apple Human Interface Guidelines (lidas pelo endpoint JSON da documentação)
  - Accessibility — https://developer.apple.com/design/human-interface-guidelines/accessibility
  - Dark Mode — https://developer.apple.com/design/human-interface-guidelines/dark-mode
  - Layout — https://developer.apple.com/design/human-interface-guidelines/layout
- Android
  - Touch target size (Android Accessibility Help) — https://support.google.com/accessibility/android/answer/7101858
  - Make apps more accessible — https://developer.android.com/guide/topics/ui/accessibility/apps
  - Wear OS, Color (Material 2.5), seção de tema escuro — https://developer.android.com/design/ui/wear/guides/m2-5/styles/color
- Refactoring UI
  - Building Your Color Palette — https://www.refactoringui.com/previews/building-your-color-palette
  - Labels Are a Last Resort — https://www.refactoringui.com/previews/labels-are-a-last-resort
  - Resumo de terceiros do livro (espaçamento, pesos, medida) — https://rjseymour66.github.io/webdev/refactoring-ui/
- Tipografia e leitura
  - Inter (site oficial) — https://rsms.me/inter/
  - Baymard, Readability: The Optimal Line Length — https://baymard.com/blog/line-length-readability
- Mobile
  - Luke Wroblewski, Designing for Large Screen Smartphones — https://www.lukew.com/ff/entry.asp?1927
  - MDN, `env()` e áreas seguras — https://developer.mozilla.org/en-US/docs/Web/CSS/env
  - MDN, atributo `inputmode` — https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode
- Processo
  - Interaction Design Foundation, Design Thinking — https://www.interaction-design.org/literature/topics/design-thinking
  - Google UX Design Certificate (página do programa) — https://grow.google/certificates/ux-design/
- Memória de trabalho (ressalva à Lei de Miller)
  - Cowan, "The magical number 4 in short-term memory" (2001) — https://www.cambridge.org/core/product/44023F1147D4A1D44BDC0AD226838496

Pontos que não puderam ser conferidos na fonte original:

- **Refactoring UI, livro**: só as prévias oficiais (paleta de cores, rótulos) foram lidas. A
  escala de espaçamento com base 4/8 e passos 4–64, "no máximo dois pesos" e "comece com espaço
  demais" vêm de resumos de terceiros; o artigo "7 Practical Tips for Cheating at Design" no
  Medium recusou o acesso.
- **Material 2, "Dark theme"**: a página não renderiza sem JavaScript e o arquivo da Wayback
  Machine recusou a requisição; a regra de dessaturar cores no escuro foi conferida na página de
  cor do Wear OS no Android Developers, que reproduz o mesmo texto.
- **Cowan (4 blocos)**: conferido por resumos acadêmicos encontrados em busca, não pela leitura
  do artigo completo; NN/g e Laws of UX não citam o número 4.
- **Google UX Design Certificate**: só a página do programa (temas do curso); o conteúdo das
  aulas exige matrícula.
- **Escala tipográfica com razão fixa** (1,2; 1,25 etc.): nenhuma das fontes consultadas define
  uma; por isso o texto pede apenas uma escala curta e fixa, a ser definida no design system.
