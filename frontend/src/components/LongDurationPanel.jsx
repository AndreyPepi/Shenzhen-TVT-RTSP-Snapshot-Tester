import { useState } from 'react'
import { Box, Typography, TextField, Button, Chip, Grid } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import { tokens } from '../theme.js'

export default function LongDurationPanel({ running, currentRun, lastRunSummary, onStart, onStop }) {
  const [directory, setDirectory] = useState('C:\\diretorio')
  const [videoDuration, setVideoDuration] = useState(5)
  const [snapshotInterval, setSnapshotInterval] = useState(1000)
  const [snapshotsPerRun, setSnapshotsPerRun] = useState(3)

  const handleStart = () => {
    onStart({
      directory,
      video_duration_seconds: Number(videoDuration),
      snapshot_interval_ms: Number(snapshotInterval),
      snapshots_per_run: Number(snapshotsPerRun),
    })
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
          TESTE DE LONGA DURAÇÃO
        </Typography>
        <Chip
          size="small"
          label={running ? `EM ANDAMENTO — EXECUÇÃO #${currentRun}` : 'PARADO'}
          sx={{
            bgcolor: 'transparent',
            border: '1px solid',
            borderColor: running ? tokens.accent : 'text.secondary',
            color: running ? tokens.accent : 'text.secondary',
          }}
        />
      </Box>

      <Grid container spacing={1.5}>
        <Grid item xs={12}>
          <TextField
            label="Diretório de destino"
            placeholder="C:\diretorio"
            value={directory}
            onChange={(e) => setDirectory(e.target.value)}
            fullWidth
            size="small"
            disabled={running}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="Duração do vídeo (s)"
            type="number"
            value={videoDuration}
            onChange={(e) => setVideoDuration(e.target.value)}
            fullWidth
            size="small"
            disabled={running}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="Intervalo entre snapshots (ms)"
            type="number"
            value={snapshotInterval}
            onChange={(e) => setSnapshotInterval(e.target.value)}
            fullWidth
            size="small"
            disabled={running}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            label="Snapshots por execução"
            type="number"
            value={snapshotsPerRun}
            onChange={(e) => setSnapshotsPerRun(e.target.value)}
            fullWidth
            size="small"
            disabled={running}
          />
        </Grid>
      </Grid>

      <Box sx={{ mt: 2, display: 'flex', gap: 1.5 }}>
        {!running ? (
          <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={handleStart}>
            INICIAR TESTE DE LONGA DURAÇÃO
          </Button>
        ) : (
          <Button variant="outlined" color="error" startIcon={<StopIcon />} onClick={onStop}>
            PARAR (após execução atual)
          </Button>
        )}
      </Box>

      {lastRunSummary && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: 'text.secondary', fontFamily: 'IBM Plex Mono, monospace' }}>
          Última execução (#{lastRunSummary.run_index}): salva em {lastRunSummary.directory}
        </Typography>
      )}
    </Box>
  )
}