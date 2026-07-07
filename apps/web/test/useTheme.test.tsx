import { test, expect, beforeEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from '../src/theme/useTheme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-bs-theme');
});

test('defaults to light and applies data-bs-theme on <html>', () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('light');
  expect(document.documentElement.getAttribute('data-bs-theme')).toBe('light');
  expect(result.current.isDark).toBe(false);
});

test('toggle flips theme, persists to localStorage, updates the attribute', () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.toggle());
  expect(result.current.theme).toBe('dark');
  expect(result.current.isDark).toBe(true);
  expect(localStorage.getItem('theme')).toBe('dark');
  expect(document.documentElement.getAttribute('data-bs-theme')).toBe('dark');
});

test('reads persisted theme on init', () => {
  localStorage.setItem('theme', 'dark');
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe('dark');
});
