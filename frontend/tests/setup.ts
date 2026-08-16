import '@testing-library/jest-dom';

/**
 * jsdom ships no matchMedia. The theme layer asks it whether the OS prefers
 * dark, so supply the API and answer "no" — a light default, which is what the
 * app falls back to in a browser that reports no preference.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
