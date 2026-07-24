import { useEffect, useState } from 'react'
import { Box, Typography, TextField, Button, Grid, Collapse, Chip } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SaveIcon from '@mui/icons-material/Save'
import { statusColors } from '../theme.js'

export default function CameraConfigPanel({ onSaved }) {
  const [ip, setIp] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [rtspPort, setRtspPort] = useState(554)
  const [rtspPath, setRtspPath] = useState('/profile3')
  const [snapshotPath, setSnapshotPath] = useState('/GetSnapshot/1')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState(false)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/camera-config')
      .then((res) => res.json())
      .then((data) => {
        if (data?.ip) {
          setIp(data.ip)
          setUser(data.user || '')
          setPassword(data.password || '')
          setRtspPort(data.rtsp_port ?? 554)
          setRtspPath(data.rtsp_path || '/profile3')
          setSnapshotPath(data.snapshot_path || '/GetSnapshot/1')
          setConfigured(true)
        }
      })
      .catch(() => {
        // se o backend não responder aqui, o formulário só fica em branco
      })
  }, [])

  const handleSave = async () => {
    setError('')
    if (!ip.trim()) {
      setError('Informe o IP da câmera.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/camera-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: ip.trim(),
          rtsp_port: Number(rtspPort) || 554,
          rtsp_path: rtspPath.trim() || '/profile3',
          snapshot_path: snapshotPath.trim() || '/GetSnapshot/1',
          user: user.trim(),
          password,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
        return
      }
      setConfigured(true)
      onSaved?.(data)
    } catch (err) {
      setError(`Falha ao salvar: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography
          variant="caption"
          sx={{ fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.06em', color: 'text.secondary' }}
        >
          CONFIGURAÇÃO DA CÂMERA
        </Typography>
        <Chip
          size="small"
          label={configured ? 'CONFIGURADA' : 'NÃO CONFIGURADA'}
          sx={{
            bgcolor: 'transparent',
            border: '1px solid',
            borderColor: configured ? statusColors.success : statusColors.warning,
            color: configured ? statusColors.success : statusColors.warning,
          }}
        />
      </Box>

      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={5}>
          <TextField
            label="IP da câmera"
            placeholder="10.54.8.106"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            fullWidth
            size="small"
          />
        </Grid>
        <Grid item xs={6} sm={3.5}>
          <TextField
            label="Usuário"
            placeholder="admin"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            fullWidth
            size="small"
          />
        </Grid>
        <Grid item xs={6} sm={3.5}>
          <TextField
            label="Senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            size="small"
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 1 }}>
        <Button
          size="small"
          onClick={() => setShowAdvanced((v) => !v)}
          endIcon={
            <ExpandMoreIcon
              sx={{ transform: showAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            />
          }
          sx={{ color: 'text.secondary', fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.72rem' }}
        >
          AVANÇADO
        </Button>
        <Collapse in={showAdvanced}>
          <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
            <Grid item xs={4}>
              <TextField
                label="Porta RTSP"
                type="number"
                value={rtspPort}
                onChange={(e) => setRtspPort(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Caminho RTSP"
                placeholder="/profile3"
                value={rtspPath}
                onChange={(e) => setRtspPath(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Caminho do snapshot"
                placeholder="/GetSnapshot/1"
                value={snapshotPath}
                onChange={(e) => setSnapshotPath(e.target.value)}
                fullWidth
                size="small"
              />
            </Grid>
          </Grid>
        </Collapse>
      </Box>

      {error && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: statusColors.error }}>
          {error}
        </Typography>
      )}

      <Box sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<SaveIcon fontSize="small" />}
          onClick={handleSave}
          disabled={saving}
          sx={{ fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.03em' }}
        >
          {saving ? 'SALVANDO...' : 'SALVAR CONFIGURAÇÃO'}
        </Button>
      </Box>
    </Box>
  )
}
