"""
Camera Test Console — backend
------------------------------
Aplicativo de teste para validar a conectividade de uma câmera IP:
  - 3 snapshots via HTTP
  - 1 vídeo de N segundos via RTSP (usando ffmpeg)
  - Log em tempo real das operações via WebSocket
  - Teste de estresse (rajada de snapshots simultânea ao vídeo)
  - Teste de longa duração (execuções contínuas salvas em disco)

Execução:
  uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""

import asyncio
import logging
import os
import subprocess
import sys
import time
import uuid
from collections import deque
from datetime import datetime
from pathlib import Path

import requests
from dotenv import load_dotenv, set_key
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from requests.auth import HTTPBasicAuth, HTTPDigestAuth

# No Windows, a política padrão de event loop às vezes não sabe iniciar
# subprocessos (o ffmpeg, no nosso caso) e lança um NotImplementedError sem
# mensagem nenhuma. Forçar o ProactorEventLoopPolicy resolve isso.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# --------------------------------------------------------------------------
# Configuração
# --------------------------------------------------------------------------
if getattr(sys, "frozen", False):
    APP_DIR = Path(sys.executable).resolve().parent
    BUNDLE_DIR = Path(sys._MEIPASS)
else:
    APP_DIR = Path(__file__).resolve().parent
    BUNDLE_DIR = Path(__file__).resolve().parent

load_dotenv(APP_DIR / ".env")

RTSP_URL = os.getenv("RTSP_URL", "")
SNAPSHOT_URL = os.getenv("SNAPSHOT_URL", "")
CAMERA_USER = os.getenv("CAMERA_USER", "")
CAMERA_PASS = os.getenv("CAMERA_PASS", "")
VIDEO_DURATION_SECONDS = os.getenv("VIDEO_DURATION_SECONDS", "5")
SNAPSHOT_DELAY_MS = int(os.getenv("SNAPSHOT_DELAY_MS", "300"))
STRESS_SNAPSHOTS_PER_SECOND = float(os.getenv("STRESS_SNAPSHOTS_PER_SECOND", "3"))
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")

BASE_DIR = APP_DIR
CAPTURES_DIR = APP_DIR / "captures"
CAPTURES_DIR.mkdir(exist_ok=True)

# Caminho do ffmpeg: usa o binário empacotado (bin/ffmpeg.exe) se existir,
# senão cai pra "ffmpeg" do PATH do sistema (comportamento de antes, útil em dev).
FFMPEG_BIN = BUNDLE_DIR / "bin" / "ffmpeg.exe"
FFMPEG_PATH = str(FFMPEG_BIN) if FFMPEG_BIN.exists() else "ffmpeg"

FRONTEND_DIST = BUNDLE_DIR / "frontend_dist"

def _build_rtsp_url(ip: str, port: int, path: str, user: str, password: str) -> str:
    """Monta a RTSP_URL a partir dos campos separados (IP, porta, caminho, credenciais)."""
    if not ip:
        return ""
    p = path if path.startswith("/") else f"/{path}"
    auth = f"{user}:{password}@" if user else ""
    return f"rtsp://{auth}{ip}:{port}{p}"


def _build_snapshot_url(ip: str, path: str, user: str, password: str) -> str:
    """Monta a SNAPSHOT_URL a partir dos campos separados.

    Mantém o formato que já funcionava para essa câmera
    (http://IP/GetSnapshot/1@usuario@senha) em vez de autenticação HTTP
    Basic/Digest padrão embutida na URL — é o formato específico desse
    modelo de câmera/NVR.
    """
    if not ip:
        return ""
    p = path if path.startswith("/") else f"/{path}"
    if user:
        return f"http://{ip}{p}@{user}@{password}"
    return f"http://{ip}{p}"


# Configuração da câmera, editável em runtime pela interface (tela
# "Configuração da câmera"). Começa com o que estiver no .env (campos novos
# CAMERA_IP/CAMERA_RTSP_PORT/CAMERA_RTSP_PATH/CAMERA_SNAPSHOT_PATH, ou os
# campos antigos RTSP_URL/SNAPSHOT_URL como fallback pra quem já tinha um
# .env configurado do jeito anterior).
camera_config = {
    "ip": os.getenv("CAMERA_IP", ""),
    "rtsp_port": int(os.getenv("CAMERA_RTSP_PORT", "554") or 554),
    "rtsp_path": os.getenv("CAMERA_RTSP_PATH", "/profile3"),
    "snapshot_path": os.getenv("CAMERA_SNAPSHOT_PATH", "/GetSnapshot/1"),
    "user": CAMERA_USER,
    "password": CAMERA_PASS,
}

if camera_config["ip"]:
    RTSP_URL = _build_rtsp_url(
        camera_config["ip"], camera_config["rtsp_port"], camera_config["rtsp_path"],
        camera_config["user"], camera_config["password"],
    )
    SNAPSHOT_URL = _build_snapshot_url(
        camera_config["ip"], camera_config["snapshot_path"],
        camera_config["user"], camera_config["password"],
    )
# se camera_config["ip"] estiver vazio, RTSP_URL/SNAPSHOT_URL continuam com
# o que veio direto do .env antigo (linhas acima) — comportamento anterior
# preservado até o usuário salvar a nova configuração pela interface.

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("camera-test")


def _looks_like_valid_jpeg(data: bytes, content_length_header: str | None) -> str | None:
    """Verifica se os bytes recebidos formam um JPEG completo.
    Retorna None se estiver ok, ou uma string descrevendo o problema."""
    if len(data) < 200:
        return f"resposta suspeitosamente pequena ({len(data)} bytes)"
    if data[:2] != b"\xff\xd8":
        return "arquivo não começa com o marcador JPEG (SOI) — provavelmente corrompido"
    if data[-2:] != b"\xff\xd9":
        return "arquivo não termina com o marcador JPEG (EOI) — imagem truncada"
    if content_length_header:
        try:
            expected = int(content_length_header)
            if expected != len(data):
                return f"tamanho recebido ({len(data)} bytes) difere do Content-Length declarado ({expected} bytes) — download truncado"
        except ValueError:
            pass
    return None


# Guarda qual estratégia de autenticação funcionou da última vez, para não
# precisar testar as 3 de novo a cada snapshot (importante no teste de
# estresse, onde velocidade importa).
_preferred_auth_label = None
_preferred_auth = None

# --------------------------------------------------------------------------
# Gerenciador de logs em tempo real (WebSocket)
# --------------------------------------------------------------------------
class LogManager:
    """Mantém um histórico curto de logs e distribui novas entradas para
    todos os clientes WebSocket conectados."""

    def __init__(self, history_size: int = 300):
        self.connections: list[WebSocket] = []
        self.history: deque[dict] = deque(maxlen=history_size)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.append(websocket)
        for entry in self.history:
            await websocket.send_json(entry)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.connections:
            self.connections.remove(websocket)

    async def broadcast(self, level: str, message: str):
        entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "level": level,  # info | success | warning | error
            "message": message,
        }
        self.history.append(entry)

        log_fn = {
            "error": logger.error,
            "warning": logger.warning,
        }.get(level, logger.info)
        log_fn(message)

        dead_connections = []
        for ws in self.connections:
            try:
                await ws.send_json(entry)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect(ws)

    def clear(self):
        self.history.clear()


log_manager = LogManager()

# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------
app = FastAPI(title="Camera Test Console API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(CAPTURES_DIR)), name="media")

# Nota: não há mais uma rota fixa "/" aqui de propósito — ela ficava na
# frente da rota coringa que serve o index.html do React (definida lá
# embaixo, perto do FRONTEND_DIST), fazendo "/" sempre devolver este JSON
# em vez da interface. Esse JSON informativo agora só existe como fallback
# quando frontend_dist não foi encontrado (ver bloco no final do arquivo).


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "rtsp_configured": bool(RTSP_URL),
        "snapshot_configured": bool(SNAPSHOT_URL),
    }


@app.get("/api/logs")
async def get_logs():
    """Histórico de logs (útil para debug fora do WebSocket)."""
    return list(log_manager.history)


@app.post("/api/logs/clear")
async def clear_logs():
    """Limpa o histórico de logs guardado no backend — sem isso, ao reconectar
    o WebSocket os logs antigos reapareceriam mesmo após 'limpar' no front."""
    log_manager.clear()
    return {"status": "cleared"}


@app.websocket("/ws/logs")
async def ws_logs(websocket: WebSocket):
    await log_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        log_manager.disconnect(websocket)


# --------------------------------------------------------------------------
# Captura de snapshots (HTTP)
# --------------------------------------------------------------------------
async def capture_snapshot(
    index: int,
    session_id: str,
    total: int = 3,
    quiet: bool = False,
    output_dir: Path | None = None,
) -> dict:
    """Captura um snapshot via HTTP.

    output_dir: se informado, salva nesse diretório em vez de CAPTURES_DIR
    (usado pelo teste de longa duração, que grava direto na pasta escolhida
    pelo usuário). Nesse caso a entrada retornada tem "path" (caminho local)
    em vez de "url" (rota /media, que só serve CAPTURES_DIR).
    """
    global _preferred_auth_label, _preferred_auth

    target_dir = output_dir or CAPTURES_DIR
    entry = {"index": index, "url": None, "path": None, "error": None}
    label_prefix = f"Snapshot {index}/{total}"

    if not SNAPSHOT_URL:
        entry["error"] = "Câmera não configurada — abra 'Configuração da câmera' e informe o IP"
        await log_manager.broadcast("error", f"{label_prefix}: {entry['error']}")
        return entry

    if not quiet:
        await log_manager.broadcast("info", f"Solicitando {label_prefix.lower()} via HTTP...")

    auth_attempts = [("sem autenticação extra", None)]
    if CAMERA_USER:
        auth_attempts.append(("HTTP Basic", HTTPBasicAuth(CAMERA_USER, CAMERA_PASS)))
        auth_attempts.append(("HTTP Digest", HTTPDigestAuth(CAMERA_USER, CAMERA_PASS)))

    if _preferred_auth_label:
        auth_attempts.sort(key=lambda item: item[0] != _preferred_auth_label)

    last_error = None
    for label, auth in auth_attempts:
        try:
            t0 = time.monotonic()
            response = await asyncio.to_thread(
                requests.get, SNAPSHOT_URL, timeout=10, auth=auth
            )
            elapsed_ms = (time.monotonic() - t0) * 1000

            if response.status_code == 401:
                last_error = f"HTTP 401 ({label})"
                continue

            response.raise_for_status()

            content_type = response.headers.get("content-type", "")
            if "image" not in content_type and len(response.content) < 500:
                raise ValueError(
                    f"resposta não parece ser uma imagem válida (content-type: {content_type or 'desconhecido'})"
                )

            integrity_issue = _looks_like_valid_jpeg(
                response.content, response.headers.get("content-length")
            )
            if integrity_issue:
                last_error = f"imagem corrompida/incompleta: {integrity_issue}"
                await log_manager.broadcast(
                    "warning", f"{label_prefix}: recebida mas {last_error} ({elapsed_ms:.0f} ms)"
                )
                continue

            target_dir.mkdir(parents=True, exist_ok=True)
            filename = f"snapshot_{session_id}_{index}.jpg"
            filepath = target_dir / filename
            filepath.write_bytes(response.content)

            _preferred_auth_label, _preferred_auth = label, auth

            entry["path"] = str(filepath)
            if target_dir == CAPTURES_DIR:
                entry["url"] = f"/media/{filename}"

            await log_manager.broadcast(
                "success",
                f"{label_prefix} recebido via {label} "
                f"({len(response.content) / 1024:.1f} KB, {elapsed_ms:.0f} ms)",
            )
            return entry

        except requests.exceptions.Timeout:
            last_error = "timeout ao aguardar resposta da câmera"
            break
        except requests.exceptions.ConnectionError as e:
            last_error = f"falha de conexão ({e.__class__.__name__})"
            break
        except requests.exceptions.HTTPError as e:
            last_error = f"câmera retornou erro HTTP: {e.response.status_code}"
            continue
        except Exception as e:
            last_error = str(e) or e.__class__.__name__
            continue

    entry["error"] = last_error or "falha desconhecida"
    await log_manager.broadcast("error", f"{label_prefix}: {entry['error']}")
    return entry


# --------------------------------------------------------------------------
# Captura de vídeo (RTSP via ffmpeg)
# --------------------------------------------------------------------------
async def capture_video(
    session_id: str,
    output_dir: Path | None = None,
    duration_seconds: float | None = None,
) -> dict:
    target_dir = output_dir or CAPTURES_DIR
    duration = duration_seconds if duration_seconds is not None else float(VIDEO_DURATION_SECONDS)

    entry = {"url": None, "path": None, "error": None}

    if not RTSP_URL:
        entry["error"] = "Câmera não configurada — abra 'Configuração da câmera' e informe o IP"
        await log_manager.broadcast("error", f"Vídeo RTSP: {entry['error']}")
        return entry

    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"video_{session_id}.mp4"
    filepath = target_dir / filename

    await log_manager.broadcast("info", "Conectando ao stream RTSP...")

    cmd = [
        FFMPEG_PATH,
        "-y",
        "-rtsp_transport", "tcp",
        "-i", RTSP_URL,
        "-t", str(duration),
        "-c:v", "copy",
        "-c:a", "aac",
        "-movflags", "+faststart",
        str(filepath),
    ]

    try:
        await log_manager.broadcast("info", f"Gravando {duration:g}s de vídeo...")

        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            timeout=max(30, duration + 25),
        )

        if result.returncode == 0 and filepath.exists() and filepath.stat().st_size > 1024:
            entry["path"] = str(filepath)
            if target_dir == CAPTURES_DIR:
                entry["url"] = f"/media/{filename}"
            size_kb = filepath.stat().st_size / 1024
            await log_manager.broadcast(
                "success", f"Vídeo RTSP capturado com sucesso ({size_kb:.1f} KB)"
            )
        else:
            stderr_text = result.stderr.decode(errors="ignore").strip()
            tail = stderr_text[-400:] if stderr_text else "ffmpeg não retornou detalhes"
            entry["error"] = f"ffmpeg falhou (código {result.returncode}): {tail}"
            await log_manager.broadcast("error", f"Vídeo RTSP: {entry['error']}")

    except subprocess.TimeoutExpired:
        entry["error"] = "timeout ao gravar vídeo — verifique o stream RTSP"
        await log_manager.broadcast("error", f"Vídeo RTSP: {entry['error']}")
    except FileNotFoundError:
        entry["error"] = (
            "ffmpeg não encontrado no sistema. Instale o ffmpeg e garanta que "
            "esteja no PATH (https://ffmpeg.org/download.html)"
        )
        await log_manager.broadcast("error", f"Vídeo RTSP: {entry['error']}")
    except Exception as e:
        entry["error"] = str(e) or f"{e.__class__.__name__} (sem mensagem detalhada)"
        await log_manager.broadcast("error", f"Vídeo RTSP: {entry['error']}")

    return entry


# --------------------------------------------------------------------------
# Configuração da câmera (IP, usuário, senha) — editável pela interface
# --------------------------------------------------------------------------
class CameraConfigIn(BaseModel):
    ip: str
    rtsp_port: int = 554
    rtsp_path: str = "/profile3"
    snapshot_path: str = "/GetSnapshot/1"
    user: str = ""
    password: str = ""


@app.get("/api/camera-config")
async def get_camera_config():
    """Retorna a configuração atual da câmera (usada para preencher o
    formulário na interface). Este é um utilitário de diagnóstico local,
    então a senha é retornada em texto puro mesmo — o mesmo nível de
    exposição que ela já tem hoje dentro do .env em disco."""
    return camera_config


@app.post("/api/camera-config")
async def set_camera_config(config: CameraConfigIn):
    """Atualiza IP/usuário/senha da câmera em runtime (sem reiniciar o
    backend) e persiste no .env para sobreviver a um restart."""
    global RTSP_URL, SNAPSHOT_URL, CAMERA_USER, CAMERA_PASS
    global _preferred_auth_label, _preferred_auth

    ip = config.ip.strip()
    if not ip:
        return {"error": "Informe o IP da câmera."}

    camera_config.update({
        "ip": ip,
        "rtsp_port": config.rtsp_port,
        "rtsp_path": (config.rtsp_path or "/profile3").strip(),
        "snapshot_path": (config.snapshot_path or "/GetSnapshot/1").strip(),
        "user": config.user.strip(),
        "password": config.password,
    })

    RTSP_URL = _build_rtsp_url(
        camera_config["ip"], camera_config["rtsp_port"], camera_config["rtsp_path"],
        camera_config["user"], camera_config["password"],
    )
    SNAPSHOT_URL = _build_snapshot_url(
        camera_config["ip"], camera_config["snapshot_path"],
        camera_config["user"], camera_config["password"],
    )
    CAMERA_USER = camera_config["user"]
    CAMERA_PASS = camera_config["password"]

    # IP/credenciais novos podem exigir uma estratégia de autenticação
    # diferente da que funcionou por último — reseta o cache.
    _preferred_auth_label = None
    _preferred_auth = None

    try:
        env_path = APP_DIR / ".env"
        if not env_path.exists():
            env_path.touch()
        set_key(str(env_path), "CAMERA_IP", camera_config["ip"])
        set_key(str(env_path), "CAMERA_RTSP_PORT", str(camera_config["rtsp_port"]))
        set_key(str(env_path), "CAMERA_RTSP_PATH", camera_config["rtsp_path"])
        set_key(str(env_path), "CAMERA_SNAPSHOT_PATH", camera_config["snapshot_path"])
        set_key(str(env_path), "CAMERA_USER", camera_config["user"])
        set_key(str(env_path), "CAMERA_PASS", camera_config["password"])
    except Exception as e:
        await log_manager.broadcast(
            "warning", f"Configuração aplicada, mas não foi possível salvar no .env: {e}"
        )

    await log_manager.broadcast("success", f"Configuração da câmera atualizada: {ip}")
    return {
        "status": "ok",
        "rtsp_url_preview": RTSP_URL,
        "snapshot_url_preview": SNAPSHOT_URL,
    }


# --------------------------------------------------------------------------
# Endpoint principal de captura
# --------------------------------------------------------------------------
@app.post("/api/capture")
async def capture():
    session_id = uuid.uuid4().hex[:8]
    await log_manager.broadcast("info", f"--- Nova sessão de captura ({session_id}) ---")

    snapshots = []
    for i in range(1, 4):
        if i > 1 and SNAPSHOT_DELAY_MS > 0:
            await asyncio.sleep(SNAPSHOT_DELAY_MS / 1000)
        snapshots.append(await capture_snapshot(i, session_id, total=3))

    video = await capture_video(session_id)

    ok_snapshots = sum(1 for s in snapshots if s["url"])
    await log_manager.broadcast(
        "info",
        f"Sessão {session_id} finalizada: {ok_snapshots}/3 snapshots, "
        f"vídeo {'ok' if video['url'] else 'falhou'}",
    )

    return {
        "session_id": session_id,
        "snapshots": snapshots,
        "video": video,
    }


# --------------------------------------------------------------------------
# Teste de estresse: N snapshots/segundo concorrentes com a gravação RTSP
# --------------------------------------------------------------------------
async def _snapshot_burst(session_id: str, rate_per_second: float, duration_seconds: float) -> list[dict]:
    total = max(1, round(rate_per_second * duration_seconds))
    interval = 1.0 / rate_per_second
    start = time.monotonic()
    results = []

    for i in range(1, total + 1):
        target = start + (i - 1) * interval
        now = time.monotonic()
        if target > now:
            await asyncio.sleep(target - now)
        results.append(
            await capture_snapshot(i, f"{session_id}stress", total=total, quiet=True)
        )

    return results


@app.post("/api/stress-test")
async def stress_test():
    session_id = uuid.uuid4().hex[:8]
    duration = float(VIDEO_DURATION_SECONDS)
    total_snapshots = max(1, round(STRESS_SNAPSHOTS_PER_SECOND * duration))

    await log_manager.broadcast(
        "info",
        f"=== Teste de estresse ({session_id}): {STRESS_SNAPSHOTS_PER_SECOND:g} snapshots/s "
        f"(~{total_snapshots} no total) simultâneos à gravação RTSP de {duration:g}s ===",
    )

    snapshots, video = await asyncio.gather(
        _snapshot_burst(session_id, STRESS_SNAPSHOTS_PER_SECOND, duration),
        capture_video(session_id),
    )

    ok = sum(1 for s in snapshots if s["url"])
    corrupted = sum(
        1 for s in snapshots if s["error"] and "corrompida" in (s["error"] or "")
    )
    await log_manager.broadcast(
        "info",
        f"=== Teste de estresse finalizado: {ok}/{len(snapshots)} snapshots ok "
        f"({corrupted} corrompidos/truncados), vídeo {'ok' if video['url'] else 'falhou'} ===",
    )

    return {
        "session_id": session_id,
        "snapshots": snapshots,
        "video": video,
        "stats": {
            "total": len(snapshots),
            "ok": ok,
            "corrupted": corrupted,
            "failed": len(snapshots) - ok,
        },
    }


# --------------------------------------------------------------------------
# Teste de longa duração: execuções contínuas salvas em disco
# --------------------------------------------------------------------------
class LongDurationConfig(BaseModel):
    directory: str
    video_duration_seconds: float = 5
    snapshot_interval_ms: int = 1000
    snapshots_per_run: int = 3


class LongDurationState:
    def __init__(self):
        self.running = False
        self.task: asyncio.Task | None = None
        self.current_run = 0
        self.directory: str | None = None
        self.config: dict | None = None
        self.last_run_summary: dict | None = None


long_duration_state = LongDurationState()


async def _long_duration_run_once(base_dir: Path, config: LongDurationConfig, run_index: int) -> dict:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = base_dir / f"run_{timestamp}_{run_index:04d}"
    run_dir.mkdir(parents=True, exist_ok=True)

    await log_manager.broadcast(
        "info", f"[Longa duração] Execução #{run_index}: salvando em {run_dir}"
    )

    interval_s = max(0.0, config.snapshot_interval_ms / 1000)

    async def snapshot_burst() -> list[dict]:
        results = []
        for i in range(1, config.snapshots_per_run + 1):
            results.append(
                await capture_snapshot(
                    i, f"run{run_index}", total=config.snapshots_per_run,
                    quiet=True, output_dir=run_dir,
                )
            )
            if i < config.snapshots_per_run and interval_s > 0:
                await asyncio.sleep(interval_s)
        return results

    snapshots, video = await asyncio.gather(
        snapshot_burst(),
        capture_video(
            f"run{run_index}", output_dir=run_dir,
            duration_seconds=config.video_duration_seconds,
        ),
    )

    ok = sum(1 for s in snapshots if s["path"])
    await log_manager.broadcast(
        "success" if video["path"] else "warning",
        f"[Longa duração] Execução #{run_index} finalizada: "
        f"{ok}/{config.snapshots_per_run} snapshots, vídeo {'ok' if video['path'] else 'falhou'}",
    )

    return {
        "run_index": run_index,
        "directory": str(run_dir),
        "snapshots": snapshots,
        "video": video,
    }


@app.post("/api/long-duration/start")
async def long_duration_start(config: LongDurationConfig):
    if long_duration_state.running:
        return {"error": "Já existe um teste de longa duração em andamento."}

    target_dir = Path(config.directory)
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return {"error": f"Não foi possível criar/acessar o diretório: {e}"}

    long_duration_state.running = True
    long_duration_state.current_run = 0
    long_duration_state.directory = str(target_dir)
    long_duration_state.config = config.dict()
    long_duration_state.last_run_summary = None

    async def loop():
        run_index = 0
        await log_manager.broadcast(
            "info", f"=== Teste de longa duração iniciado em {target_dir} ==="
        )
        try:
            while long_duration_state.running:
                run_index += 1
                long_duration_state.current_run = run_index
                summary = await _long_duration_run_once(target_dir, config, run_index)
                long_duration_state.last_run_summary = summary
        except asyncio.CancelledError:
            pass
        finally:
            long_duration_state.running = False
            await log_manager.broadcast("info", "=== Teste de longa duração encerrado ===")

    long_duration_state.task = asyncio.create_task(loop())
    return {"status": "started", "directory": str(target_dir)}


@app.post("/api/long-duration/stop")
async def long_duration_stop():
    if not long_duration_state.running:
        return {"status": "not_running"}
    # Sinaliza para o loop parar após a execução atual terminar (não corta
    # uma gravação de vídeo no meio, o que geraria um arquivo inválido).
    long_duration_state.running = False
    await log_manager.broadcast(
        "warning", "Parando teste de longa duração após a execução atual..."
    )
    return {"status": "stopping"}


@app.get("/api/long-duration/status")
async def long_duration_status():
    return {
        "running": long_duration_state.running,
        "current_run": long_duration_state.current_run,
        "directory": long_duration_state.directory,
        "last_run_summary": long_duration_state.last_run_summary,
    }


if FRONTEND_DIST.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(FRONTEND_DIST / "assets")),
        name="frontend-assets",
    )

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Rota curinga: só é alcançada se nenhuma rota de API/media/ws acima
        # já respondeu, então é seguro devolver sempre o index.html do React
        # (o React Router, se algum dia usarem, cuidaria do resto no cliente).
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    logger.warning(
        "Pasta frontend_dist não encontrada — rodando só a API, sem servir a interface web."
    )

    @app.get("/")
    async def root():
        return {
            "message": "Camera Test Console API está no ar, mas o build do frontend "
                        "(frontend_dist) não foi encontrado — rode 'npm run build' e "
                        "copie o resultado pra frontend_dist, ou rode o frontend "
                        "separadamente via 'npm run dev' em http://localhost:5173",
            "docs": "/docs",
            "health": "/api/health",
        }


if __name__ == "__main__":
    import uvicorn

    # Passa o objeto `app` diretamente (em vez da string "main:app").
    # A string faz o Uvicorn reimportar o módulo "main" em runtime, o que
    # funciona rodando via `python main.py` mas falha dentro do .exe
    # empacotado pelo PyInstaller — não existe um módulo "main" importável
    # por nome ali dentro, só o executável. reload=False já torna a string
    # desnecessária mesmo em dev (reload é o único motivo de usar string).
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)