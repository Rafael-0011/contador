# ContaCarga

Contador mobile-first de sacos (`SC`) para conferência de carga de caminhão.

## O problema

A conferência manual de sacos durante o carregamento de caminhões costuma acontecer em ambientes de campo, com pressa, ruído, exposição ao sol e uso de celulares com uma mão ou com luvas. Uma contagem simples pode ser interrompida, sofrer erros de toque ou depender de conexão com a internet.

Também existe uma necessidade operacional importante: registrar cada parada da conferência com a contagem daquele trecho, o total acumulado e o horário mostrado pela câmera ou pelo processo de operação. O horário do computador não representa necessariamente o horário real da conferência.

## A solução

O ContaCarga transforma o celular em um contador de operação rápido e offline:

- Um toque em qualquer parte da tela soma `+1 SC`.
- A área principal ocupa toda a tela para facilitar o uso no campo.
- Um gesto de pinça com dois dedos para dentro abre o menu de controle.
- Arrastar dois dedos para baixo também abre o menu.
- Durante gestos com dois dedos, nenhum saco é contado.
- O operador pode continuar, zerar ou salvar a parada.
- Antes de contar, informa a data da operação e o número do romaneio.
- Ao salvar, o horário é informado manualmente conforme a câmera ou a operação.
- Cada parada registra a contagem atual, a soma acumulada e o horário.
- O histórico permanece salvo mesmo sem internet ou após fechar o navegador.
- O resumo pode ser copiado para envio por WhatsApp.

## Exemplo de registro

| Parada | Contagem atual | Soma acumulada | Horário |
| --- | ---: | ---: | --- |
| 1 | 120 SC | 120 SC | 08:15:32 |
| 2 | 95 SC | 215 SC | 08:42:10 |

Neste projeto, `SC` significa **sacos**.

## Funcionalidades

### Contagem

- Pointer Events para toque e clique sem atraso artificial.
- Feedback visual e vibração curta quando disponível.
- Botão para desfazer o último toque.
- Bloqueio do zoom por duplo toque para evitar interferência na operação.

### Controle da operação

- Bottom sheet com ações grandes para uso com luvas.
- Continuar a contagem atual.
- Zerar a contagem atual com confirmação.
- Salvar uma parada e iniciar o próximo lote.
- Campo de horário manual com máscara visível no formato `HHhMMmSSs`.
- Aceita entrada numérica como `081532` e converte para `08h15m32s`; o histórico salva no formato `08:15:32`.

### Histórico

- Lista de todas as paradas salvas.
- Total geral em destaque.
- Limpeza do histórico com confirmação.
- Ao limpar o histórico, uma confirmação informa que uma nova contagem será iniciada.
- Resumo em texto para copiar e compartilhar.
- Atualizacao manual do aplicativo dentro do popup de opcoes, com dupla confirmacao.

### Offline e PWA

- Estado salvo em `localStorage`.
- Service Worker com cache do app shell.
- Manifesto PWA para instalação na tela inicial.
- Compatível com publicação estática no Cloudflare Pages.
- Wake Lock API para tentar manter a tela ligada durante o uso.

## Stack

- HTML5
- CSS3
- JavaScript vanilla
- Pointer Events API
- Local Storage API
- Screen Wake Lock API
- Service Worker API
- Cloudflare Pages

Não há framework, dependência externa ou etapa de build.

## Estrutura

```text
contador/
├── index.html       # Estrutura da aplicação
├── style.css        # Layout, responsividade e acessibilidade visual
├── app.js           # Contagem, gestos, histórico e persistência
├── manifest.json    # Configuração da PWA
├── sw.js            # Cache e funcionamento offline
├── _headers         # Headers do Cloudflare Pages na raiz publicada
├── public/_headers  # Versão para projetos que usam public como diretório publicado
└── README.md        # Documentação do projeto
```

## Como executar localmente

É necessário usar um servidor HTTP local para que o Service Worker funcione corretamente.

```bash
python3 -m http.server 4173
```

Depois, abra:

```text
http://localhost:4173
```

Para interromper o servidor, use `Ctrl+C`.

## Deploy no Cloudflare Pages

### Upload direto

1. Acesse o painel da Cloudflare.
2. Entre em **Workers & Pages**.
3. Clique em **Create application**.
4. Selecione **Pages** e depois **Upload assets**.
5. Envie a pasta do projeto.
6. Não configure comando de build.
7. Publique o projeto.

### Usando Git

1. Envie os arquivos para um repositório Git.
2. No Cloudflare Pages, escolha **Connect to Git**.
3. Selecione o repositório.
4. Deixe o comando de build vazio.
5. Use a raiz do projeto como diretório de publicação.
6. Salve e faça o deploy.

O Service Worker e os recursos de instalação da PWA funcionam corretamente em HTTPS, como no domínio publicado pelo Cloudflare Pages.

### Cache e atualizações

O controle de versão está no início de `app.js`:

```js
const APP_VERSION = '1.0.4';
const APP_VERSION_KEY = 'contacarga-app-version';
```

Quando `APP_VERSION` muda, o aplicativo:

1. Compara a versão salva no `localStorage`.
2. Remove caches antigos do Cache Storage.
3. Solicita atualização dos Service Workers registrados.
4. Recarrega a página automaticamente.

Os dados da contagem não são apagados nessa atualização. A limpeza manual fica no popup de **Opções**, em **Atualizar aplicativo**, e exige duas confirmações. Ela só é executada com internet disponível para evitar que o app fique sem o shell offline durante o recarregamento.

O Service Worker usa `skipWaiting()` e `clients.claim()` em `sw.js`, enquanto `app.js` chama `registration.update()` e reage a `controllerchange`.

Os arquivos `_headers` desabilitam o cache HTTP para `index.html`, `app.js`, `sw.js` e `manifest.json`. A cópia na raiz é necessária quando a raiz do projeto é publicada diretamente; `public/_headers` atende configurações que usam `public` como diretório de publicação.

## Decisões técnicas

### Interface em tela cheia

A atividade principal é contar rapidamente. Por isso, a superfície de contagem ocupa o viewport inteiro e os controles ficam abaixo dela, sem cobrir o número principal.

### Gestos globais

Os ponteiros são observados no documento para permitir contagem em toda a tela e reconhecer gestos mesmo fora do painel visual. Botões e campos de formulário são protegidos para não gerar contagens acidentais.

### Horário manual

O horário salvo é informado pelo operador porque o relógio do computador ou do celular pode não representar o horário da câmera ou da operação de carga.

### Persistência local

O `localStorage` foi escolhido por ser simples, nativo e suficiente para o volume de dados de uma conferência. A aplicação continua funcional sem backend e sem conexão.

### Sem dependências

HTML, CSS e JavaScript puros reduzem o tempo de carregamento, facilitam a manutenção e tornam o deploy em Cloudflare Pages direto.

## Acessibilidade e uso em campo

- Contraste elevado.
- Número grande e centralizado.
- `aria-live` para atualização da contagem.
- Botões com área de toque ampla.
- Suporte a modo escuro do sistema.
- Layout responsivo para retrato e paisagem.
- Feedback por vibração quando o dispositivo oferece suporte.

## Aprendizados

- Em interfaces de operação, reduzir etapas é mais importante do que adicionar recursos visuais.
- Gestos podem liberar espaço na tela, mas precisam de uma alternativa visível para acessibilidade e descoberta.
- Persistência local é suficiente para muitos fluxos de campo que não precisam de sincronização em tempo real.
- O horário da operação deve vir da fonte operacional correta, e não ser preenchido automaticamente pelo dispositivo.
- Service Workers exigem versionamento de cache para que atualizações cheguem aos usuários existentes.

## Possíveis evoluções

- Cadastro de placa do caminhão e identificação da carga.
- Exportação CSV com download direto.
- Histórico separado por operação.
- Sincronização opcional quando a internet voltar.
- Modo de conferência com dois operadores.
- Testes automatizados de gestos em dispositivos móveis reais.

## Post sugerido para LinkedIn

Criei o **ContaCarga**, uma PWA mobile-first para resolver um problema real de conferência de carga de caminhão.

Durante a contagem de sacos, o operador pode estar no sol, usando luvas, com apenas uma mão livre e sem conexão com a internet. Um contador comum não considera esse contexto.

A solução permite:

- Contar sacos com um toque em qualquer parte da tela.
- Usar pinça com dois dedos ou arrastar dois dedos para abrir as opções.
- Desfazer uma contagem acidental.
- Salvar paradas com contagem atual, soma acumulada e horário informado pela câmera.
- Consultar e copiar o histórico mesmo offline.
- Instalar o app na tela inicial do celular.

Tecnologias utilizadas: HTML, CSS, JavaScript vanilla, Pointer Events, Local Storage, Service Worker, PWA e Cloudflare Pages.

Esse projeto reforçou uma ideia importante: uma boa interface não começa pela tecnologia, começa entendendo as condições reais de uso.

#frontend #javascript #pwa #cloudflare #ux #mobilefirst #tecnologia
