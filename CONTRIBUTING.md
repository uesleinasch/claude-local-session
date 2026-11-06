# Como contribuir

Obrigado pelo interesse no Local Session! Este guia diz como montar o ambiente, por onde o código
anda e o que um pull request precisa ter para entrar.

> **English:** contributions are welcome. The codebase, UI and commit messages are in Brazilian
> Portuguese, but issues and pull requests in English are fine too.

Ao participar, você concorda com o [Código de Conduta](CODE_OF_CONDUCT.md).

## Antes de começar

- **Bug ou ideia?** Abra uma [issue](https://github.com/uesleinasch/claude-local-session/issues/new/choose)
  com o template certo. Para mudança grande, abra a issue antes de escrever o código: assim
  dá para alinhar o desenho antes de você investir tempo.
- **Falha de segurança?** Não abra issue pública. Siga o [SECURITY.md](SECURITY.md).

## Ambiente

Você precisa de:

- [Bun](https://bun.sh) 1.3 ou mais novo;
- `tmux`, para os testes de integração do terminal e para a resposta de perguntas pela página;
- Claude Code, para testar o plugin de verdade.

O app Android é opcional e usa Flutter 3.47 ou mais novo.

```bash
git clone https://github.com/uesleinasch/claude-local-session.git
cd claude-local-session
bun install
bun test                 # unitários + integração (sobe um hub de verdade numa porta efêmera)
bunx tsc --noEmit        # a única checagem estática do repo
bun run hub              # o hub em primeiro plano, para depurar
```

Para ver suas mudanças rodando numa sessão do Claude Code, use `bun scripts/update.ts`: ele
espelha o repo no cache do plugin e reinicia o hub. O [CLAUDE.md](CLAUDE.md) explica a
arquitetura, as fronteiras de segurança e as armadilhas do deploy local. Vale ler antes de mexer
no hub.

App Android:

```bash
cd mobile && flutter test && flutter analyze
```

## Fluxo de branches

| branch | papel |
| --- | --- |
| `Production` | o que está publicado; as releases saem daqui |
| `Development` | homologação: **é para cá que os pull requests vão** |
| `main` | backup do código |

1. Crie sua branch a partir de `Production`: `feat/…`, `fix/…`, `docs/…` ou `chore/…`.
2. Faça commits pequenos, cada um com uma mudança só.
3. Abra o pull request para `Development`.

A promoção para `Production` (`release/*`, tags e releases) é com quem mantém o projeto.

## Convenções

- **Idioma:** código, strings da interface, comentários e mensagens de commit em português.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/pt-br/), com a descrição
  em minúsculas e focada no efeito para quem usa, por exemplo
  `feat: terminal de verdade no diretório do projeto, pelo navegador`.
- **Comentários:** só para o que o código não consegue mostrar (acoplamento entre arquivos,
  armadilha de biblioteca, decisão de segurança). Nada de comentário narrativo.
- **Núcleo puro e casca:** a regra fica num módulo sem I/O, com teste unitário; o efeito colateral
  fica na casca. O CLAUDE.md lista os exemplos a copiar.
- **Interface:** siga o [design system](docs/design/design-system.md). Cor, fonte e espaçamento vêm
  dos tokens de `web/tokens.css`, e o `tests/web-css.test.ts` reprova os padrões que só quebram
  no celular.
- **Protocolo:** uma mudança no protocolo entre o navegador e o hub mexe em `src/protocol.ts`,
  `src/hub.ts` **e** `web/app.js` juntos. Nada avisa se você esquecer um dos três.

## O pull request

- [ ] `bun test` e `bunx tsc --noEmit` passando (e `flutter test`, se mexeu em `mobile/`);
- [ ] teste novo para o comportamento novo, escrito antes do código e visto falhando;
- [ ] documentação atualizada (README, CLAUDE.md) se o comportamento mudou;
- [ ] mudança visual com captura de tela, de preferência no celular;
- [ ] nenhuma fronteira de segurança afrouxada (token, `realpath`, allowlists — veja o CLAUDE.md).

O template do pull request traz essa lista. A revisão pode pedir ajustes; nada pessoal.

## Licença

Ao contribuir, você concorda que sua contribuição é licenciada sob a [licença MIT](LICENSE) do
projeto.
