import { FileText, RotateCcw, X } from 'lucide-react'
import IconButton from '../ui/IconButton'

export default function AttachmentChip({ file, preview, disabled, onRemove, onReplace }) {
  const size = file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB`
    : `${(file.size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  return <div className="contour-attached-file" role="group" aria-label="Selected attachment">
    {preview ? <img src={preview} alt="Selected attachment" /> : <FileText size={20} aria-hidden="true" />}
    <div><strong title={file.name}>{file.name}</strong><small>{file.type === 'application/pdf' ? 'PDF' : 'Image'} · {size}</small></div>
    <span className="contour-attachment-actions">
      <IconButton label="Replace attachment" tooltip={false} disabled={disabled} onClick={onReplace}><RotateCcw size={16} /></IconButton>
      <IconButton label="Remove attachment" tooltip={false} disabled={disabled} onClick={onRemove}><X size={16} /></IconButton>
    </span>
  </div>
}
