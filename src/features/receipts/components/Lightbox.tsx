import { ChevronLeft, ChevronRight, ExternalLink, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useReceiptSrc } from '../hooks/useReceiptSrc'
import type { Attachment } from '../schemas'
import { MAX_ZOOM, MIN_ZOOM, NO_ZOOM, zoomTo, type Zoom } from '../zoom'
import { ZoomableImage } from './ZoomableImage'

interface Props {
  images: readonly Attachment[]
  /** The image shown, or null when closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
  onDelete: (attachment: Attachment) => void
}

/** Full-screen viewer for a parent's images, with zoom and previous/next. */
export function Lightbox({ images, index, onIndexChange, onDelete }: Props) {
  const current = index === null ? undefined : images[index]
  return (
    <Dialog open={current !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
      {current && index !== null && (
        <LightboxContent
          key={current.path}
          image={current}
          index={index}
          count={images.length}
          onIndexChange={onIndexChange}
          onDelete={onDelete}
        />
      )}
    </Dialog>
  )
}

function LightboxContent({
  image,
  index,
  count,
  onIndexChange,
  onDelete,
}: {
  image: Attachment
  index: number
  count: number
  onIndexChange: (index: number | null) => void
  onDelete: (attachment: Attachment) => void
}) {
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM)
  const { src, missing, error } = useReceiptSrc(image.path)
  const go = (delta: number) => {
    if (count > 1) onIndexChange((index + delta + count) % count)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') go(-1)
    else if (e.key === 'ArrowRight') go(1)
    else if (e.key === '+' || e.key === '=') setZoom(zoomTo(zoom, zoom.scale + 0.5))
    else if (e.key === '-') setZoom(zoomTo(zoom, zoom.scale - 0.5))
    else if (e.key === '0') setZoom(NO_ZOOM)
    else return
    e.preventDefault()
  }

  const toolButton = 'text-white hover:bg-white/15 hover:text-white'

  return (
    <DialogContent
      onKeyDown={onKeyDown}
      className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black/95 p-0 text-white"
    >
      <div className="flex items-center gap-1 py-2 pr-12 pl-4">
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-sm font-medium">{image.name}</DialogTitle>
          <DialogDescription className="text-xs text-white/70">
            {count > 1 ? `Image ${index + 1} of ${count}. ` : ''}
            <span className="sr-only">
              Use + and − to zoom{count > 1 ? ', and the arrow keys to move between images' : ''}.
            </span>
          </DialogDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={toolButton}
          aria-label="Zoom out"
          disabled={zoom.scale <= MIN_ZOOM}
          onClick={() => setZoom(zoomTo(zoom, zoom.scale - 0.5))}
        >
          <ZoomOut />
        </Button>
        <button
          type="button"
          className="min-w-12 rounded-md px-1 text-xs tabular-nums outline-none hover:bg-white/15 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Reset zoom"
          onClick={() => setZoom(NO_ZOOM)}
        >
          {Math.round(zoom.scale * 100)}%
        </button>
        <Button
          variant="ghost"
          size="icon"
          className={toolButton}
          aria-label="Zoom in"
          disabled={zoom.scale >= MAX_ZOOM}
          onClick={() => setZoom(zoomTo(zoom, zoom.scale + 0.5))}
        >
          <ZoomIn />
        </Button>
        {src && (
          <Button variant="ghost" size="icon" className={toolButton} asChild>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the original in a new tab"
            >
              <ExternalLink />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={toolButton}
          aria-label={`Delete ${image.name}`}
          onClick={() => onDelete(image)}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        {src ? (
          <ZoomableImage src={src} alt={image.name} zoom={zoom} onZoomChange={setZoom} />
        ) : (
          <p className="flex size-full items-center justify-center text-sm text-white/70">
            {missing ? 'This file hasn’t finished uploading yet.' : (error ?? 'Loading…')}
          </p>
        )}
        {count > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className={`absolute top-1/2 left-2 -translate-y-1/2 bg-black/40 ${toolButton}`}
              aria-label="Previous image"
              onClick={() => go(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`absolute top-1/2 right-2 -translate-y-1/2 bg-black/40 ${toolButton}`}
              aria-label="Next image"
              onClick={() => go(1)}
            >
              <ChevronRight />
            </Button>
          </>
        )}
      </div>
    </DialogContent>
  )
}
