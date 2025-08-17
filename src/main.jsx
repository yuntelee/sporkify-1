import React from 'react'
import ReactDOM from 'react-dom/client'
import { MantineProvider, createTheme, Container, Paper, Card, Select, Button, rem } from '@mantine/core';
import App from './App.jsx'
import './index.css'
import '@mantine/core/styles.css';

const CONTAINER_SIZES = {
  xxs: rem("200px"),
  xs: rem("300px"),
  sm: rem("400px"),
  md: rem("500px"),
  lg: rem("600px"),
  xl: rem("1400px"),
  xxl: rem("1600px"),
};

// Function to determine if it's day or night
const mantineTheme = createTheme({
  /** Put your mantine theme override here */
  fontSizes: {
    xs: rem("12px"),
    sm: rem("14px"),
    md: rem("16px"),
    lg: rem("18px"),
    xl: rem("20px"),
    "2xl": rem("24px"),
    "3xl": rem("30px"),
    "4xl": rem("36px"),
    "5xl": rem("48px"),
  },
  spacing: {
    "3xs": rem("4px"),
    "2xs": rem("8px"),
    xs: rem("10px"),
    sm: rem("12px"),
    md: rem("16px"),
    lg: rem("20px"),
    xl: rem("24px"),
    "2xl": rem("28px"),
    "3xl": rem("32px"),
  },
  primaryColor: "brand",
  colors: {
    brand: [
      "#f9f5f0",
      "#ede3d4",
      "#e1d1b8",
      "#d4be9c",
      "#c8ac81",
      "#b29060",
      "#a18254",
      "#8f7349",
      "#7e653f",
      "#6d5735"
    ],
    // Keep the Spotify color palette from before
    spotify: [
      '#e8f5e8',
      '#d3e9d3',
      '#b8dbb8',
      '#9ccc9c',
      '#7fb87f',
      '#1db954', // Spotify green
      '#19a049',
      '#15873d',
      '#126e32',
      '#0e5426'
    ],
  },
  components: {
    /** Put your mantine component override here */
    Container: Container.extend({
      vars: (_, { size, fluid }) => ({
        root: {
          "--container-size": fluid
            ? "100%"
            : size !== undefined && size in CONTAINER_SIZES
              ? CONTAINER_SIZES[size]
              : rem(size),
        },
      }),
    }),
    Paper: Paper.extend({
      defaultProps: {
        p: "md",
        shadow: "sm",
        radius: "md",
        withBorder: true,
      },
    }),
    Card: Card.extend({
      defaultProps: {
        p: "xl",
        shadow: "sm",
        radius: "var(--mantine-radius-default)",
        withBorder: true,
      },
    }),
    Select: Select.extend({
      defaultProps: {
        checkIconPosition: "right",
      },
    }),
    Button: Button.extend({
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: '500',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
        }
      }
    }),
  },
  other: {
    style: "mantine",
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MantineProvider theme={mantineTheme} defaultColorScheme="light" forceColorScheme="light">
      <App />
    </MantineProvider>
  </React.StrictMode>,
)
