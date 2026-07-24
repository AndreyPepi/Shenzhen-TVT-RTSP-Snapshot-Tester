import { useEffect, useRef } from 'react'
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { statusColors } from '../theme.js'

const LEVEL_LABEL = {
  info: 'INFO',
  success: 'OK',
  warning: 'WARN',
  error: 'ERR',
}

export default function LogConsole({ logs, connected, onClear }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [logs])

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant="caption"
          sx={{ fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.06em', color: 'text.secondary' }}
        >
          LOG DO SISTEMA
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            size="small"
            label={connected ? 'WS CONECTADO' : 'WS DESCONECTADO'}
            sx={{
              height: 20,
              bgcolor: 'transparent',
              border: '1px solid',
              borderColor: connected ? statusColors.success : statusColors.error,
              color: connected ? statusColors.success : statusColors.error,
            }}
          />
          <Tooltip title="Limpar logs">
            <IconButton size="small" onClick={onClear} sx={{ color: 'text.secondary' }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1.5,
          py: 1,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '0.78rem',
          lineHeight: 1.7,
        }}
      >
        {logs.length === 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Nenhum evento ainda. Clique em "Capturar amostra" para iniciar.
          </Typography>
        )}
        {logs.map((entry, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, color: 'text.primary', whiteSpace: 'pre-wrap' }}>
            <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0 }}>
              {entry.timestamp}
            </Box>
            <Box
              component="span"
              sx={{
                color: statusColors[entry.level] || statusColors.info,
                flexShrink: 0,
                width: 42,
              }}
            >
              [{LEVEL_LABEL[entry.level] || 'INFO'}]
            </Box>
            <Box component="span">{entry.message}</Box>
          </Box>
        ))}
        <div ref={bottomRef} />
      </Box>
    </Box>
  )
}