// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { loadLocalPrimaryObservation } from '../../../../server/services/solar-research/primary-observation';
import { prepareSolarResearchExport } from '../../../../shared/solar-research-export';
import { SolarResearchWorkbenchCatalog } from '../SolarResearchWorkbenchCatalog';
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from '../../lib/workstation/accountCapabilityPolicy';

const packageId = 'solar-package:' + 'a'.repeat(64);
const recordId = 'solar-primary:' + 'b'.repeat(64);
const indexId = 'solar-evidence-index:' + 'c'.repeat(64);
const account = { session: { profile: { profile_id: 'owner-1' } }, account_policy: { account_type: 'developer' } };
const packages = { ok: true, profileId: 'owner-1', schemaVersion: 'solar-package-catalog/1', offset: 0,
  totalPackages: 1, nextOffset: null, order: 'package_id_lexicographic', scientificAdmission: false, scienceRunAllowed: false,
  packages: [{ packageId, indexId, totalBytes: 100, comparisonRecordId: recordId, comparisonRows: 37,
    archiveId: null, literatureId: null, benchmarkId: null, artifactIntegrityVerified: true,
    sourceIdentityAuthenticated: false, scientificAdmission: false, scienceRunAllowed: false }] };
const records = { ok: true, profileId: 'owner-1', records: [{ recordId, createdAt: '2026-09-27T00:00:00.000Z',
  rowCount: 37, fixtureOnly: true, hasModelDifference: false }], totalRecords: 1, rejectedCount: 0,
  offset: 0, nextOffset: null, admissionAllowed: false, scienceRunAllowed: false };
const local = { ok: true, profileId: 'owner-1', schemaVersion: 'solar-local-product-inventory/1',
  localFilesOnly: true, workspaceRootLocated: true, scientificAdmission: false, scienceRunAllowed: false,
  products: [
    ['g1.author.cdif', 'artifacts/research/g1-basu-author-intake-20260924/cdif.txt', 'observed_inversion_input', 'source_input'],
    ['g1.author.avker.bp04', 'artifacts/research/g1-basu-author-intake-20260924/avker.BP04_B4752dRF', 'operator_kernel_input', 'source_input'],
    ['mesa.solar_reference.parser_fixture', 'ops/mesa/solar-reference/profile_solar_reference.data', 'parser_fixture', 'test_fixture'],
    ['starsim.solar_product_registry', 'data/starsim/solar-product-registry.v1.json', 'product_type_registry', 'schema_only'],
  ].map(([id, relativePath, role, maturity]) => ({ id, relativePath, role, maturity, frozenSha256: null,
    bytes: null, sha256: null, state: 'missing', comparisonUse: 'Not a calibrated model.',
    scientificAdmission: false, scienceRunAllowed: false })) };
const matchedLocal = { ...local, products: local.products.map(item => item.id === 'g1.author.cdif'
  ? { ...item, state: 'frozen_hash_matched', bytes: 5949,
    frozenSha256: '893d75b6c30729902ef169bdc08166cc600b212857e1ddcc025087cb59aff226',
    sha256: '893d75b6c30729902ef169bdc08166cc600b212857e1ddcc025087cb59aff226' }
  : item.id === 'g1.author.avker.bp04' ? { ...item, state: 'frozen_hash_matched', bytes: 2914379,
    frozenSha256: '027e2853299eee5aa34818149deb3a4bd51cf93c12fc5b2a525f14641fad344e',
    sha256: '027e2853299eee5aa34818149deb3a4bd51cf93c12fc5b2a525f14641fad344e' } : item) };
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
const fetcher = () => vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(packages))
  .mockResolvedValueOnce(reply(records)).mockResolvedValueOnce(reply(local));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('reads owner catalogs only on request and carries the exact selected record into Compare', async () => {
  const fetch = fetcher(); vi.stubGlobal('fetch', fetch);
  const onOpenRecord = vi.fn();
  render(<SolarResearchWorkbenchCatalog onOpenRecord={onOpenRecord} />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByText(recordId)).toBeTruthy());
  expect(fetch.mock.calls[1][0]).toContain('expected_profile_id=owner-1');
  expect(fetch.mock.calls[2][0]).toContain('expected_profile_id=owner-1');
  expect(fetch.mock.calls[3][0]).toContain('expected_profile_id=owner-1');
  expect(screen.getByText('Known local inputs (checked against this runtime)')).toBeTruthy();
  fireEvent.click(screen.getByText(recordId));
  expect(screen.getByText('Fixture: UI/test use only.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect this record in Compare' }));
  expect(onOpenRecord).toHaveBeenCalledWith(recordId);
  expect(fetch).toHaveBeenCalledTimes(4);
});

it('rejects non-developer policy before any archive request', async () => {
  const fetch = vi.fn().mockResolvedValue(reply({ ...account, account_policy: { account_type: 'user' } }));
  vi.stubGlobal('fetch', fetch);
  render(<SolarResearchWorkbenchCatalog />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByText(/signed-in developer account is required/)).toBeTruthy());
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('rejects a catalog scientific-admission claim', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(account))
    .mockResolvedValueOnce(reply({ ...packages, scientificAdmission: true }))
    .mockResolvedValueOnce(reply(records)).mockResolvedValueOnce(reply(local));
  vi.stubGlobal('fetch', fetch);
  render(<SolarResearchWorkbenchCatalog />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByText('Package catalog identity or claim boundary rejected')).toBeTruthy());
  expect(screen.queryByText(recordId)).toBeNull();
});

it('rejects an owner-substituted record catalog', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(account))
    .mockResolvedValueOnce(reply(packages))
    .mockResolvedValueOnce(reply({ ...records, profileId: 'other-owner' })).mockResolvedValueOnce(reply(local));
  vi.stubGlobal('fetch', fetch);
  render(<SolarResearchWorkbenchCatalog />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByText('Owner research record catalog unavailable')).toBeTruthy());
  expect(screen.queryByText(recordId)).toBeNull();
});

it('explains an old desktop service rather than presenting its missing route as an empty catalog', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(account))
    .mockResolvedValueOnce(reply({error:'api_not_found'},false))
    .mockResolvedValueOnce(reply(records)).mockResolvedValueOnce(reply(local));
  vi.stubGlobal('fetch', fetch);
  render(<SolarResearchWorkbenchCatalog />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByText(/Rebuild the renderer and service together/)).toBeTruthy());
  expect(screen.queryByText('No packages on this page.')).toBeNull();
  expect(screen.queryByText(recordId)).toBeNull();
});

it('rejects a local inventory that claims scientific admission', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(packages))
    .mockResolvedValueOnce(reply(records)).mockResolvedValueOnce(reply({ ...local, scientificAdmission: true }));
  vi.stubGlobal('fetch', fetch);
  render(<SolarResearchWorkbenchCatalog />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByText('Local inventory identity or claim boundary rejected')).toBeTruthy());
  expect(screen.queryByText(recordId)).toBeNull();
});

it('opens only an exact verified observation bundle from the frozen local inputs', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const bundle = await prepareSolarResearchExport(await loadLocalPrimaryObservation(process.cwd(), '2026-09-27T20:00:00Z'));
  const fetch = vi.fn().mockResolvedValueOnce(reply(account)).mockResolvedValueOnce(reply(packages))
    .mockResolvedValueOnce(reply(records)).mockResolvedValueOnce(reply(matchedLocal))
    .mockResolvedValueOnce(reply({ ok: true, profileId: 'owner-1', productId: 'g1.author.cdif', recordId: bundle.recordId,
      bundle, sourceIdentityAuthenticated: false, admissionAllowed: false, scienceRunAllowed: false }));
  vi.stubGlobal('fetch', fetch);
  const onOpenLocalRecord = vi.fn();
  render(<SolarResearchWorkbenchCatalog onOpenLocalRecord={onOpenLocalRecord} />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open 37 observed rows in Compare' })).toBeTruthy());
  expect(fetch).toHaveBeenCalledTimes(4);
  fireEvent.click(screen.getByRole('button', { name: 'Open 37 observed rows in Compare' }));
  await waitFor(() => expect(onOpenLocalRecord).toHaveBeenCalledWith(bundle));
  expect(fetch.mock.calls[4][0]).toContain('product_id=g1.author.cdif');
});

it('discards a late owner page after account change', async () => {
  let resolvePackage!: (value: unknown) => void;
  const pending = new Promise(done => { resolvePackage = done; });
  const fetch = vi.fn().mockResolvedValueOnce(reply(account)).mockReturnValueOnce(pending)
    .mockResolvedValueOnce(reply(records)).mockResolvedValueOnce(reply(local));
  vi.stubGlobal('fetch', fetch);
  render(<SolarResearchWorkbenchCatalog />);
  fireEvent.click(screen.getByRole('button', { name: 'Inspect research products' }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await act(async () => resolvePackage(reply(packages)));
  expect(screen.queryByText(recordId)).toBeNull();
  expect(screen.getByText(/Account changed/)).toBeTruthy();
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
});
