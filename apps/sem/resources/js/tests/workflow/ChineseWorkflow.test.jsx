import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import KanbanSetting from '../../components/KanbanSetting';

afterEach(() => {
    cleanup();
    document.documentElement.lang = '';
    vi.unstubAllGlobals();
});

describe('Chinese workflow status display', () => {
    it('shows Chinese labels while submitting the unchanged workflow identifier', async () => {
        document.documentElement.lang = 'zh-CN';
        const fetchMock = vi.fn(async (url, options) => ({
            ok: true,
            json: async () => options.method === 'POST'
                ? { id: 1, title: 'Open', order: 1 } : [],
        }));
        vi.stubGlobal('fetch', fetchMock);
        render(<KanbanSetting
            endpoints={{ list: '/statuses', store: '/statuses' }}
            trans={{ title: '状态', select_type: '请选择', order: '顺序', add: '添加', added: '已添加' }}
        />);
        await waitFor(() => expect(fetchMock).toHaveBeenCalled());
        expect(screen.getByRole('option', { name: '待处理' })).toHaveValue('Open');
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Open' } });
        fireEvent.click(screen.getByRole('button', { name: '添加' }));
        await waitFor(() => expect(fetchMock.mock.calls.some(([, options]) =>
            options.method === 'POST' && JSON.parse(options.body).title === 'Open'
        )).toBe(true));
        expect(await screen.findByRole('cell', { name: '待处理' })).toBeInTheDocument();
    });
});
