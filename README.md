# Camera Test Console

Aplicativo de teste para validar a conectividade de uma câmera IP:

- **3 snapshots** via HTTP
- **1 vídeo de 5s** via RTSP (usando `ffmpeg`)
- **Log em tempo real** de todas as operações (WebSocket)
- Interface web (React + MUI) para visualizar tudo

```
camera-test-app/
├── backend/          FastAPI (Python)
│   ├── main.py
│   ├── requirements.txt
│   ├── .env          
│   └── captures/      onde as imagens/vídeos capturados ficam salvos
└── frontend/          React + Vite + Material UI
    └── src/
```

## Pré-requisitos

1. **Python 3.10+**
2. **Node.js 18+** (para o frontend)
3. **ffmpeg** instalado e no PATH — é ele quem grava o trecho de vídeo do RTSP.
   - Windows: baixe em https://www.gyan.dev/ffmpeg/builds/ (build "essentials"), extraia e
     adicione-o à pasta `bin` e ao PATH.
   - Verifique com: `ffmpeg -version`

## 1. Configuração

O arquivo `backend/.env.example.env` já vem preenchido com os dados de exemplo, configure de acordo com seu ambiente:

**Esse arquivo contém a senha da câmera em texto puro.** Não o suba para um
repositório público (o `.gitignore` já exclui `.env` por padrão). Se for
compartilhar o projeto com outra pessoa, use o `.env.example` como referência
e peça para ela preencher os próprios dados.

## 2. Rodando o backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

O backend sobe em `http://localhost:8000`. Endpoints principais:

| Método | Rota           | Descrição                                   |
|--------|----------------|----------------------------------------------|
| POST   | `/api/capture` | Dispara 3 snapshots + 1 vídeo RTSP           |
| GET    | `/api/logs`    | Histórico de logs (JSON)                     |
| WS     | `/ws/logs`     | Stream de logs em tempo real                  |
| GET    | `/media/...`   | Arquivos capturados (imagens/vídeo)          |

## 3. Rodando o frontend

Em outro terminal:

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`. O Vite já está configurado para redirecionar
`/api`, `/media` e `/ws` para o backend na porta 8000 — não precisa mexer em
CORS nem em URLs.

## 4. Usando

1. Clique em **"Capturar amostra"**.
2. Acompanhe o painel de log à direita — ele mostra cada snapshot sendo
   solicitado, a conexão RTSP sendo aberta, sucessos e falhas em tempo real.
3. Ao final, as 3 imagens e o vídeo aparecem na grade à esquerda, cada um
   emoldurado como um "viewfinder": borda âmbar durante a captura, verde se
   deu certo, vermelha se falhou (com a mensagem de erro).

### Teste de estresse

O botão **"Teste de estresse"** dispara vários snapshots por segundo
(configurável via `STRESS_SNAPSHOTS_PER_SECOND`, padrão 3/s) **ao mesmo
tempo** em que grava o vídeo RTSP — simula carga real contra a câmera para
revelar problemas que só aparecem sob rajada (ex: frames de snapshot
truncados/corrompidos porque o encoder da câmera ainda não liberou o buffer
do pedido anterior). Cada miniatura no resultado é colorida por status:
verde = ok, âmbar = imagem corrompida/truncada (detectada por checagem dos
marcadores JPEG e do `Content-Length`), vermelho = falha de rede/HTTP.
Clique numa miniatura para abrir a imagem em tamanho real.

## Troubleshooting

- **"ffmpeg não encontrado no sistema"** → instale o ffmpeg e confirme que
  `ffmpeg -version` funciona no mesmo terminal onde você roda o backend.
- **Timeout no vídeo RTSP** → confira se a máquina que roda o backend está na
  mesma rede que a câmera (`10.54.8.106`) e se a porta 554 não está bloqueada
  por firewall.
- **Snapshot retorna erro HTTP 401/403** → geralmente é usuário/senha errados
  na `SNAPSHOT_URL` do `.env`.
- **WebSocket "DESCONECTADO"** → confirme que o backend está rodando na porta
  8000; o frontend tenta reconectar automaticamente a cada 2s.
- Se quiser trocar a duração do vídeo, edite `VIDEO_DURATION_SECONDS` no
  `.env` e reinicie o backend.

## Sobre as escolhas técnicas

- **Snapshots**: feitos com `requests` (síncrono, rodando em thread separada
  via `asyncio.to_thread`) para não travar o servidor.
- **Vídeo RTSP**: capturado via `ffmpeg -rtsp_transport tcp -i <RTSP_URL> -t 5
  -c:v copy -c:a aac`. O vídeo é copiado direto do stream (rápido, sem perda
  de qualidade); o áudio é reencodado para AAC porque o contêiner `.mp4` não
  aceita alguns codecs de câmera (ex: `pcm_alaw`) via cópia direta.
  `-rtsp_transport tcp` evita perda de pacotes comum em UDP atrás de
  NAT/firewall. Se sua câmera não tiver áudio, ou você preferir descartá-lo,
  troque `-c:a aac` por `-an` no `backend/main.py`.
- **Logs em tempo real**: um `LogManager` guarda um histórico em memória e
  transmite cada evento via WebSocket para todos os clientes conectados.
