import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ExternalLink,
  Globe,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCw,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

import { useStore } from '../store/useStore';

type PreviewState = 'idle' | 'loading' | 'live' | 'error';

const LOAD_TIMEOUT_MS = 15000;

export const Preview: React.FC = () => {
  const { previewUrl } = useStore();

  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<PreviewState>(
    previewUrl ? 'loading' : 'idle',
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAddressExpanded, setIsAddressExpanded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const loadTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (loadTimeoutRef.current !== null) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    setRefreshKey((current) => current + 1);
    setLoadAttempt(0);
    setIsAddressExpanded(false);
    setState(previewUrl ? 'loading' : 'idle');
  }, [previewUrl]);

  useEffect(() => {
    if (!previewUrl || state !== 'loading') {
      return;
    }

    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current);
    }

    loadTimeoutRef.current = window.setTimeout(() => {
      if (!mountedRef.current) {
        return;
      }

      setState('error');
      loadTimeoutRef.current = null;
    }, LOAD_TIMEOUT_MS);

    return () => {
      if (loadTimeoutRef.current !== null) {
        window.clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [previewUrl, refreshKey, state, loadAttempt]);

  const displayUrl = useMemo(() => {
    if (!previewUrl) {
      return '';
    }

    try {
      const url = new URL(previewUrl);

      return `${url.host}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return previewUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '');
    }
  }, [previewUrl]);

  const fullDisplayUrl = useMemo(() => {
    if (!previewUrl) {
      return '';
    }

    return previewUrl;
  }, [previewUrl]);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (!previewUrl) {
      return;
    }

    clearLoadTimeout();

    setState('loading');
    setLoadAttempt((current) => current + 1);
    setRefreshKey((current) => current + 1);
  }, [clearLoadTimeout, previewUrl]);

  const handleOpenExternal = useCallback(() => {
    if (!previewUrl) {
      return;
    }

    const opened = window.open(
      previewUrl,
      '_blank',
      'noopener,noreferrer',
    );

    if (opened) {
      opened.opener = null;
    }
  }, [previewUrl]);

  const handleIframeLoad = useCallback(() => {
    clearLoadTimeout();

    if (!mountedRef.current) {
      return;
    }

    setState('live');
  }, [clearLoadTimeout]);

  const handleIframeError = useCallback(() => {
    clearLoadTimeout();

    if (!mountedRef.current) {
      return;
    }

    setState('error');
  }, [clearLoadTimeout]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((current) => !current);
  }, []);

  const handleIframeDoubleClick = useCallback(() => {
    setIsFullscreen((current) => !current);
  }, []);

  const handleEscapeFullscreen = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    },
    [isFullscreen],
  );

  useEffect(() => {
    window.addEventListener(
      'keydown',
      handleEscapeFullscreen,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleEscapeFullscreen,
      );
    };
  }, [handleEscapeFullscreen]);

  const statusLabel = useMemo(() => {
    switch (state) {
      case 'loading':
        return 'Loading';

      case 'live':
        return 'Live';

      case 'error':
        return 'Preview error';

      case 'idle':
      default:
        return 'Waiting';
    }
  }, [state]);

  const statusDescription = useMemo(() => {
    switch (state) {
      case 'loading':
        return 'Waiting for the development server...';

      case 'live':
        return 'Preview is connected and running.';

      case 'error':
        return 'The preview did not respond in time.';

      case 'idle':
      default:
        return 'Start the development server to see your project.';
    }
  }, [state]);

  const statusDotClass = useMemo(() => {
    switch (state) {
      case 'live':
        return 'bg-emerald-400';

      case 'loading':
        return 'bg-yellow-400 animate-pulse';

      case 'error':
        return 'bg-red-400';

      case 'idle':
      default:
        return 'bg-gray-600';
    }
  }, [state]);

  const containerClassName = isFullscreen
    ? 'fixed inset-0 z-[90] flex flex-col bg-gray-950 text-gray-200'
    : 'h-full min-h-0 flex flex-col bg-gray-900 text-gray-200';

  return (
    <div className={containerClassName}>
      {/* ================================================================
          PREVIEW TOOLBAR
          ================================================================ */}
      <div
        className="
          h-9
          shrink-0
          flex
          items-center
          gap-2
          px-2
          sm:px-3
          bg-gray-900
          border-b
          border-gray-800
        "
      >
        {/* Identity */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="
              flex
              items-center
              justify-center
              w-5
              h-5
              rounded
              bg-gray-800
              shrink-0
            "
          >
            <Globe
              size={13}
              className={
                state === 'live'
                  ? 'text-emerald-400'
                  : 'text-gray-500'
              }
            />
          </div>

          <span className="text-xs font-medium text-gray-400 truncate">
            PREVIEW
          </span>

          {state === 'live' && (
            <span
              className="
                hidden
                sm:inline
                text-[9px]
                uppercase
                tracking-wider
                text-emerald-500/70
              "
            >
              Live
            </span>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {previewUrl && (
            <>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={state === 'loading'}
                title="Refresh preview"
                aria-label="Refresh preview"
                className="
                  p-1.5
                  rounded
                  text-gray-500
                  hover:text-gray-200
                  hover:bg-gray-800
                  disabled:opacity-40
                  disabled:cursor-not-allowed
                  transition-colors
                "
              >
                <RefreshCw
                  size={13}
                  className={
                    state === 'loading'
                      ? 'animate-spin'
                      : ''
                  }
                />
              </button>

              <button
                type="button"
                onClick={handleOpenExternal}
                title="Open preview in a new browser tab"
                aria-label="Open preview in a new browser tab"
                className="
                  hidden
                  sm:block
                  p-1.5
                  rounded
                  text-gray-500
                  hover:text-gray-200
                  hover:bg-gray-800
                  transition-colors
                "
              >
                <ExternalLink size={13} />
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                title={
                  isFullscreen
                    ? 'Exit fullscreen preview'
                    : 'Fullscreen preview'
                }
                aria-label={
                  isFullscreen
                    ? 'Exit fullscreen preview'
                    : 'Fullscreen preview'
                }
                className="
                  p-1.5
                  rounded
                  text-gray-500
                  hover:text-gray-200
                  hover:bg-gray-800
                  transition-colors
                "
              >
                {isFullscreen ? (
                  <Minimize2 size={13} />
                ) : (
                  <Maximize2 size={13} />
                )}
              </button>
            </>
          )}

          {isFullscreen && (
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              title="Close fullscreen preview"
              aria-label="Close fullscreen preview"
              className="
                ml-0.5
                p-1.5
                rounded
                text-gray-500
                hover:text-gray-200
                hover:bg-gray-800
                transition-colors
              "
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ================================================================
          ADDRESS BAR
          ================================================================ */}
      {previewUrl && (
        <div
          className="
            h-8
            shrink-0
            flex
            items-center
            px-2
            sm:px-3
            bg-gray-950
            border-b
            border-gray-800
          "
        >
          <button
            type="button"
            onClick={() =>
              setIsAddressExpanded((current) => !current)
            }
            className="
              flex
              items-center
              gap-2
              min-w-0
              w-full
              px-2
              py-1
              rounded
              bg-gray-900
              border
              border-gray-800
              hover:border-gray-700
              transition-colors
              text-left
            "
            title={fullDisplayUrl}
            aria-label="Preview address"
          >
            {state === 'live' ? (
              <Wifi
                size={11}
                className="text-emerald-500 shrink-0"
              />
            ) : state === 'error' ? (
              <WifiOff
                size={11}
                className="text-red-400 shrink-0"
              />
            ) : (
              <Globe
                size={11}
                className="text-gray-600 shrink-0"
              />
            )}

            <span
              className={`
                text-[10px]
                text-gray-500
                ${
                  isAddressExpanded
                    ? 'break-all whitespace-normal'
                    : 'truncate'
                }
              `}
            >
              {isAddressExpanded
                ? fullDisplayUrl
                : displayUrl}
            </span>
          </button>
        </div>
      )}

      {/* ================================================================
          PREVIEW CONTENT
          ================================================================ */}
      <div
        className="
          relative
          flex-1
          min-h-0
          overflow-hidden
          bg-white
        "
      >
        {/* --------------------------------------------------------------
            EMPTY / IDLE STATE
            -------------------------------------------------------------- */}
        {!previewUrl && (
          <div
            className="
              absolute
              inset-0
              flex
              flex-col
              items-center
              justify-center
              bg-gray-950
              text-center
              px-6
            "
          >
            <div
              className="
                flex
                items-center
                justify-center
                w-14
                h-14
                rounded-xl
                bg-gray-900
                border
                border-gray-800
                mb-4
              "
            >
              <Globe
                size={28}
                strokeWidth={1}
                className="text-gray-600"
              />
            </div>

            <p className="text-sm text-gray-400">
              Starting development server...
            </p>

            <p className="text-xs text-gray-600 mt-1 max-w-xs leading-5">
              Once the WebContainer server is ready, the
              live preview will appear here automatically.
            </p>
          </div>
        )}

        {/* --------------------------------------------------------------
            LOADING STATE
            -------------------------------------------------------------- */}
        {previewUrl && state === 'loading' && (
          <div
            className="
              absolute
              inset-0
              z-20
              flex
              flex-col
              items-center
              justify-center
              bg-gray-950
              text-center
              px-6
            "
          >
            <div
              className="
                flex
                items-center
                justify-center
                w-12
                h-12
                rounded-full
                bg-blue-500/10
                border
                border-blue-500/20
                mb-4
              "
            >
              <RotateCw
                size={21}
                className="animate-spin text-blue-400"
              />
            </div>

            <p className="text-sm text-gray-400">
              Loading preview...
            </p>

            <p className="text-xs text-gray-600 mt-1 max-w-xs">
              Connecting to the WebContainer development
              server.
            </p>
          </div>
        )}

        {/* --------------------------------------------------------------
            ERROR STATE
            -------------------------------------------------------------- */}
        {previewUrl && state === 'error' && (
          <div
            className="
              absolute
              inset-0
              z-30
              flex
              flex-col
              items-center
              justify-center
              bg-gray-950
              px-6
              text-center
            "
          >
            <div
              className="
                flex
                items-center
                justify-center
                w-12
                h-12
                rounded-xl
                bg-red-500/5
                border
                border-red-500/20
                mb-4
              "
            >
              <WifiOff
                size={22}
                strokeWidth={1.5}
                className="text-red-400/70"
              />
            </div>

            <p className="text-sm text-gray-300">
              Unable to load the preview
            </p>

            <p className="text-xs text-gray-600 mt-1 max-w-sm leading-5">
              The development server may still be starting,
              may have stopped, or the page may have failed
              to respond.
            </p>

            <button
              type="button"
              onClick={handleRefresh}
              className="
                mt-4
                flex
                items-center
                gap-2
                px-3
                py-1.5
                rounded-md
                border
                border-gray-700
                bg-gray-800
                hover:bg-gray-750
                hover:border-gray-600
                text-xs
                text-gray-300
                hover:text-white
                transition-colors
              "
            >
              <RefreshCw size={13} />
              Try Again
            </button>
          </div>
        )}

        {/* --------------------------------------------------------------
            IFRAME
            -------------------------------------------------------------- */}
        {previewUrl && state !== 'error' && (
          <iframe
            ref={iframeRef}
            key={refreshKey}
            src={previewUrl}
            className="
              absolute
              inset-0
              w-full
              h-full
              border-0
              bg-white
            "
            title="EDITOR X Live Preview"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            onDoubleClick={handleIframeDoubleClick}
            allow="clipboard-read; clipboard-write"
            sandbox="
              allow-scripts
              allow-same-origin
              allow-forms
              allow-modals
              allow-popups
              allow-popups-to-escape-sandbox
            "
          />
        )}
      </div>

      {/* ================================================================
          STATUS BAR
          ================================================================ */}
      {previewUrl && (
        <div
          className="
            h-6
            shrink-0
            flex
            items-center
            justify-between
            px-2
            sm:px-3
            bg-gray-900
            border-t
            border-gray-800
            text-[10px]
            text-gray-600
          "
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`
                w-1.5
                h-1.5
                rounded-full
                shrink-0
                ${statusDotClass}
              `}
              aria-hidden="true"
            />

            <span className="truncate">
              {statusLabel}
            </span>

            <span className="hidden sm:inline text-gray-700">
              •
            </span>

            <span
              className="hidden sm:inline truncate text-gray-700"
              title={statusDescription}
            >
              {statusDescription}
            </span>
          </div>

          <span className="shrink-0 ml-2">
            EDITOR X
          </span>
        </div>
      )}
    </div>
  );
};