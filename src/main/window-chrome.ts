/** Cross-platform hidden-title-bar options with native window controls retained. */
export const WINDOW_CONTROLS_OVERLAY_HEIGHT = 36

export interface HiddenTitleBarOptions {
  titleBarStyle: 'hidden'
  titleBarOverlay?: {
    color: string
    symbolColor: string
    height: number
  }
}

export function hiddenTitleBarOptions(platform: NodeJS.Platform, dark: boolean): HiddenTitleBarOptions {
  return {
    titleBarStyle: 'hidden',
    ...(platform === 'darwin' ? {} : {
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: dark ? '#f4f4f5' : '#202123',
        height: WINDOW_CONTROLS_OVERLAY_HEIGHT,
      },
    }),
  }
}
