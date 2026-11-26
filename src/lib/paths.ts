/** Validates a project-relative path for the browser workspace. Returns an error message or null. */
export function validateRelativePath(p: string): string | null {
  const path = p.trim();
  if (!path) return 'Enter a file path.';
  if (path.length > 200) return 'Path is too long (200 characters max).';
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return 'Use a path relative to the project, without a leading slash.';
  if (path.includes('\\')) return 'Use forward slashes.';
  if (/[\u0000-\u001f]/.test(path)) return 'Path contains control characters.';
  if (path.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return 'Path cannot contain empty, "." or ".." segments.';
  return null;
}
