import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import multer from 'multer'

export function uploadFilename(file) { return `${randomUUID()}${file.mimetype === 'application/pdf' ? '.pdf' : '.upload'}` }
export function createUpload(directory = path.resolve('./temp')) {
  mkdirSync(directory, { recursive: true })
  return multer({
    storage: multer.diskStorage({ destination: directory, filename: (_req, file, done) => done(null, uploadFilename(file)) }),
    fileFilter: (_req, file, done) => {
      if (file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/')) return done(null, true)
      done(Object.assign(new Error('Unsupported upload.'), { status: 400 }))
    },
    limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8, parts: 10, fieldSize: 128 * 1024 },
  })
}
export function uploadError(error, _req, res, _next) {
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'File exceeds 20 MB.' })
  if (error instanceof multer.MulterError || error.status === 400) return res.status(400).json({ message: 'Invalid PDF/image upload or request.' })
  if (error.status === 429) return res.status(429).json({ message: 'Too many requests. Try again shortly.' })
  return res.status(503).json({ message: 'Agent service unavailable.' })
}
