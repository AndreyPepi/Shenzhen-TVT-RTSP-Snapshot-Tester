import { useEffect, useRef, useState, useCallback } from 'react'
import { Box, Container, Typography, Button, Chip, CircularProgress } from '@mui/material'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined'
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined'
import MediaGallery from './components/MediaGallery.jsx'
import LogConsole from './components/LogConsole.jsx'
import StressPanel from './components/StressPanel.jsx'
import CameraConfigPanel from './components/CameraConfigPanel.jsx'
import LongDurationPanel from './components/LongDurationPanel.jsx'
import { statusColors } from './theme.js'

const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/logs`

export default function App() {
  const [logs, setLogs] = useState([])
  const [wsConnected, setWsConnected] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [result, setResult] = useState(null)
  const [stressing, setStressing] = useState(false)
  const [stressResult, setStressResult] = useState(null)

  const [longRunning, setLongRunning] = useState(false)
  const [longCurrentRun, setLongCurrentRun] = useState(0)
  const [longLastSummary, setLongLastSummary] = useState(null)

  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const statusPollTimer = useRef(null)

  const connectWs = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => setWsConnected(true)
    ws.onclose = () => {
      setWsConnected(false)
      if (wsRef.current === ws) {
        reconnectTimer.current = setTimeout(connectWs, 2000)
      }
    }
    ws.onerror = () => ws.close()
    ws.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data)
        setLogs((prev) => [...prev, entry])
      } catch {
        // ignora mensagens malformadas
      }
    }
  }, [])

  useEffect(() => {
    connectWs()
    return () => {
      clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connectWs])

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/long-duration/status')
        const data = await res.json()
        setLongRunning(data.running)
        setLongCurrentRun(data.current_run)
        setLongLastSummary(data.last_run_summary)
      } catch {
        // ignora falha pontual de polling
      }
    }
    if (longRunning) {
      poll()
      statusPollTimer.current = setInterval(poll, 2000)
    }
    return () => clearInterval(statusPollTimer.current)
  }, [longRunning])

  const pushLocalError = (message) => {
    setLogs((prev) => [
      ...prev,
      { timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false }), level: 'error', message },
    ])
  }

  const handleCapture = async () => {
    setCapturing(true)
    setResult(null)
    try {
      const res = await fetch('/api/capture', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      pushLocalError(`Falha ao chamar o backend: ${err.message}. Verifique se o servidor FastAPI está rodando na porta 8000.`)
    } finally {
      setCapturing(false)
    }
  }

  const handleStressTest = async () => {
    setStressing(true)
    setStressResult(null)
    try {
      const res = await fetch('/api/stress-test', { method: 'POST' })
      const data = await res.json()
      setStressResult(data)
    } catch (err) {
      pushLocalError(`Falha ao chamar o backend: ${err.message}.`)
    } finally {
      setStressing(false)
    }
  }

  const handleLongDurationStart = async (config) => {
    try {
      const res = await fetch('/api/long-duration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (data.error) {
        pushLocalError(data.error)
        return
      }
      setLongRunning(true)
    } catch (err) {
      pushLocalError(`Falha ao iniciar teste de longa duração: ${err.message}`)
    }
  }

  const handleLongDurationStop = async () => {
    try {
      await fetch('/api/long-duration/stop', { method: 'POST' })
    } catch (err) {
      pushLocalError(`Falha ao parar teste de longa duração: ${err.message}`)
    }
  }

  const handleClearLogs = async () => {
    setLogs([])
    try {
      await fetch('/api/logs/clear', { method: 'POST' })
    } catch {
      // se o backend não responder, ao menos o front já limpou localmente
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', pb: 6 }}>
      <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <CameraAltOutlinedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600 }}>
              CAMERA TEST CONSOLE
            </Typography>
          </Box>
          <Chip
            size="small"
            label={wsConnected ? 'SISTEMA ONLINE' : 'SISTEMA OFFLINE'}
            sx={{
              fontWeight: 600,
              bgcolor: 'transparent',
              border: '1px solid',
              borderColor: wsConnected ? statusColors.success : statusColors.error,
              color: wsConnected ? statusColors.success : statusColors.error,
            }}
          />
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ mb: 4 }}>
          <CameraConfigPanel />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 4 }}>
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Ao clicar, o sistema solicita 3 snapshots via HTTP e grava 5s de vídeo via RTSP.
            </Typography>
            {result?.session_id && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'IBM Plex Mono, monospace' }}>
                sessão #{result.session_id}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="large"
              disabled={capturing}
              onClick={handleCapture}
              startIcon={capturing ? <CircularProgress size={18} color="inherit" /> : <PlayCircleOutlineIcon />}
              sx={{ px: 3, fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.03em' }}
            >
              {capturing ? 'CAPTURANDO...' : 'CAPTURAR AMOSTRA'}
            </Button>
            <Button
              variant="outlined"
              size="large"
              disabled={stressing}
              onClick={handleStressTest}
              startIcon={stressing ? <CircularProgress size={18} color="inherit" /> : <BoltOutlinedIcon />}
              sx={{
                px: 3,
                fontFamily: 'IBM Plex Mono, monospace',
                letterSpacing: '0.03em',
                borderColor: statusColors.warning,
                color: statusColors.warning,
                '&:hover': { borderColor: statusColors.warning, bgcolor: 'rgba(255,176,32,0.08)' },
              }}
            >
              {stressing ? 'RAJADA EM ANDAMENTO...' : 'TESTE DE ESTRESSE'}
            </Button>
          </Box>
        </Box>

        {(stressResult || stressing) && (
          <Box sx={{ mb: 3 }}>
            <StressPanel running={stressing} result={stressResult} />
          </Box>
        )}

        <Box sx={{ mb: 4 }}>
          <LongDurationPanel
            running={longRunning}
            currentRun={longCurrentRun}
            lastRunSummary={longLastSummary}
            onStart={handleLongDurationStart}
            onStop={handleLongDurationStop}
          />
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1.4fr 1fr' },
            gap: 3,
            alignItems: 'start',
          }}
        >
          <MediaGallery snapshots={result?.snapshots} video={result?.video} capturing={capturing} />

          <Box sx={{ height: { xs: 360, md: 520 } }}>
            <LogConsole logs={logs} connected={wsConnected} onClear={handleClearLogs} />
          </Box>
        </Box>
      </Container>
    </Box>
  )
}