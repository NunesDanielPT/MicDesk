# MicDesk — Gestão de microfones para eventos

App web (iPad, telemóvel e PC) para gerir microfones, pilhas e o alinhamento de oradores, com várias contas de utilizador e painel de administração. Tudo sincroniza em tempo real entre os dispositivos.

## O que faz

- **Micros**: nome/número, tipo (mão, lapela, headset, instrumento, púlpito, ambiente), cor, pessoa dedicada, canal da mesa, frequência, estado (ok / reserva / avaria / fora de serviço).
- **Pilhas**: Cheia · 2 traços · 1 traço · Vazia, com um toque. Botão "Pilhas novas" e histórico (quem mudou e quando).
- **Alinhamento**: blocos por hora. Cada bloco pode ter vários oradores (um painel), cada um com o seu micro. Também há intervalos.
  - Avisos automáticos: micro repetido no mesmo bloco, troca de micro entre oradores ("vem de X"), pilhas baixas, micro avariado.
  - O púlpito e os micros de ambiente podem ser partilhados sem dar aviso.
  - **Importar da folha**: copia as colunas Hora | Orador | Micro do Excel ou do Google Sheets e cola-as. Os micros que faltarem são criados.
  - Imprimir: gera uma tabela igual à tua folha.
- **ON AIR**: o bloco que está a acontecer fica com moldura vermelha e o selo **ON AIR**. Em *Evento → Passagem para ON AIR* escolhes o modo:
  - **Perguntar** (o modo por omissão): quando chega a hora do bloco seguinte aparece um aviso a pedir autorização para o pôr no ar.
  - **Automático**: o bloco seguinte passa para o ar sozinho à hora marcada.
  - **Manual**: o bloco só muda quando alguém carrega em **● Pôr no ar**.
  Em qualquer um dos modos podes pôr um bloco no ar ou tirá-lo à mão.
- **Cronómetro ON AIR**: no Ao vivo aparece, para o bloco no ar:
  - há quanto tempo está no ar;
  - a contagem decrescente até à hora de fim, que é a hora fim do bloco ou o início do bloco seguinte. Fica verde, depois amarela nos últimos 2 minutos e vermelha com **+mm:ss** quando passa do tempo;
  - se o bloco entrou atrasado ou adiantado, e quantos minutos de atraso o próximo bloco já leva.
  - O botão **⛶ Ecrã de palco** mostra o countdown em ecrã inteiro, para um monitor de palco ou um iPad virado para o orador.
  - Todos os aparelhos usam o relógio do servidor, por isso mostram o mesmo tempo.
- **Ecrã e experiência** (menu → 🖥 Ecrã e experiência): a grelha do Ao vivo ajusta-se ao ecrã.
  - Predefinições da app: Automático, PC/régie, iPad, Telemóvel, Palco/letra grande e Visão total.
  - Também podes ajustar à mão o tamanho dos nomes, a **largura dos blocos**, o espaçamento e quantos blocos aparecem antes e depois, com pré-visualização ao vivo.
  - As tuas próprias predefinições ficam guardadas na tua conta, para usares em todos os aparelhos. A escolha ativa é guardada em cada aparelho.
  - No Ao vivo há atalhos **A− / A+** (tamanho dos nomes), **◂▸ − / ◂ ▸ +** (largura dos blocos) e **⤢ Ajustar ao ecrã**.
- **Arrastar micros**: na página Micros, usa a pega ⠿ para arrastar um cartão e mudar a ordem. Funciona com rato e com toque.
- **📚 Catálogo de mesas** (Mesa → Escolher mesa): escolhes a marca, o modelo e a versão, e a matriz é criada com as saídas da mesa (mains, buses e matrizes) e a capacidade de canais. Se usares um canal acima da capacidade, aparece um aviso.
  - Behringer: WING, X32, XR18
  - Midas: M32, MR18
  - Yamaha: DM7, DM3, CL, QL, TF
  - Allen & Heath: SQ, Avantis, dLive
  - DiGiCo: S21, SD12, Quantum 225
  - Soundcraft: Ui24R
- **🔌 Integrações com bases de micros (beta, só super admin)**: lê o nome do canal, a frequência e a bateria diretamente das bases de micros sem fios pela rede.
  - **Shure** ULX-D, QLX-D, SLX-D e Axient Digital (TCP 2202).
  - **Sennheiser SSC** EW-DX, Digital 6000 e SpeechLine (UDP 45, experimental).
  - **Modo de teste** com comandos TCP/UDP em bruto, para as outras marcas.
  - Cada canal pode ficar ligado a um micro de um evento. Com "auto 30 s", a bateria e a frequência atualizam-se sozinhas e as alterações ficam no histórico.
  - O servidor MicDesk tem de estar na mesma rede que as bases.
- **Mesa (matriz de áudio)**: guarda o modelo da mesa, os canais e as saídas, e a matriz que diz que canal vai para que saída.
  - Cada canal tem número, nome, micro ligado, entrada física ou stagebox e 48V.
  - As saídas são, por exemplo, PA, monitores, gravação e streaming.
  - Para ligar ou desligar um canal numa saída, toca na célula.
  - "Canais a partir dos micros" cria um canal por micro, já ligado à PA.
  - A matriz também se imprime.
- **Ao vivo** (grelha para o iPad na régie ou no palco): as linhas são os micros e as colunas são os 2 blocos anteriores, o bloco ON AIR (a vermelho) e os seguintes.
  - Cada célula diz quem tem aquele micro naquele bloco.
  - **↺ de X** indica que o micro muda de pessoa; **recolher de X** indica que é preciso tirá-lo a quem está no ar agora.
  - No topo aparecem o relógio, o bloco no ar, o seguinte, o número de trocas e as pilhas fracas.
- **Micado / Por micar**: cada orador com micro tem um botão para marcar quando já tem o micro posto.
  - O cabeçalho do bloco mostra quantos já estão micados (ex.: "1/6 micados").
  - As grelhas mostram "🎙 micado" ou "por micar".
  - No Ao vivo aparece quantas pessoas do próximo bloco ainda faltam micar. Tocar numa célula fora da coluna ON AIR marca essa pessoa como micada.
  - Ao marcar alguém como micado (ou por micar), a mesma pessoa com o **mesmo micro** nos blocos seguintes muda também automaticamente.
  - Se mudares o micro de um orador, ele volta a "por micar". O púlpito e os micros de ambiente não usam este estado.
  - Fica tudo registado no histórico: "Rui micou Ana Branquinho (micro 4)".
- **Grelha de micros no Alinhamento**: mostra o evento inteiro de uma vez. Para dar um micro a alguém nesse bloco, toca numa célula vazia.
  - Ao escolher o micro para um orador, cada opção diz se o micro está livre ou quem o teve nos 2 blocos anteriores.
- **Criar ou editar um bloco com previsão**: ao escrever os oradores e escolher os micros, aparece por baixo de cada um se o micro está ✓ livre, se é preciso ↺ **recolher de** alguém (e de que bloco) ou se está repetido. Há também uma grelha com os 3 blocos anteriores, o bloco novo e o seguinte. Ao editar um bloco, também se mudam, juntam ou tiram oradores.
- **Página principal e contas**: a página inicial apresenta a app e tem **Entrar** e **Criar conta**. Qualquer pessoa pode criar conta com o email. O super admin pode fechar os registos em *Utilizadores*, e também criar contas à mão.
- **Equipa do evento**: em *Evento → Equipa do evento*, o dono do evento adiciona colegas pelo email.
  - Os colegas veem e editam o evento em tempo real.
  - Só o dono pode apagar o evento e gerir a equipa.
  - Se o colega ainda não tem conta, fica com um convite pendente. Quando criar conta com esse email, o evento aparece-lhe automaticamente.
  - O botão "Copiar mensagem de convite" prepara o texto para mandar por WhatsApp ou email.
- **Histórico e notificações**: todas as alterações ficam registadas com o nome de quem as fez, a hora e o que mudou. Por exemplo: *"Ana mudou as pilhas do micro 3: cheia → 1 traço"*, *"Rui pôs ON AIR o bloco 15:55"*, *"Pedro mudou o micro de Ana Branquinho (14:00): Head → 4"*.
  - O separador **Histórico** de cada evento mostra tudo, agrupado por dia. Dá para filtrar por pessoa e pesquisar.
  - Quando um colega altera alguma coisa, aparece uma notificação no canto do ecrã.
  - Com "🔔 Ativar notificações", o aviso chega também quando a app está em segundo plano. No iPhone e no iPad, isto só funciona com a app instalada no ecrã principal.
- **Privacidade**: cada utilizador vê os seus eventos e os que foram partilhados com ele. O super admin vê todos.
- **Limite de eventos**: cada utilizador pode ter até **5 eventos** (o super admin muda o limite por utilizador; 0 = sem limite). Ao chegar ao limite aparece um aviso com a lista dos eventos, passados primeiro, para apagar.
- **Criar evento**: só o nome é obrigatório; data, local, modo ON AIR e micros base estão em *Mais opções*.
- Duplicar eventos (para reutilizar micros e alinhamento) e arquivar.

## Instalar no Ubuntu com Portainer

**Requisitos:** Docker e Portainer já instalados. Não precisa de mais nada, porque a app não tem dependências externas e usa SQLite.

### Opção A: pela linha de comandos (a mais simples)

```bash
# 1. copiar o zip para o servidor e descompactar
scp micdesk.zip utilizador@servidor:/opt/
ssh utilizador@servidor
cd /opt && sudo unzip micdesk.zip -d micdesk && cd micdesk

# 2. editar o email e a password do admin
sudo nano docker-compose.yml

# 3. construir e arrancar
sudo docker compose up -d --build
```

O container aparece no Portainer como `micdesk` e podes geri-lo a partir daí (logs, reiniciar, etc.).

### Opção B: tudo pelo Portainer

1. No servidor, descompacta o zip em `/opt/micdesk` e corre `cd /opt/micdesk && sudo docker build -t micdesk:latest .`
   (em alternativa, no Portainer: **Images → Build a new image → Upload**, envia o `micdesk.tar.gz` (o zip convertido) e dá-lhe o nome `micdesk:latest`.)
2. No Portainer, vai a **Stacks → Add stack → Web editor**, cola o conteúdo de `portainer-stack.yml`, muda o email e a password e carrega em **Deploy the stack**.

### Primeiro acesso

Abre `http://IP-DO-SERVIDOR:3000` e entra com o `ADMIN_EMAIL` e a `ADMIN_PASSWORD` que definiste.

1. Vai a **Utilizadores → + Utilizador** e cria uma conta para cada colega. A app mostra as credenciais para lhe enviares.
2. Cada colega entra, cria os seus eventos (só o nome é obrigatório) e gere micros e alinhamento.

> O email e a password do admin só são usados **no primeiro arranque**. Depois disso, a password muda-se em *A minha conta*.
> Se deixares `ADMIN_PASSWORD` vazio, é gerada uma password aleatória, que aparece nos logs do container.

### Domínio + HTTPS (recomendado)

Põe a app atrás do proxy que já usas (Nginx Proxy Manager, Traefik ou Caddy) a apontar para a porta 3000, e depois muda `COOKIE_SECURE` para `"true"`.
O tempo real usa Server-Sent Events. No Nginx Proxy Manager funciona sem configuração; num nginx manual, junta `proxy_buffering off;` na location.

### Backups

Todos os dados estão num único ficheiro SQLite, no volume `micdesk_data` (`/data/micdesk.db`).

```bash
docker run --rm -v micdesk_data:/data -v $(pwd):/b alpine sh -c "cp /data/micdesk.db* /b/"
```

### Atualizar

Substitui os ficheiros e corre `docker compose up -d --build`. Se usaste a opção B, faz build da imagem outra vez e, na stack, carrega em **Update the stack**. Os dados ficam no volume e não se perdem.

## Instalar a app nos aparelhos (iPhone, iPad, Android, Windows, Mac)

A MicDesk é uma app web instalável (PWA). Fica com ícone próprio, abre em ecrã inteiro ou em janela própria e é sempre a versão mais recente do servidor. Não há lojas de apps nem ficheiros para instalar.

> ⚠ **É obrigatório HTTPS.** Os aparelhos só deixam instalar se o site for aberto com `https://` (por exemplo através do Nginx Proxy Manager com um certificado Let's Encrypt). Com `http://IP:3000` a app funciona no browser, mas não se instala.

Na app há o botão **📲 Instalar app**: aparece no ecrã de login, no aviso da página de eventos e no menu do utilizador. Mostra os passos certos para o aparelho que está a ser usado.

| Aparelho | Como instalar |
|---|---|
| **iPhone / iPad** | No Safari: botão Partilhar → **Adicionar ao ecrã principal** |
| **Android** | No Chrome: botão **Instalar** da app, ou menu ⋮ → **Instalar aplicação** |
| **Windows** | No Edge ou no Chrome: botão **Instalar**, ou o ícone ⊕ na barra de endereço. A app fica no menu Iniciar |
| **Mac** | No Safari: **Ficheiro → Adicionar à Dock**. No Chrome ou no Edge: botão **Instalar** |

## Variáveis de ambiente

| Variável | Por omissão | Para que serve |
|---|---|---|
| `PORT` | 3000 | Porta interna |
| `ADMIN_EMAIL` | admin@micdesk.local | Super admin criado no 1º arranque |
| `ADMIN_PASSWORD` | (aleatória) | Password do super admin no 1º arranque |
| `COOKIE_SECURE` | false | `true` quando a app estiver atrás de HTTPS |
| `SESSION_DAYS` | 30 | Dias até a sessão expirar |
| `ALLOW_SIGNUP` | true | `false` fecha o registo de contas no primeiro arranque. Depois disso, muda-se no painel |
| `DEFAULT_MAX_EVENTS` | 5 | Limite de eventos para novos utilizadores |
| `DATA_DIR` | /data | Pasta da base de dados |
