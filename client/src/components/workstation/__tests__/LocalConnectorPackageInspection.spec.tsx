// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '@/lib/workstation/accountCapabilityPolicy';
import LocalConnectorPackageInspection from '../LocalConnectorPackageInspection';
import type { LocalConnectorInspection } from '@shared/local-connector-package-inspection';

const mocks = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock('@shared/local-connector-package-inspection', async original => ({
  ...await original<typeof import('@shared/local-connector-package-inspection')>(),
  inspectLocalConnectorFiles: mocks.inspect,
}));
const result = (): LocalConnectorInspection => ({ status: 'checksum_matches', packageId: 'com.example.program', version: '0.1.0',
  claimedPublisher: 'publisher:fixture', claimedPlatforms: ['win32'], claimedMinNodeMajor: 20,
  archiveSha256: 'a'.repeat(64), claimedArchiveSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), archiveBytes: 10, manifestBytes: 100,
  publisherTrust: 'not_checked', archiveContents: 'not_checked', compatibility: 'not_checked', admission: 'not_granted',
  installAuthorized: false, runtimeAuthorized: false });
const select = () => {
  fireEvent.change(screen.getByLabelText('Adapter archive (.tgz)'), { target: { files: [new File(['archive'], 'connector.tgz')] } });
  fireEvent.change(screen.getByLabelText('Candidate manifest (.json)'), { target: { files: [new File(['{}'], 'package-candidate.json')] } });
};
beforeEach(() => {
  mocks.inspect.mockReset().mockResolvedValue(result());
  vi.stubGlobal('fetch', vi.fn());
  window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), installPrivateEnvironmentPackage: vi.fn() };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.casimirDesktop; });

describe('local downloaded-adapter inspection', () => {
  it('requires explicit file selection and Check, with no upload or native installation', async () => {
    render(<LocalConnectorPackageInspection />);
    expect(screen.getByRole('button', { name: 'Check selected files' })).toBeDisabled();
    select(); expect(mocks.inspect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    await screen.findByText('The archive checksum matches the selected candidate manifest.');
    expect(screen.getByText('Publisher (claimed)')).toBeInTheDocument();
    expect(screen.getByText(/Archive contents, publisher trust and compatibility have not been checked/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(window.casimirDesktop!.installPrivateEnvironmentPackage).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /install|enable|connect/i })).toBeNull();
  });

  it('presents a checksum mismatch without an installation affordance', async () => {
    mocks.inspect.mockResolvedValue({ ...result(), status: 'checksum_mismatch', archiveSha256: 'c'.repeat(64) });
    render(<LocalConnectorPackageInspection />); select();
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    await screen.findByText(/These files do not match/);
    expect(screen.getByText(/Platform admission is not granted/)).toBeInTheDocument();
  });

  it('clears a prior result when either selected file changes', async () => {
    render(<LocalConnectorPackageInspection />); select();
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    await screen.findByText('com.example.program');
    fireEvent.change(screen.getByLabelText('Candidate manifest (.json)'), { target: { files: [new File(['other'], 'other.json')] } });
    expect(screen.queryByText('com.example.program')).toBeNull();
  });

  it.each(['clear', 'account change'])('late inspection cannot restore state after %s', async action => {
    let finish!: (value: LocalConnectorInspection) => void;
    mocks.inspect.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<LocalConnectorPackageInspection />); select();
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    if (action === 'clear') fireEvent.click(screen.getByRole('button', { name: 'Clear selected files' }));
    else act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await act(async () => finish(result()));
    expect(screen.queryByText('com.example.program')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check selected files' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not expose reader exception content to the UI', async () => {
    mocks.inspect.mockRejectedValue(new Error('private local content'));
    render(<LocalConnectorPackageInspection />); select();
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    await screen.findByText('The files could not be checked. No files were uploaded or installed.');
    expect(screen.queryByText('private local content')).toBeNull();
  });

  it('an obsolete check cannot replace the result for a newer selection', async () => {
    let finishOld!: (value: LocalConnectorInspection) => void;
    mocks.inspect.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    render(<LocalConnectorPackageInspection />); select();
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected files' }));
    select(); mocks.inspect.mockResolvedValueOnce({ ...result(), packageId: 'com.example.new-selection' });
    fireEvent.click(screen.getByRole('button', { name: 'Check selected files' }));
    await screen.findByText('com.example.new-selection');
    await act(async () => finishOld(result()));
    expect(screen.getByText('com.example.new-selection')).toBeInTheDocument();
    expect(screen.queryByText('com.example.program')).toBeNull();
  });
});
