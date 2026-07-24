import { useEffect, useCallback } from 'react'
import { Box, Modal, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'

export default function Lightbox({ items, index, onClose, onNavigate }) {
  const open = index !== null && index >= 0 && !!items?.[index]

  const goTo = useCallback(
    (delta) => {
      if (!items?.length) return
      onNavigate((index + delta + items.length) % items.length)
    },
    [index, items, onNavigate]
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goTo(-1)
      else if (e.key === 'ArrowRight') goTo(1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, goTo, onClose])

  if (!open) return null
  const item = items[index]

  return (
    <Modal open={open} onClose={onClose}>
      <Box
        onClick={onClose}
        sx={{
          position: 'fixed',
          inset: 0,
          bgcolor: 'rgba(0,0,0,0.92)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <IconButton onClick={onClose} sx={{ position: 'absolute', top: 16, right: 16, color: '#fff' }}>
          <CloseIcon />
        </IconButton>

        {items.length > 1 && (
          <IconButton
            onClick={(e) => { e.stopPropagation(); goTo(-1) }}
            sx={{ position: 'absolute', left: { xs: 4, sm: 16 }, color: '#fff' }}
          >
            <ArrowBackIosNewIcon />
          </IconButton>
        )}

        <Box
          onClick={(e) => e.stopPropagation()}
          sx={{ maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
        >
          {item.kind === 'video' ? (
            <Box component="video" src={item.src} controls autoPlay sx={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 1 }} />
          ) : (
            <Box component="img" src={item.src} alt={item.label || ''} sx={{ maxWidth: '90vw', maxHeight: '80vh', borderRadius: 1, objectFit: 'contain' }} />
          )}
          {item.label && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'IBM Plex Mono, monospace' }}>
              {item.label} {items.length > 1 ? `· ${index + 1}/${items.length}` : ''}
            </Typography>
          )}
        </Box>

        {items.length > 1 && (
          <IconButton
            onClick={(e) => { e.stopPropagation(); goTo(1) }}
            sx={{ position: 'absolute', right: { xs: 4, sm: 16 }, color: '#fff' }}
          >
            <ArrowForwardIosIcon />
          </IconButton>
        )}
      </Box>
    </Modal>
  )
}