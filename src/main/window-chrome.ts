/** Per-platform title-bar chrome. macOS and Windows hide the native bar
 *  (macOS draws traffic lights in the content, Windows keeps native controls
 *  in a 36px overlay); Linux keeps the FULL NATIVE title bar (#73 problem 2):
 *  UOS/Deepin draw the overlay controls exactly over the web UI's top-right
 *  actions, and the kernel web bar has no Linux avoidance inset. */
export const WINDOW_CONTROLS_OVERLAY_HEIGHT = 36
export const MACOS_SIDEBAR_SAFE_TOP = 12
export const MACOS_SIDEBAR_COLLAPSED_SAFE_TOP = 25

export interface HiddenTitleBarOptions {
  titleBarStyle: 'hidden' | 'default'
  titleBarOverlay?: {
    color: string
    symbolColor: string
    height: number
  }
}

export function hiddenTitleBarOptions(platform: NodeJS.Platform, dark: boolean): HiddenTitleBarOptions {
  if (platform === 'linux') return { titleBarStyle: 'default' }
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
