import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';

vi.mock('colorthief', () => ({
  __esModule: true,
  getPalette: vi.fn(),
}));

import { getPalette } from 'colorthief';

const makeColor = (r, g, b) => ({ array: () => [r, g, b] });
const VALID_PALETTE = [
  makeColor(63, 14, 64),
  makeColor(17, 100, 163),
  makeColor(54, 197, 240),
  makeColor(236, 178, 46),
];

const makeFile = (name, type, size = 1024) => {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const getFileInput = () => document.querySelector('input[type="file"]');
const getDropZone = () => document.querySelector('.upload-area');
const getHiddenImage = () =>
  waitFor(() => {
    const img = document.querySelector('.hidden-image');
    expect(img).toBeInTheDocument();
    return img;
  });

const uploadAndExtract = async (file) => {
  await act(async () => {
    fireEvent.change(getFileInput(), { target: { files: [file] } });
  });
  const hidden = await getHiddenImage();
  await act(async () => {
    fireEvent.load(hidden);
  });
  return hidden;
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('renders the heading', () => {
  render(<App />);
  expect(screen.getByText(/Slack Theme Generator/i)).toBeInTheDocument();
});

test('rejects files larger than 5MB', async () => {
  render(<App />);
  const big = makeFile('big.jpg', 'image/jpeg', 6 * 1024 * 1024);
  await act(async () => {
    fireEvent.change(getFileInput(), { target: { files: [big] } });
  });
  expect(screen.getByText(/under 5MB/i)).toBeInTheDocument();
  expect(getPalette).not.toHaveBeenCalled();
});

test('rejects SVG files with a helpful message', async () => {
  render(<App />);
  const svg = makeFile('logo.svg', 'image/svg+xml');
  await act(async () => {
    fireEvent.change(getFileInput(), { target: { files: [svg] } });
  });
  expect(screen.getByText(/SVG files are not supported/i)).toBeInTheDocument();
});

test('rejects drops containing more than one file', async () => {
  render(<App />);
  const f1 = makeFile('a.png', 'image/png');
  const f2 = makeFile('b.png', 'image/png');
  await act(async () => {
    fireEvent.drop(getDropZone(), { dataTransfer: { files: [f1, f2] } });
  });
  expect(screen.getByText(/just one logo file at a time/i)).toBeInTheDocument();
});

test('happy path: a JPG renders the extracted palette', async () => {
  getPalette.mockResolvedValue(VALID_PALETTE);
  render(<App />);
  await uploadAndExtract(makeFile('logo.jpg', 'image/jpeg'));
  await waitFor(() => {
    expect(screen.getByText('#3F0E40')).toBeInTheDocument();
  });
  expect(screen.getByText('#1164A3')).toBeInTheDocument();
});

test('shows a friendly message when getPalette throws', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getPalette.mockRejectedValue(new Error('decode failed'));
  render(<App />);
  await uploadAndExtract(makeFile('logo.jpg', 'image/jpeg'));
  await waitFor(() => {
    expect(screen.getByText(/Could not extract colors/i)).toBeInTheDocument();
  });
});

test('shows a CORS-aware message when the hidden image fails to load', async () => {
  render(<App />);
  await act(async () => {
    fireEvent.change(getFileInput(), {
      target: { files: [makeFile('logo.jpg', 'image/jpeg')] },
    });
  });
  const hidden = await getHiddenImage();
  await act(async () => {
    fireEvent.error(hidden);
  });
  expect(screen.getByText(/cross-origin requests/i)).toBeInTheDocument();
});

test('announces clipboard copy via the aria-live region', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  getPalette.mockResolvedValue(VALID_PALETTE);
  render(<App />);
  await uploadAndExtract(makeFile('logo.jpg', 'image/jpeg'));

  const copyButton = screen.getByRole('button', { name: /copy theme string/i });
  await act(async () => {
    fireEvent.click(copyButton);
  });

  expect(writeText).toHaveBeenCalledWith('#3F0E40, #1164A3, #36C5F0, #ECB22E');
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(/copied/i);
  });
});

test('a stale getPalette resolve does not overwrite a newer upload', async () => {
  let resolveFirst;
  const stalePalette = [
    makeColor(255, 0, 0),
    makeColor(0, 255, 0),
    makeColor(0, 0, 255),
    makeColor(0, 0, 0),
  ];
  getPalette
    .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
    .mockResolvedValueOnce(VALID_PALETTE);

  render(<App />);
  await uploadAndExtract(makeFile('first.jpg', 'image/jpeg'));
  await uploadAndExtract(makeFile('second.jpg', 'image/jpeg'));

  await waitFor(() => {
    expect(screen.getByText('#3F0E40')).toBeInTheDocument();
  });

  await act(async () => {
    resolveFirst(stalePalette);
  });

  expect(screen.queryByText('#FF0000')).not.toBeInTheDocument();
  expect(screen.getByText('#3F0E40')).toBeInTheDocument();
});
