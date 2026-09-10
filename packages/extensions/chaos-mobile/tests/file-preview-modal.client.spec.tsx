// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FilePreviewModal } from '../src/client/FilePreviewModal.tsx'
import { filePreviewStore } from '../src/client/file-preview-store.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('filePreviewStore', () => {
  it('updates state reactively on open and close', () => {
    let observed = filePreviewStore.getSnapshot()
    expect(observed.open).toBe(false)

    const unsubscribe = filePreviewStore.subscribe(() => {
      observed = filePreviewStore.getSnapshot()
    })

    filePreviewStore.open('/test/path.ts')
    expect(observed.open).toBe(true)
    expect(observed.path).toBe('/test/path.ts')

    filePreviewStore.close()
    expect(observed.open).toBe(false)

    unsubscribe()
  })
})

describe('FilePreviewModal component', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <FilePreviewModal open={false} path="/fake/file.ts" onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders code/text file with line numbers and metadata', async () => {
    const fakeData = {
      ok: true,
      kind: 'text',
      path: '/demo/example.ts',
      name: 'example.ts',
      extension: 'ts',
      language: 'typescript',
      size: 1024,
      lineCount: 2,
      content: 'const a = 1\nconst b = 2',
      truncated: false,
      rawUrl: '/api/chaos/file?path=%2Fdemo%2Fexample.ts&raw=1',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => fakeData,
    } as Response)

    render(<FilePreviewModal open path="/demo/example.ts" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('example.ts')).toBeTruthy()
    })

    expect(screen.getByText('TS')).toBeTruthy()
    expect(screen.getByText('2 行')).toBeTruthy()
    expect(screen.getByText(/const a = 1/)).toBeTruthy()
  })

  it('renders markdown with toggle between preview and raw', async () => {
    const fakeData = {
      ok: true,
      kind: 'markdown',
      path: '/demo/README.md',
      name: 'README.md',
      extension: 'md',
      language: 'markdown',
      size: 512,
      lineCount: 1,
      content: '# Hello World',
      truncated: false,
      rawUrl: '/api/chaos/file?path=%2Fdemo%2FREADME.md&raw=1',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => fakeData,
    } as Response)

    render(<FilePreviewModal open path="/demo/README.md" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeTruthy()
    })

    const rawBtn = screen.getByRole('button', { name: '源码' })
    expect(rawBtn).toBeTruthy()
    fireEvent.click(rawBtn)

    await waitFor(() => {
      expect(screen.getByText('# Hello World')).toBeTruthy()
    })
  })

  it('renders image preview for image files', async () => {
    const fakeData = {
      ok: true,
      kind: 'image',
      path: '/demo/logo.png',
      name: 'logo.png',
      extension: 'png',
      size: 2048,
      mimeType: 'image/png',
      rawUrl: '/api/chaos/file?path=%2Fdemo%2Flogo.png&raw=1',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => fakeData,
    } as Response)

    render(<FilePreviewModal open path="/demo/logo.png" onClose={vi.fn()} />)

    await waitFor(() => {
      const img = screen.getByRole('img')
      expect(img.getAttribute('src')).toBe('/api/chaos/file?path=%2Fdemo%2Flogo.png&raw=1')
    })
  })
})
