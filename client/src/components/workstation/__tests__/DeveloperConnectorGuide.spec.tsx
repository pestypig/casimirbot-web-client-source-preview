// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeveloperConnectorGuide from '../DeveloperConnectorGuide';
import { DEVELOPER_CONNECTOR_PROMPT, CONNECTOR_SOURCE_PREVIEW_URL } from '@shared/developer-connector-guide';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
afterEach(() => {
  cleanup();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
const open = () => fireEvent.click(screen.getByText('Build a connector'));

describe('developer guide in Environment Store', () => {
  it('keeps the native app in its panel and copies only the requested assistant prompt or source URL', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<DeveloperConnectorGuide native />); open();
    expect(screen.getByRole('textbox', { name: 'Give this to your coding assistant' })).toHaveAttribute('readonly');
    expect(screen.queryByRole('link')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy assistant prompt' }));
    await screen.findByText('Assistant prompt copied.');
    expect(writeText).toHaveBeenLastCalledWith(DEVELOPER_CONNECTOR_PROMPT);
    fireEvent.click(screen.getByRole('button', { name: 'Copy source URL' }));
    await screen.findByText('Source URL copied.');
    expect(writeText).toHaveBeenLastCalledWith(CONNECTOR_SOURCE_PREVIEW_URL);
  });

  it('leaves selectable text and an actionable message when clipboard permission is absent', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    render(<DeveloperConnectorGuide native />); open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy assistant prompt' }));
    await screen.findByText('Select and copy the text below. Clipboard access is unavailable.');
    expect(screen.getByRole('textbox')).toHaveValue(DEVELOPER_CONNECTOR_PROMPT);
  });

  it('offers the full route in a browser and keeps private-tool availability explicit', () => {
    render(<DeveloperConnectorGuide />); open();
    expect(screen.getByRole('link', { name: 'Read full developer guide' })).toHaveAttribute('href', '/developers');
    expect(screen.getByText(/These scripts are not included in the public source preview/)).toBeInTheDocument();
    expect(screen.getByText(/Community adapter import and general third-party runtime admission are not available yet/)).toBeInTheDocument();
  });
});
