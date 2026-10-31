import { useState } from 'react'
import Dialog from '../ui/Dialog'

export default function ImagePreviewDialog({ image, onClose }) {
  const [failedSource, setFailedSource] = useState(null)
  return <Dialog open={!!image} onClose={onClose} title="Image preview" className="contour-image-dialog">
    {image && (failedSource === image.src
      ? <p role="alert">This image is unavailable. You can close the preview and continue reading.</p>
      : <img src={image.src} alt={image.alt} onError={() => setFailedSource(image.src)} />)}
  </Dialog>
}
