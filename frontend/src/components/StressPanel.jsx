import { useMemo, useState } from 'react'
import { Box, Typography, Chip, LinearProgress } from '@mui/material'
import { statusColors } from '../theme.js'
import Lightbox from './Lightbox.jsx'

function Thumb({ item, onClick }) {
  const isCorrupted = item.error && item.error.includes('corrompida')
  const status = item.url ? 'ok' : isCorrupted ? 'corrupted' : 'error'
  const borderColor =
    status === 'ok' ? statusColors.success : status === 'corrupted' ? statusColors.warning : statusColors.error

  return (
    <Box
      onClick={item.url ? onClick : undefined}
      sx={{
        width: 64,
        height: 48,
        borderRadius: '3px',
        border: '2px solid',
        borderColor,
        overflow: 'hidden',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: item.url ? 'pointer' : 'default',
      }}
      title={item.error ? `#${item.index}: ${item.error}` : `#${item.index}: ok`}
    >
      {item.url ? (
        <Box component="img" src={item.url} alt={`snapshot ${item.index}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <Typography sx={{ fontSize: '0.6rem', color: borderColor, fontFamily: 'IBM Plex Mono, monospace' }}>
          {status === 'corrupted' ? '⚠' : '×'}
        </Typography>
      )}
    </Box>
  )
}

export default function StressPanel({ running, result }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const snapshots = result?.snapshots || []
  const stats = result?.stats

  const lightboxItems = useMemo(() => {
    const items = snapshots
      .filter((s) => s.url)
      .map((s) => ({ src: s.url, label: `SNAPSHOT #${s.index}`, kind: 'image' }))
    if (result?.video?.url) items.push({ src: result.video.url, label: 'VÍDEO RTSP', kind: 'video' })
    return items
  }, [snapshots, result])

  const openLightboxFor = (src) => {
    const idx = lightboxItems.findIndex((it) => it.src === src)
    if (idx >= 0) setLightboxIndex(idx)
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
          TESTE DE ESTRESSE — SNAPSHOTS EM RAJADA DURANTE O VÍDEO
        </Typography>
        {stats && (
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            <Chip size="small" label={`${stats.ok} OK`} sx={{ borderColor: statusColors.success, color: statusColors.success, border: '1px solid', bgcolor: 'transparent' }} />
            {stats.corrupted > 0 && (
              <Chip size="small" label={`${stats.corrupted} CORROMPIDOS`} sx={{ borderColor: statusColors.warning, color: statusColors.warning, border: '1px solid', bgcolor: 'transparent' }} />
            )}
            {stats.failed - stats.corrupted > 0 && (
              <Chip size="small" label={`${stats.failed - stats.corrupted} FALHAS`} sx={{ borderColor: statusColors.error, color: statusColors.error, border: '1px solid', bgcolor: 'transparent' }} />
            )}
          </Box>
        )}
      </Box>

      {running && <LinearProgress sx={{ mb: 1.5 }} />}

      {!running && snapshots.length === 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Ainda não executado. Dispara N snapshots por segundo (configurável) durante os 5s de gravação do
          vídeo RTSP, para simular carga real e revelar frames corrompidos/truncados.
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {snapshots.map((item) => (
          <Thumb key={item.index} item={item} onClick={() => openLightboxFor(item.url)} />
        ))}
      </Box>

      <Lightbox
        items={lightboxItems}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </Box>
  )
}