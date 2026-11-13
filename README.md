# MicDesk — Gestão de microfones para eventos

App web (iPad, telemóvel e PC) para gerir microfones, pilhas e o alinhamento de oradores, com vários clientes e painel de administração. Tudo sincroniza em tempo real entre os dispositivos.

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
- **Ao vivo** (para o iPad na régie ou no palco): relógio, quem está em palco, o que vem a seguir e o que é preciso recolher a quem. Os botões Anterior/Próximo funcionam em todos os ecrãs ao mesmo tempo.
- **Clientes** (multi-empresa): cada cliente tem os seus eventos e utilizadores, que ficam isolados dos outros. Podes suspender um cliente ou mudar-lhe o limite de eventos.
- **Papéis**: Super admin (tu) · Administrador do cliente · Operador · Só leitura. **Só o super admin cria e gere utilizadores e clientes.**
- **Limite de eventos**: cada cliente pode ter até **5 eventos** (o super admin pode mudar o limite por cliente; 0 = sem limite). Quando chega ao limite aparece um aviso com a lista dos eventos, os passados em primeiro, para apagar.
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

1. Vai a **Clientes → + Novo cliente**. Podes criar logo o administrador desse cliente, e a app mostra as credenciais para lhe enviares.
2. O cliente entra, cria eventos e adiciona os operadores da equipa dele.

> O email e a password do admin só são usados **no primeiro arranque**. Depois disso, a password muda-se em *A minha conta*.
> Se deixares `ADMIN_PASSWORD` vazio, é gerada uma password aleatória, que aparece nos logs do container.

### Domínio + HTTPS (recomendado para clientes)

Põe a app atrás do proxy que já usas (Nginx Proxy Manager, Traefik ou Caddy) a apontar para a porta 3000, e depois muda `COOKIE_SECURE` para `"true"`.
O tempo real usa Server-Sent Events. No Nginx Proxy Manager funciona sem configuração; num nginx manual, junta `proxy_buffering off;` na location.

### Backups

Todos os dados estão num único ficheiro SQLite, no volume `micdesk_data` (`/data/micdesk.db`).

```bash
docker run --rm -v micdesk_data:/data -v $(pwd):/b alpine sh -c "cp /data/micdesk.db* /b/"
```

### Atualizar

Substitui os ficheiros e corre `docker compose up -d --build`. Se usaste a opção B, faz build da imagem outra vez e, na stack, carrega em **Update the stack**. Os dados ficam no volume e não se perdem.

## Instalar como app no iPad / iPhone

Abre o endereço no Safari, carrega em **Partilhar → Adicionar ao ecrã principal** e a app abre em ecrã inteiro, como uma app nativa.

## Variáveis de ambiente

| Variável | Por omissão | Para que serve |
|---|---|---|
| `PORT` | 3000 | Porta interna |
| `ADMIN_EMAIL` | admin@micdesk.local | Super admin criado no 1º arranque |
| `ADMIN_PASSWORD` | (aleatória) | Password do super admin no 1º arranque |
| `COOKIE_SECURE` | false | `true` quando a app estiver atrás de HTTPS |
| `SESSION_DAYS` | 30 | Dias até a sessão expirar |
| `DEFAULT_MAX_EVENTS` | 5 | Limite de eventos para novos clientes |
| `DATA_DIR` | /data | Pasta da base de dados |
