import { useMemo, useState } from 'react'
import { Box, Typography } from '@mui/material'
import MediaSlot from './MediaSlot.jsx'
import Lightbox from './Lightbox.jsx'

export default function MediaGallery({ snapshots, video, capturing }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const slots = [0, 1, 2].map((i) => snapshots?.[i] ?? null)

  const statusFor = (item) => {
    if (capturing && !item) return 'loading'
    if (!item) return 'idle'
    if (item.url) return 'ok'
    if (item.error) return 'error'
    return 'idle'
  }

  const now = new Date().toLocaleTimeString('pt-BR', { hour12: false })

  const lightboxItems = useMemo(() => {
    const items = []
    slots.forEach((item, i) => {
      if (item?.url) items.push({ src: item.url, label: `SNAPSHOT ${i + 1}/3`, kind: 'image' })
    })
    if (video?.url) items.push({ src: video.url, label: 'VÍDEO RTSP', kind: 'video' })
    return items
  }, [slots, video])

  const openLightboxFor = (src) => {
    const idx = lightboxItems.findIndex((it) => it.src === src)
    if (idx >= 0) setLightboxIndex(idx)
  }

  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ color: 'text.secondary', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' }}
      >
        Snapshots (HTTP)
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
          gap: 1.5,
          mt: 1,
          mb: 3,
        }}
      >
        {slots.map((item, i) => (
          <MediaSlot
            key={i}
            kind="image"
            label={`SNAPSHOT ${i + 1}/3`}
            status={statusFor(item)}
            src={item?.url}
            errorMessage={item?.error}
            timestamp={item ? now : null}
            onClick={() => item?.url && openLightboxFor(item.url)}
          />
        ))}
      </Box>

      <Typography
        variant="overline"
        sx={{ color: 'text.secondary', fontFamily: 'IBM Plex Mono, monospace', letterSpacing: '0.08em' }}
      >
        Vídeo (RTSP · 5s)
      </Typography>
      <Box sx={{ mt: 1, maxWidth: { sm: '60%' } }}>
        <MediaSlot
          kind="video"
          label="VÍDEO RTSP"
          status={capturing && !video ? 'loading' : video ? (video.url ? 'ok' : 'error') : 'idle'}
          src={video?.url}
          errorMessage={video?.error}
          timestamp={video ? now : null}
          onClick={() => video?.url && openLightboxFor(video.url)}
        />
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