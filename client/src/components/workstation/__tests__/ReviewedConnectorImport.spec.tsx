// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewedConnectorImport, { type ReviewedConnectorImportBridge } from '../ReviewedConnectorImport';
import type { ReviewedConnectorImportState } from '@shared/reviewed-connector-import';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '@/lib/workstation/accountCapabilityPolicy';

const ready = (): ReviewedConnectorImportState => ({
  schema: 'casimirbot.reviewed_connector_import.local.v1', prototype: true,
  packageId: 'com.example.starter', version: '0.1.0', artifactSha256: 'a'.repeat(64),
  reviewExpiresAt: new Date(Date.now() + 60000).toISOString(), status: 'not_installed',
  installAvailable: true, removeAvailable: false, runtimeAvailable: false, connected: false, granted: false,
});
const stored = () => ({ ...ready(), status: 'installed_stopped' as const, removeAvailable: true,
  installationRef: 'environment_installation:11111111-1111-4111-8111-111111111111' });
const bridge = () => ({ inspect: vi.fn(async () => ready() as unknown), import: vi.fn(async () => stored() as unknown),
  remove: vi.fn(async () => ({ ...ready(), status: 'removed', codeFilesRemoved: true } as unknown)), invalidate: vi.fn(async () => ({ invalidated: true })) });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('reviewed cold-import Store controls', () => {
  it('keeps the unfinished prototype hidden on old builds or without native admission', async () => {
    const input = bridge(); input.inspect.mockResolvedValue({ ...ready(), status: 'unavailable', installAvailable: false });
    const view = render(<ReviewedConnectorImport bridge={null} />);
    expect(screen.queryByRole('region')).toBeNull();
    view.rerender(<ReviewedConnectorImport bridge={input} />);
    await act(async () => {});
    expect(screen.queryByRole('region')).toBeNull();
    expect(input.import).not.toHaveBeenCalled();
  });
  it('inspects once and waits for an explicit user import without passing any payload', async () => {
    const input = bridge(); render(<ReviewedConnectorImport bridge={input} />);
    await screen.findByRole('button', { name: 'Import reviewed starter' });
    expect(input.inspect).toHaveBeenCalledTimes(1); expect(input.import).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Import reviewed starter' }));
    await screen.findByText('Stored for this account and device. Not connected; no runtime or program grant.');
    expect(input.import).toHaveBeenCalledWith();
    expect(screen.queryByRole('button', { name: /\b(start|execute|connect|grant)\b/i })).toBeNull();
  });
  it('a native cancel is displayed without inventing an installation', async () => {
    const input = bridge(); input.import.mockResolvedValue({ ...ready(), cancelled: true });
    render(<ReviewedConnectorImport bridge={input} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed starter' }));
    await screen.findByText('Native operation cancelled.');
    expect(screen.getByRole('button', { name: 'Remove stored starter' })).toBeDisabled();
  });
  it('withdrawal disables import while leaving current-owner removal reachable', async () => {
    const input = bridge(); input.inspect.mockResolvedValue({ ...stored(), installAvailable: false });
    render(<ReviewedConnectorImport bridge={input} />);
    await screen.findByRole('button', { name: 'Remove stored starter' });
    expect(screen.getByRole('button', { name: 'Import reviewed starter' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove stored starter' }));
    await screen.findByText('Reviewed starter removed. Your data and history were kept.');
    expect(input.remove).toHaveBeenCalledWith();
  });
  it('an account change drops a pending result and inspects only the current owner', async () => {
    const input = bridge(); let finish!: (value: unknown) => void;
    input.import.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<ReviewedConnectorImport bridge={input} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed starter' }));
    act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await act(async () => finish(stored()));
    await screen.findByRole('button', { name: 'Import reviewed starter' });
    expect(screen.queryByText('Stored for this account and device. Not connected; no runtime or program grant.')).toBeNull();
    expect(input.invalidate).toHaveBeenCalled(); expect(input.import).toHaveBeenCalledOnce();
    expect(input.inspect).toHaveBeenCalledTimes(2);
  });
  it('a malformed native reply cannot display runtime admission or enable operations', async () => {
    const input = bridge(); input.import.mockResolvedValue({ ...stored(), runtimeAvailable: true });
    render(<ReviewedConnectorImport bridge={input} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed starter' }));
    await screen.findByText('Native import is unavailable or was not confirmed. Refresh to inspect the current stored state.');
    expect(screen.getByRole('button', { name: 'Import reviewed starter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove stored starter' })).toBeDisabled();
  });
  it.each(['inspect', 'import'] as const)('bridge replacement during %s refreshes through the new bridge only', async operation => {
    const previous = bridge(), current = bridge(); let finish!: (value: unknown) => void;
    previous[operation].mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ReviewedConnectorImport bridge={previous} />);
    if (operation === 'import') fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed starter' }));
    view.rerender(<ReviewedConnectorImport bridge={current} />);
    expect(screen.queryByRole('region')).toBeNull();
    await act(async () => finish(stored()));
    await screen.findByRole('button', { name: 'Import reviewed starter' });
    expect(current.inspect).toHaveBeenCalledOnce();
    expect(previous.inspect).toHaveBeenCalledOnce();
    expect(previous.invalidate).toHaveBeenCalledTimes(operation === 'import' ? 1 : 0);
    expect(screen.getByRole('button', { name: 'Remove stored starter' })).toBeDisabled();
    expect(screen.queryByText('Stored for this account and device. Not connected; no runtime or program grant.')).toBeNull();
  });
  it('review expiry disables only positive import, without deleting stored code', async () => {
    vi.useFakeTimers();
    const input = bridge(); input.inspect.mockResolvedValue(stored());
    await act(async () => { render(<ReviewedConnectorImport bridge={input} />); });
    expect(screen.getByRole('button', { name: 'Import reviewed starter' })).not.toBeDisabled();
    await act(async () => { vi.advanceTimersByTime(60001); });
    expect(screen.getByRole('button', { name: 'Import reviewed starter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove stored starter' })).not.toBeDisabled();
    expect(input.remove).not.toHaveBeenCalled(); expect(input.import).not.toHaveBeenCalled();
  });
  it('unmounting a read-only inspection cannot cancel another native operation', async () => {
    const input = bridge(); let finish!: (value: unknown) => void;
    input.inspect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ReviewedConnectorImport bridge={input} />); view.unmount();
    expect(input.invalidate).not.toHaveBeenCalled();
    await act(async () => finish(ready()));
    expect(input.import).not.toHaveBeenCalled();
  });
  it('unmounting a pending import requests cancellation and ignores its late result', async () => {
    const input = bridge(); let finish!: (value: unknown) => void;
    input.import.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const view = render(<ReviewedConnectorImport bridge={input} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Import reviewed starter' }));
    view.unmount(); expect(input.invalidate).toHaveBeenCalledOnce();
    await act(async () => finish(stored()));
    expect(input.inspect).toHaveBeenCalledOnce();
  });
});
