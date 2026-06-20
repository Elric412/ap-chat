import { describe, it, expect } from 'vitest';
import { classifySandboxFile } from '../sandbox/artifact-promotion';

describe('classifySandboxFile', () => {
  it('classifies an HTML file as a previewable html artifact', () => {
    expect(classifySandboxFile('ai-debugger-site/index.html')).toEqual({ type: 'html', language: 'html' });
  });

  it('classifies SVG as an svg artifact', () => {
    expect(classifySandboxFile('logo.svg')).toEqual({ type: 'svg' });
  });

  it('classifies code files with the right language', () => {
    expect(classifySandboxFile('app.py')).toEqual({ type: 'code', language: 'python' });
    expect(classifySandboxFile('styles.css')).toEqual({ type: 'code', language: 'css' });
    expect(classifySandboxFile('data.json')).toEqual({ type: 'code', language: 'json' });
  });

  it('classifies markdown and csv', () => {
    expect(classifySandboxFile('README.md')).toEqual({ type: 'markdown', language: 'markdown' });
    expect(classifySandboxFile('out.csv')).toEqual({ type: 'table', language: 'csv' });
  });

  it('returns null for binary files (never surfaced as text artifacts)', () => {
    expect(classifySandboxFile('chart.png')).toBeNull();
    expect(classifySandboxFile('archive.zip')).toBeNull();
    expect(classifySandboxFile('font.woff2')).toBeNull();
  });

  it('returns null for unknown / extensionless files', () => {
    expect(classifySandboxFile('Makefile')).toBeNull();
    expect(classifySandboxFile('mystery.xyz')).toBeNull();
  });

  it('is case-insensitive on the extension', () => {
    expect(classifySandboxFile('Index.HTML')).toEqual({ type: 'html', language: 'html' });
  });
});
