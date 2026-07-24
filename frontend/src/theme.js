import { createTheme } from '@mui/material/styles'

// Paleta — console de monitoramento técnico, com o azul-marinho da
// identidade visual do Grupo Pumatronix como cor de destaque.
const tokens = {
  bgBase: '#0b0f12',
  bgPanel: '#12181c',
  bgElevated: '#171f24',
  border: '#263139',
  textPrimary: '#e4ecee',
  textSecondary: '#7c8d95',

  // Mesmo hex usado em index.css --accent — mantenha os dois sincronizados
  // se algum dia trocar pelo valor exato do manual de marca.
  accent: '#0B3D63',
  accentContrast: '#F2F6F9',

  ok: '#35d07f',
  err: '#ff5c5c',
  warn: '#ffb020',
  info: '#4fa8e0',
}

export const statusColors = {
  info: tokens.info,
  success: tokens.ok,
  warning: tokens.warn,
  error: tokens.err,
}

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: tokens.bgBase,
      paper: tokens.bgPanel,
    },
    primary: {
      main: tokens.accent,
      contrastText: tokens.accentContrast,
    },
    success: { main: tokens.ok },
    error: { main: tokens.err },
    warning: { main: tokens.warn },
    info: { main: tokens.info },
    text: {
      primary: tokens.textPrimary,
      secondary: tokens.textSecondary,
    },
    divider: tokens.border,
  },
  typography: {
    fontFamily: "'Inter', system-ui, sans-serif",
    h1: { fontFamily: "'IBM Plex Mono', monospace" },
    h2: { fontFamily: "'IBM Plex Mono', monospace" },
    h6: { fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.02em' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${tokens.border}`,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.72rem',
        },
      },
    },
  },
})

export default theme
export { tokens }