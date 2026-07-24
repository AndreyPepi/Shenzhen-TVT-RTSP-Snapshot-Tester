import { Box, Typography, CircularProgress } from '@mui/material'
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined'
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'

const BACKEND_ORIGIN = ''

export default function MediaSlot({ kind, label, status, src, errorMessage, timestamp, onClick }) {
  const stateClass =
    status === 'loading' ? 'viewfinder--active' : status === 'ok' ? 'viewfinder--ok' : status === 'error' ? 'viewfinder--error' : ''

  // Cantos só aparecem quando há status ativo/concluído — placeholder
  // vazio (idle) fica sem moldura parcial nenhuma.
  const showCorners = status !== 'idle'
  const clickable = status === 'ok' && typeof onClick === 'function'

  return (
    <Box
      className={`viewfinder ${stateClass}`}
      onClick={clickable ? onClick : undefined}
      sx={{
        aspectRatio: kind === 'video' ? '16 / 9' : '4 / 3',
        bgcolor: 'background.default',
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        cursor: clickable ? 'pointer' : 'default',
        position: 'relative',
      }}
    >
      {showCorners && (
        <>
          <span className="viewfinder__corner viewfinder__corner--tl" />
          <span className="viewfinder__corner viewfinder__corner--tr" />
          <span className="viewfinder__corner viewfinder__corner--bl" />
          <span className="viewfinder__corner viewfinder__corner--br" />
        </>
      )}

      {status === 'loading' && (
        <Box className="viewfinder__rec">
          <span className="viewfinder__rec-dot" />
          {kind === 'video' ? 'REC' : 'CAP'}
        </Box>
      )}

      {status === 'idle' && (
        <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
          {kind === 'video' ? (
            <VideocamOutlinedIcon sx={{ fontSize: 28, opacity: 0.5 }} />
          ) : (
            <PhotoCameraOutlinedIcon sx={{ fontSize: 28, opacity: 0.5 }} />
          )}
          <Typography variant="caption" display="block" sx={{ mt: 0.5, fontFamily: 'IBM Plex Mono, monospace' }}>
            AGUARDANDO
          </Typography>
        </Box>
      )}

      {status === 'loading' && (
        <CircularProgress size={26} thickness={4} sx={{ color: 'primary.main' }} />
      )}

      {status === 'ok' && kind === 'image' && (
        <Box component="img" src={BACKEND_ORIGIN + src} alt={label} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      )}

      {status === 'ok' && kind === 'video' && (
        <Box component="video" src={BACKEND_ORIGIN + src} controls sx={{ width: '100%', height: '100%', objectFit: 'cover', bgcolor: '#000' }} />
      )}

      {status === 'error' && (
        <Box sx={{ textAlign: 'center', color: 'error.main', px: 2 }}>
          <BrokenImageOutlinedIcon sx={{ fontSize: 26 }} />
          <Typography variant="caption" display="block" sx={{ mt: 0.5, fontFamily: 'IBM Plex Mono, monospace', wordBreak: 'break-word' }}>
            {errorMessage || 'FALHA NA CAPTURA'}
          </Typography>
        </Box>
      )}

      {(status === 'ok' || status === 'error') && timestamp && (
        <Box className="viewfinder__osd">{timestamp}</Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          px: 1,
          py: 0.25,
          fontSize: '0.62rem',
          fontFamily: 'IBM Plex Mono, monospace',
          letterSpacing: '0.04em',
          color: 'text.secondary',
          bgcolor: 'rgba(11,15,18,0.55)',
          borderBottomRightRadius: 4,
        }}
      >
        {label}
      </Box>
    </Box>
  )
}