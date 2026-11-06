# Material Design 3: referências para o claude-local-session

Pesquisa feita em novembro de 2026. Cobre o que é específico do Material Design 3 (M3) e da
expansão M3 Expressive; fundamentos gerais de UI/UX ficam em outro documento.

## 1. Como usar este documento

- **Quem consulta**: quem for mexer no CSS de `web/` (a página que o hub serve e que o app
  Android encapsula numa WebView) ou no tema do Flutter em `mobile/`.
- **De onde vêm os números.** As páginas de `m3.material.io` são renderizadas por JavaScript e
  não entregam texto a um leitor sem navegador. Por isso todo valor numérico deste documento foi
  conferido nos **tokens publicados pelas implementações oficiais**, que são geradas a partir da
  mesma especificação:
  - Material Web (`material-components/material-web`, tokens `v0_192`);
  - Flutter (`dev/tools/gen_defaults/data/*.json`, tokens `6_1_0`);
  - Jetpack Compose (`androidx`, `compose/material3/.../tokens/*.kt`, versões indicadas em cada
    tabela).
  Quando duas fontes divergem, as duas aparecem.
- **"não verificado"** marca número ou afirmação que não foi possível conferir numa fonte oficial
  durante a pesquisa. Não use esses valores como verdade sem checar.
- **"proposta"** marca decisão de projeto derivada da especificação, não regra do Material.
- Orientações qualitativas de uso de componente ("quando usar") resumem as diretrizes M3; os links
  de `m3.material.io` estão na seção 15 para leitura no navegador.
- Os tokens têm nome estável (`md.sys.color.primary`, `md.sys.shape.corner.medium`…). No CSS
  eles viram `--md-sys-color-primary`, `--md-sys-shape-corner-medium`; no Flutter, campos de
  `ColorScheme`, `TextTheme` e dos `*ThemeData`. Usar os mesmos nomes nos dois lados é o que
  mantém a página e o app coerentes.

## 2. Visão geral do M3

### O que mudou em relação ao M2

| Aspecto | M2 | M3 |
| --- | --- | --- |
| Cor | `primary`/`secondary` + variantes, tema escuro com sobreposição branca por elevação | esquema gerado por algoritmo a partir de uma cor-semente (*seed*), com papéis `*-container`, `on-*`, `tertiary` e a família `surface-container-*` |
| Cor dinâmica | não existe | esquema derivado do papel de parede (Android 12+) ou de uma semente escolhida |
| Tipografia | 13 estilos (h1–h6, subtitle, body, button, caption, overline) | 15 estilos em 5 papéis × 3 tamanhos: display, headline, title, body, label |
| Forma | cantos pequenos (4 dp) quase em tudo | escala de cantos de 0 a "full"; botões em pílula, cards 12 dp, diálogos 28 dp |
| Elevação | sombra como principal indicador | *tonal elevation*: superfícies mais altas ficam em tons de `surface-container` mais claros; sombra só onde for preciso separar |
| Botões | contained, outlined, text | filled, filled tonal, outlined, text, elevated, todos com 40 dp de altura e canto full |
| Navegação inferior | bottom navigation (56 dp) | navigation bar (80 dp) com indicador ativo em pílula |

No Flutter, `ThemeData.useMaterial3` é `true` por padrão; com ele, `colorScheme` passa a ser o
esquema base M3, `typography` vira `Typography.material2021` e o efeito de toque passa a ser
`InkSparkle` no Android (fora da web) ou `InkRipple` nos demais. A documentação diz que a flag
será descontinuada e que só o M3 continuará suportado.

### M3 Expressive

- Anunciado pelo Google em **13 de maio de 2025**, para Android 16 e Wear OS 6, como evolução do
  Material You, com animações de mola (*springs*) mais "naturais", mais opções de forma e de
  personalização.
- O Jetpack Compose já implementa: `MaterialExpressiveTheme`, `MotionScheme.standard()` e
  `MotionScheme.expressive()`, os cantos `LargeIncreased`, `ExtraLargeIncreased` e
  `ExtraExtraLarge`, a escala tipográfica *emphasized* e os componentes `ButtonGroup`,
  `SplitButton`, `LoadingIndicator`, `FloatingToolbar` e `FloatingActionButtonMenu` (existência
  dos arquivos conferida no `androidx-main`).
- **Flutter não implementa M3 Expressive no framework.** Na issue
  [#168813](https://github.com/flutter/flutter/issues/168813) a equipe declarou (14/05/2025) que
  não está desenvolvendo nem aceitando contribuições de Expressive; em 29/07/2025 informou que os
  pacotes `material` e `cupertino` estão sendo desacoplados do núcleo e que o trabalho de
  Expressive acontecerá nos novos pacotes em `flutter/packages`. Existem pacotes de terceiros
  (`expressive_m3`, `material_3_expressive`), sem chancela oficial.
- **Material Web também não implementa Expressive**: está em modo de manutenção desde junho de
  2024 (ver seção 14).
- Consequência para este app: o alvo realista é **M3 "base"** nos dois lados, adotando do
  Expressive só o que é token puro e barato (cantos maiores, pesos *emphasized*, molas onde
  couber).

### Design tokens: ref, sys, comp

Três camadas, cada uma apontando para a anterior:

| Camada | Exemplo | O que guarda |
| --- | --- | --- |
| **Reference** (`md.ref.*`) | `md.ref.palette.primary80 = #D0BCFF`, `md.ref.typeface.plain = Roboto` | valores brutos: paletas tonais, famílias tipográficas, pesos |
| **System** (`md.sys.*`) | `md.sys.color.primary = md.ref.palette.primary80` (tema escuro) | decisões de papel: o que é "primary", "surface", "title-medium" |
| **Component** (`md.comp.*`) | `md.comp.filled-button.container.color = md.sys.color.primary` | onde cada papel é usado em cada parte de cada componente |

No CSS isso vira custom properties que podem ser escopadas por seletor; o Material Web mostra
exatamente esse uso (`--md-filled-button-container-shape: 0px` num seletor muda só aqueles
botões). Para este repositório: definir os `--md-sys-*` em `:root` e fazer os componentes do
`style.css` consumirem esses tokens, em vez de cores e raios literais.

## 3. Cor

### Papéis (roles)

Todo papel de "contêiner" tem um par `on-*` para o conteúdo em cima dele, com contraste
garantido pelo algoritmo.

| Grupo | Papéis | Uso típico neste app |
| --- | --- | --- |
| Primary | `primary`, `on-primary`, `primary-container`, `on-primary-container` | ação principal (enviar prompt, aprovar), FAB, foco |
| Secondary | `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container` | indicador ativo da navigation bar, chips selecionados, botão tonal |
| Tertiary | `tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container` | acento de contraste: badge de "pergunta pendente", destaque que não é ação |
| Error | `error`, `on-error`, `error-container`, `on-error-container` | negar comando, falha de conexão, régua com erro |
| Surface | `surface`, `surface-dim`, `surface-bright`, `surface-container-lowest`, `-low`, `surface-container`, `-high`, `-highest`, `on-surface`, `on-surface-variant` | fundo e camadas de toda a UI |
| Contorno | `outline`, `outline-variant` | `outline`: borda de campo e de botão outlined; `outline-variant`: divisórias e bordas decorativas |
| Inverso | `inverse-surface`, `inverse-on-surface`, `inverse-primary` | snackbar (fundo `inverse-surface`, ação em `inverse-primary`) |
| Fixos | `primary-fixed`, `primary-fixed-dim`, `on-primary-fixed`, `on-primary-fixed-variant` (idem secondary/tertiary) | cor que não muda entre claro e escuro; raramente necessária aqui |
| Outros | `scrim`, `shadow`, `surface-tint` | véu atrás de diálogo/sheet modal; cor da sombra |

`background`/`on-background` e `surface-variant` ainda existem, mas o Flutter marcou como
*deprecated* (desde 3.18): use `surface`/`on-surface` e `surface-container-highest`.

### Esquema base escuro (baseline, semente roxa do Material)

Valores dos tokens `color_dark` + `palette` do Flutter (6_1_0). Servem de referência de
**tons** (qual tom de cada paleta vai em cada papel); as cores reais deste app saem da semente
escolhida.

| Papel | Tom | Hex |
| --- | --- | --- |
| primary | primary 80 | `#D0BCFF` |
| on-primary | primary 20 | `#381E72` |
| primary-container | primary 30 | `#4F378B` |
| on-primary-container | primary 90 | `#EADDFF` |
| secondary | secondary 80 | `#CCC2DC` |
| secondary-container | secondary 30 | `#4A4458` |
| on-secondary-container | secondary 90 | `#E8DEF8` |
| tertiary | tertiary 80 | `#EFB8C8` |
| tertiary-container | tertiary 30 | `#633B48` |
| error | error 80 | `#F2B8B5` |
| on-error | error 20 | `#601410` |
| error-container | error 30 | `#8C1D18` |
| on-error-container | error 90 | `#F9DEDC` |
| surface / surface-dim | neutral 6 | `#141218` |
| surface-bright | neutral 24 | `#3B383E` |
| surface-container-lowest | neutral 4 | `#0F0D13` |
| surface-container-low | neutral 10 | `#1D1B20` |
| surface-container | neutral 12 | `#211F26` |
| surface-container-high | neutral 17 | `#2B2930` |
| surface-container-highest | neutral 22 | `#36343B` |
| on-surface | neutral 90 | `#E6E0E9` |
| on-surface-variant | neutral-variant 80 | `#CAC4D0` |
| outline | neutral-variant 60 | `#938F99` |
| outline-variant | neutral-variant 30 | `#49454F` |
| inverse-surface | neutral 90 | `#E6E0E9` |
| inverse-on-surface | neutral 20 | `#322F35` |
| inverse-primary | primary 40 | `#6750A4` |
| scrim / shadow | neutral 0 | `#000000` |

O fundo atual da página (perto de `#10131A`, com `--bg: #0e0f11`) fica entre os tons 4 e 6 da
paleta neutra: o M3 escuro já trabalha nessa faixa, então a migração não escurece nem clareia a
UI de forma perceptível.

### Esquemas dinâmicos, semente e variantes

- O esquema é gerado a partir de **uma cor-semente** (`ColorScheme.fromSeed` no Flutter;
  Material Theme Builder ou `material-color-utilities` na web). A própria semente pode não
  aparecer em nenhum papel.
- `DynamicSchemeVariant` (Flutter) escolhe o algoritmo:

| Variante | Efeito |
| --- | --- |
| `tonalSpot` (padrão) | paletas pastel, croma baixo, mesmo com semente saturada |
| `fidelity` | paletas acompanham a semente, mesmo muito saturada |
| `content` | quase igual a `fidelity`; `primaryContainer` é a própria semente ajustada para contraste; tertiary análoga |
| `vibrant` | croma máximo na paleta primária |
| `expressive` | croma médio, matiz da primária deslocado em relação à semente |
| `neutral` | quase cinza, com um toque de croma |
| `monochrome` | só cinzas |
| `rainbow`, `fruitSalad` | lúdicos; o matiz da semente some do tema |

- **Decisão a tomar (proposta)**: a página usa âmbar (`--amber: #f5a524`) como acento e o app
  Flutter usa semente `0xFF7C5CFF` (roxo). Para os dois lados ficarem iguais, escolha **uma**
  semente e gere os dois esquemas dela. Com âmbar, `tonalSpot` vai lavar a cor; `fidelity` ou
  `content` preservam o âmbar.
- **Cor dinâmica do papel de parede** (Android 12+) só faria sentido no nativo Flutter; a página
  dentro da WebView não a recebe. Para não haver duas identidades, a proposta é não usar cor
  dinâmica.

### Contraste

- `ColorScheme.fromSeed(contrastLevel:)` vai de −1,0 a 1,0; 0,0 é o normal, e as diretrizes M3
  chamam 0,5 de **médio** e 1,0 de **alto**. O Material Theme Builder exporta os três níveis.
- O algoritmo garante contraste entre cada par `X`/`on-X`; ele **não** garante contraste de
  combinações inventadas (texto `primary` sobre `secondary-container`, por exemplo). Use sempre
  os pares.
- Referência mínima para texto (Android Developers): 4,5:1 para texto pequeno, 3:1 para o
  restante.

### Tema escuro

- No escuro, os papéis "de ação" usam tons **80** (claros) e os contêineres tons **30**; o texto
  usa neutral 90. Não use branco puro nem preto puro em superfícies.
- A hierarquia de profundidade vem de `surface-container-*` (mais alto = mais claro), não de
  sombra (ver seção 6).
- Proposta de mapeamento dos tokens atuais de `web/style.css` para papéis M3:

| Token atual | Papel M3 |
| --- | --- |
| `--bg` | `surface` |
| `--sunken` | `surface-container-lowest` |
| `--surface` | `surface-container-low` |
| `--control` | `surface-container` |
| `--raise` | `surface-container-high` |
| `--active` | `surface-container-highest` |
| `--line-faint`, `--line` | `outline-variant` |
| `--line-strong`, `--line-contrast` | `outline` |
| `--ink`, `--ink-body` | `on-surface` |
| `--ink-2`, `--ink-3` | `on-surface-variant` |
| `--ink-4`, `--ink-5` | `on-surface` com opacidade de desabilitado (não verificado: o M3 usa 38% para conteúdo desabilitado) |
| `--amber`, `--amber-tint` | `primary`, `primary-container` (se a semente for âmbar) |
| `--red`, `--red-tint` | `error`, `error-container` |
| `--green`, `--green-tint` | sem papel M3; vira cor customizada "sucesso" gerada com o mesmo algoritmo (o Theme Builder permite cores extras; não verificado na documentação consultada) |

## 4. Tipografia

### Type scale do M3 (valores oficiais)

Tokens `md.sys.typescale.*` do Material Web (`v0_192`), convertidos de rem para px (1 rem =
16 px); os mesmos números estão em `text_style.json` do Flutter (`6_1_0`). Fonte "brand" e
"plain" são ambas Roboto no padrão.

| Estilo | Fonte | Tamanho | Line-height | Peso | Tracking |
| --- | --- | --- | --- | --- | --- |
| display-large | brand | 57 px | 64 px | 400 | −0,25 px |
| display-medium | brand | 45 px | 52 px | 400 | 0 |
| display-small | brand | 36 px | 44 px | 400 | 0 |
| headline-large | brand | 32 px | 40 px | 400 | 0 |
| headline-medium | brand | 28 px | 36 px | 400 | 0 |
| headline-small | brand | 24 px | 32 px | 400 | 0 |
| title-large | brand | 22 px | 28 px | 400 | 0 |
| title-medium | plain | 16 px | 24 px | 500 | 0,15 px |
| title-small | plain | 14 px | 20 px | 500 | 0,1 px |
| body-large | plain | 16 px | 24 px | 400 | 0,5 px |
| body-medium | plain | 14 px | 20 px | 400 | 0,25 px |
| body-small | plain | 12 px | 16 px | 400 | 0,4 px |
| label-large | plain | 14 px | 20 px | 500 | 0,1 px |
| label-medium | plain | 12 px | 16 px | 500 | 0,5 px |
| label-small | plain | 11 px | 16 px | 500 | 0,5 px |

`label-large-weight-prominent` = 700 (Material Web). **Emphasized** (M3 Expressive, Compose
`TypeScaleTokens` v0_103): mesmo tamanho, peso maior. Exemplos conferidos: `body-large-emphasized`
16 sp/500, `title-medium-emphasized` 16 sp/700, `label-large-emphasized` 14 sp/700,
`headline-small-emphasized` 24 sp/500.

Uso por papel:

- **display**: números ou palavras grandes e curtas; quase nunca num app de ferramenta.
- **headline**: título de tela em telas largas ou cabeçalho de diálogo (`headline-small` é o
  padrão do título de diálogo).
- **title**: título da top app bar (`title-large`), nome de sessão num item de lista
  (`title-medium`), cabeçalho de card (`title-medium`/`title-small`).
- **body**: texto corrido: respostas em markdown (`body-large` ou `body-medium`), texto de apoio
  de lista (`body-medium`).
- **label**: texto de botão (`label-large`), de chip e de navigation bar (`label-medium`), badge
  e metadado (`label-small`).

### Mapeamento para Inter (proposta)

Por que ajustar: os trackings positivos do M3 foram calibrados para Roboto. Inter já tem
espaçamento generoso em tamanhos de texto e tem **eixo de tamanho óptico** (`opsz` 14–32) além
de `wght` 100–900 (rsms.me/inter). Com `font-optical-sizing: auto` (padrão do CSS), o navegador
aplica o desenho "Display" nos títulos e o "Text" no corpo, que é o trabalho que o tracking
fazia no Roboto. A altura-x do Inter é maior que a do Roboto, então o mesmo tamanho em px parece
maior: manter os tamanhos do M3 já resulta em leitura confortável.

Regras da proposta:

1. **Tamanhos e line-heights iguais aos do M3**: preservam a grade de 4 px e o ritmo vertical
   dos componentes (alturas de 40, 56, 64 px dependem deles).
2. **Tracking**: negativo leve em display/headline; zero em title e body; mantém positivo só
   em label ≤ 12 px, onde Inter fica apertado em caixa pequena.
3. **Pesos**: 400 para display/headline/body, 500 para title/label (como no M3), 600 no lugar
   de 700 para os estilos *emphasized*/*prominent*: no tema escuro, 700 do Inter "estoura" em
   texto claro sobre fundo escuro.

| Estilo | Tamanho / line-height | Peso Inter | Tracking Inter (CSS) | Tracking Inter (Flutter, px) |
| --- | --- | --- | --- | --- |
| display-large | 57 / 64 | 400 | −0,02em | −1,1 |
| display-medium | 45 / 52 | 400 | −0,02em | −0,9 |
| display-small | 36 / 44 | 400 | −0,015em | −0,5 |
| headline-large | 32 / 40 | 400 | −0,01em | −0,3 |
| headline-medium | 28 / 36 | 400 | −0,01em | −0,3 |
| headline-small | 24 / 32 | 400 | 0 | 0 |
| title-large | 22 / 28 | 500 | 0 | 0 |
| title-medium | 16 / 24 | 500 | 0 | 0 |
| title-small | 14 / 20 | 500 | 0 | 0 |
| body-large | 16 / 24 | 400 | 0 | 0 |
| body-medium | 14 / 20 | 400 | 0 | 0 |
| body-small | 12 / 16 | 400 | 0,01em | 0,1 |
| label-large | 14 / 20 | 500 | 0 | 0 |
| label-medium | 12 / 16 | 500 | 0,02em | 0,25 |
| label-small | 11 / 16 | 500 | 0,03em | 0,35 |

Os valores de tracking acima são **proposta, não verificados** contra nenhuma tabela oficial do
Inter: a página de métricas dinâmicas do Inter (`rsms.me/inter/dynmetrics/`) não entregou
conteúdo legível. Valide no olho, no celular, antes de fixar.

Recursos OpenType do Inter úteis aqui (rsms.me/inter): `tnum` (números tabulares, para a régua
de atividade, contadores e porcentagem de contexto), `cv11` (a de um andar, opcional),
`ss02` (desambiguação com zero cortado, útil em hashes e IDs). A própria página do Inter
recomenda `font-feature-settings: 'liga' 1, 'calt' 1` no `:root` por causa do Chrome.

Código, terminal e caminhos continuam em fonte monoespaçada (`--mono` atual). O M3 não define
papel monoespaçado.

### Carregar Inter na web (self-host)

- Licença: SIL Open Font License 1.1, compatível com empacotar junto.
- Arquivo: o pacote `@fontsource-variable/inter` 5.3.0 traz woff2 variáveis por subconjunto. O
  subconjunto **latin** cobre o português (U+0000–00FF inclui á, ã, ç, é, õ…). Tamanhos
  medidos no jsDelivr:
  - `inter-latin-wght-normal.woff2` (só eixo de peso): **48 KB**;
  - `inter-latin-opsz-normal.woff2` (peso + tamanho óptico): **73 KB**;
  - `latin-ext` acrescenta 85–133 KB e só é preciso para idiomas da Europa Central.
- Itálico só se o markdown das respostas precisar; senão o navegador sintetiza.
- Servir do próprio hub, mesma origem. Hoje a página do hub **não** declara CSP (nenhum
  `Content-Security-Policy` em `src/` ou `web/`), mas a janela Electron declara
  `default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:`
  (`desktop/renderer/index.html`): ali **não há `font-src`**, então uma fonte, mesmo
  same-origin, seria bloqueada até se acrescentar `font-src 'self'`. Se a página do hub ganhar
  CSP um dia, o mesmo vale.

```css
@font-face {
  font-family: "Inter";
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url("fonts/inter-latin-opsz-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
    U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215,
    U+FEFF, U+FFFD;
}
```

O `unicode-range` acima é o do subconjunto latin do Fontsource (não verificado linha a linha
nesta pesquisa; copie do CSS do próprio pacote). `<link rel="preload" as="font"
type="font/woff2" crossorigin>` no `<head>` evita o salto de layout; o atributo `crossorigin` é
obrigatório mesmo em self-host (web.dev).

### Carregar Inter no Flutter

| Opção | Como | Prós | Contras |
| --- | --- | --- | --- |
| Asset no `pubspec.yaml` | `fonts: - family: Inter` com um arquivo por peso (`weight: 400/500/600`) | offline, previsível, sem dependência | arquivos no APK |
| `google_fonts` (9.0.0, BSD-3) | `GoogleFonts.interTextTheme()` | API pronta | **busca a fonte por HTTP em tempo de execução** se não achar o arquivo nos assets; o app fala só com o hub na LAN, então a busca falharia ou vazaria tráfego para fora |

Proposta: **asset no pubspec**, com arquivos estáticos 400, 500 e 600. Se usar `google_fonts`
mesmo assim, empacote os `.ttf` em assets (o pacote os prefere automaticamente) e desligue a
busca em rede com `GoogleFonts.config.allowRuntimeFetching = false`.

Fonte variável no Flutter: `TextStyle(fontVariations: [FontVariation('wght', 500)])` existe; se
`fontWeight` é aplicado automaticamente ao eixo `wght` de um único arquivo variável **não foi
verificado**. Arquivos estáticos por peso evitam a dúvida.

## 5. Forma

Escala de cantos (`md.sys.shape.corner.*`), Material Web `v0_192`; Compose `ShapeTokens` 14_1_0
acrescenta os três tamanhos do Expressive.

| Token | Valor | Uso típico |
| --- | --- | --- |
| none | 0 | top app bar, navigation bar e rail, list item, sheet em tela cheia |
| extra-small | 4 px | menu, snackbar, text field outlined (filled usa só os cantos de cima: `extra-small-top` = 4 4 0 0) |
| small | 8 px | chips |
| medium | 12 px | cards, small FAB |
| large | 16 px | FAB, extended FAB, navigation drawer (`large-end` = 0 16 16 0) |
| large-increased (Expressive) | 20 px | — |
| extra-large | 28 px | diálogo, large FAB, search view docked; bottom sheet usa `extra-large-top` (28 28 0 0) |
| extra-large-increased (Expressive) | 32 px | — |
| extra-extra-large (Expressive) | 48 px | — |
| full | 9999 px (CSS) / círculo | botões, icon buttons, segmented button, search bar, badge, indicador ativo, trilho do switch |

Atenção: o exemplo de `Shapes` na documentação do Compose usa `extraLarge = 24.dp`, mas é um
exemplo de personalização; o token oficial é 28.

## 6. Elevação

Níveis (`md.sys.elevation.level*`, idênticos no Material Web e no Flutter):

| Nível | dp | Componentes (tokens Flutter 6_1_0) |
| --- | --- | --- |
| level0 | 0 | filled button, filled/outlined card, navigation rail, top app bar parada |
| level1 | 1 | elevated button, elevated card, bottom sheet, chip elevado |
| level2 | 3 | navigation bar, menu, top app bar com conteúdo rolado por baixo |
| level3 | 6 | diálogo, FAB e extended FAB, search bar, search view, snackbar |
| level4 | 8 | FAB em hover, chip sendo arrastado |
| level5 | 12 | — |

Elevação tonal e sombra:

- **Tonal**: no M3 atual a altura se expressa pela **cor** da superfície. Os tokens 6_1_0 já
  atribuem papéis `surface-container-*` aos contêineres (navigation bar = `surface-container`),
  em vez da antiga sobreposição de `surface-tint` com opacidade.
- **Sombra**: continua existindo (`md.sys.color.shadow`), mas sem papel de hierarquia; serve
  para separar algo que flutua **sobre** conteúdo que rola (FAB, menu, snackbar). No tema
  escuro a sombra quase não aparece, então a separação vem do tom.
- Proposta para a página: abandonar `box-shadow` como sinal de hierarquia; usar tom de
  `surface-container-*` para profundidade e sombra curta apenas em FAB, menu e snackbar.

## 7. Movimento

### Easing e duração (M3 base)

Tokens `md.sys.motion.*` do Material Web `v0_192` (as durações também batem com Flutter e
Compose).

| Easing | cubic-bezier |
| --- | --- |
| emphasized | (0.2, 0, 0, 1) |
| emphasized-decelerate | (0.05, 0.7, 0.1, 1) |
| emphasized-accelerate | (0.3, 0, 0.8, 0.15) |
| standard | (0.2, 0, 0, 1) |
| standard-decelerate | (0, 0, 0, 1) |
| standard-accelerate | (0.3, 0, 1, 1) |
| legacy | (0.4, 0, 0.2, 1) |
| legacy-decelerate | (0, 0, 0.2, 1) |
| legacy-accelerate | (0.4, 0, 1, 1) |
| linear | (0, 0, 1, 1) |

O *emphasized* da especificação é uma curva composta (*path*), sem equivalente em uma única
cubic-bezier; o Material Web usa (0.2, 0, 0, 1) como aproximação, igual ao *standard*.

| Duração | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| short | 50 ms | 100 ms | 150 ms | 200 ms |
| medium | 250 ms | 300 ms | 350 ms | 400 ms |
| long | 450 ms | 500 ms | 550 ms | 600 ms |
| extra-long | 700 ms | 800 ms | 900 ms | 1000 ms |

Combinações usuais (orientação M3; pares exatos **não verificados**):

- entrada de elemento: *emphasized-decelerate*, medium4 a long2;
- saída: *emphasized-accelerate*, short4 a medium1 (sair é mais rápido que entrar);
- mudança pequena de estado (cor, opacidade, hover): *standard*, short2 a short4;
- elemento que fica na tela e muda de lugar: *emphasized* ou *standard*, medium2 a medium4.

### Molas (M3 Expressive)

O Expressive troca curva + duração por **molas** em dois tipos: *spatial* (posição, tamanho,
forma; pode ultrapassar) e *effects* (cor, opacidade; sem ultrapassar). Compose, tokens v0_14_0:

| Mola | Standard (amortecimento / rigidez) | Expressive (amortecimento / rigidez) |
| --- | --- | --- |
| fast spatial | 0,9 / 1400 | 0,6 / 800 |
| default spatial | 0,9 / 700 | 0,8 / 380 |
| slow spatial | 0,9 / 300 | 0,8 / 200 |
| fast effects | 1,0 / 3800 | 1,0 / 3800 |
| default effects | 1,0 / 1600 | 1,0 / 1600 |
| slow effects | 1,0 / 800 | 1,0 / 800 |

CSS não tem mola nativa; a função `linear()` de easing permite aproximá-la por pontos (suporte
nos navegadores **não verificado** nesta pesquisa). No Flutter há `SpringSimulation` /
`SpringDescription`. Para este app a proposta é ficar nas curvas do M3 base e respeitar
`prefers-reduced-motion` (seção 12).

## 8. Layout

### Window size classes

Fonte: Android Developers (as classes compact, medium e expanded correspondem às da diretriz
de layout do M3; large e extra-large foram acrescentadas para desktop).

| Classe (largura) | Faixa | Caso típico |
| --- | --- | --- |
| compact | < 600 dp | celular em retrato |
| medium | 600–839 dp | tablet em retrato, dobrável aberto em retrato |
| expanded | 840–1199 dp | tablet em paisagem |
| large | 1200–1599 dp | tablet grande |
| extra-large | ≥ 1600 dp | desktop |

| Classe (altura) | Faixa |
| --- | --- |
| compact | < 480 dp (celular em paisagem) |
| medium | 480–899 dp |
| expanded | ≥ 900 dp |

A largura costuma decidir o layout; a altura compacta impede, por exemplo, dois painéis num
celular deitado. As classes valem para a **janela**, não para o aparelho. No CSS, o equivalente
é `@media (min-width: 600px)` e `@media (min-width: 840px)` (1 dp ≈ 1 CSS px).

### Margens, grade e espaçamento

| Item | Valor | Situação |
| --- | --- | --- |
| Grade base | múltiplos de 4 dp (todas as medidas de componente nos tokens são múltiplas de 4) | verificado indiretamente pelos tokens |
| Margem lateral em compact | 16 dp | não verificado |
| Margem lateral em medium/expanded | 24 dp | não verificado |
| Espaço entre painéis | 24 dp | não verificado |
| Padding interno de list item | 16 dp à esquerda e à direita | verificado (`list-item.leading-space`/`trailing-space` = 16) |

Layouts canônicos do M3 relevantes: **list-detail** (lista de sessões + feed da sessão lado a lado
em expanded), **feed** e **supporting pane** (feed + painel lateral de arquivos ou terminal em
expanded). Em compact cada um vira uma tela de cada vez.

## 9. Estados (state layers)

Estado é sinalizado por uma camada da cor do **conteúdo** (`on-*`) sobre o contêiner, com
opacidade fixa:

| Estado | Material Web v0_192 | Flutter 6_1_0 / Compose v0_210 |
| --- | --- | --- |
| hover | 0,08 | 0,08 |
| focus | 0,12 | 0,10 |
| pressed | 0,12 | 0,10 |
| dragged | 0,16 | 0,16 |

As versões mais novas dos tokens (Flutter e Compose) baixaram focus e pressed para 0,10. Use
0,10 na página para casar com o app.

Outras regras do sistema de estados:

- **Desabilitado**: contêiner com `on-surface` a 12% e conteúdo `on-surface` a 38% (valores **não
  verificados** nos arquivos consultados).
- **Foco por teclado**: o M3 desenha um anel de foco além da camada de estado; espessura e
  deslocamento **não verificados**.
- **Selecionado**: troca de cor de contêiner (ex.: `secondary-container` no indicador ativo) e, nos
  ícones, a versão preenchida.
- Implementação CSS proposta: um `::before` absoluto com `background: currentColor` e `opacity`
  variando por `:hover`, `:focus-visible` e `:active`, dentro de `@media (hover: hover)` para o
  hover não "grudar" no toque.

## 10. Componentes relevantes

Medidas tiradas dos tokens do Flutter `6_1_0` (`gen_defaults/data`), salvo indicação. "c." =
token de canto da seção 5.

### Top app bar

- **Quando usar**: cabeçalho de cada tela, com título, navegação (voltar/menu) e até três ações.
- **Anatomia**: contêiner, ícone de navegação à esquerda, título, ações à direita.
- **Medidas**: small 64 dp; medium 112 dp; large 152 dp; ícones 24 dp; canto none; elevação
  level0 parada e level2 com conteúdo rolado por baixo (a cor muda para um container mais alto).
- **Variantes**: center-aligned, small, medium, large (as duas últimas recolhem para small ao
  rolar).
- **No app**: small no feed (nome da sessão + menu de modelo/interromper); center-aligned nas
  telas nativas do Flutter.

### Navigation bar

- **Quando usar**: 3 a 5 destinos principais em compact.
- **Anatomia**: contêiner, ícone, indicador ativo em pílula atrás do ícone, rótulo, badge
  opcional.
- **Medidas**: altura 80 dp; indicador 64 × 32 dp, c.full; ícone 24 dp; rótulo `label-medium`;
  contêiner `surface-container`, elevação level2; indicador `secondary-container`, ícone ativo
  `on-secondary-container`, inativo `on-surface-variant`.
- **No app**: candidata para sessões / arquivos / terminal / ajustes no celular.

### Navigation rail

- **Quando usar**: os mesmos destinos em medium e expanded, na lateral.
- **Medidas**: largura 80 dp; indicador 56 × 32 dp (56 × 56 sem rótulo); ícone 24 dp;
  elevação level0. Pode abrigar um FAB no topo.

### FAB e extended FAB

- **Quando usar**: a ação mais importante da tela, uma só. Extended quando o rótulo ajuda.
- **Medidas**: FAB 56 dp, c.large (16), ícone 24; small FAB 40 dp, c.medium (12); large FAB
  96 dp, c.extra-large (28), ícone 36; extended 56 dp de altura, c.large; elevação level3
  (level1 na variante *lowered*). Largura mínima do extended: **não verificado**.
- **Variantes**: cores primary/secondary/tertiary/surface. No Expressive, o FAB menu
  (`FloatingActionButtonMenu`) abre ações relacionadas.
- **No app**: "nova sessão" na lista de sessões. No feed a ação principal é o envio do composer,
  então não cabe FAB ali.

### Botões

Todos com **40 dp de altura**, c.full, ícone opcional de 18 dp, rótulo `label-large`.

| Variante | Ênfase | Contêiner | Uso no app |
| --- | --- | --- | --- |
| filled | máxima | `primary`, level0 | "Aprovar" no card de permissão, "Enviar" |
| filled tonal | média-alta | `secondary-container` | ação secundária forte ("Aprovar sempre") |
| elevated | média | `surface-container-low`, level1 | só quando o fundo é padronagem ou imagem |
| outlined | média | transparente, borda `outline` de 1 dp | "Negar", "Cancelar" ao lado de um filled |
| text | baixa | transparente | ações em diálogo e snackbar |

Regra M3: uma ação de ênfase máxima por região. O par aprovar/negar fica **filled + outlined**
(ou filled + text); vermelho em "negar" só se for destrutivo de fato, e aí com `error`.

No Expressive há tamanhos de botão (XS a XL), cantos que mudam ao pressionar e `ButtonGroup`/
`SplitButton`; medidas **não verificadas**.

### Icon buttons

- **Medidas**: alvo e camada de estado 40 dp; ícone 24 dp; outlined com contêiner 40 × 40,
  c.full. O alvo de toque é ampliado para 48 dp (seção 12).
- **Variantes**: standard (sem contêiner), filled, filled tonal, outlined; podem ser *toggle*
  (selecionado = ícone preenchido + contêiner).
- **No app**: anexar, interromper, copiar, abrir terminal. Sempre com rótulo acessível.

### Cards

- **Quando usar**: agrupar conteúdo e ações sobre um assunto: um pedido de permissão, uma
  pergunta, um resumo de sessão.
- **Medidas**: c.medium (12); elevated level1, filled e outlined level0; outlined com borda de
  1 dp em `outline-variant`. Padding interno de 16 dp: **não verificado** nos tokens.
- **Variantes**: elevated (`surface-container-low`), filled (`surface-container-highest`),
  outlined (`surface`).
- **No app**: card de permissão = filled ou outlined com preview do comando em bloco
  monoespaçado, ações no rodapé; card de pergunta = filled com radio (escolha única) ou checkbox
  (múltipla).

### Lists

- **Medidas**: uma linha 56 dp; duas linhas 72 dp; três linhas 88 dp; padding lateral 16 dp;
  avatar 40 dp; ícone 24 dp; imagem 56 dp; c.none.
- **Anatomia**: leading (ícone/avatar), headline (`body-large`), supporting text (`body-medium`,
  `on-surface-variant`), trailing (meta, ícone, switch).
- **No app**: lista de sessões (duas linhas: nome + diretório/estado, trailing com badge de
  urgência) e gerenciador de arquivos (uma linha, ícone de tipo à esquerda).

### Chips

- **Medidas**: 32 dp de altura, c.small (8), ícone 18 dp; borda de 1 dp quando não selecionado,
  sem borda quando selecionado.
- **Variantes**: assist (atalho de ação), filter (alternar filtro), input (valor digitado,
  removível), suggestion (sugestão de resposta).
- **No app**: filter para filtrar sessões ou tipos de evento; input para anexos no composer;
  suggestion para respostas rápidas.

### Dialogs

- **Quando usar**: decisão que bloqueia o fluxo e precisa de resposta agora. Não para avisos.
- **Medidas**: c.extra-large (28), elevação level3, título `headline-small`, ícone opcional
  24 dp. Largura mínima 280 dp e máxima 560 dp: **não verificado**.
- **Variantes**: basic e full-screen (c.none, para compact quando o conteúdo é grande).
- **No app**: confirmação de confiança na pasta antes de spawn, apagar arquivo.

### Bottom sheets

- **Medidas**: c.extra-large-top (28 28 0 0); alça de arraste 32 × 4 dp em
  `on-surface-variant`; elevação level1. Largura máxima 640 dp: **não verificado**.
- **Variantes**: standard (convive com o conteúdo) e modal (com scrim).
- **No app**: escolher modelo, ações de um arquivo, detalhes da régua de atividade no celular.

### Snackbar

- **Medidas**: uma linha 48 dp, duas linhas 68 dp; c.extra-small (4); level3; fundo
  `inverse-surface`, texto `on-inverse-surface` em `body-medium`, ação em `inverse-primary`.
- **Uso**: confirmação breve e reversível ("Arquivo copiado", "Reconectado"), no máximo uma
  ação. Não usar para erro que exige decisão.

### Progress indicators

- **Medidas**: espessura do indicador 4 dp, espaço entre indicador e trilho 4 dp, ponto de parada
  4 dp, c.full (tokens 6_1_0, que já trazem o desenho com trilho separado). Diâmetro do circular:
  **não verificado**.
- **Variantes**: linear e circular; determinado e indeterminado. No Expressive há o
  `LoadingIndicator` (forma que muda) e a versão ondulada; medidas não verificadas.
- **No app**: a barra de contexto é um linear determinado; "sessão pensando" pode ser linear
  indeterminado no topo do feed.

### Text fields

- **Medidas**: ícones 24 dp; filled com c.extra-small-top e indicador inferior de 1 dp (2 dp no
  foco); outlined com c.extra-small, borda de 1 dp (2 dp em `primary` no foco, `error` em erro).
  Altura de 56 dp: **não verificado** nos tokens consultados.
- **Anatomia**: contêiner, rótulo (flutua ao focar), texto, texto de apoio/erro, contador, ícones
  leading/trailing.
- **No app**: o composer foge do padrão (área multilinha que cresce, com anexo e envio). Proposta:
  contêiner `surface-container-high` com c.extra-large ou c.full quando em uma linha,
  ícone de anexo como leading icon button e envio como filled icon button.

### Menus

- **Medidas**: c.extra-small (4), elevação level2. Altura de item 48 dp: **não verificado**.
- **No app**: menu de contexto de arquivo, troca de modelo no desktop.

### Badges

- **Medidas**: pequeno (ponto) 6 dp; grande 16 dp de altura com número; c.full; cor `error`.
- **No app**: sessões com permissão ou pergunta pendente, sobre o ícone da navegação.

### Switch, checkbox, radio

| Controle | Medidas |
| --- | --- |
| switch | trilho 52 × 32 dp, c.full; alça 16 dp desligado, 24 dp ligado ou com ícone, 28 dp pressionado; ícone 16 dp; camada de estado 40 dp |
| checkbox | caixa 18 dp; camada de estado 40 dp |
| radio | ícone 20 dp; camada de estado 40 dp |

- Switch para liga/desliga com efeito imediato (ajustes: "avisos com o app fechado").
- Checkbox para múltipla escolha que se confirma depois (pergunta com `multiSelect`).
- Radio para escolha única (pergunta comum).

### Segmented buttons

- **Medidas**: 40 dp de altura, c.full nas pontas, borda de 1 dp, ícone 18 dp.
- **Uso**: 2 a 5 opções mutuamente exclusivas ou filtros na mesma linha.
- **No app**: modo da sessão (por exemplo, normal / auto / plano) ou filtro LAN / VPN nos
  ajustes do app.

### Search

- **Medidas**: search bar 56 dp de altura, c.full, level3, avatar 30 dp; search view docked
  c.extra-large com cabeçalho 56 dp; em tela cheia c.none com cabeçalho 72 dp.
- **No app**: busca no gerenciador de arquivos (a busca em subpastas) e, se crescer, filtro de
  sessões.

## 11. Padrões de navegação e de feedback

Navegação:

- **Por classe de largura**: compact → navigation bar; medium → navigation rail; expanded e
  maiores → rail ou navigation drawer (drawer: 360 dp de largura, indicador 336 × 56 dp,
  c.large-end).
- **Hierarquia**: voltar na top app bar para telas filhas (sessão → arquivo); o botão voltar do
  sistema faz o mesmo no app Android.
- **List-detail**: em compact, tocar numa sessão empurra o feed; em expanded, os dois ficam
  visíveis.
- Destino selecionado: ícone preenchido + indicador `secondary-container`; não selecionado:
  contorno, `on-surface-variant`.

Feedback (do mais leve ao mais intrusivo):

| Necessidade | Componente |
| --- | --- |
| reconhecer um toque | state layer + ripple |
| mostrar progresso | progress indicator (linear para tarefa de tela; circular para item) |
| confirmar ação concluída, com desfazer | snackbar |
| sinalizar algo pendente sem interromper | badge |
| informar estado persistente da tela (offline, versão desatualizada) | banner no topo do conteúdo (o `#outdated` atual) |
| exigir decisão agora | dialog |
| pedir aprovação contextual dentro do fluxo | card no feed (como os de permissão), não diálogo |

Os cards de permissão e pergunta como **card inline no feed** combinam com o M3: a decisão está
ligada a um ponto da conversa e não deve sequestrar a tela inteira.

## 12. Acessibilidade no M3

- **Alvo de toque mínimo de 48 × 48 dp**. No Flutter, `MaterialTapTargetSize.padded` é o
  padrão de `ThemeData.materialTapTargetSize` e expande o alvo para 48 × 48. Icon buttons de
  40 dp têm alvo de 48. Na página, garantir `min-width`/`min-height` de 48 px no bloco
  `@media (hover: none)` (o repositório já tem teste exigindo controle maior nesse bloco).
- **Contraste**: os pares `X`/`on-X` do esquema gerado atendem ao contraste mínimo; texto
  pequeno precisa de 4,5:1 e o restante de 3:1 (Android Developers). Para quem precisa de mais,
  os esquemas de contraste médio (0,5) e alto (1,0).
- **Não depender só de cor**: estado de sessão com ícone e texto além da cor; erro com ícone e
  mensagem.
- **Rótulos**: todo icon button com `aria-label` na web e `tooltip`/`Semantics` no Flutter.
- **Foco visível** por teclado em todo controle (`:focus-visible` na web).
- **Movimento**: respeitar `prefers-reduced-motion: reduce` na web (trocar deslocamentos por
  fade curto) e `MediaQuery.disableAnimations` no Flutter.
- **Texto escalável**: tamanhos em rem na web; no Flutter, não travar `textScaler`. Os
  componentes M3 crescem com o texto, então evite alturas fixas em contêineres de texto.
- **Espaçamento de texto**: o conteúdo não pode quebrar se o usuário aumentar line-height para
  1,5×, letter-spacing para 0,12× e word-spacing para 0,16× o tamanho da fonte (WCAG 2.2, 1.4.12).

## 13. Ícones: comparação e recomendação

Números medidos em 06/11/2026 no npm, jsDelivr e pub.dev.

| Critério | Material Symbols | Lucide | Phosphor | Tabler |
| --- | --- | --- | --- | --- |
| Licença | Apache-2.0 | ISC (porte Flutter: MIT) | MIT | MIT |
| Quantidade | 3.940 nomes por estilo no `@material-symbols/svg-400` 0.48.3 (versão *outlined* e *-fill*); o pacote Flutter fala em 4.264 | 2.322 (`lucide-static` 1.70.0) | 1.512 por peso (`@phosphor-icons/core` 2.1.1) | 5.203 outline + 1.054 filled (`@tabler/icons` 3.50.0) |
| Desenho | geometria por **preenchimento**, grade 24 (viewBox 960); 3 estilos (outlined, rounded, sharp) | traço 2 px, pontas e junções arredondadas, grade 24 | grade 256; regular equivale a ~1,5 px de traço em 24 px (inferido do path); 6 pesos (thin, light, regular, bold, fill, duotone) | traço 2 px, pontas arredondadas, grade 24 |
| Variações | eixos variáveis FILL 0–1, wght 100–700, GRAD −50–200, opsz 20–48 | peso de traço 100–600 no Flutter | 6 pesos | outline e filled |
| SVG avulso (mediana) | 436 B (outlined), 401 B (fill), 691 B (rounded) | 466 B | 458 B (regular) | 534 B (outline) |
| Fonte completa woff2 | outlined com todos os eixos: 4,0 MB; padrão do Google Fonts: 295 KB; subconjunto com `icon_names`: ~1,7 KB para 3 ícones | 313 KB | ~147 KB por peso | não medido |
| Web sem build | copiar os SVGs usados, ou baixar o woff2 já subconjuntado pelo Google Fonts e servir local | copiar SVGs de `lucide-static` | copiar SVGs do `core` ou servir o woff2 de um peso | copiar SVGs |
| Flutter | `Icons` embutido (Material Icons, a geração anterior, já incluso com `uses-material-design`); `material_symbols_icons` 4.2960.0 (Apache-2.0, 130 pontos, publicado em 07/2026) | `lucide_icons_flutter` 4.0.2 (160 pontos, publicado em 04/11/2026) | `phosphor_flutter` 2.1.0 (55 pontos, último em 05/2024) | `flutter_tabler_icons` 1.43.0 (150 pontos, último em 09/2024, atrás da versão web) |
| Coerência com M3 | total: é o conjunto do próprio sistema, com FILL para estado selecionado | boa em traço; contrasta com o desenho preenchido dos componentes M3 | boa com o peso regular | boa; muito parecida com Lucide |

Observações:

- Os quatro são leves **se** cada ícone for embutido individualmente (≈ 0,5 KB cada); o que pesa
  é carregar a biblioteca inteira, em fonte ou em JS.
- Os SVGs do Material Symbols usam `fill`; os de Lucide e Tabler usam `stroke`. Para colorir com
  `currentColor` muda o atributo, não a técnica.
- O padrão M3 de **ícone preenchido para o destino selecionado** sai de graça no Material
  Symbols (arquivo `-fill`, eixo FILL ou `fill: true` no Flutter). Em Lucide e Tabler o
  "preenchido" não existe para todo ícone.
- Phosphor tem a pior situação no Flutter (pacote parado desde 2024, 55 pontos).
- Tabler no Flutter está atrás da versão web: ícones novos podem não existir no app.

### Recomendação

**Material Symbols, estilo Outlined (peso 400), com a variante `-fill` para estado selecionado.**

- **Web**: copiar só os SVGs usados de `@material-symbols/svg-400` para um diretório próprio (por
  exemplo `web/icons/`, fora de `web/vendor/`) ou montar um sprite `<symbol>` servido pelo hub;
  usar com `<svg><use href="icons.svg#terminal"/></svg>` e `fill="currentColor"`. Com cerca de
  30 ícones o custo é ~15 KB sem compressão, sem fonte, sem JS, mesma origem.
- **Flutter**: `material_symbols_icons` (`Symbols.terminal`, `fill: 1` no selecionado), que faz
  tree-shaking da fonte, ou o `Icons` embutido enquanto o conjunto bastar.

Motivo em duas linhas: é o único conjunto que é o próprio idioma visual do M3 (desenho dos
componentes, eixo FILL para seleção, pesos que acompanham Inter), com licença Apache-2.0 e pacote
ativo nos dois lados. Embutido ícone a ícone, pesa o mesmo que as alternativas.

Alternativa: **Lucide**, se o dono preferir o visual de traço. É o mais bem mantido fora do Google,
com o pacote Flutter mais saudável. Custo: perde o FILL de seleção e destoa um pouco dos
componentes M3.

## 14. Implementação

### Web sem build: tokens CSS vs. `@material/web`

**`@material/web`** (2.5.0, Apache-2.0, 7,9 MB descompactado):

- Prós: componentes M3 completos (`md-filled-button`, `md-outlined-text-field`, `md-checkbox`…),
  tokens `--md-sys-*` e `--md-<componente>-*` prontos, acessibilidade de formulário resolvida.
- Contras:
  - **modo de manutenção desde junho de 2024** (discussão #5642): "novas funcionalidades e
    componentes não estão mais planejados", PRs não são aceitos por padrão, a equipe foi
    realocada. Não terá M3 Expressive;
  - é distribuído como **módulos ES com imports nus** (`lit`, `tslib`): o exemplo "buildless"
    oficial depende de import map apontando para um CDN (`esm.run`). Sem build e sem internet
    (o hub serve a LAN), seria preciso vendorizar a árvore de dependências inteira à mão;
  - shadow DOM: estilizar por dentro só pelos tokens expostos; interfere com os testes que leem
    `style.css` (`tests/web-css.test.ts`);
  - o README recomenda carregar Roboto do Google Fonts, o que conflita com self-host.
- **Recomendação**: **só tokens em CSS custom properties**, com os **mesmos nomes** do Material
  Web (`--md-sys-color-*`, `--md-sys-typescale-*`, `--md-sys-shape-corner-*`). Os componentes
  continuam HTML nativo estilizado no `style.css`. Se um dia valer adotar `@material/web` para um
  componente isolado, ele já herda o tema.

Esqueleto de tokens (os valores de cor são o baseline escuro da seção 3; substituir pelo esquema
gerado da semente escolhida, exportado do Material Theme Builder):

```css
:root {
  color-scheme: dark;

  --md-sys-color-primary: #D0BCFF;
  --md-sys-color-on-primary: #381E72;
  --md-sys-color-primary-container: #4F378B;
  --md-sys-color-on-primary-container: #EADDFF;
  --md-sys-color-secondary-container: #4A4458;
  --md-sys-color-on-secondary-container: #E8DEF8;
  --md-sys-color-error: #F2B8B5;
  --md-sys-color-on-error: #601410;
  --md-sys-color-error-container: #8C1D18;
  --md-sys-color-on-error-container: #F9DEDC;
  --md-sys-color-surface: #141218;
  --md-sys-color-surface-container-lowest: #0F0D13;
  --md-sys-color-surface-container-low: #1D1B20;
  --md-sys-color-surface-container: #211F26;
  --md-sys-color-surface-container-high: #2B2930;
  --md-sys-color-surface-container-highest: #36343B;
  --md-sys-color-on-surface: #E6E0E9;
  --md-sys-color-on-surface-variant: #CAC4D0;
  --md-sys-color-outline: #938F99;
  --md-sys-color-outline-variant: #49454F;
  --md-sys-color-inverse-surface: #E6E0E9;
  --md-sys-color-inverse-on-surface: #322F35;
  --md-sys-color-inverse-primary: #6750A4;

  --md-ref-typeface-brand: "Inter", system-ui, sans-serif;
  --md-ref-typeface-plain: "Inter", system-ui, sans-serif;

  --md-sys-typescale-title-medium-size: 1rem;
  --md-sys-typescale-title-medium-line-height: 1.5rem;
  --md-sys-typescale-title-medium-weight: 500;
  --md-sys-typescale-body-medium-size: 0.875rem;
  --md-sys-typescale-body-medium-line-height: 1.25rem;
  --md-sys-typescale-body-medium-weight: 400;
  --md-sys-typescale-label-large-size: 0.875rem;
  --md-sys-typescale-label-large-line-height: 1.25rem;
  --md-sys-typescale-label-large-weight: 500;

  --md-sys-shape-corner-extra-small: 4px;
  --md-sys-shape-corner-small: 8px;
  --md-sys-shape-corner-medium: 12px;
  --md-sys-shape-corner-large: 16px;
  --md-sys-shape-corner-extra-large: 28px;
  --md-sys-shape-corner-full: 9999px;

  --md-sys-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --md-sys-motion-easing-emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1);
  --md-sys-motion-easing-emphasized-accelerate: cubic-bezier(0.3, 0, 0.8, 0.15);
  --md-sys-motion-duration-short4: 200ms;
  --md-sys-motion-duration-medium2: 300ms;
  --md-sys-motion-duration-medium4: 400ms;

  --md-sys-state-hover-state-layer-opacity: 0.08;
  --md-sys-state-focus-state-layer-opacity: 0.1;
  --md-sys-state-pressed-state-layer-opacity: 0.1;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --md-sys-motion-duration-medium2: 0ms;
    --md-sys-motion-duration-medium4: 0ms;
  }
}
```

Os nomes `--md-sys-motion-*` e `--md-sys-state-*` seguem a convenção dos tokens, mas a
documentação do Material Web só lista explicitamente as propriedades de cor, tipografia,
tipo de letra e forma.

Gerar o esquema: o **Material Theme Builder** (web ou plugin do Figma) recebe a semente e
exporta para CSS, Flutter (Dart) e Compose, nos três níveis de contraste. Assim o CSS e o
`ColorScheme` do app saem do mesmo cálculo. A outra via é chamar
`ColorScheme.fromSeed` no Flutter com a mesma semente e variante: o algoritmo é o mesmo
(`material-color-utilities`), mas confira os hex lado a lado, porque versões diferentes da
biblioteca podem gerar tons ligeiramente diferentes (não verificado).

### Flutter

```dart
const semente = Color(0xFFF5A524);

final esquema = ColorScheme.fromSeed(
  seedColor: semente,
  brightness: Brightness.dark,
  dynamicSchemeVariant: DynamicSchemeVariant.fidelity,
);

final base = ThemeData(
  useMaterial3: true,
  colorScheme: esquema,
  fontFamily: 'Inter',
);

final tema = base.copyWith(
  textTheme: base.textTheme.copyWith(
    bodyLarge: base.textTheme.bodyLarge?.copyWith(letterSpacing: 0),
    bodyMedium: base.textTheme.bodyMedium?.copyWith(letterSpacing: 0),
    titleMedium: base.textTheme.titleMedium?.copyWith(letterSpacing: 0),
  ),
);
```

```yaml
flutter:
  uses-material-design: true
  fonts:
    - family: Inter
      fonts:
        - asset: fonts/Inter-Regular.ttf
        - asset: fonts/Inter-Medium.ttf
          weight: 500
        - asset: fonts/Inter-SemiBold.ttf
          weight: 600
```

Notas:

- `useMaterial3: true` já é o padrão; deixar explícito documenta a intenção.
- Hoje `mobile/lib/main.dart` usa `colorSchemeSeed: Color(0xFF7C5CFF)` com
  `brightness: Brightness.dark`, que equivale a `fromSeed` com `tonalSpot`. A semente âmbar do
  exemplo só faz sentido se a página também for para âmbar (seção 3).
- `copyWith(useMaterial3: true)` **não** troca os padrões dependentes do M3; a flag precisa estar
  no construtor.
- Tema por componente (`navigationBarTheme`, `cardTheme`, `filledButtonTheme`…) só quando o
  padrão M3 não servir; os padrões já seguem os tokens da seção 10.

## 15. Fontes

Especificação M3 (renderizada por JavaScript; consultada, mas sem texto extraível; ler no
navegador):

- https://m3.material.io/styles/color/roles
- https://m3.material.io/styles/typography/type-scale-tokens
- https://m3.material.io/styles/shape/corner-radius-scale
- https://m3.material.io/styles/motion/easing-and-duration/tokens-specs
- https://m3.material.io/foundations/interaction/states/state-layers
- https://m3.material.io/blog/building-with-m3-expressive
- https://m3.material.io/foundations/layout/applying-layout/window-size-classes (link citado
  pela documentação Android; o acesso direto devolveu 404)

Tokens oficiais (fonte dos números):

- https://github.com/material-components/material-web/tree/main/tokens/versions/v0_192
  (`_md-sys-typescale.scss`, `_md-ref-typeface.scss`, `_md-sys-shape.scss`,
  `_md-sys-motion.scss`, `_md-sys-state.scss`, `_md-sys-elevation.scss`)
- https://github.com/flutter/flutter/tree/master/dev/tools/gen_defaults/data (`color_dark.json`,
  `palette.json`, `elevation.json`, `state.json`, `motion.json`, `text_style.json`,
  `typeface.json` e os JSON de cada componente: `button_*`, `card_*`, `chip_*`, `dialog`,
  `fab_*`, `icon_button*`, `list`, `menu`, `navigation_bar`, `navigation_rail`,
  `navigation_drawer`, `progress_indicator`, `radio_button`, `checkbox`, `switch`, `search_bar`,
  `search_view`, `segmented_button_outlined`, `sheet_bottom`, `snackbar`, `text_field_*`,
  `top_app_bar_*`, `badge`)
- https://github.com/androidx/androidx/tree/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens
  (`ShapeTokens.kt`, `MotionTokens.kt`, `StateTokens.kt`, `ExpressiveMotionTokens.kt`,
  `StandardMotionTokens.kt`, `TypeScaleTokens.kt`, `ElevationTokens.kt`) e os arquivos
  `ButtonGroup.kt`, `SplitButton.kt`, `LoadingIndicator.kt`, `FloatingToolbar.kt`,
  `FloatingActionButtonMenu.kt`, `MaterialTheme.kt` do mesmo diretório pai

Material Web:

- https://github.com/material-components/material-web (README)
- https://github.com/material-components/material-web/discussions/5642 (modo de manutenção)
- https://material-web.dev/theming/material-theming/
- https://material-web.dev/theming/color/
- https://material-web.dev/theming/typography/
- https://material-web.dev/components/icon/
- https://material-web.dev/about/intro/

Flutter:

- https://api.flutter.dev/flutter/material/ThemeData/useMaterial3.html
- https://api.flutter.dev/flutter/material/ColorScheme/ColorScheme.fromSeed.html
- https://api.flutter.dev/flutter/material/DynamicSchemeVariant.html
- https://api.flutter.dev/flutter/material/MaterialTapTargetSize.html
- https://api.flutter.dev/flutter/dart-ui/FontVariation-class.html
- https://docs.flutter.dev/ui/design/material
- https://docs.flutter.dev/cookbook/design/fonts
- https://github.com/flutter/flutter/issues/168813 (M3 Expressive no Flutter)

Android / Compose:

- https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes
- https://developer.android.com/develop/ui/compose/designsystems/material3
- https://developer.android.com/reference/kotlin/androidx/compose/material3/ShapeDefaults
- https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme
- https://developer.android.com/guide/topics/ui/accessibility/apps
- https://blog.google/products/android/material-3-expressive-android-wearos-launch/

Cor e tema:

- https://github.com/material-foundation/material-theme-builder
- https://material-foundation.github.io/material-theme-builder/

Ícones:

- https://developers.google.com/fonts/docs/material_symbols
- https://fonts.google.com/icons (biblioteca, citada pela documentação acima)
- https://pub.dev/packages/material_symbols_icons
- https://lucide.dev/guide/packages/lucide-static
- https://pub.dev/packages/lucide_icons_flutter
- metadados do npm (`registry.npmjs.org/<pacote>/latest`) e listagens do jsDelivr
  (`data.jsdelivr.com/v1/packages/npm/<pacote>@<versão>?structure=flat`) para `lucide-static`,
  `@phosphor-icons/web`, `@phosphor-icons/core`, `@tabler/icons`, `material-symbols`,
  `@material-symbols/svg-400`, `@material/web` e `@fontsource-variable/inter`
- API do pub.dev (`pub.dev/api/packages/<pacote>` e `/score`) para `lucide_icons_flutter`,
  `phosphor_flutter`, `flutter_tabler_icons`, `tabler_icons`, `material_symbols_icons` e
  `google_fonts`
- SVGs de amostra (`terminal`) de cada conjunto, via `cdn.jsdelivr.net`

Fonte Inter:

- https://rsms.me/inter/
- https://pub.dev/packages/google_fonts
- https://web.dev/learn/design/typography (preload e `crossorigin`)
- https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
